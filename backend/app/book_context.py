"""请求级作品上下文（`ContextVar`）。

## 为什么需要它

契约里的 by-id 端点（`GET /api/chapters/{id}`、`PATCH /api/characters/{id}` …）
**不带作品标识**，而 id 只在单部作品库内唯一。旧实现靠进程内**全局「当前作品指针」**
解析归属 —— 多标签页各开一本书时，两边的指针互相抢占，甲书标签页的自动保存会
**静默写进乙书**（数据损坏级 P0）。

修法：前端在每次请求带上 `X-Book-Slug` 请求头，中间件把它存进**本请求专属**的
`ContextVar`。by-id 归属解析看到它时**只在该作品内查找**，绝不回退全库扫描。

## 为什么必须是 `ContextVar` 而不是全局变量

`ContextVar` 的值随每次请求的 context 独立：FastAPI/Starlette 对每个请求都在
独立的上下文中运行（`asyncio.Task` 会拷贝当前 context），因此并发请求之间**互不污染**。
若换成模块级全局变量，等于把「指针抢占」这个 bug 从一处搬到另一处，问题依旧。
"""

from __future__ import annotations

from contextvars import ContextVar, Token

# 默认 None = 「本请求没有指定作品」，此时沿用旧的全库解析语义（向后兼容 curl 直连）。
_request_slug: ContextVar[str | None] = ContextVar("request_book_slug", default=None)


def set_request_slug(slug: str) -> Token:
    """在本请求上下文里绑定作品 slug，返回可用于恢复的 token。"""
    return _request_slug.set(slug)


def get_request_slug() -> str | None:
    """读取本请求绑定的作品 slug；未绑定返回 None。"""
    return _request_slug.get()


def reset_request_slug(token: Token) -> None:
    """请求结束时恢复上下文（配合 `try/finally`，避免泄漏到复用同一 context 的后续任务）。"""
    _request_slug.reset(token)
