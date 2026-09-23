"""联网搜索（默认免密钥，DuckDuckGo HTML + bs4 解析；可配置端点/代理）。

## 为什么默认 DDG、又允许换端点
本项目是 BYOK 本地工具，用户只配了模型密钥；Tavily/Bing 之类还要第二个 key，
与「开箱即用」相悖。但 DDG 在中国大陆直连不通 —— 所以设置里提供两档出路：
① 填代理地址（如 `http://127.0.0.1:7890`）继续用 DDG；
② 填自建/第三方 JSON 搜索端点（约定 `GET {endpoint}?q=...` 返回
   `{"results": [{"title","url","snippet"}]}`），国内网络可直连自己的服务。

## 红线
搜索失败（断网 / 被限流 / 页面改版）**一律降级为空结果**，绝不抛错打断对话 ——
联网是增强项。但降级必须**分级留痕**：网络类 warning、解析类带堆栈，
非网络 bug 直接上抛 —— 否则功能坏了与"没搜到"表现相同，无从排查。
"""

from __future__ import annotations

import json
import sqlite3
from urllib.parse import unquote, urlparse, parse_qs

import httpx
from bs4 import BeautifulSoup

from app.db.global_db import get_global_database
from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

DEFAULT_ENDPOINT = "https://html.duckduckgo.com/html/"
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_TIMEOUT = 8.0
_MAX_RESULTS = 5

_META_ENDPOINT = "web_search_endpoint"
_META_PROXY = "web_search_proxy"


# ---------------------------------------------------------------- 配置存取（全局 meta）
def get_config() -> dict:
    """返回 `{endpoint, proxy}`；未配置时 endpoint 为默认 DDG。"""
    with get_global_database().connection() as conn:
        rows = dict(
            conn.execute(
                "SELECT key, value FROM meta WHERE key IN (?, ?)",
                (_META_ENDPOINT, _META_PROXY),
            ).fetchall()
        )
    return {
        "endpoint": rows.get(_META_ENDPOINT) or DEFAULT_ENDPOINT,
        "proxy": rows.get(_META_PROXY) or "",
    }


def save_config(endpoint: str | None, proxy: str | None) -> dict:
    """写配置；传空 = 恢复默认（删键）。"""
    with get_global_database().transaction() as conn:
        for key, value in ((_META_ENDPOINT, endpoint), (_META_PROXY, proxy)):
            if value:
                conn.execute(
                    "INSERT INTO meta (key, value) VALUES (?, ?)"
                    " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value),
                )
            else:
                conn.execute("DELETE FROM meta WHERE key = ?", (key,))
    return get_config()


# ---------------------------------------------------------------- 结果清洗
def _clean_url(href: str) -> str:
    """DDG 结果链接常包一层 /l/?uddg=<encoded> 跳转，还原成真实地址。"""
    if not href:
        return ""
    if href.startswith("//"):
        href = "https:" + href
    try:
        parsed = urlparse(href)
        if "duckduckgo.com" in parsed.netloc and parsed.path.startswith("/l/"):
            target = parse_qs(parsed.query).get("uddg")
            if target:
                return unquote(target[0])
        return href if parsed.scheme in ("http", "https") else ""
    except ValueError:
        return ""


def _normalize_results(raw: object) -> list[dict]:
    items = raw if isinstance(raw, list) else []
    out: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        url = _clean_url(str(item.get("url") or ""))
        if not url:
            continue
        out.append(
            {
                "title": str(item.get("title") or url)[:200],
                "url": url[:500],
                "snippet": str(item.get("snippet") or "")[:300],
            }
        )
        if len(out) >= _MAX_RESULTS:
            break
    return out


def _client_kwargs(proxy: str) -> dict:
    return {"proxy": proxy} if proxy else {}


# ---------------------------------------------------------------- 主入口
def web_search(query: str, max_results: int = _MAX_RESULTS) -> list[dict]:
    """返回 `[{title, url, snippet}]`；网络/配置类失败降级为空表（分级留痕）。

    联网是增强项，不能把主对话打死：读配置的库忙、代理地址写错（ValueError）
    一律降级 + warning；但**代码 bug（非这两类异常）照旧上抛** ——
    真 bug 伪装成"没搜到"是最坏的降级。
    """
    query = (query or "").strip()
    if not query:
        return []
    try:
        cfg = get_config()
        if cfg["endpoint"] == DEFAULT_ENDPOINT:
            return _search_ddg(query, max_results, cfg["proxy"])
        return _search_json_endpoint(query, max_results, cfg)
    except (httpx.HTTPError, ValueError) as exc:
        # 网络失败（超时/拒连/5xx）或代理地址不合法：用户侧可恢复，降级 + warning
        logger.warning(
            "web search failed",
            **log_fields(query=query[:60], err=type(exc).__name__),
        )
        return []
    except sqlite3.Error:
        # 全局库偶发忙/坏：也不该拖垮对话
        logger.warning("web search config store failed", exc_info=True)
        return []


def _search_ddg(query: str, max_results: int, proxy: str) -> list[dict]:
    with httpx.Client(
        headers={"User-Agent": _UA, "Accept": "text/html"},
        timeout=_TIMEOUT,
        follow_redirects=True,
        **_client_kwargs(proxy),
    ) as client:
        resp = client.post(DEFAULT_ENDPOINT, data={"q": query})
        resp.raise_for_status()
    out: list[dict] = []
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        for item in soup.select("div.result")[: max_results * 3]:
            link = item.select_one("a.result__a")
            if link is None:
                continue
            url = _clean_url(link.get("href") or "")
            snippet = item.select_one(".result__snippet")
            if not url:
                continue
            out.append(
                {
                    "title": link.get_text(" ", strip=True)[:200],
                    "url": url[:500],
                    "snippet": snippet.get_text(" ", strip=True)[:300] if snippet else "",
                }
            )
            if len(out) >= max_results:
                break
    except Exception:
        # 解析炸了多半是 DDG 改版或打包缺 lxml backend —— 降级但**带堆栈+页面头部**留证，
        # 否则"永久 0 命中"会被归因成用户网络问题，排查方向从第一天就是错的
        logger.warning(
            "web search parse failed",
            exc_info=True,
            **log_fields(query=query[:60], status=resp.status_code, head=resp.text[:200]),
        )
        return []
    return out


def _search_json_endpoint(query: str, max_results: int, cfg: dict) -> list[dict]:
    """自建端点：`GET {endpoint}?q=...` → `{"results": [{title,url,snippet}]}`。"""
    with httpx.Client(
        headers={"User-Agent": _UA},
        timeout=_TIMEOUT,
        follow_redirects=True,
        **_client_kwargs(cfg["proxy"]),
    ) as client:
        resp = client.get(cfg["endpoint"], params={"q": query})
        resp.raise_for_status()
        try:
            data = resp.json()
        except (json.JSONDecodeError, ValueError):
            logger.warning("web search json invalid", **log_fields(endpoint=cfg["endpoint"][:80]))
            return []
    body = data.get("results") if isinstance(data, dict) else data
    return _normalize_results(body)[:max_results]
