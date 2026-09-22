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
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)


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


def connect(db_path: Path, caps: Capabilities | None = None) -> sqlite3.Connection:
    """打开并配置一个 SQLite 连接（外键开、WAL、Row 工厂、按需加载扩展）。"""
    caps = caps or probe_capabilities()
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
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
    return conn


class Database:
    """单个作品库的连接持有者。单用户单机，用一把可重入锁串行化写操作。"""

    def __init__(self, path: Path, caps: Capabilities) -> None:
        self.path = Path(path)
        self.caps = caps
        self.lock = threading.RLock()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = connect(self.path, self.caps)
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """单事务上下文：全部成功提交，异常回滚。"""
        conn = connect(self.path, self.caps)
        try:
            with self.lock:
                try:
                    yield conn
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
        finally:
            conn.close()
