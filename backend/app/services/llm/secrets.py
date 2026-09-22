"""密钥环读写（keyring）。密钥仅用于当次请求，用后即弃，不缓存、不落日志、不回显。

数据库只存 key_ref（引用名）。本模块提供可替换后端以便测试。
"""

from __future__ import annotations

import uuid
from typing import Protocol

import keyring
from keyring.errors import KeyringError, PasswordDeleteError

from app.errors import SecretStoreError

SERVICE_NAME = "ai-novel"


class SecretBackend(Protocol):
    def set(self, key_ref: str, secret: str) -> None: ...
    def get(self, key_ref: str) -> str | None: ...
    def delete(self, key_ref: str) -> None: ...


class KeyringBackend:
    def set(self, key_ref: str, secret: str) -> None:
        keyring.set_password(SERVICE_NAME, key_ref, secret)

    def get(self, key_ref: str) -> str | None:
        return keyring.get_password(SERVICE_NAME, key_ref)

    def delete(self, key_ref: str) -> None:
        try:
            keyring.delete_password(SERVICE_NAME, key_ref)
        except PasswordDeleteError:
            pass


_backend: SecretBackend = KeyringBackend()


def set_backend(backend: SecretBackend) -> None:
    """测试注入用。"""
    global _backend
    _backend = backend


def new_key_ref() -> str:
    return f"ai-novel-{uuid.uuid4().hex}"


def store_secret(key_ref: str, secret: str) -> None:
    try:
        _backend.set(key_ref, secret)
    except (KeyringError, RuntimeError, OSError, ValueError) as exc:
        raise SecretStoreError(detail=None) from exc


def load_secret(key_ref: str) -> str | None:
    try:
        return _backend.get(key_ref)
    except (KeyringError, RuntimeError, OSError, ValueError) as exc:
        raise SecretStoreError() from exc


def delete_secret(key_ref: str | None) -> None:
    if not key_ref:
        return
    try:
        _backend.delete(key_ref)
    except (KeyringError, RuntimeError, OSError, ValueError):
        # 删除失败不阻断配置删除；密钥残留不影响功能
        pass
