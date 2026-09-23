"""模型配置服务（R5）：CRUD + 密钥环 + 有效性检测 + 本地费用估算。

模型配置存**全局库** `data/app.db`（`app/db/global_db.py`），与「当前打开的作品」
无关 —— 因此本模块的端点均**不需要活跃作品**（不再抛 `NO_ACTIVE_BOOK`）。
密钥本体仍只存系统密钥环，全局库仅存 `key_ref`。
"""

from __future__ import annotations

from time import perf_counter

from app.config import settings
from app.db.global_db import get_global_database
from app.db.registry import get_registry, now_iso
from app.errors import AppError, ProviderNotFoundError
from app.logging_config import get_logger, log_fields
from app.models.provider import (
    DiscoverModelsRequest,
    DiscoverModelsResult,
    DraftTestRequest,
    LLMProviderOut,
    ProviderCreate,
    ProviderTestResult,
    ProviderUpdate,
    ProviderUsage,
    UsagePeriod,
)
from app.repositories import memory_repo, provider_repo
from app.services import workspace
from app.services.llm import discovery
from app.services.llm import registry as llm_registry
from app.services.llm.secrets import delete_secret, load_secret, new_key_ref, store_secret

logger = get_logger(__name__)


def _to_out(row: dict, roles: list[str] | None = None) -> LLMProviderOut:
    return LLMProviderOut(
        id=row["id"],
        provider=row["provider"],
        model=row["model"],
        base_url=row.get("base_url"),
        key_ref=row.get("key_ref"),
        task_role=row.get("task_role") or "content",
        task_roles=list(roles or []),
        is_default=int(row.get("is_default") or 0),
        enabled=int(row.get("enabled") or 0),
    )


def list_providers() -> list[LLMProviderOut]:
    with get_global_database().connection() as conn:
        rows = provider_repo.list_all(conn)
        grouped = provider_repo.roles_map(conn)  # 一次取全，避免 N+1
    return [_to_out(r, grouped.get(int(r["id"]), [])) for r in rows]


def create_provider(payload: ProviderCreate) -> LLMProviderOut:
    now = now_iso()
    key_ref = None
    if payload.api_key:
        key_ref = new_key_ref()
        store_secret(key_ref, payload.api_key)
    # 角色集合：新字段优先；省略时沿用单值 `task_role`（老客户端语义不变）。
    roles = payload.task_roles if payload.task_roles is not None else [payload.task_role or "content"]
    try:
        with get_global_database().transaction() as conn:
            if payload.is_default:
                provider_repo.clear_defaults(conn)
            provider_id = provider_repo.create(
                conn,
                {
                    "provider": payload.provider,
                    "model": payload.model,
                    "base_url": payload.base_url,
                    "key_ref": key_ref,
                    "task_role": payload.task_role or "content",
                    "is_default": payload.is_default,
                    "enabled": payload.enabled,
                },
                now,
            )
            provider_repo.set_roles(conn, provider_id, roles, now)
            row = provider_repo.get(conn, provider_id)
            roles_now = provider_repo.roles_of(conn, provider_id)
    except Exception:
        delete_secret(key_ref)
        raise
    logger.info(
        "provider created",
        **log_fields(provider=payload.provider, model=payload.model),
    )
    return _to_out(row, roles_now)


def update_provider(provider_id: int, payload: ProviderUpdate) -> LLMProviderOut:
    fields = payload.model_dump(exclude_unset=True)
    new_secret = fields.pop("api_key", None)
    roles_provided = "task_roles" in fields
    roles = fields.pop("task_roles", None)
    # `task_role` 在库里是 `NOT NULL DEFAULT 'content'`，写 null 会触发约束违约 → 500。
    # 契约语义定为：传 null = **不修改**该字段（不是"清空"）。
    # 真正要表达"不再承担某角色"请用 `task_roles`（传 `[]` 即解除全部分配）。
    legacy_role = fields.get("task_role")
    if "task_role" in fields and fields["task_role"] is None:
        fields.pop("task_role")
    for flag in ("is_default", "enabled"):
        if flag in fields and fields[flag] is not None:
            fields[flag] = 1 if fields[flag] else 0
    with get_global_database().transaction() as conn:
        row = provider_repo.get(conn, provider_id)
        if row is None:
            raise ProviderNotFoundError()
        if fields.get("is_default") == 1:
            provider_repo.clear_defaults(conn)
        if new_secret:
            key_ref = row.get("key_ref") or new_key_ref()
            store_secret(key_ref, new_secret)
            fields["key_ref"] = key_ref
        provider_repo.update(conn, provider_id, fields)
        if roles_provided:
            provider_repo.set_roles(conn, provider_id, roles or [], now_iso())
        elif legacy_role:
            # 老客户端只发单值 `task_role` → 等价于"该模型只承担这一个角色"
            provider_repo.set_roles(conn, provider_id, [legacy_role], now_iso())
        row = provider_repo.get(conn, provider_id)
        roles_now = provider_repo.roles_of(conn, provider_id)
    return _to_out(row, roles_now)


def delete_provider(provider_id: int) -> None:
    with get_global_database().transaction() as conn:
        row = provider_repo.get(conn, provider_id)
        if row is None:
            raise ProviderNotFoundError()
        provider_repo.delete(conn, provider_id)
    delete_secret(row.get("key_ref"))


def test_provider(provider_id: int) -> ProviderTestResult:
    with get_global_database().connection() as conn:
        row = provider_repo.get(conn, provider_id)
        # 业务规则改为看**关联表**：只要该模型承担 `embedding`（哪怕同时还挂着别的角色），
        # 就用嵌入接口探测 —— 与 `roles` 的多角色语义保持一致。
        is_embedding = row is not None and "embedding" in provider_repo.roles_of(conn, provider_id)
    if row is None:
        raise ProviderNotFoundError()
    try:
        client = llm_registry.build_client(row)
    except AppError as exc:
        return ProviderTestResult(ok=False, latency_ms=0, error=exc.message)
    start = perf_counter()
    try:
        if is_embedding:
            client.embed(["连通性测试"])
        else:
            # 超时给 60s（原为 20s）：实测 `step-3.5-flash` 对 "ping" 的响应在
            # 3.2s~25.4s 之间波动，20s 阈值下 6 次里有 5 次触顶 → **有效密钥被误报
            # 「模型请求失败」**。宁可多等，也不能让用户以为自己密钥填错了。
            client.chat([{"role": "user", "content": "ping"}], timeout=60.0)
        ok, error = True, None
    except AppError as exc:
        ok, error = False, exc.message
    except Exception:  # noqa: BLE001 - 统一转可读文案，不外泄堆栈
        ok, error = False, "模型请求失败，请检查网络或配置后重试"
    latency = int((perf_counter() - start) * 1000)
    return ProviderTestResult(ok=ok, latency_ms=latency, error=error)


def _usage_stats(from_date: str | None, to_date: str | None) -> dict:
    """用量估算来源：**当前作品**的 `recall_log`。

    说明：`recall_log` 无 provider 归属列（见 `schema.sql`），模型配置全局化后
    「某 provider 的用量」在数据层无法精确归属。这里沿用既有口径：以当前作品的
    召回记录做本地估算；无当前作品或读取失败时返回 0，不报错（用量属参考信息）。
    """
    registry = get_registry()
    slug = workspace.get_active()
    if not slug or not registry.exists(slug):
        return {"calls": 0, "tokens": 0}
    try:
        with registry.database(slug).connection() as conn:
            return memory_repo.recall_stats(conn, from_date, to_date)
    except Exception:  # noqa: BLE001 - 估算失败不得让端点 500
        logger.warning("usage recall stats failed", **log_fields(slug=slug))
        return {"calls": 0, "tokens": 0}


def get_usage(provider_id: int, from_date: str | None, to_date: str | None) -> ProviderUsage:
    with get_global_database().connection() as conn:
        row = provider_repo.get(conn, provider_id)
    if row is None:
        raise ProviderNotFoundError()
    stats = _usage_stats(from_date, to_date)
    unit = settings.price_per_1k_cny.get(row["provider"], 0.0)
    total_tokens = stats["tokens"]
    cost = round(total_tokens / 1000.0 * unit, 4)
    return ProviderUsage(
        provider_id=provider_id,
        model=row["model"],
        period=UsagePeriod(from_=from_date, to=to_date),
        calls=stats["calls"],
        prompt_tokens=total_tokens,
        completion_tokens=0,
        total_tokens=total_tokens,
        estimated_cost=cost,
        currency="CNY",
        estimated=True,
    )


def _resolve_credentials(
    provider: str, base_url: str | None, api_key: str | None
) -> tuple[str | None, str | None]:
    """解析 (base_url, api_key)。

    api_key 缺省时复用**全局库**里同平台已配置的密钥（**只读取**，不写库、不写密钥环）。
    """
    resolved_base = base_url or llm_registry.DEFAULT_BASE_URLS.get(provider)
    if api_key:
        return resolved_base, api_key
    with get_global_database().connection() as conn:
        row = provider_repo.find_by_provider(conn, provider)
    if row and row.get("key_ref"):
        return resolved_base or row.get("base_url"), load_secret(row["key_ref"])
    return resolved_base, None


def discover_models(payload: DiscoverModelsRequest) -> DiscoverModelsResult:
    """拉取平台可用模型列表；**不落库、不写密钥环**。"""
    base_url, api_key = _resolve_credentials(
        payload.provider, payload.base_url, payload.api_key
    )
    result = discovery.list_models(payload.provider, base_url, api_key)
    logger.info(
        "models discovered",
        **log_fields(provider=payload.provider, count=len(result.models)),
    )
    return DiscoverModelsResult(
        models=result.models, count=len(result.models), note=result.note
    )


def test_draft(payload: DraftTestRequest) -> ProviderTestResult:
    """保存前用临时凭据测一次最小 chat；**不落库、不写密钥环、不缓存密钥**。"""
    base_url, api_key = _resolve_credentials(
        payload.provider, payload.base_url, payload.api_key
    )
    start = perf_counter()
    try:
        discovery.minimal_chat(payload.provider, base_url, api_key, payload.model)
        ok, error = True, None
    except AppError as exc:
        ok, error = False, exc.message
    except Exception:  # noqa: BLE001 - 统一转可读文案，不外泄堆栈
        ok, error = False, "模型请求失败，请检查网络或配置后重试"
    latency = int((perf_counter() - start) * 1000)
    return ProviderTestResult(ok=ok, latency_ms=latency, error=error)
