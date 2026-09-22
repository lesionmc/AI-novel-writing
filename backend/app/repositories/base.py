"""仓储层通用工具：全部参数化查询，禁止字符串拼接 SQL。"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Sequence
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


def build_update(
    table: str,
    fields: dict[str, Any],
    where: str,
    where_params: Iterable[Any],
) -> tuple[str, list[Any]] | None:
    """按白名单字段构造 UPDATE 语句（表名/列名来自代码常量，值全部参数化）。"""
    if not fields:
        return None
    assignments = ", ".join(f"{col} = ?" for col in fields)
    sql = f"UPDATE {table} SET {assignments} WHERE {where}"
    return sql, [*fields.values(), *where_params]
