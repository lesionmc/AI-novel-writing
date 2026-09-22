"""作品库注册表（基础设施层）。

一书一库：`books/<slug>/novel.db`。切换作品 = 切换库路径。
连接按 slug 缓存，各书独立，避免 WAL 句柄与路径串书（坑 20）。
"""

from __future__ import annotations

import json
import shutil
import threading
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings
from app.db.connection import Capabilities, Database, connect, probe_capabilities
from app.db.schema_loader import apply_schema, missing_objects
from app.errors import BookNotFoundError, ValidationError
from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

_INVALID_SLUG_CHARS = set('<>:"/\\|?*')


def sanitize_slug(raw: str) -> str:
    """把书名转为可用作目录名的 slug（保留中文；剔除非法字符与空白）。"""
    text = (raw or "").strip()
    text = "".join(ch for ch in text if ch not in _INVALID_SLUG_CHARS and ch >= " ")
    text = text.strip().strip(".")
    return text


def is_valid_slug(slug: str) -> bool:
    if not slug or slug in {".", ".."}:
        return False
    if any(ch in _INVALID_SLUG_CHARS for ch in slug):
        return False
    if "/" in slug or "\\" in slug:
        return False
    return not slug.startswith(".")


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
        if not self.books_dir.is_dir():
            return []
        slugs: list[str] = []
        for child in self.books_dir.iterdir():
            if not child.is_dir() or child.name.startswith((".", "_")):
                continue
            if (child / "novel.db").is_file():
                slugs.append(child.name)
        return sorted(slugs)

    # --------------------------------------------------------- lifecycle
    def create(self, slug: str, initial_meta: dict) -> None:
        self._ensure_slug(slug)
        book_dir = self.book_dir(slug)
        if book_dir.exists():
            raise ValidationError(f"作品目录已存在：{slug}")
        book_dir.mkdir(parents=True, exist_ok=False)
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
        path = self.meta_path(slug)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    def patch_meta(self, slug: str, updates: dict) -> dict:
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
