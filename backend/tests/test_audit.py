"""质检（audit）测试：去 AI 味本地规则 + 两个端点集成 + 词库状态。

被测算功能都是纯本地的（不调用模型、不联网），因此集成用例**不安装任何假模型**
（不使用 `fake_llm` 夹具）即可通过——这正是"不配模型也能用"红线的验证。
底层算法（Aho-Corasick / 归一化 / 词库）的用例见 `test_sensitive_words.py`。
"""

from __future__ import annotations

from app.db.registry import get_registry, now_iso
from app.repositories import chapter_repo
from app.services.audit import ai_flavor
from app.services.audit.wordlist import reset_cache_for_tests, wordlist_path


# ================================================================ 去 AI 味
def test_ai_flavor_detects_all_three_types():
    text = "首先，他感到无比愤怒。其次，他非常难过。因此，他最后离开了。"
    score, hits = ai_flavor.detect(text)
    assert {h.type for h in hits} == {"cliche", "emotion_label", "adjective_density"}
    assert 0 <= score <= 100


def test_ai_flavor_position_is_plain_text_offset():
    text = "普通的一句。因此，他走了。"
    _, hits = ai_flavor.detect(text)
    cliches = [h for h in hits if h.type == "cliche"]
    assert cliches
    for h in cliches:
        assert text[h.position : h.position + len(h.text)] == h.text


def test_ai_flavor_empty_and_plain_text():
    assert ai_flavor.detect("") == (0, [])
    assert ai_flavor.detect("   \n  ")[1] == []
    score, hits = ai_flavor.detect("他推开门，走了进去。")
    assert hits == []
    assert score == 0


def _hits(kind: str, n: int) -> list[ai_flavor.FlavorHit]:
    return [
        ai_flavor.FlavorHit(type=kind, text="首先", position=i, suggestion="s") for i in range(n)
    ]


def test_ai_flavor_score_zero_hits_and_bounds():
    assert ai_flavor.score_hits([], 100) == 0
    assert ai_flavor.score_hits(_hits("cliche", 1), 10) > 0
    # 命中极密时落在高档（不设硬上限，保留中高档位分辨率）
    assert 85 <= ai_flavor.score_hits(_hits("cliche", 50), 50) <= 100


def test_ai_flavor_short_text_is_not_inflated():
    """QA 缺陷 B 回归：短文本不再因"每千字密度"被放大成虚高评分。

    旧实现（density = weighted*1000 / 裸字符数，饱和点 10）下，28 字 1 命中即可接近满分；
    改成长度加性平滑（字符数 + 500）后短文本被显著压平。
    """
    assert ai_flavor.score_hits(_hits("cliche", 1), 28) <= 25
    assert ai_flavor.score_hits(_hits("cliche", 2), 28) <= 45
    # 但"堆满套话"的真问题仍要拿到高分，别被压平
    assert ai_flavor.score_hits(_hits("cliche", 50), 50) >= 85


def test_ai_flavor_score_monotonic_in_hits_and_length():
    def sc(n: int, chars: int) -> int:
        return ai_flavor.score_hits(_hits("cliche", n), chars)

    # 同字数：命中越多分越高
    assert sc(1, 4000) < sc(5, 4000) < sc(50, 4000)
    # 同命中数：字数越多分越低（加性平滑使其在任意长度都成立，含极短文本）
    series = [sc(10, length) for length in (28, 49, 200, 500, 2000, 4000)]
    assert series == sorted(series, reverse=True)
    assert series[0] > series[-1]


def test_ai_flavor_score_grows_with_density():
    light = "他推开门，走了进去，屋里没人。"
    heavy = "非常非常，极其无比，十分格外，深深地彻底地。"
    assert ai_flavor.detect(light)[0] < ai_flavor.detect(heavy)[0]


def test_ai_flavor_suggestion_is_nonempty_and_mentions_match():
    _, hits = ai_flavor.detect("首先，他出发了。")
    assert hits
    assert all(h.suggestion and h.text in h.suggestion for h in hits)


# ============================================================ 端点集成（无模型）
def _add_chapter(client, book: str, content: str, title: str = "章") -> dict:
    ch = client.post(f"/api/books/{book}/chapters", json={"title": title}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": content})
    return ch


def test_ai_flavor_endpoint_works_without_any_model(client, book):
    ch = _add_chapter(client, book, "首先，他感到无比愤怒。因此，他最后离开了。")
    resp = client.post(f"/api/chapters/{ch['id']}/audit/ai-flavor")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert 0 <= body["score"] <= 100
    assert body["hits"]
    assert {h["type"] for h in body["hits"]} <= {"cliche", "emotion_label", "adjective_density"}


def test_ai_flavor_endpoint_empty_chapter_returns_zero(client, book):
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "空章"}).json()
    resp = client.post(f"/api/chapters/{ch['id']}/audit/ai-flavor")
    assert resp.status_code == 200
    assert resp.json() == {"score": 0, "hits": []}


def test_ai_flavor_endpoint_missing_chapter(client):
    resp = client.post("/api/chapters/999999/audit/ai-flavor")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "CHAPTER_NOT_FOUND"


def test_sensitive_endpoint_without_wordlist_returns_empty(client, book):
    _add_chapter(client, book, "随便写一些正文内容。")
    resp = client.post(f"/api/books/{book}/audit/sensitive")
    assert resp.status_code == 200, resp.text
    # 词库缺失时必须显式标注「没实际检查」，不能只给一个 0 命中（假安全感，P1-4）
    assert resp.json() == {"total_hits": 0, "wordlist_available": False, "hits": []}


def test_sensitive_endpoint_with_wordlist_aggregates_per_chapter(client, book, tmp_path):
    _add_chapter(client, book, "这里出现了敏感词，还有敏感词。", title="甲")
    _add_chapter(client, book, "另一章没有命中。", title="乙")
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    wordlist_path(data_dir).write_text("敏感词,illegal\n其他词,other\n", encoding="utf-8")
    reset_cache_for_tests()

    resp = client.post(f"/api/books/{book}/audit/sensitive")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_hits"] == 2  # 两处出现 -> 次数之和
    assert body["hits"] == [
        {"word": "敏感词", "category": "illegal", "chapter_seq": 1, "count": 2}
    ]


def test_sensitive_endpoint_does_not_match_across_paragraphs(client, book, tmp_path):
    """QA 缺陷 A 回归：<p>敏</p><p>感</p> 不能被拼成「敏感」（换行归一成边界哨兵）。"""
    _add_chapter(client, book, "<p>敏</p><p>感</p>", title="跨段")
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    wordlist_path(data_dir).write_text("敏感,illegal\n", encoding="utf-8")
    reset_cache_for_tests()

    resp = client.post(f"/api/books/{book}/audit/sensitive")
    assert resp.status_code == 200, resp.text
    # 有词库（词库可用）但跨段不命中 → total_hits=0 才是真正的「检查过、没命中」
    assert resp.json() == {"total_hits": 0, "wordlist_available": True, "hits": []}


def test_sensitive_endpoint_still_matches_within_paragraph_bypass(client, book, tmp_path):
    """段内空格/符号绕过仍必须命中（缺陷 A 的修复不能改坏原需求）。"""
    _add_chapter(client, book, "<p>敏 * 感</p>", title="段内绕过")
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    wordlist_path(data_dir).write_text("敏感,illegal\n", encoding="utf-8")
    reset_cache_for_tests()

    resp = client.post(f"/api/books/{book}/audit/sensitive")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "total_hits": 1,
        "wordlist_available": True,
        "hits": [{"word": "敏感", "category": "illegal", "chapter_seq": 1, "count": 1}],
    }


def test_sensitive_wordlist_available_flag_true_when_configured(client, book, tmp_path):
    """词库存在时 wordlist_available 为 true（显式钉死语义）。"""
    _add_chapter(client, book, "正文里没有敏感内容。")
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    wordlist_path(data_dir).write_text("某词,illegal\n", encoding="utf-8")
    reset_cache_for_tests()

    body = client.post(f"/api/books/{book}/audit/sensitive").json()
    assert body["wordlist_available"] is True
    assert body["total_hits"] == 0  # 词库有词、正文没命中 → 这才是真正的「0 命中」


def test_sensitive_endpoint_book_not_found(client):
    resp = client.post("/api/books/不存在的书/audit/sensitive")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "BOOK_NOT_FOUND"


# ============================================================ 词库状态三态
def test_wordlist_status_three_states(client, tmp_path):
    # 1) 未配置
    body = client.get("/api/audit/wordlist-status").json()
    assert body["configured"] is False
    assert body["count"] == 0
    assert body["path"].endswith("sensitive_words.txt")

    # 2) 已配置 N 条（变体分别计入）
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    wordlist_path(data_dir).write_text("词甲,illegal\n词乙|词丙,other\n", encoding="utf-8")
    reset_cache_for_tests()
    body = client.get("/api/audit/wordlist-status").json()
    assert body["configured"] is True
    assert body["count"] == 3

    # 3) 词库为空（只有注释）-> 视为未配置
    wordlist_path(data_dir).write_text("# 注释\n\n", encoding="utf-8")
    reset_cache_for_tests()
    body = client.get("/api/audit/wordlist-status").json()
    assert body["configured"] is False
    assert body["count"] == 0


# ================================= 回归：仓储白名单不静默接受越界字段（坑 1）
def test_chapter_save_ignores_non_whitelisted_fields(client, book):
    """正文保存走列白名单，`status` 等回写字段必须经 `finalize` 专用路径；
    `save` 不得静默把它们写进库（否则就是"零报错却改错数据"）。"""
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "白名单"}).json()
    registry = get_registry()
    with registry.database(book).transaction() as conn:
        chapter_repo.save(conn, ch["id"], {"title": "改过的标题", "status": "done"}, now_iso())
    with registry.database(book).connection() as conn:
        row = chapter_repo.get(conn, ch["id"])
    assert row["title"] == "改过的标题"  # 白名单内字段正常写入
    assert row["status"] == "draft"  # 白名单外字段被忽略，未被静默改写
