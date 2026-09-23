"""ReplyStreamExtractor：从流式 JSON 里增量抽 reply 文本（流式对话的地基）。"""

from __future__ import annotations

from app.utils.reply_stream import ReplyStreamExtractor


def _drain(chunks: list[str]) -> str:
    ex = ReplyStreamExtractor()
    return "".join(ex.feed(c) for c in chunks)


def test_plain_reply_across_chunks():
    out = _drain(['{"rep', 'ly": "你好，今天', '想推进哪块？", "draf'])
    assert out == "你好，今天想推进哪块？"


def test_escape_decoding():
    out = _drain(['{"reply": "第一行\\n第二行\\t带\\"引号\\"", "x'])
    assert out == '第一行\n第二行\t带"引号"'


def test_unicode_escape():
    assert _drain(['{"reply": "\\u4f60\\u597d"']) == "你好"


def test_stops_at_closing_quote_ignores_draft():
    out = _drain(['{"reply": "短", "draft": {"kind": "prose", "payload": {"text": "不该出现"}}}'])
    assert out == "短"


def test_split_escape_across_boundary():
    # \n 被切断在两个 chunk 之间也必须正确解码
    assert _drain(['{"reply": "a\\', 'nb"}']) == "a\nb"


def test_malformed_json_yields_nothing_and_never_garbles():
    assert _drain(["对不起，我直接说：", "今天天气不错"]) == ""


def test_bad_escape_stops_extraction():
    assert _drain(['{"reply": "ok\\q', "rest"]) == "ok"
