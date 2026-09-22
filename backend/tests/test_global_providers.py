"""模型配置全局化：全局库、DDL 单源、端点免活跃作品、老库一次性迁移。

覆盖任务要求 ①②③：全局库 `data/app.db` + DDL 复用、provider 端点不再要求活跃作品、
老书库存量配置一次性迁移（取第一本非空 / 去重 / 幂等 / 失败非致命），
以及**迁移标记**语义（清空后重启不复活 —— 本次验收点）。
"""

from __future__ import annotations

from pathlib import Path

from app.config import settings
from app.db import global_db as global_db_mod
from app.db.connection import connect, probe_capabilities
from app.db.registry import get_registry
from app.db.schema_loader import (
    SCHEMA_PATH,
    expected_global_objects,
    expected_objects,
    load_statements,
    missing_global_objects,
)
from app.repositories import provider_repo
from app.services import provider_migration


def _wipe_global() -> None:
    """把全局库连文件一起删掉（模拟全新安装）。

    只 reset holder 不够：`app.db` 里可能已写入迁移标记，会让后续迁移直接早退。
    """
    global_db_mod.reset_global_database()
    base = global_db_mod.global_db_path()
    for suffix in ("", "-wal", "-shm"):
        Path(str(base) + suffix).unlink(missing_ok=True)


# ------------------------------------------------------------ 全局库与 DDL 单源


def test_global_db_created_in_data_dir(client):
    db = global_db_mod.get_global_database()
    assert db.path == settings.data_dir / "app.db"
    assert db.path.is_file()
    with db.connection() as conn:
        assert missing_global_objects(conn) == []
    assert set(expected_global_objects()) == {"llm_provider", "meta"}


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


# ------------------------------------------------------------ 老库一次性迁移


def _seed_legacy_book_providers(slug: str, rows: list[tuple[str, str, str]]) -> None:
    """在书库里补出老版 llm_provider 表并写入行（模拟升级前的库）。"""
    conn = connect(settings.books_dir / slug / "novel.db", probe_capabilities())
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_provider (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL, model TEXT NOT NULL, base_url TEXT, key_ref TEXT,
                task_role TEXT NOT NULL DEFAULT 'content',
                is_default INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL)
            """
        )
        for provider, model, key_ref in rows:
            conn.execute(
                "INSERT INTO llm_provider (provider, model, key_ref, created_at)"
                " VALUES (?, ?, ?, ?)",
                (provider, model, key_ref, "2026-09-20T00:00:00+08:00"),
            )
        conn.commit()
    finally:
        conn.close()


def test_migration_moves_legacy_book_providers_to_global(client):
    slug = client.post("/api/books", json={"title": "老书"}).json()["slug"]
    _seed_legacy_book_providers(slug, [("deepseek", "deepseek-chat", "kr-1")])
    _wipe_global()  # 模拟首次升级：全局库（含迁移标记）都尚未存在

    assert provider_migration.migrate_providers_to_global() == 1
    with global_db_mod.get_global_database().connection() as conn:
        rows = provider_repo.list_all(conn)
    assert [r["provider"] for r in rows] == ["deepseek"]
    assert rows[0]["key_ref"] == "kr-1"
    # 幂等：再跑一次不重复迁移
    assert provider_migration.migrate_providers_to_global() == 0
    with global_db_mod.get_global_database().connection() as conn:
        assert len(provider_repo.list_all(conn)) == 1


def test_migration_dedupes_identical_rows(client):
    slug = client.post("/api/books", json={"title": "重复源"}).json()["slug"]
    _seed_legacy_book_providers(
        slug, [("qwen", "qwen-max", "kr-x"), ("qwen", "qwen-max", "kr-x")]
    )
    _wipe_global()
    assert provider_migration.migrate_providers_to_global() == 1


def test_migration_skips_new_book_without_table(client):
    """新书库已无 llm_provider 表 → 无内容可迁，不报错、不写入。"""
    client.post("/api/books", json={"title": "新书"})
    _wipe_global()
    assert provider_migration.migrate_providers_to_global() == 0
    with global_db_mod.get_global_database().connection() as conn:
        assert provider_repo.list_all(conn) == []


def test_migration_failure_is_non_fatal(client, monkeypatch):
    """源数据异常 → 迁移返回 0、不抛异常（不得阻断启动）。"""
    slug = client.post("/api/books", json={"title": "坏源"}).json()["slug"]
    _seed_legacy_book_providers(slug, [("kimi", "moonshot-v1-8k", "kr-bad")])
    _wipe_global()

    def boom(*_args, **_kwargs):
        raise RuntimeError("simulated corruption")

    monkeypatch.setattr(provider_repo, "create", boom)
    assert provider_migration.migrate_providers_to_global() == 0


def test_migration_sets_marker_even_when_nothing_to_migrate(client):
    """没有任何老配置时也落一次标记 —— 避免每次启动重复扫库。"""
    _wipe_global()
    assert provider_migration.migrate_providers_to_global() == 0
    with global_db_mod.get_global_database().connection() as conn:
        marker = conn.execute(
            "SELECT value FROM meta WHERE key = 'providers_migrated_v1'"
        ).fetchone()
    assert marker is not None and marker[0] == "1"


def test_migration_marks_without_duplicating_when_global_already_configured(client):
    """兼容从「行数判据」旧版本升级：全局已有配置但无标记 → 只落标记、不重复搬运。"""
    slug = client.post("/api/books", json={"title": "老书"}).json()["slug"]
    _seed_legacy_book_providers(slug, [("deepseek", "deepseek-chat", "kr-1")])
    _wipe_global()
    with global_db_mod.get_global_database().transaction() as conn:
        provider_repo.create(
            conn,
            {"provider": "kimi", "model": "moonshot-v1-8k"},
            "2026-09-22T00:00:00+08:00",
        )
    assert provider_migration.migrate_providers_to_global() == 0
    with global_db_mod.get_global_database().connection() as conn:
        rows = provider_repo.list_all(conn)
    assert [r["provider"] for r in rows] == ["kimi"]  # 未把 deepseek 重复搬入


# ---------------------------------------------- 验收点：删空的模型重启不复活


def test_deleted_providers_stay_deleted_after_restart(client):
    """用户场景：老配置迁移进来 → 在设置页全删 → 重启（再走迁移入口）→ 仍为空。

    回归护栏：旧判据「全局库有没有 provider 行」会在重启时把旧库的行再次搬回，
    导致模型永远删不干净。现判据为一次性标记，删除后必须保持为空。
    """
    slug = client.post("/api/books", json={"title": "老书"}).json()["slug"]
    _seed_legacy_book_providers(
        slug,
        [("stepfun", "step-3.5-flash", "kr-a"), ("stepfun", "step-5-preview", "kr-b")],
    )
    _wipe_global()

    # ① 首次启动迁移入口 → 老配置被搬进全局库
    assert provider_migration.migrate_providers_to_global() == 2
    assert [p["model"] for p in client.get("/api/providers").json()] == [
        "step-3.5-flash",
        "step-5-preview",
    ]

    # ② 用户在设置页把模型全删了（走真实 API）
    for p in client.get("/api/providers").json():
        assert client.delete(f"/api/providers/{p['id']}").status_code == 204
    assert client.get("/api/providers").json() == []
    assert client.get("/api/system/capabilities").json()["llm_configured"] is False

    # ③ 重启：再次走迁移入口（lifespan 每次启动都会调它）
    assert provider_migration.migrate_providers_to_global() == 0

    # ④ 删除后必须仍是空的 —— 不得复活
    assert client.get("/api/providers").json() == []
    assert client.get("/api/system/capabilities").json()["llm_configured"] is False
