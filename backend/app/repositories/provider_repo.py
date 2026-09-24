"""llm_provider 表数据访问（R5）。密钥本体在系统密钥环，此处仅 key_ref。

## 「模型 ↔ 任务角色」的存储口径（2026-09-22 变更）

路由**只认** `provider_role` 关联表（`(provider_id, task_role)` 多对多），不再读
`llm_provider.task_role` 单值列 —— 那一列是旧设计的遗留，无法表达「一个模型全包」，
现仅作历史数据与老库回填来源保留（见 `schema.sql` 的 provider_role 段注释）。

因此：**一个模型可挂多个角色**；**一个角色仍可有多个候选模型**（顺序不变）。
"""

from __future__ import annotations

import sqlite3
from typing import Any, Iterable

from app.repositories.base import fetch_one, insert

_COLUMNS = ("provider", "model", "base_url", "key_ref", "task_role", "is_default", "enabled")

#: 角色的规范顺序 —— 用于列表展示与「首要角色」的确定性取值（顺序即 models.TaskRole 的声明序）。
ROLE_ORDER = ("outline", "content", "review", "embedding")


def _normalize_roles(roles: Iterable[str]) -> list[str]:
    """去重 + 按规范顺序排序（未知角色排在最后，保持原相对顺序）。"""
    seen = {r for r in roles if r}
    known = [r for r in ROLE_ORDER if r in seen]
    extra = sorted(seen - set(ROLE_ORDER))
    return known + extra


def create(conn: sqlite3.Connection, data: dict[str, Any], now: str) -> int:
    return insert(
        conn,
        """
        INSERT INTO llm_provider
            (provider, model, base_url, key_ref, task_role, is_default, enabled, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["provider"],
            data["model"],
            data.get("base_url"),
            data.get("key_ref"),
            data.get("task_role", "content"),
            1 if data.get("is_default") else 0,
            1 if data.get("enabled", 1) else 0,
            now,
        ),
    )


def get(conn: sqlite3.Connection, provider_id: int) -> dict | None:
    return fetch_one(conn, "SELECT * FROM llm_provider WHERE id = ?", (provider_id,))


def list_all(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM llm_provider ORDER BY is_default DESC, id ASC"
    ).fetchall()
    return [dict(r) for r in rows]


def update(conn: sqlite3.Connection, provider_id: int, fields: dict[str, Any]) -> None:
    clean = {k: v for k, v in fields.items() if k in _COLUMNS}
    if not clean:
        return
    assignments = ", ".join(f"{col} = ?" for col in clean)
    conn.execute(
        f"UPDATE llm_provider SET {assignments} WHERE id = ?",  # noqa: S608
        [*clean.values(), provider_id],
    )


def delete(conn: sqlite3.Connection, provider_id: int) -> bool:
    # 同事务清掉角色关联：全局库不建外键（项目约定：不用触发器/隐式副作用）
    conn.execute("DELETE FROM provider_role WHERE provider_id = ?", (provider_id,))
    cur = conn.execute("DELETE FROM llm_provider WHERE id = ?", (provider_id,))
    return cur.rowcount > 0


# --------------------------------------------------------------- 角色关联（多对多）


def roles_of(conn: sqlite3.Connection, provider_id: int) -> list[str]:
    """该模型承担的全部角色（规范顺序；无分配 → 空列表）。"""
    rows = conn.execute(
        "SELECT task_role FROM provider_role WHERE provider_id = ?", (provider_id,)
    ).fetchall()
    return _normalize_roles(str(r[0]) for r in rows)


def roles_map(conn: sqlite3.Connection) -> dict[int, list[str]]:
    """一次取全表的「模型 → 角色列表」，供列表端点避免 N+1 查询。"""
    rows = conn.execute("SELECT provider_id, task_role FROM provider_role").fetchall()
    grouped: dict[int, list[str]] = {}
    for r in rows:
        grouped.setdefault(int(r[0]), []).append(str(r[1]))
    return {pid: _normalize_roles(roles) for pid, roles in grouped.items()}


def set_roles(conn: sqlite3.Connection, provider_id: int, roles: Iterable[str], now: str) -> None:
    """**整体替换**该模型的角色集合（传空列表 = 解除全部分配）。

    同时把 `llm_provider.task_role` 同步成「首要角色」—— 该列已不参与路由，
    但让它在库里仍读得通（老版本的界面/工具不会看到自相矛盾的值）。
    角色集合为空时**不动**该列（写 '' 会被 CHECK 拒绝，写 'content' 则是撒谎）。
    """
    normalized = _normalize_roles(roles)
    conn.execute("DELETE FROM provider_role WHERE provider_id = ?", (provider_id,))
    for role in normalized:
        conn.execute(
            "INSERT OR IGNORE INTO provider_role (provider_id, task_role, created_at)"
            " VALUES (?, ?, ?)",
            (provider_id, role, now),
        )
    if normalized:
        conn.execute(
            "UPDATE llm_provider SET task_role = ? WHERE id = ?", (normalized[0], provider_id)
        )


# ---------------------------------------------------------------------- 按角色取模型


def find_for_role(conn: sqlite3.Connection, task_role: str) -> dict | None:
    """取该角色的首选模型：**只认 `provider_role` 关联表**（一个模型可挂多个角色）。

    同一角色被多个模型占用时，与旧口径一致：`is_default DESC, id ASC` 取第一个。
    """
    return fetch_one(
        conn,
        """
        SELECT p.* FROM llm_provider p
          JOIN provider_role r ON r.provider_id = p.id
         WHERE p.enabled = 1 AND r.task_role = ?
         ORDER BY p.is_default DESC, p.id ASC LIMIT 1
        """,
        (task_role,),
    )


def find_default(conn: sqlite3.Connection) -> dict | None:
    """该角色**没有任何模型**时的回退 —— 「一个模型全包」正是靠这条才成立。"""
    return fetch_one(
        conn,
        "SELECT * FROM llm_provider WHERE enabled = 1 ORDER BY is_default DESC, id ASC LIMIT 1",
    )


def find_by_provider(conn: sqlite3.Connection, provider: str) -> dict | None:
    """按平台名取一条已配置记录（用于复用其 key_ref / base_url）。"""
    return fetch_one(
        conn,
        "SELECT * FROM llm_provider WHERE provider = ? ORDER BY is_default DESC, id ASC LIMIT 1",
        (provider,),
    )


def list_enabled(conn: sqlite3.Connection) -> list[dict]:
    """所有已启用配置，按 `is_default DESC, id ASC`（与 find_for_role 同序）。"""
    rows = conn.execute(
        "SELECT * FROM llm_provider WHERE enabled = 1 ORDER BY is_default DESC, id ASC"
    ).fetchall()
    return [dict(r) for r in rows]


def clear_defaults(conn: sqlite3.Connection) -> None:
    conn.execute("UPDATE llm_provider SET is_default = 0")
