"""web_search：DDG HTML 解析、uddg 跳转还原、失败降级为空。"""

from __future__ import annotations

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
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        return None


def _patch_post(monkeypatch, *, text=None, exc=None):
    def fake_post(url, **kwargs):
        if exc:
            raise exc
        return _Resp(text)

    monkeypatch.setattr(web_search.httpx, "post", fake_post)


def test_parses_results_and_unwraps_redirect(monkeypatch):
    _patch_post(monkeypatch, text=_SAMPLE)
    out = web_search.web_search("宋代城防")
    assert len(out) == 2
    assert out[0]["url"] == "https://example.com/wiki/wengcheng"
    assert "瓮城" in out[0]["snippet"]
    assert out[1]["url"] == "https://example.org/mian"


def test_network_failure_degrades_to_empty(monkeypatch):
    import httpx

    _patch_post(monkeypatch, exc=httpx.ConnectError("offline"))
    assert web_search.web_search("任意查询") == []


def test_non_httpx_bug_propagates(monkeypatch):
    """非网络类异常（代码 bug）不许被降级吞掉 —— 审查修复项，防真 bug 伪装成断网。"""
    _patch_post(monkeypatch, exc=ZeroDivisionError("bug"))
    try:
        web_search.web_search("任意查询")
    except ZeroDivisionError:
        pass
    else:
        raise AssertionError("应当抛出而不是降级")


def test_garbage_page_degrades_to_empty(monkeypatch):
    _patch_post(monkeypatch, text="<html>验证码</html>")
    assert web_search.web_search("任意查询") == []


def test_empty_query_skips_request(monkeypatch):
    _patch_post(monkeypatch, exc=AssertionError("不该发请求"))
    assert web_search.web_search("   ") == []
