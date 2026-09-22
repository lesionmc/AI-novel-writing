"""步骤 6：导出 txt / docx 与范围过滤、字数统计。"""

from __future__ import annotations

import io


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


def test_stats_reflects_written_words(client, book):
    _seed(client, book, 3)
    stats = client.get(f"/api/books/{book}/stats").json()
    assert stats["chapter_count"] == 3
    assert stats["total_words"] == sum(
        len(f"第{i}章的正文内容。") for i in range(1, 4)
    )
