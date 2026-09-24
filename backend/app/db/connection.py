"""SQLite 连接层与启动能力自检（Spec 第 11 章坑 1/2/3）。

三项自检：
  1. hasattr(conn, "enable_load_extension")  —— Python 是否支持加载扩展
  2. sqlite-vec 加载后 SELECT vec_version()  —— 向量扩展是否可用
  3. PRAGMA compile_options 含 ENABLE_FTS5   —— FTS5 是否编入

任一失败 **降级而非报错**：跳过 vec_chunk / 跳过两张 FTS 表，
把降级原因写进结构化日志。缺扩展也必须能建出可用的库（红线 3）。
"""

from __future__ import annotations

import sqlite3
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from app.errors import DatabaseBusyError
from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

# SQLite 忙等待时长：写锁被别的连接持有时，让 SQLite 自己等这么久再报 SQLITE_BUSY。
# 抽成模块常量是为了让测试能短暂调小它，从而快速触发忙锁路径（不必真等 5 秒）。
BUSY_TIMEOUT_MS = 5000

# `transaction()` 提交阶段的忙锁重试上限与退避（指数：50ms/100ms/200ms，总计 < 0.4s）。
TXN_MAX_RETRIES = 3
TXN_RETRY_BASE_DELAY = 0.05

_BUSY_MARKERS = ("database is locked", "database table is locked")


def is_busy_error(exc: BaseException) -> bool:
    """该异常是否为 SQLite「忙锁」类错误（可重试）。

    WAL 下读写并发良好，但**写-写**仍会争锁。忙锁是**暂时性**的，
    不该被当成不可重试的 500（A-06 / P1-3）。
    """
    if not isinstance(exc, sqlite3.OperationalError):
        return False
    message = str(exc).lower()
    return any(marker in message for marker in _BUSY_MARKERS)



@dataclass(frozen=True)
class Capabilities:
    """运行时数据库能力，决定 schema 条件化对象与召回降级路径。"""

    loadable_extension: bool
    vec_available: bool
    vec_version: str | None
    fts5_available: bool
    degrade_reasons: tuple[str, ...]

    def as_dict(self) -> dict[str, object]:
        return {
            "loadable_extension": self.loadable_extension,
            "vec_available": self.vec_available,
            "vec_version": self.vec_version,
            "fts5_available": self.fts5_available,
            "degrade_reasons": list(self.degrade_reasons),
        }


_caps_lock = threading.Lock()
_caps_cache: Capabilities | None = None


def _probe_fts5(conn: sqlite3.Connection) -> bool:
    try:
        rows = conn.execute("PRAGMA compile_options").fetchall()
    except sqlite3.Error:
        return False
    compiled = any("ENABLE_FTS5" in str(r[0]) for r in rows)
    if not compiled:
        return False
    try:
        conn.execute("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x)")
        conn.execute("DROP TABLE temp.__fts5_probe")
        return True
    except sqlite3.Error:
        return False


def _probe_vec(conn: sqlite3.Connection) -> tuple[bool, str | None, str]:
    """返回 (是否可用, vec_version, 失败原因)。"""
    try:
        import sqlite_vec  # type: ignore
    except Exception as exc:  # pragma: no cover - 依赖缺失路径
        return False, None, f"未能 import sqlite_vec: {exc.__class__.__name__}"
    try:
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
    except Exception as exc:
        return False, None, f"加载 sqlite-vec 扩展失败: {exc.__class__.__name__}: {exc}"
    try:
        row = conn.execute("SELECT vec_version()").fetchone()
        return True, str(row[0]), ""
    except sqlite3.Error as exc:
        return False, None, f"vec_version() 自检失败: {exc}"


def probe_capabilities(force: bool = False) -> Capabilities:
    """执行三项启动自检，结果进程内缓存。"""
    global _caps_cache
    with _caps_lock:
        if _caps_cache is not None and not force:
            return _caps_cache

        reasons: list[str] = []
        conn = sqlite3.connect(":memory:")
        try:
            loadable = hasattr(conn, "enable_load_extension")
            if not loadable:
                reasons.append(
                    "Python 未启用可加载扩展 (hasattr enable_load_extension=False)"
                )

            vec_ok, vec_version, vec_reason = (False, None, "")
            if loadable:
                vec_ok, vec_version, vec_reason = _probe_vec(conn)
            else:
                vec_reason = "上游能力缺失：Python 不支持加载扩展"
            if not vec_ok:
                reasons.append(f"向量扩展不可用，跳过 vec_chunk：{vec_reason}")

            fts5_ok = _probe_fts5(conn)
            if not fts5_ok:
                reasons.append("FTS5 未编入，跳过 chapter_fts / setting_fts 全文检索表")

            caps = Capabilities(
                loadable_extension=loadable,
                vec_available=vec_ok,
                vec_version=vec_version,
                fts5_available=fts5_ok,
                degrade_reasons=tuple(reasons),
            )
        finally:
            conn.close()

        _caps_cache = caps
        logger.info(
            "db capabilities probed",
            **log_fields(**caps.as_dict()),
        )
        for reason in caps.degrade_reasons:
            logger.warning("db capability degraded", **log_fields(reason=reason))
        return caps


def reset_capability_cache() -> None:
    """仅供测试使用：清空能力缓存。"""
    global _caps_cache
    with _caps_lock:
        _caps_cache = None


def enable_wal(conn: sqlite3.Connection) -> None:
    """把库切到 WAL 模式。

    `PRAGMA journal_mode` 是**写性质**操作：每次建连接都执行会争库锁，是
    `database is locked`（A-06）的诱因之一。因此**只在建库时调用一次**
    （`BookRegistry.create` / 全局库首次建库）。WAL 是**持久化**属性，写在库文件头里，
    之后只读连接不会把它改回去。
    """
    conn.execute("PRAGMA journal_mode = WAL")


def connect(db_path: Path, caps: Capabilities | None = None) -> sqlite3.Connection:
    """打开并配置一个 SQLite 连接（外键开、Row 工厂、增长忙等待、按需加载扩展）。

    配置过程**任一步抛错都先 `close()` 再抛**：否则异常 traceback 会一直持有连接引用，
    Windows 上表现为文件句柄不释放（库被进程独占 → 无法移动/删除，见 P0-1 的 `books/AUX`）。
    sqlite-vec 加载失败是**有意降级**（只记 WARN 不抛），这里的 try/except 不得改变该语义。
    """
    caps = caps or probe_capabilities()
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute(f"PRAGMA busy_timeout = {int(BUSY_TIMEOUT_MS)}")
        if caps.vec_available:
            try:
                conn.enable_load_extension(True)
                import sqlite_vec  # type: ignore

                sqlite_vec.load(conn)
                conn.enable_load_extension(False)
            except Exception as exc:  # pragma: no cover - 运行时降级
                logger.warning(
                    "vec extension load failed on connection; degrade",
                    **log_fields(error=exc.__class__.__name__),
                )
    except BaseException:
        conn.close()
        raise
    return conn


class Database:
    """单个作品库的连接持有者。单用户单机，用一把可重入锁串行化写操作。"""

    def __init__(self, path: Path, caps: Capabilities) -> None:
        self.path = Path(path)
        self.caps = caps
        self.lock = threading.RLock()
        self._migrated = False

    def _ensure_migrated(self, conn: sqlite3.Connection) -> None:
        """每库每进程补一次列（老作品缺列会在读写时静默 500）。"""
        if self._migrated:
            return
        with self.lock:
            if self._migrated:
                return
            from app.db.schema_loader import ensure_book_migrations

            ensure_book_migrations(conn)
            self._migrated = True

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = connect(self.path, self.caps)
        try:
            self._ensure_migrated(conn)
            yield conn
        finally:
            conn.close()

    def commit_with_retry(self, conn: sqlite3.Connection) -> None:
        """提交带**有限重试**：忙锁时退避重试，最多 `TXN_MAX_RETRIES` 次。

        为什么只重试提交：SQLite 的写锁在第一条写语句处获取、在提交时释放，
        提交是最后一道可能撞上忙锁的关口。**调用方的事务体无法在此重跑**
        （`contextmanager` 的 `yield` 每次 `with` 只能产出一次，重跑会破坏语义），
        所以事务体阶段撞锁一律翻译成可重试的 `DatabaseBusyError`（503），
        由客户端在合适时机重试，而不是伪装成不可重试的 500。
        """
        delay = TXN_RETRY_BASE_DELAY
        for attempt in range(1, TXN_MAX_RETRIES + 1):
            try:
                conn.commit()
                if attempt > 1:
                    logger.warning(
                        "db busy: commit succeeded after retry",
                        **log_fields(attempt=attempt, path=str(self.path)),
                    )
                return
            except sqlite3.OperationalError as exc:
                if not is_busy_error(exc) or attempt == TXN_MAX_RETRIES:
                    logger.warning(
                        "db busy: commit gave up",
                        **log_fields(attempt=attempt, path=str(self.path)),
                    )
                    try:
                        conn.rollback()  # 提交失败后事务仍开着，尽力回滚
                    except sqlite3.Error:
                        pass
                    raise DatabaseBusyError() from exc
                logger.warning(
                    "db busy: retrying commit",
                    **log_fields(attempt=attempt, delay=round(delay, 3), path=str(self.path)),
                )
                time.sleep(delay)
                delay *= 2

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """单事务上下文：全部成功提交，异常回滚；忙锁翻译成可重试错误。"""
        conn = connect(self.path, self.caps)
        try:
            self._ensure_migrated(conn)
            with self.lock:
                try:
                    yield conn
                except sqlite3.OperationalError as exc:
                    conn.rollback()
                    if is_busy_error(exc):
                        logger.warning(
                            "db busy: transaction body", **log_fields(path=str(self.path))
                        )
                        raise DatabaseBusyError() from exc
                    raise
                except Exception:
                    conn.rollback()
                    raise
                self.commit_with_retry(conn)
        finally:
            conn.close()
