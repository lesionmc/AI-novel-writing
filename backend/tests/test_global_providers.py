"""模型配置全局化：全局库、DDL 单源、端点免活跃作品。

覆盖：全局库 `data/app.db` + DDL 复用、provider 端点不再要求活跃作品。
（历史一次性迁移 `provider_migration` 已于 2026-09-23 随仓库瘦身退役：
项目未发布过带旧结构的库，schema.sql 即终态。）
"""

from __future__ import annotations

from app.config import settings
from app.db import global_db as global_db_mod
from app.db.connection import probe_capabilities
from app.db.registry import get_registry
from app.db.schema_loader import (
    SCHEMA_PATH,
    expected_global_objects,
    expected_objects,
    load_statements,
    missing_global_objects,
)


# ------------------------------------------------------------ 全局库与 DDL 单源


def test_global_db_created_in_data_dir(client):
    db = global_db_mod.get_global_database()
    assert db.path == settings.data_dir / "app.db"
    assert db.path.is_file()
    with db.connection() as conn:
        assert missing_global_objects(conn) == []
    # 全局库对象 = 模型配置 + 元信息 + 模型↔角色关联表（2026-09-22 新增 provider_role）
    assert set(expected_global_objects()) == {"llm_provider", "meta", "provider_role"}


def test_book_schema_no_longer_holds_llm_provider(client, book):
    """书库不再创建 llm_provider 表；只有全局库才有。"""
    assert "llm_provider" not in expected_objects(probe_capabilities())
    with get_registry().database(book).connection() as conn:
        book_tables = {
            r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
    assert "llm_provider" not in book_tables
    with global_db_mod.get_global_database().connection() as conn:
        global_tables = {
            r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
    assert {"llm_provider", "meta"} <= global_tables


def test_ddl_single_source_book_and_global_are_disjoint():
    """书库/全局库的建表语句都从同一份 schema.sql 解析，且互斥 —— 无第二份 DDL。"""
    book_stmts = load_statements(probe_capabilities(), scope="book")
    global_stmts = load_statements(scope="global")
    global_sql = "\n".join(global_stmts)

    # 全局库承载 llm_provider + meta，书库两者都不应有
    assert "CREATE TABLE IF NOT EXISTS llm_provider" in global_sql
    assert "CREATE TABLE IF NOT EXISTS meta" in global_sql
    joined_book = "\n".join(book_stmts)
    assert "llm_provider" not in joined_book
    assert "CREATE TABLE IF NOT EXISTS meta" not in joined_book

    # 两处建表语句在原文各只出现一次 → 未复制粘贴出第二份（不造成双真源）
    text = SCHEMA_PATH.read_text(encoding="utf-8")
    assert text.count("CREATE TABLE IF NOT EXISTS llm_provider") == 1
    assert text.count("CREATE TABLE IF NOT EXISTS meta") == 1


# ------------------------------------------------------ 端点不依赖活跃作品


def test_create_provider_without_active_book(client):
    resp = client.post(
        "/api/providers",
        json={"provider": "ollama", "model": "bge-m3", "task_role": "embedding"},
    )
    assert resp.status_code == 201, resp.text
    assert client.get("/api/providers").json()[0]["provider"] == "ollama"


def test_provider_endpoints_without_book(client):
    """无作品时 PATCH/DELETE/test 均可用；缺 id 报 PROVIDER_NOT_FOUND（而非 NO_ACTIVE_BOOK）。"""
    pid = client.post(
        "/api/providers", json={"provider": "deepseek", "model": "deepseek-chat"}
    ).json()["id"]
    assert (
        client.patch(f"/api/providers/{pid}", json={"model": "deepseek-reasoner"}).status_code
        == 200
    )
    assert client.delete(f"/api/providers/{pid}").status_code == 204

    missing = client.post("/api/providers/9999/test")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "PROVIDER_NOT_FOUND"


