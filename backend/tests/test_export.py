"""步骤 6：导出 txt / docx 与范围过滤、字数统计。"""

from __future__ import annotations

import io

from app.config import settings
from app.services.export_service import _chapter_heading
from app.utils.text import count_words


def _seed(client, book, n=3):
    ids = []
    for i in range(1, n + 1):
        ch = client.post(f"/api/books/{book}/chapters", json={"title": f"标题{i}"}).json()
        client.patch(f"/api/chapters/{ch['id']}", json={"content": f"第{i}章的正文内容。"})
        ids.append(ch)
    return ids


def test_export_txt_utf8_and_range(client, book):
    _seed(client, book, 3)
    resp = client.get(f"/api/books/{book}/export?format=txt&range=1-2")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/plain")
    text = resp.content.decode("utf-8")
    assert "第1章 标题1" in text
    assert "第2章 标题2" in text
    assert "第3章 标题3" not in text
    assert "第1章的正文内容。" in text


def test_export_txt_full(client, book):
    _seed(client, book, 2)
    text = client.get(f"/api/books/{book}/export?format=txt").content.decode("utf-8")
    assert "第1章" in text and "第2章" in text


def test_export_docx_opens(client, book):
    _seed(client, book, 2)
    resp = client.get(f"/api/books/{book}/export?format=docx")
    assert resp.status_code == 200
    from docx import Document

    doc = Document(io.BytesIO(resp.content))
    headings = [p.text for p in doc.paragraphs if p.style.name.startswith("Heading")]
    assert any("第1章" in h for h in headings)


def test_export_bad_range_rejected(client, book):
    _seed(client, book, 1)
    resp = client.get(f"/api/books/{book}/export?format=txt&range=abc")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_export_bad_format_rejected(client, book):
    resp = client.get(f"/api/books/{book}/export?format=pdf")
    assert resp.status_code == 400


def test_chapter_heading_never_repeats_chapter_number():
    """P1 回归：标题只出现一个章号，且章号一律以 seq 为准。"""
    cases = [
        (None, "第5章"),
        ("", "第5章"),
        ("   ", "第5章"),
        ("第1章", "第5章"),  # 仅含章号 → 丢掉 title 里的数字
        ("第1章 风雪夜", "第5章 风雪夜"),  # 带章号前缀 → 剥掉后保留题名
        ("第 12 章：风雪夜", "第5章 风雪夜"),  # 章号与 seq 不一致 → 以 seq 为准
        ("第3章、旧题", "第5章 旧题"),
        ("风雪夜", "第5章 风雪夜"),  # 无章号 → 直接加前缀
    ]
    for title, expected in cases:
        assert _chapter_heading({"seq": 5, "title": title}) == expected, title


def test_export_txt_does_not_repeat_chapter_number(client, book):
    """P1 端到端：真实作品的 title 本就是「第N章」，导出不得拼成「第1章 第1章」。"""
    first = client.post(f"/api/books/{book}/chapters", json={"title": "第1章"}).json()
    client.patch(f"/api/chapters/{first['id']}", json={"content": "正文一。"})
    second = client.post(
        f"/api/books/{book}/chapters", json={"title": "第2章 风雪夜"}
    ).json()
    client.patch(f"/api/chapters/{second['id']}", json={"content": "正文二。"})

    text = client.get(f"/api/books/{book}/export?format=txt").content.decode("utf-8")
    assert "第1章 第1章" not in text
    assert "第2章 第2章" not in text
    assert "\n第1章\n" in text
    assert "\n第2章 风雪夜\n" in text


def test_stats_reflects_written_words(client, book):
    _seed(client, book, 3)
    stats = client.get(f"/api/books/{book}/stats").json()
    assert stats["chapter_count"] == 3
    # 与全书统一口径（标点不计）一致：用 count_words 而不是 len
    assert stats["total_words"] == sum(
        count_words(f"第{i}章的正文内容。") for i in range(1, 4)
    )


# ------------------------------------------------------------- 整本备份 zip
def test_backup_returns_valid_zip_with_db_and_meta(client, book, tmp_path):
    import io
    import zipfile

    ch = client.post(f"/api/books/{book}/chapters", json={"title": "备份章"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "这段必须出现在备份库里。"})
    # 原子写 meta 的残留 tmp 文件不得进包（白名单打包）
    (settings.books_dir / book / "meta.json.deadbeef.tmp").write_text("{}", encoding="utf-8")

    resp = client.get(f"/api/books/{book}/backup")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert "Content-Disposition" in resp.headers

    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = set(zf.namelist())
    assert "novel.db" in names and "meta.json" in names
    assert not any(n.endswith(("-wal", "-shm")) for n in names)
    assert not any(n.endswith(".tmp") for n in names), "meta 原子写残留不该进备份包"
    # 备份库是完整可用的 SQLite：能查到刚写的正文
    with zf.open("novel.db") as fh:
        raw = fh.read()
    import sqlite3

    db_file = tmp_path / "restored.db"
    db_file.write_bytes(raw)
    conn = sqlite3.connect(db_file)
    try:
        row = conn.execute("SELECT content FROM chapter LIMIT 1").fetchone()
        assert row and "这段必须出现在备份库里。" in row[0]
    finally:
        conn.close()


def test_backup_unknown_book_404(client):
    resp = client.get("/api/books/不存在的书/backup")
    assert resp.status_code == 404
