"""测试替身：内存密钥环后端与假模型客户端。"""

from __future__ import annotations

import hashlib

EMBED_DIM = 1024


class InMemorySecretBackend:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    def set(self, key_ref: str, secret: str) -> None:
        self.store[key_ref] = secret

    def get(self, key_ref: str) -> str | None:
        return self.store.get(key_ref)

    def delete(self, key_ref: str) -> None:
        self.store.pop(key_ref, None)


class FakeLLMClient:
    """可编程假客户端：chat 按顺序吐出预设响应，embed 返回确定性 1024 维向量。"""

    provider = "fake"
    model = "fake-model"

    def __init__(self, chat_responses=None, embed_map=None) -> None:
        self._responses = list(chat_responses or [])
        self.embed_map = embed_map or {}
        self.chat_calls: list[list[dict]] = []
        self.embed_calls: list[list[str]] = []

    def chat(self, messages, *, json_mode: bool = False, timeout: float = 60.0) -> str:
        self.chat_calls.append(messages)
        if not self._responses:
            return "{}"
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    def chat_stream(self, messages, *, json_mode: bool = False, timeout: float = 60.0):
        """流式假实现：把预设响应按 2 字符切片吐出，模拟真实逐 token 到达。"""
        text = self.chat(messages, json_mode=json_mode, timeout=timeout)
        return iter([text[i : i + 2] for i in range(0, len(text), 2)])

    def embed(self, texts, *, timeout: float = 60.0) -> list[list[float]]:
        self.embed_calls.append(list(texts))
        return [self._vector(text) for text in texts]

    def _vector(self, text: str) -> list[float]:
        if text in self.embed_map:
            return list(self.embed_map[text])
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        return [digest[i % len(digest)] / 255.0 for i in range(EMBED_DIM)]


def constant_vector(value: float) -> list[float]:
    return [value] * EMBED_DIM
