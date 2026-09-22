"""跨库定位辅助：判断某 id 是否存在于本库（用于 by-id 端点解析所在作品）。

按资源显式函数，避免动态拼接表名。
"""

from __future__ import annotations

import sqlite3

from app.repositories.base import fetch_scalar


def _has(conn: sqlite3.Connection, table: str, id_value: int) -> bool:
    return fetch_scalar(conn, f"SELECT 1 FROM {table} WHERE id = ?", (id_value,)) is not None


def has_book(conn: sqlite3.Connection, id_value: int) -> bool:
    return _has(conn, "book", id_value)


def has_character(conn: sqlite3.Connection, id_value: int) -> bool:
    return _has(conn, "character", id_value)


def has_world_entry(conn: sqlite3.Connection, id_value: int) -> bool:
    return _has(conn, "world_entry", id_value)


def has_foreshadow(conn: sqlite3.Connection, id_value: int) -> bool:
    return _has(conn, "foreshadow", id_value)


def has_outline(conn: sqlite3.Connection, id_value: int) -> bool:
    return _has(conn, "outline", id_value)


def has_chapter(conn: sqlite3.Connection, id_value: int) -> bool:
    return _has(conn, "chapter", id_value)
