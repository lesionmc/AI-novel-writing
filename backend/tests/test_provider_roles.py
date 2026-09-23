"""一个模型可承担多个任务角色（`provider_role` 关联表）—— 回归护栏。

用户原始诉求：「为什么不能选择多个一样的模型」「能不能一个 ai 做完全部」。
旧设计里 `llm_provider.task_role` 是**单值**列，把同一个模型指给第二个角色时
只能把上一个角色的分配抢走；本组测试锁住新的多对多语义：

1. 一个模型挂 outline + content + review → 三个角色**都**取到它；
2. 该角色无任何模型时**仍回退默认模型** —— 「一个模型全包」成立的前提；
3. `ollama`（免密钥 provider）语义不受影响。
（历史回填迁移 `provider_role_migration` 已于 2026-09-23 随仓库瘦身退役。）
"""

from __future__ import annotations

from app.db import global_db as global_db_mod
from app.db.schema_loader import missing_global_objects
from app.repositories import provider_repo
from app.services.llm import registry as llm_registry
from app.services.llm.clients import OllamaClient


def test_existing_global_db_gains_provider_role_without_rebuild(client):
    """老全局库（还没有 provider_role）在下次访问时被补上该表。

    这正是**线上库升级**的真实情形：`CREATE TABLE IF NOT EXISTS` 不会追加以存在的库，
    所以新表必须登记进 `_GLOBAL_TABLES`（`missing_global_objects`）才会被补建 ——
    漏了这一步，重启后新表会因「no such table」而静默缺失。
    """
    db = global_db_mod.get_global_database()
    with db.transaction() as conn:
        conn.execute("DROP TABLE IF EXISTS provider_role")
        assert missing_global_objects(conn) == ["provider_role"]

    global_db_mod.reset_global_database()  # 模拟重启：下次访问重新自检建库
    with global_db_mod.get_global_database().connection() as conn:
        assert missing_global_objects(conn) == []
    # 新表补建后角色查询可用（不因缺表而失败）
    with global_db_mod.get_global_database().connection() as c:
        assert provider_repo.find_for_role(c, "outline") is None


def _mk(client, model: str, roles: list[str], **extra):
    resp = client.post(
        "/api/providers",
        json={"provider": "ollama", "model": model, "task_roles": roles, **extra},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _find(role: str) -> dict | None:
    with global_db_mod.get_global_database().connection() as conn:
        return provider_repo.find_for_role(conn, role)


def _default() -> dict | None:
    with global_db_mod.get_global_database().connection() as conn:
        return provider_repo.find_default(conn)


# ------------------------------------------------- ① 一个模型挂多个角色


def test_one_provider_serves_multiple_roles(client):
    p = _mk(client, "all-in-one", ["outline", "content", "review"])

    assert p["task_roles"] == ["outline", "content", "review"]
    for role in ("outline", "content", "review"):
        hit = _find(role)
        assert hit is not None, role
        assert hit["id"] == p["id"], role
    # 没挂的角色依然为空（不是"挂了一个就全都有"）
    assert _find("embedding") is None


def test_all_roles_on_one_model_covers_user_goal(client):
    """「一个 ai 做完全部」：四个角色全指给同一个模型，四处都取到它。"""
    p = _mk(client, "do-everything", ["outline", "content", "review", "embedding"])

    assert p["task_roles"] == ["outline", "content", "review", "embedding"]
    for role in ("outline", "content", "review", "embedding"):
        assert _find(role)["id"] == p["id"], role


def test_new_role_assignment_does_not_steal_from_other_role(client):
    """回归核心：把同一模型指给第 2 个角色，**不再**抢走第 1 个角色的分配。"""
    p = _mk(client, "shared", ["outline"])
    assert _find("content") is None

    resp = client.patch(f"/api/providers/{p['id']}", json={"task_roles": ["outline", "content"]})
    assert resp.status_code == 200, resp.text
    assert resp.json()["task_roles"] == ["outline", "content"]
    # 两个角色都在，且都是同一个模型（旧实现会把 "outline" 清掉）
    assert _find("outline")["id"] == p["id"]
    assert _find("content")["id"] == p["id"]


def test_patch_task_roles_replaces_set_and_can_unassign_all(client):
    p = _mk(client, "multi", ["outline", "content"])
    resp = client.patch(f"/api/providers/{p['id']}", json={"task_roles": []})
    assert resp.status_code == 200, resp.text
    assert resp.json()["task_roles"] == []
    # 「解除分配」这个能力此前根本不存在，现在必须真的生效
    assert _find("outline") is None and _find("content") is None


def test_legacy_task_role_field_still_works(client):
    """老客户端只发单值 `task_role` → 等价于"只承担这一个角色"（不减功能）。"""
    p = _mk(client, "legacy", [])
    resp = client.patch(f"/api/providers/{p['id']}", json={"task_role": "outline"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["task_role"] == "outline"
    assert _find("outline")["id"] == p["id"]
    # create 走单值时同样落进关联表
    q = client.post(
        "/api/providers", json={"provider": "ollama", "model": "single", "task_role": "review"}
    ).json()
    assert _find("review")["id"] == q["id"]


# ------------------------------------------------- ② 无角色 → 回退默认模型


def test_role_without_model_falls_back_to_default(client, monkeypatch):
    """「一个模型全包」的另一半：4 个角色都不指定 → 全部走默认模型。"""
    seen: list[dict] = []

    def fake_build(row):
        seen.append(row)
        return row

    monkeypatch.setattr(llm_registry, "build_client", fake_build)

    default = _mk(client, "the-default", [], is_default=True)
    other = _mk(client, "side-model", ["outline"])

    assert _find("review") is None
    assert _find("content") is None
    assert llm_registry.get_client_for_role("review")["id"] == default["id"]
    assert llm_registry.get_client_for_role("content")["id"] == default["id"]
    # 指定了角色的仍然按角色走，不被默认抢走
    assert llm_registry.get_client_for_role("outline")["id"] == other["id"]
    assert _default()["id"] == default["id"]


def test_disabled_provider_is_not_used_for_role(client):
    p = _mk(client, "disabled-one", ["review"])
    assert client.patch(f"/api/providers/{p['id']}", json={"enabled": 0}).status_code == 200
    assert _find("review") is None


# ------------------------------------------------- ③ 免密钥 provider 不受影响


def test_ollama_keyless_provider_unaffected(client, book):
    p = _mk(client, "qwen3:8b", ["content"])
    assert p["key_ref"] is None

    client_obj = llm_registry.get_client_for_role("content")
    assert isinstance(client_obj, OllamaClient)
    assert llm_registry.has_enabled_provider() is True

    # 嵌入角色同样可指给免密钥模型
    e = _mk(client, "bge-m3", ["embedding"])
    assert llm_registry.get_embedding_client() is not None
    assert _find("embedding")["id"] == e["id"]
