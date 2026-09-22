"""正文辅助 AI 的**上下文组装层**：4 个写作能力 + 一致性审校共用同一个「记忆包」。

## 为什么单独抽一层

老板的原话是：「**ai 应该是要有记忆，和记录当前这篇小说的全部设定的**」。
而改之前，全项目唯一的 AI 对话（`setup_chat`）**只喂了书名 / 题材 / 简介三行** ——
AI 根本不知道这本书写过什么，等于白聊。

本模块负责把「记忆」真正组装出来：

    书名 / 题材 / 卖点
  + 设定库（人物卡四要素 + 世界观词条）
  + 本章出场人物及其**截至本章的现状**
  + 还没回收的伏笔（读者会记得，忘了就是"吃书"）
  + 本章大纲 + 上一章摘要
  + 最近正文（接住语气与场景）

**纪律：任何需要"懂这本书"的 AI 能力都必须经这里取上下文，不许各自拼字符串。**
否则「上下文里到底喂了什么」会散落在 N 个 service 里，改一处漏一处——
本项目已经因为"双真源"吃过一次亏（见 ADR-006）。

## 预算与降级

设定库可能很长（一本书几百个词条），无节制塞进去会把上下文窗口吃光。
所以每块都有字符预算，超了**按块截断并明确标注"（已截断）"**，
而不是静默丢掉 —— 静默截断会让模型以为"设定就这么少"，然后开始编。
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from app.repositories import (
    book_repo,
    chapter_repo,
    character_repo,
    foreshadow_repo,
    memory_repo,
    outline_repo,
    world_entry_repo,
)
from app.services.presence import characters_in_text
from app.utils.text import count_words, strip_html

# 各块字符预算（中文字符）。超预算按块截断并标注，绝不静默。
MAX_SETTINGS_CHARS = 6000
MAX_CHARACTERS_CHARS = 2000
MAX_OUTLINE_CHARS = 1500
MAX_SUMMARY_CHARS = 1200
RECENT_TEXT_CHARS = 2500
MAX_FORESHADOWS = 20
MAX_FALLBACK_CHARACTERS = 8


def clip_text(text: str, budget: int) -> str:
    """按字符预算截断，并**明确标注**被截断了（静默截断会让模型以为设定就这么多）。

    公开函数：`writing_ai_service` / `consistency_service` 也要用它截断待处理文本。
    """
    text = (text or "").strip()
    if len(text) <= budget:
        return text
    return text[:budget].rstrip() + f"\n…（内容过长，已截断，仅保留前 {budget} 字）"


@dataclass
class WritingContext:
    """一次写作 AI 调用所需的全部上下文（只读快照）。"""

    slug: str
    book_title: str
    book_genre: str
    book_premise: str
    chapter_seq: int
    chapter_title: str
    settings: str
    characters: str
    open_foreshadows: str
    chapter_outline: str
    prev_summary: str
    recent_text: str
    chapter_text: str
    character_states_history: str = ""

    def variables(self) -> dict[str, object]:
        """转成提示词插值变量（键名与 prompts/*.md 里的占位符一一对应）。"""
        return {
            "book_title": self.book_title,
            "book_genre": self.book_genre,
            "book_premise": self.book_premise,
            "chapter_seq": self.chapter_seq,
            "chapter_title": self.chapter_title,
            "settings": self.settings or "（设定库还是空的）",
            "characters": self.characters or "（本章没有识别到已登记的人物）",
            "open_foreshadows": self.open_foreshadows or "（没有未回收的伏笔）",
            "chapter_outline": self.chapter_outline or "（本章还没有写大纲要点）",
            "prev_summary": self.prev_summary or "（第一章，没有上一章）",
            "recent_text": self.recent_text or "（本章正文还是空的，属于开篇）",
            "character_states_history": self.character_states_history or "（暂无状态变更记录）",
        }


def _settings_text(conn: sqlite3.Connection) -> str:
    """设定库全文：人物卡（四要素）+ 世界观词条。"""
    lines: list[str] = []

    for row in character_repo.all_rows(conn):
        parts = [f"- {row['name']}（{row.get('role') or '未标注'}）"]
        for label, key in (
            ("表面身份", "surface_identity"),
            ("秘密欲望", "secret_desire"),
            ("致命弱点", "fatal_weakness"),
            ("矛盾行为", "contradiction"),
            ("外貌", "appearance"),
            ("背景", "background"),
        ):
            value = (row.get(key) or "").strip()
            if value:
                parts.append(f"    {label}：{value}")
        if row.get("status"):
            parts.append(f"    当前生死：{row['status']}")
        lines.append("\n".join(parts))

    world_rows = world_entry_repo.all_rows(conn)
    if world_rows:
        lines.append("")
        lines.append("【世界观 / 设定词条】")
        for row in world_rows:
            content = (row.get("content") or "").strip()
            lines.append(f"- [{row.get('category') or 'other'}] {row['name']}"
                         + (f"：{content}" if content else ""))

    return clip_text("\n".join(lines), MAX_SETTINGS_CHARS)


def _characters_text(conn: sqlite3.Connection, chapter: dict) -> str:
    """本章出场人物 + **截至本章的现状**。

    优先按「正文里出现过的名字」识别（与召回同源，见 `presence.characters_in_text`）；
    正文为空（开篇）时退回设定库前若干个角色。
    """
    seq = int(chapter.get("seq") or 1)
    found = characters_in_text(conn, chapter.get("content") or "")
    if not found:
        found = character_repo.all_rows(conn)[:MAX_FALLBACK_CHARACTERS]

    lines: list[str] = []
    for char in found:
        latest = memory_repo.latest_state(conn, int(char["id"]), seq)
        state = (latest or {}).get("state")
        where = (latest or {}).get("chapter_seq")
        desc = f"- {char['name']}（{char.get('role') or '未标注'}）"
        if state:
            desc += f"｜第 {where} 章时的状态：{state}"
        else:
            desc += "｜暂无状态记录"
        lines.append(desc)

    return clip_text("\n".join(lines), MAX_CHARACTERS_CHARS)


def _foreshadows_text(conn: sqlite3.Connection, seq: int) -> str:
    """未回收伏笔，按重要度排序后取前 N 条（与召回同一套截断口径）。"""
    rows = foreshadow_repo.open_foreshadows(conn)[:MAX_FORESHADOWS]
    lines: list[str] = []
    for row in rows:
        planted = row.get("planted_chapter_seq")
        age = f"（已埋 {seq - int(planted)} 章）" if planted else ""
        lines.append(
            f"- [{row.get('importance') or 'medium'}] {row['title']}{age}"
        )
    return "\n".join(lines)


def _outline_text(conn: sqlite3.Connection, chapter_id: int) -> str:
    from app.repositories.base import fetch_all

    rows = fetch_all(
        conn,
        "SELECT content FROM outline WHERE level = 'chapter' AND chapter_id = ?",
        (chapter_id,),
    )
    text = "\n".join((r.get("content") or "").strip() for r in rows if r.get("content"))
    return clip_text(text, MAX_OUTLINE_CHARS)


def _prev_summary(conn: sqlite3.Connection, seq: int) -> str:
    prev = chapter_repo.get_by_seq(conn, seq - 1)
    if not prev:
        return ""
    summary = (prev.get("chapter_summary") or "").strip()
    if summary:
        return clip_text(summary, MAX_SUMMARY_CHARS)
    # 没有记忆摘要时，退回"上一章正文的尾巴"，至少让模型知道刚写到哪
    tail = strip_html(prev.get("content") or "").strip()
    return clip_text(tail[-MAX_SUMMARY_CHARS:], MAX_SUMMARY_CHARS)


def _recent_text(chapter_text: str) -> str:
    """本章正文的**尾部**（续写要接住的正是这里）。"""
    text = chapter_text.strip()
    if not text:
        return ""
    return "…" + text[-RECENT_TEXT_CHARS:] if len(text) > RECENT_TEXT_CHARS else text


def _states_history(conn: sqlite3.Connection, seq: int) -> str:
    """角色状态变更历史（审校用：判断"已死角色又出场"这类矛盾要靠它）。"""
    from app.repositories.base import fetch_all

    rows = fetch_all(
        conn,
        """
        SELECT c.name AS name, s.chapter_seq AS seq, s.state AS state
        FROM character_state s
        JOIN character c ON c.id = s.character_id
        WHERE s.chapter_seq <= ?
        ORDER BY s.chapter_seq ASC, s.id ASC
        """,
        (seq,),
    )
    lines = [f"- 第 {r['seq']} 章｜{r['name']}：{r['state']}" for r in rows if r.get("state")]
    return clip_text("\n".join(lines), MAX_SUMMARY_CHARS * 2)


def load(conn: sqlite3.Connection, slug: str, chapter: dict) -> WritingContext:
    """组装一次写作 AI 调用的完整上下文。**只读，无副作用。**"""
    book = book_repo.get_row(conn) or {}
    seq = int(chapter.get("seq") or 1)
    chapter_text = strip_html(chapter.get("content") or "").strip()

    return WritingContext(
        slug=slug,
        book_title=(book.get("title") or "").strip() or "（未命名）",
        book_genre=(book.get("genre") or "").strip() or "（未指定）",
        book_premise=(book.get("premise") or "").strip() or "（未填写）",
        chapter_seq=seq,
        chapter_title=(chapter.get("title") or "").strip() or "（未命名）",
        settings=_settings_text(conn),
        characters=_characters_text(conn, chapter),
        open_foreshadows=_foreshadows_text(conn, seq),
        chapter_outline=_outline_text(conn, int(chapter["id"])),
        prev_summary=_prev_summary(conn, seq),
        recent_text=_recent_text(chapter_text),
        chapter_text=chapter_text,
        character_states_history=_states_history(conn, seq),
    )


def chapter_word_count(chapter: dict) -> int:
    return count_words(chapter.get("content") or "")
