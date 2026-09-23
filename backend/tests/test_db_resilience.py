"""连接层健壮性回归：句柄释放（P0-1 副作用）+ 忙锁可重试语义（A-06）。

- T2：`connect()` 配置过程抛错时**必须 close**，否则异常 traceback 持有连接引用，
  在 Windows 上表现为文件句柄不释放（`books/AUX` 就是被这样锁死、删不掉的）。
- T3：`PRAGMA journal_mode = WAL` 只在建库时设一次；忙锁返回可重试的 `DB_BUSY`（503），
  而不是不可重试的 `INTERNAL_ERROR`（500）。
"""

from __future__ import annotations

import sqlite3

import pytest

from app.config import settings
from app.db import connection as connection_mod
from app.db.connection import connect, is_busy_error, probe_capabilities


# ------------------------------------------------------------------ T2 句柄释放
class _BoomOnPragma(sqlite3.Connection):
    """真实连接子类：遇到指定 PRAGMA 时抛错，用于模拟配置阶段失败。"""

    def execute(self, sql, *args):  # noqa: ANN001, ANN002
        if "foreign_keys" in sql:
            raise sqlite3.OperationalError("simulated pragma failure")
        return super().execute(sql, *args)


def test_connect_closes_handle_when_pragma_fails(tmp_path, monkeypatch):
    caps = probe_capabilities()  # 先取好（缓存），避免探测自身也走被替换的 connect
    real_connect = sqlite3.connect
    created: list[sqlite3.Connection] = []

    def fake_connect(*args, **kwargs):
        kwargs["factory"] = _BoomOnPragma
        conn = real_connect(*args, **kwargs)
        created.append(conn)
        return conn

    monkeypatch.setattr(connection_mod.sqlite3, "connect", fake_connect)

    db_path = tmp_path / "boom.db"
    with pytest.raises(sqlite3.OperationalError):
        connect(db_path, caps=caps)

    assert len(created) == 1
    # 连接必须已被 close：对已关闭连接执行语句会抛 ProgrammingError
    with pytest.raises(sqlite3.ProgrammingError):
        created[0].execute("SELECT 1")
    # 文件句柄已释放 → Windows 上可以删除该文件（不抛 PermissionError）
    db_path.unlink()


def test_connect_keeps_vec_degrade_semantics(tmp_path, monkeypatch):
    """vec 加载失败是**有意降级**：只记 WARN，连接仍须成功返回（不得被 close）。"""
    import sqlite_vec

    def boom(_conn):  # noqa: ANN001
        raise RuntimeError("simulated vec load failure")

    monkeypatch.setattr(sqlite_vec, "load", boom)
    caps = probe_capabilities()
    assert caps.vec_available is True

    conn = connect(tmp_path / "degrade.db", caps=caps)
    try:
        # 连接可用（降级不抛）
        assert conn.execute("SELECT 1").fetchone()[0] == 1
    finally:
        conn.close()


# --------------------------------------------------------------- T3 WAL 只在建库设
def test_existing_book_db_stays_wal_after_plain_connect(client, book):
    """已有库不会被「不再每次执行 WAL PRAGMA」的改动破坏成非 WAL。"""
    db_path = settings.books_dir / book / "novel.db"
    assert _journal_mode(connect(db_path)) == "wal"


def _journal_mode(conn: sqlite3.Connection) -> str:
    try:
        return str(conn.execute("PRAGMA journal_mode").fetchone()[0]).lower()
    finally:
        conn.close()


def test_new_book_db_is_wal(client, book):
    assert _journal_mode(connect(settings.books_dir / book / "novel.db")) == "wal"


def test_global_db_is_wal(client):
    from app.db.global_db import get_global_database, global_db_path

    get_global_database()  # 触发建库
    assert _journal_mode(connect(global_db_path())) == "wal"


# --------------------------------------------------------------- T3 忙锁可重试
def test_is_busy_error_detects_locked_only():
    assert is_busy_error(sqlite3.OperationalError("database is locked"))
    assert is_busy_error(sqlite3.OperationalError("database table is locked"))
    assert not is_busy_error(sqlite3.OperationalError("no such table: chapter"))
    assert not is_busy_error(RuntimeError("database is locked"))


def test_write_under_contention_returns_retryable_db_busy(client, book, monkeypatch):
    """另一个连接持有写事务时，PATCH 必须返回可重试的 `DB_BUSY`/503，而不是 500。"""
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "争锁章"}).json()
    monkeypatch.setattr(connection_mod, "BUSY_TIMEOUT_MS", 1)  # 快速触发忙锁

    db_path = settings.books_dir / book / "novel.db"
    holder = sqlite3.connect(db_path, isolation_level=None)
    try:
        holder.execute("BEGIN IMMEDIATE")
        holder.execute("UPDATE chapter SET title = title WHERE id = ?", (ch["id"],))
        resp = client.patch(f"/api/chapters/{ch['id']}", json={"content": "改不动"})
    finally:
        holder.rollback()
        holder.close()

    assert resp.status_code == 503, resp.text
    assert resp.json()["error"]["code"] == "DB_BUSY"
