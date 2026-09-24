"""web_search：DDG HTML 解析、uddg 还原、JSON 自建端点、配置存取、失败降级。"""

from __future__ import annotations

import httpx
import pytest

from app.services import web_search

_SAMPLE = """
<html><body>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fwiki%2Fwengcheng&rut=abc">宋代城防制度 - 百科</a>
  <a class="result__snippet">瓮城是城门外的防御小城，常设<b>马面</b>与敌楼。</a>
</div>
<div class="result">
  <a class="result__a" href="https://example.org/mian">马面考</a>
  <div class="result__snippet">马面即敌台。</div>
</div>
</body></html>
"""


class _Resp:
    def __init__(self, text="", payload=None, status=200):
        self.text = text
        self.status_code = status
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=None, response=None)  # type: ignore[arg-type]

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class _FakeClient:
    """替掉 httpx.Client：记录请求，返回预设响应；exc 模拟网络层失败。"""

    def __init__(self, *, text=None, payload=None, exc=None, status=200, **_kw):
        self._resp = _Resp(text=text or "", payload=payload, status=status)
        self._exc = exc
        self.last: dict | None = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, **kw):
        self.last = {"method": "POST", "url": url, **kw}
        if self._exc:
            raise self._exc
        return self._resp

    def get(self, url, **kw):
        self.last = {"method": "GET", "url": url, **kw}
        if self._exc:
            raise self._exc
        return self._resp


@pytest.fixture()
def fake_client(monkeypatch):
    def install(**kwargs):
        client = _FakeClient(**kwargs)
        monkeypatch.setattr(web_search.httpx, "Client", lambda **_kw: client)
        return client

    return install


def test_parses_ddg_results_and_unwraps_redirect(client, fake_client):
    fake_client(text=_SAMPLE)
    out = web_search.web_search("宋代城防")
    assert len(out) == 2
    assert out[0]["url"] == "https://example.com/wiki/wengcheng"
    assert "瓮城" in out[0]["snippet"]


def test_network_failure_degrades_to_empty(client, fake_client):
    fake_client(exc=httpx.ConnectError("offline"))
    assert web_search.web_search("任意查询") == []


def test_non_httpx_bug_propagates(client, fake_client):
    """非网络类异常（代码 bug）不许被降级吞掉 —— 防真 bug 伪装成断网。"""
    fake_client(exc=ZeroDivisionError("bug"))
    with pytest.raises(ZeroDivisionError):
        web_search.web_search("任意查询")


def test_garbage_page_degrades_to_empty(client, fake_client):
    fake_client(text="<html>验证码</html>")
    assert web_search.web_search("任意查询") == []


def test_empty_query_skips_request(client, fake_client):
    client = fake_client(exc=AssertionError("不该发请求"))
    assert web_search.web_search("   ") == []
    assert client.last is None


# ------------------------------------------------------------ 配置与自建端点
def test_config_roundtrip_and_reset(client):
    cfg = web_search.save_config("https://search.local/api", "http://127.0.0.1:7890")
    assert cfg == {"endpoint": "https://search.local/api", "proxy": "http://127.0.0.1:7890"}
    cfg = web_search.save_config(None, None)
    assert cfg["endpoint"] == web_search.DEFAULT_ENDPOINT
    assert cfg["proxy"] == ""


def test_custom_json_endpoint_used_with_proxy(client, fake_client):
    web_search.save_config("https://search.local/api", "http://127.0.0.1:7890")
    client_obj = fake_client(payload={"results": [{"title": "t", "url": "https://a.com/x", "snippet": "s"}]})
    out = web_search.web_search("测试")
    assert out == [{"title": "t", "url": "https://a.com/x", "snippet": "s"}]
    assert client_obj.last["method"] == "GET"  # type: ignore[index]
    assert client_obj.last["url"] == "https://search.local/api"  # type: ignore[index]
    assert client_obj.last["params"] == {"q": "测试"}  # type: ignore[index]


def test_json_endpoint_bad_payload_degrades(client, fake_client):
    web_search.save_config("https://search.local/api", None)
    fake_client(text="not json")
    assert web_search.web_search("测试") == []


def test_bad_proxy_value_degrades_not_500(client, fake_client):
    """代理地址写错（httpx 构造抛 ValueError）→ 降级空结果，不能把主对话打死。

    必须挂 `client` fixture：它把 project_root 指到 tmp 并重置全局库单例，
    否则 save_config 会**写进真实的 data/app.db**（曾把非法值漏进生产库，
    导致设置页 GET /web-search 响应模型校验 500）。
    """
    web_search.save_config(None, "not-a-valid-proxy-url")
    fake_client(exc=ValueError("unknown proxy scheme"))
    assert web_search.web_search("测试") == []
