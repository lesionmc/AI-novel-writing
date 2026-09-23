"""轻量联网搜索（无密钥）：DuckDuckGo HTML 端点 + bs4 解析。

## 为什么自己拼而不是接搜索 API
本项目是 BYOK 本地工具，用户只配了模型密钥；Tavily/Bing 之类还要第二个 key，
与「开箱即用」相悖。DDG 的 html 端点无需鉴权即可返回纯静态结果页，够用。

## 红线
搜索失败（断网 / 被限流 / 页面改版）**一律降级为空结果**，绝不抛错打断对话 ——
联网是增强项，不是必需项。结果只作为资料注入提示词，由模型消化后回答。
"""

from __future__ import annotations

from urllib.parse import unquote, urlparse, parse_qs

import httpx
from bs4 import BeautifulSoup

from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

_ENDPOINT = "https://html.duckduckgo.com/html/"
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_TIMEOUT = 8.0
_MAX_RESULTS = 5


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


def web_search(query: str, max_results: int = _MAX_RESULTS) -> list[dict]:
    """返回 `[{title, url, snippet}]`；任何异常都吞掉并返回空表。"""
    query = (query or "").strip()
    if not query:
        return []
    try:
        resp = httpx.post(
            _ENDPOINT,
            data={"q": query},
            headers={"User-Agent": _UA, "Accept": "text/html"},
            timeout=_TIMEOUT,
            follow_redirects=True,
        )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001 —— 降级是刻意的，见模块头
        logger.info("web search failed", **log_fields(query=query[:60], err=type(exc).__name__))
        return []

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
    except Exception as exc:  # noqa: BLE001 —— 页面改版同样降级
        logger.info("web search parse failed", **log_fields(query=query[:60], err=type(exc).__name__))
        return []
    return out
