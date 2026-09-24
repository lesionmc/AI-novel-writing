"""仓储层通用工具：全部参数化查询，禁止字符串拼接 SQL。"""

from __future__ import annotations

import sqlite3
from collections.abc import Sequence
from typing import Any


def fetch_one(conn: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> dict | None:
    row = conn.execute(sql, params).fetchone()
    return dict(row) if row is not None else None


def fetch_all(conn: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> list[dict]:
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def fetch_scalar(conn: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> Any:
    row = conn.execute(sql, params).fetchone()
    return row[0] if row is not None else None


def execute(conn: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> int:
    cur = conn.execute(sql, params)
    return cur.rowcount


def insert(conn: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> int:
    cur = conn.execute(sql, params)
    return int(cur.lastrowid or 0)
