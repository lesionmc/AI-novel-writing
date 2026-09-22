"""工作区服务：当前作品指针 + by-id 资源所在作品解析。

契约中 `GET /api/chapters/{id}`、`/api/characters/{id}` 等端点不含作品 slug，
而 id 仅在同一作品库内唯一。单用户单机场景下采用「当前作品指针」解析：
凡带 `{book}` 的端点会更新当前作品；by-id 端点优先在当前作品中定位，
未命中则回退全库扫描（唯一命中才采纳）。本策略记录于后端 README。
"""

from __future__ import annotations

import json
import threading
from collections.abc import Callable

from app.config import settings
from app.db.registry import get_registry
from app.errors import ConflictError, NoActiveBookError, NotFoundError
from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

_guard = threading.RLock()
_active_slug: str | None = None


def _state_file():
    return settings.data_dir / "active_book.json"


def set_active(slug: str) -> None:
    global _active_slug
    with _guard:
        _active_slug = slug
    try:
        _state_file().parent.mkdir(parents=True, exist_ok=True)
        _state_file().write_text(
            json.dumps({"slug": slug}, ensure_ascii=False), encoding="utf-8"
        )
    except OSError as exc:  # 指针持久化失败不影响本次会话
        logger.warning("active book persist failed", **log_fields(error=str(exc)))


def get_active() -> str | None:
    global _active_slug
    with _guard:
        if _active_slug is not None:
            return _active_slug
        path = _state_file()
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                _active_slug = data.get("slug")
            except (json.JSONDecodeError, OSError):
                _active_slug = None
        return _active_slug


def clear_active() -> None:
    global _active_slug
    with _guard:
        _active_slug = None
    try:
        _state_file().unlink(missing_ok=True)
    except OSError:
        pass


def reset_active_for_tests() -> None:
    clear_active()


def resolve_slug(
    contains: Callable,
    id_value: int,
    not_found: NotFoundError,
) -> str:
    """定位 id 所在作品 slug：当前作品优先，其次全库扫描（唯一命中）。"""
    registry = get_registry()
    active = get_active()
    if active and registry.exists(active):
        with registry.database(active).connection() as conn:
            if contains(conn, id_value):
                return active

    matches: list[str] = []
    for slug in registry.list_slugs():
        with registry.database(slug).connection() as conn:
            if contains(conn, id_value):
                matches.append(slug)

    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        if active and active in matches:
            return active
        raise ConflictError(
            "该资源在多个作品中存在，无法确定归属，请先进入对应作品"
        )
    raise not_found


def require_active() -> str:
    active = get_active()
    if not active or not get_registry().exists(active):
        raise NoActiveBookError()
    return active
