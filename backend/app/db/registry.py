"""作品库注册表（基础设施层）。

一书一库：`books/<slug>/novel.db`。切换作品 = 切换库路径。
连接按 slug 缓存，各书独立，避免 WAL 句柄与路径串书（坑 20）。
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings
from app.db.connection import Capabilities, Database, connect, probe_capabilities
from app.db.schema_loader import apply_schema, missing_objects
from app.errors import BookExistsError, BookNotFoundError, ValidationError
from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

_INVALID_SLUG_CHARS = set('<>:"/\\|?*')

# slug 长度上限。依据：Windows `MAX_PATH` 默认 260 —— 完整路径
# `<项目根>/ai-novel/books/<slug>/novel.db-wal` 已占去约 60~90 字符，
# 留 80 给 slug 后仍有两倍余量；同时避免用户用 10000 字书名把建目录搞成 500（P1-3）。
MAX_SLUG_LENGTH = 80

# Windows 保留设备名：不能作为目录/文件名，否则目录建得出来但库写不进去，
# 且删除失败会留下「幽灵作品」（列表可见、点开 500）。大小写不敏感，
# 且**带扩展名形式**（如 `NUL.json`）同样保留 —— 故比对「第一个点之前的部分」。
_WINDOWS_RESERVED_NAMES = frozenset(
    {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "CLOCK$",
        "CONIN$",
        *(f"COM{i}" for i in range(1, 10)),
        *(f"LPT{i}" for i in range(1, 10)),
    }
)

# SQLite 主库文件固定以这 16 字节开头（见 https://sqlite.org/fileformat2.html）。
_SQLITE_MAGIC = b"SQLite format 3\x00"


def _looks_like_sqlite(path: Path) -> bool:
    """该文件是否「像一个可用的 SQLite 库」：非空且带 SQLite 文件头。

    只读 16 字节，开销可忽略。用途是把残留脏目录挡在扫描之外 ——
    例如 `books/CON/novel.db` 这种 0 字节或非 SQLite 的文件，
    一旦被当成正常作品库打开，会在查询时抛 `sqlite3.OperationalError`
    （`no such table: chapter`）而影响**全站** by-id 端点（P0-1）。
    """
    try:
        if path.stat().st_size == 0:
            return False
        with path.open("rb") as fh:
            return fh.read(len(_SQLITE_MAGIC)) == _SQLITE_MAGIC
    except OSError:
        return False


def _is_reserved_name(slug: str) -> bool:
    """是否为 Windows 保留设备名（`CON`/`AUX`/`NUL.json` …）。"""
    stem = slug.split(".", 1)[0].strip().upper()
    return stem in _WINDOWS_RESERVED_NAMES


def sanitize_slug(raw: str) -> str:
    """把书名转为可用作目录名的 slug（保留中文；剔除非法字符与空白）。"""
    text = (raw or "").strip()
    text = "".join(ch for ch in text if ch not in _INVALID_SLUG_CHARS and ch >= " ")
    text = text.strip().strip(".")
    return text


def is_valid_slug(slug: str) -> bool:
    """slug 是否可安全用作作品目录名（也用于校验 `X-Book-Slug` 请求头）。

    拒收条件：空 / `.` / `..`；含非法字符或路径分隔符；**前导 `.` 或 `_`**
    （`list_slugs` 会跳过这类目录，否则会建出「列表里永远看不见」的孤儿作品）；
    超长；Windows 保留设备名（含带扩展名形式）。
    """
    if not slug or slug in {".", ".."}:
        return False
    if len(slug) > MAX_SLUG_LENGTH:
        return False
    if any(ch in _INVALID_SLUG_CHARS for ch in slug):
        return False
    if "/" in slug or "\\" in slug:
        return False
    if slug.startswith(".") or slug.startswith("_"):
        return False
    if _is_reserved_name(slug):
        return False
    return True


def now_iso() -> str:
    return datetime.now(UTC).astimezone().isoformat(timespec="seconds")


class BookRegistry:
    def __init__(
        self,
        books_dir: Path,
        recycle_dir: Path,
        caps: Capabilities | None = None,
    ) -> None:
        self.books_dir = Path(books_dir)
        self.recycle_dir = Path(recycle_dir)
        self.caps = caps or probe_capabilities()
        self._dbs: dict[str, Database] = {}
        self._guard = threading.RLock()
        # 串行化 meta.json 的写入。**实测**：光把临时文件名唯一化还不够 ——
        # Windows 上 `os.replace` 若与另一个线程对**同一目标**的 replace 并发，
        # 会以 `PermissionError`（拒绝访问）失败。故必须再叠一把实例级锁。
        # 实例级足够：进程内通过 `get_registry()` 单例访问同一注册表；
        # 跨进程由 `instance_lock` 保证单实例运行。
        self._meta_guard = threading.RLock()

    # ---------------------------------------------------------------- paths
    def book_dir(self, slug: str) -> Path:
        self._ensure_slug(slug)
        return self.books_dir / slug

    def db_path(self, slug: str) -> Path:
        return self.book_dir(slug) / "novel.db"

    def meta_path(self, slug: str) -> Path:
        return self.book_dir(slug) / "meta.json"

    def _ensure_slug(self, slug: str) -> None:
        if not is_valid_slug(slug):
            raise ValidationError(f"非法的作品标识：{slug!r}")

    # ----------------------------------------------------------- existence
    def exists(self, slug: str) -> bool:
        return is_valid_slug(slug) and self.db_path(slug).is_file()

    def require(self, slug: str) -> None:
        if not self.exists(slug):
            raise BookNotFoundError(f"作品不存在：{slug}")

    # ------------------------------------------------------------ database
    def database(self, slug: str) -> Database:
        self.require(slug)
        with self._guard:
            db = self._dbs.get(slug)
            if db is None:
                db = Database(self.db_path(slug), self.caps)
                self._dbs[slug] = db
            return db

    def forget(self, slug: str) -> None:
        with self._guard:
            self._dbs.pop(slug, None)

    # --------------------------------------------------------------- scan
    def list_slugs(self) -> list[str]:
        """列出疑似作品 slug。

        只做「像不像一个库」的廉价判断（存在 + 文件头合法），
        **不做**打开与建表自检 —— 那由 `services/workspace.resolve_slug`
        逐个容错处理：单个坏库不得拖垮调用方。
        """
        if not self.books_dir.is_dir():
            return []
        slugs: list[str] = []
        for child in self.books_dir.iterdir():
            if not child.is_dir() or child.name.startswith((".", "_")):
                continue
            db_path = child / "novel.db"
            if db_path.is_file() and _looks_like_sqlite(db_path):
                slugs.append(child.name)
        return sorted(slugs)

    # --------------------------------------------------------- lifecycle
    def create(self, slug: str, initial_meta: dict) -> None:
        self._ensure_slug(slug)
        book_dir = self.book_dir(slug)
        if book_dir.exists():
            raise BookExistsError(f"同名作品已存在：{slug}")
        try:
            book_dir.mkdir(parents=True, exist_ok=False)
        except FileExistsError as exc:
            # 并发建同名作品时，两个请求都会通过上面的存在性检查 → mkdir 只有一个成功。
            # 转成 409（BookExistsError），由服务层重算 slug 重试，而不是 500 `FileExistsError`。
            raise BookExistsError(f"同名作品已存在：{slug}") from exc
        try:
            conn = connect(self.db_path(slug), self.caps)
            try:
                apply_schema(conn, self.caps)
                missing = missing_objects(conn, self.caps)
                if missing:
                    logger.warning(
                        "schema objects missing after create",
                        **log_fields(slug=slug, missing=missing),
                    )
            finally:
                conn.close()
        except Exception:
            shutil.rmtree(book_dir, ignore_errors=True)
            if book_dir.exists():
                # 回滚失败（Windows 保留名 / 句柄未释放等）不能静默吞掉 ——
                # 否则会留下「幽灵作品」：列表可见但点开 500（P0-1）。
                logger.warning(
                    "book dir rollback failed; residual dir left",
                    **log_fields(slug=slug, path=str(book_dir)),
                )
            raise
        self.write_meta(slug, initial_meta)
        logger.info("book created", **log_fields(slug=slug))

    def move_to_recycle(self, slug: str) -> Path:
        self.require(slug)
        self.recycle_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = self.recycle_dir / f"{slug}-{stamp}"
        self.forget(slug)
        shutil.move(str(self.book_dir(slug)), str(target))
        logger.info("book moved to recycle", **log_fields(slug=slug, target=str(target)))
        return target

    # ---------------------------------------------------------------- meta
    def read_meta(self, slug: str) -> dict:
        path = self.meta_path(slug)
        if not path.is_file():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            logger.warning("meta.json unreadable", **log_fields(slug=slug))
            return {}

    def write_meta(self, slug: str, meta: dict) -> None:
        """原子写 meta.json（并发安全）。

        两处改动缺一不可：
          1. **临时文件名唯一**（`uuid4().hex`）：旧的固定名 `meta.json.tmp` 会让并发写入者
             互相覆盖、撞 `PermissionError`（P0-3a）。
          2. **一把实例级锁**：唯一临时名解决了「临时文件互踩」，但**实测**在 Windows 上
             并发 `os.replace` 到**同一目标**仍会 `PermissionError`（拒绝访问）——
             `MoveFileEx(REPLACE_EXISTING)` 与另一个替换者对同一目标竞争时会失败。
             故 `_meta_guard` 串行化「写临时文件 + replace」临界区。
        锁内只做本地文件操作，不触碰数据库，不会与 `Database.lock` 形成嵌套等待。
        """
        path = self.meta_path(slug)
        with self._meta_guard:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
            try:
                tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                os.replace(tmp, path)
            finally:
                # 中途失败时清掉自己的残留临时文件（唯一名，不影响任何其它写入者）。
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except OSError:  # pragma: no cover - 清理失败不掩盖原始异常
                        pass

    def patch_meta(self, slug: str, updates: dict) -> dict:
        # 读-改-写整体持锁，避免并发 patch 丢更新
        with self._meta_guard:
            meta = self.read_meta(slug)
            meta.update(updates)
            self.write_meta(slug, meta)
            return meta


_registry: BookRegistry | None = None
_registry_guard = threading.Lock()


def get_registry() -> BookRegistry:
    global _registry
    with _registry_guard:
        if _registry is None:
            _registry = BookRegistry(settings.books_dir, settings.recycle_dir)
        return _registry


def reset_registry() -> None:
    """仅供测试使用。"""
    global _registry
    with _registry_guard:
        _registry = None
