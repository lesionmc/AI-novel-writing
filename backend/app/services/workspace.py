"""工作区服务：当前作品指针 + by-id 资源所在作品解析。

契约中 `GET /api/chapters/{id}`、`/api/characters/{id}` 等端点不含作品 slug，
而 id 仅在同一作品库内唯一。解析优先级：

1. **请求级作品上下文**（`app/book_context.py`，来自 `X-Book-Slug` 请求头）——
   有了它，by-id 端点只在该作品内查找，**绝不**跨书扫描（修 P0-2 跨书静默覆盖）。
2. 旧客户端 / curl 直连（无该头）：退回「当前作品指针」解析 ——
   凡带 `{book}` 的端点会更新当前作品；by-id 端点优先在当前作品中定位，
   未命中则回退全库扫描（唯一命中才采纳；多命中即歧义 → 409）。
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Callable

from app.book_context import get_request_slug
from app.config import settings
from app.db.registry import get_registry
from app.errors import ConflictError, NotFoundError
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
    """返回「当前作品」：**请求级上下文优先**，其次才是进程内全局指针。

    为什么请求级优先：全局指针会被别的标签页抢走。若本请求已通过
    `X-Book-Slug` 明确指定了作品，就必须以它为准，否则等于把跨书覆盖的
    入口留在这里（P0-2）。
    """
    request_slug = get_request_slug()
    if request_slug and get_registry().exists(request_slug):
        return request_slug
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


def _contains_id(registry, slug: str, contains: Callable, id_value: int) -> bool:
    """探测 id 是否在该作品库中；库损坏时跳过该库（返回 False）而不是抛出。

    为什么必须容错：`books/` 下任何一个残缺目录（0 字节库、非 SQLite 文件、
    缺业务表的库）都会让 `contains()` 抛 `sqlite3.Error`。若任由它冒泡，
    一次 by-id 请求就会变成 **500**，且**全站**所有 by-id 端点都被一部坏书库拖垮
    （P0-1）。这里把它降级为「这个库不影响本次定位」，并留下可追溯的告警日志。
    """
    try:
        with registry.database(slug).connection() as conn:
            return bool(contains(conn, id_value))
    except (sqlite3.Error, OSError) as exc:
        logger.warning(
            "book db unreadable, skipped during id lookup",
            **log_fields(slug=slug, error=type(exc).__name__, detail=str(exc)),
        )
        return False


def resolve_slug(
    contains: Callable,
    id_value: int,
    not_found: NotFoundError,
) -> str:
    """定位 id 所在作品 slug。

    **有请求级作品上下文时**：只在该作品内查找。命中即返回；未命中（含该作品
    不存在）**直接抛 `not_found`（404）**，绝不回退全库扫描 —— 回退就等于允许
    把别的书里的同 id 资源当作目标，正是 P0-2 跨书静默写坏数据的根因。

    **无请求级上下文时**（旧客户端 / curl）：保持既有语义 —— 当前作品优先，
    其次逐个容错地全库扫描。多命中时**一律 `ConflictError`（409）**：多命中本身
    就是歧义信号，不再悄悄替用户选一本。
    """
    registry = get_registry()

    request_slug = get_request_slug()
    if request_slug:
        if registry.exists(request_slug) and _contains_id(
            registry, request_slug, contains, id_value
        ):
            return request_slug
        raise not_found

    active = get_active()
    if active and registry.exists(active) and _contains_id(registry, active, contains, id_value):
        return active

    matches: list[str] = []
    for slug in registry.list_slugs():
        if _contains_id(registry, slug, contains, id_value):
            matches.append(slug)

    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        # 多命中 = 归属歧义。旧实现会在 active 命中时静默选 active，其它情况才报错；
        # 这等于鼓励「猜一本」。现在一律 409，宁可让老客户端显式进入作品，也不写错书。
        raise ConflictError(
            "该资源在多个作品中存在，无法确定归属，请先进入对应作品"
        )
    raise not_found
