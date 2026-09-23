"""导出服务（R16）：txt / docx，支持章节范围。"""

from __future__ import annotations

import io
import re
from urllib.parse import quote

from app.db.registry import get_registry
from app.errors import ValidationError
from app.logging_config import get_logger, log_fields
from app.repositories import chapter_repo
from app.services import workspace
from app.utils.text import strip_html

logger = get_logger(__name__)

_RANGE_RE = re.compile(r"^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$")

# 标题里已有的章号前缀，如「第1章」「第 12 章：」「第3章、」。
# 本项目章节 title 常被自动填成「第1章」这类题名，导出时必须先剥掉，
# 否则会渲染成「第1章 第1章」（P1）。数字一律以 row["seq"] 为准。
_CHAPTER_PREFIX_RE = re.compile(r"^\s*第\s*\d+\s*章\s*[：:、.．\-—]?\s*")


def parse_range(text: str | None) -> tuple[int | None, int | None]:
    if not text:
        return None, None
    m = _RANGE_RE.match(text)
    if not m:
        raise ValidationError(f"章节范围格式不正确：{text}（应为 1-10 或 5）")
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else start
    if start < 1 or end < 1 or end < start:
        raise ValidationError(f"章节范围不合法：{text}")
    return start, end


def _load_chapters(slug: str, range_text: str | None) -> tuple[list[dict], str]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    start, end = parse_range(range_text)
    with registry.database(slug).connection() as conn:
        rows = chapter_repo.list_full_chapters(conn, start, end)
    meta = registry.read_meta(slug)
    return rows, (meta.get("title") or slug)


def _chapter_heading(row: dict) -> str:
    """章节标题：**只输出一个章号**，章号取自 `row["seq"]`。

    四种输入都收敛到同一形态（title 自带的章号一律丢弃，以 seq 为准）：
      ""            → 第5章
      "第1章"        → 第5章          （仅含章号）
      "第1章 风雪夜"  → 第5章 风雪夜   （剥掉旧前缀）
      "风雪夜"       → 第5章 风雪夜   （无章号，直接加前缀）
    """
    title = _CHAPTER_PREFIX_RE.sub("", (row.get("title") or "").strip()).strip()
    if not title:
        return f"第{row['seq']}章"
    return f"第{row['seq']}章 {title}"


def export_txt(slug: str, range_text: str | None) -> tuple[bytes, str]:
    rows, book_title = _load_chapters(slug, range_text)
    blocks: list[str] = [book_title, ""]
    for row in rows:
        blocks.append(_chapter_heading(row))
        blocks.append("")
        blocks.append(strip_html(row.get("content") or "").strip())
        blocks.append("")
    text = "\n".join(blocks).strip() + "\n"
    logger.info("export txt", **log_fields(slug=slug, chapters=len(rows)))
    return text.encode("utf-8"), f"{book_title}.txt"


def export_docx(slug: str, range_text: str | None) -> tuple[bytes, str]:
    from docx import Document

    rows, book_title = _load_chapters(slug, range_text)
    doc = Document()
    doc.add_heading(book_title, level=0)
    for row in rows:
        doc.add_heading(_chapter_heading(row), level=1)
        body = strip_html(row.get("content") or "").strip()
        for para in [p for p in body.split("\n") if p.strip()]:
            doc.add_paragraph(para)
    buffer = io.BytesIO()
    doc.save(buffer)
    logger.info("export docx", **log_fields(slug=slug, chapters=len(rows)))
    return buffer.getvalue(), f"{book_title}.docx"


def content_disposition(filename: str) -> str:
    ascii_fallback = re.sub(r"[^A-Za-z0-9_.-]", "_", filename) or "export"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"
