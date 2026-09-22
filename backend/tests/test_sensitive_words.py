"""敏感词底层测试：Aho-Corasick 自动机 / 归一化 / 词库解析与缓存。

均为纯函数或独立算法，不依赖 TestClient；端点集成用例见 `test_audit.py`。
"""

from __future__ import annotations

import pytest

from app.services.audit.aho_corasick import AhoCorasick
from app.services.audit.normalize import PARAGRAPH_BOUNDARY, normalize
from app.services.audit.wordlist import (
    load_wordlist,
    parse_wordlist,
    reset_cache_for_tests,
    wordlist_path,
)
from app.utils.text import strip_html


# ============================================================ Aho-Corasick 正确性
def test_ac_multiple_patterns_with_overlap():
    ac = AhoCorasick()
    for word in ("he", "she", "hers", "his"):
        ac.add(word, word)
    ac.build()
    # "ushers"：[1,4)="she"、[2,4)="he"、[2,5)="hers" 三处重叠命中
    assert sorted(ac.scan("ushers")) == [(1, "she"), (2, "he"), (2, "hers")]


def test_ac_output_chain_reports_all_suffix_patterns():
    ac = AhoCorasick()
    ac.add("敏感", "敏感")
    ac.add("敏感词", "敏感词")
    ac.build()
    # 同一位置的长词与其后缀短词都要报出来
    assert sorted(ac.scan("敏感词")) == [(0, "敏感"), (0, "敏感词")]


def test_ac_overlapping_same_pattern():
    ac = AhoCorasick()
    ac.add("aa", "aa")
    ac.build()
    assert sorted(ac.scan("aaa")) == [(0, "aa"), (1, "aa")]


def test_ac_rebuilds_after_new_pattern_added():
    ac = AhoCorasick()
    ac.add("甲", "甲")
    assert list(ac.scan("甲")) == [(0, "甲")]
    ac.add("乙", "乙")  # 新增后必须能重建并生效
    assert sorted(ac.scan("甲乙")) == [(0, "甲"), (1, "乙")]


def test_ac_pattern_count_ignores_empty_word():
    ac = AhoCorasick()
    ac.add("一")
    ac.add("二")
    ac.add("")  # 空串忽略
    assert ac.pattern_count == 2


# ==================================================================== 归一化
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("敏\uff0a感", "敏感"),  # 全角星号插入
        ("敏.感", "敏感"),  # 英文句点插入
        ("敏 感", "敏感"),  # 空格插入
        ("敏\u200b感", "敏感"),  # 零宽空格
        ("敏\ufeff感", "敏感"),  # BOM / 零宽不换行空格
        ("敏\u00ad感", "敏感"),  # 软连字符
        ("ＡＢＣ", "abc"),  # 全角字母 -> 半角 + 小写
        ("", ""),  # 空输入
    ],
)
def test_normalize(raw, expected):
    assert normalize(raw) == expected


def test_normalize_keeps_chinese_sentence_punctuation():
    # 刻意不删中文句读，避免把相邻句子粘连出误报。
    # 注意 NFKC 会把全角问号「？」折叠为半角「?」，但句号「。」保留，且字符数不变（不删除）。
    out = normalize("他走了。然后呢？")
    assert "。" in out
    assert len(out) == len("他走了。然后呢？")


def test_normalize_turns_line_breaks_into_boundary_sentinel():
    # 段落/换行边界必须保留为哨兵，不能被删掉（否则跨段会拼出误报）
    for raw in ("敏\n感", "敏\r\n感", "敏\r感", "敏\u2028感", "敏\u2029感"):
        assert normalize(raw) == f"敏{PARAGRAPH_BOUNDARY}感", repr(raw)


def test_sensitive_does_not_match_across_paragraphs(tmp_path):
    wl = _make_wordlist(tmp_path, "敏感,illegal\n")
    # 跨段不命中：strip_html 把块级标签换成换行 -> 归一成边界哨兵
    assert wl.count_matches(strip_html("<p>敏</p><p>感</p>")) == {}
    # 句子边界（句读保留）同样不跨
    assert wl.count_matches("敏。感") == {}
    # 段内空白 / 插入符号绕过仍必须命中（原需求不能改坏）
    assert sum(wl.count_matches(strip_html("<p>敏 感</p>")).values()) == 1
    assert sum(wl.count_matches(strip_html("<p>敏 * 感</p>")).values()) == 1


# ================================================================ 词库解析
def test_parse_wordlist_variants_category_and_dedup():
    raw = (
        "# 注释行会被忽略\n"
        "\n"
        "   \n"
        "词A|词A变体,暴力\n"
        "词B\n"
        "词C,illegal\n"
        "词A,other\n"  # 重复词：保留首次出现的分类
        "词D,violence\n"
    )
    entries = parse_wordlist(raw)
    assert {e.word: e.category for e in entries} == {
        "词A": "violence",  # 中文别名「暴力」映射到 violence
        "词A变体": "violence",
        "词B": "other",  # 省略分类 -> other
        "词C": "illegal",
        "词D": "violence",
    }


def test_parse_wordlist_tolerates_empty_variants_and_fullwidth_comma():
    entries = parse_wordlist("词E，，extra\n词F|,other\n词G，违法\n")
    assert {e.word: e.category for e in entries} == {
        "词E": "other",
        "词F": "other",
        "词G": "illegal",
    }


def test_parse_wordlist_unknown_category_is_preserved():
    # 无法识别的分类原样保留，不做静默丢弃
    assert parse_wordlist("词X,自定义分类\n")[0].category == "自定义分类"


# ============================================================ 词库匹配与缓存
def _make_wordlist(tmp_path, text: str):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    path = wordlist_path(data_dir)
    path.write_text(text, encoding="utf-8")
    reset_cache_for_tests()
    return load_wordlist(path)


def test_wordlist_variant_expansion_and_normalized_dedup(tmp_path):
    wl = _make_wordlist(tmp_path, "敏感词|敏 感 词|敏感词拼音,illegal\n")
    # 「敏 感 词」归一化后与「敏感词」同形 -> 去重，避免同一处命中被重复计数
    assert wl.count == 2
    assert {e.word for e in wl.entries} == {"敏感词", "敏感词拼音"}
    assert sum(wl.count_matches("这里有个敏感词。").values()) == 1


def test_wordlist_matches_despite_bypass_symbols(tmp_path):
    wl = _make_wordlist(tmp_path, "敏感词,illegal\n")
    bypassed = (
        "这是敏感词。",
        "这是敏*感词。",
        "这是敏 感 词。",
        "这是敏\u200b感词。",
        "这是敏.感词。",
    )
    for text in bypassed:
        assert sum(wl.count_matches(text).values()) == 1, text
    assert sum(wl.count_matches("敏感词，又来一个敏感词").values()) == 2


def test_wordlist_english_is_case_insensitive(tmp_path):
    wl = _make_wordlist(tmp_path, "Forbidden\n")
    assert sum(wl.count_matches("this is forbidden").values()) == 1
    assert sum(wl.count_matches("This is FORBIDDEN!").values()) == 1


def test_wordlist_missing_file_is_empty_not_error(tmp_path):
    reset_cache_for_tests()
    wl = load_wordlist(wordlist_path(tmp_path / "data"))
    assert wl.count == 0
    assert wl.count_matches("任何正文") == {}


@pytest.mark.parametrize("content", ["", "\n\n", "   \n\t\n", "# 只有注释\n# 还是注释\n"])
def test_wordlist_empty_or_comment_only(tmp_path, content):
    wl = _make_wordlist(tmp_path, content)
    assert wl.count == 0
    assert wl.count_matches("敏感词") == {}


def test_wordlist_cache_is_invalidated_by_file_change(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    path = wordlist_path(data_dir)
    path.write_text("词甲\n", encoding="utf-8")
    reset_cache_for_tests()
    assert load_wordlist(path).count == 1
    path.write_text("词甲\n词乙\n", encoding="utf-8")  # 同路径变更
    assert load_wordlist(path).count == 2  # 靠 (mtime, size) 失效并重建
