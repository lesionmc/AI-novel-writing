"""T-B 回归：`limit` 必须有上下界。

两个层面各钉一遍：
  1. **路由层**：`Query(ge=1, le=200)` → 非法值 400 `VALIDATION_ERROR`（不静默接受）；
  2. **仓库层**：兜底夹取 —— SQLite 的 `LIMIT -1` 语义是**无上限**，
     任何调用路径都不允许把 0/负值带进 SQL（否则等于导出全表）。
"""

from __future__ import annotations

from app.db.connection import Capabilities
from app.repositories import memory_repo, search_setting_repo


def _no_fts_caps() -> Capabilities:
    """fts5_available=False → 强制走子串匹配分支（那里也会把 limit 绑进 SQL）。"""
    return Capabilities(
        loadable_extension=False,
        vec_available=False,
        vec_version=None,
        fts5_available=False,
        degrade_reasons=(),
    )


class _CapturingConn:
    """记录绑定参数、返回空行的假连接。"""

    def __init__(self) -> None:
        self.params: tuple | None = None

    def execute(self, sql: str, params: tuple = ()) -> object:  # noqa: ANN401
        self.params = params
        return _EmptyCursor()


class _EmptyCursor:
    def fetchall(self) -> list:
        return []


# --------------------------------------------------------------------- 路由层
def test_search_limit_out_of_range_rejected(client, book):
    for bad in ("-1", "0", "100000"):
        resp = client.get(
            f"/api/books/{book}/search", params={"q": "张三", "limit": bad}
        )
        assert resp.status_code == 400, (bad, resp.status_code, resp.text)
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    # 边界内仍照常工作
    assert client.get(
        f"/api/books/{book}/search", params={"q": "张三", "limit": 200}
    ).status_code == 200


def test_recall_logs_limit_out_of_range_rejected(client, book):
    for bad in ("-1", "0", "100000"):
        resp = client.get(f"/api/books/{book}/recall-logs", params={"limit": bad})
        assert resp.status_code == 400, (bad, resp.status_code, resp.text)
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.get(
        f"/api/books/{book}/recall-logs", params={"limit": 1}
    ).status_code == 200


# --------------------------------------------------------------------- 仓库层
def test_search_repo_clamps_nonpositive_and_oversized_limit():
    conn = _CapturingConn()
    search_setting_repo.search_setting(conn, _no_fts_caps(), "张三", -1)
    assert conn.params is not None and conn.params[-1] == 1  # 不是 -1（无上限）

    search_setting_repo.search_setting(conn, _no_fts_caps(), "张三", 10_000)
    assert conn.params is not None and conn.params[-1] == search_setting_repo._MAX_LIMIT


def test_memory_repo_clamps_nonpositive_and_oversized_limit():
    conn = _CapturingConn()
    memory_repo.list_recall_logs(conn, -1)
    assert conn.params is not None and conn.params[0] == 1

    memory_repo.list_recall_logs(conn, 10_000)
    assert conn.params is not None and conn.params[0] == memory_repo._MAX_LIMIT
