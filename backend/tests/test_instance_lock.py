"""单实例锁测试（风险项 TC-02）。

全部使用 `tmp_path` 作为 data 目录，绝不触碰真实的 `data/` / `books/`。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

from app.services import instance_lock
from app.services.instance_lock import (
    AlreadyRunningError,
    InstanceLockError,
    LockUnreadableError,
    acquire_lock,
    release_lock,
)


def _lock_path(data_dir):
    return data_dir / instance_lock.LOCK_FILENAME


def test_acquire_writes_lock_with_required_fields(tmp_path):
    lock = acquire_lock(tmp_path, port=8711, host="127.0.0.1")
    try:
        data = json.loads(_lock_path(tmp_path).read_text(encoding="utf-8"))
        assert data["pid"] == os.getpid()
        assert data["port"] == 8711
        assert data["host"] == "127.0.0.1"
        assert data["started_at"]  # 非空时间戳
        assert data["process_started_at"]
    finally:
        release_lock(lock)


def test_second_acquire_fails_with_already_running(tmp_path):
    first = acquire_lock(tmp_path, port=8711, host="127.0.0.1")
    try:
        with pytest.raises(AlreadyRunningError) as excinfo:
            acquire_lock(tmp_path, port=8712, host="127.0.0.1")
        # 失败原因可判别：异常类型 + reason + 持有者信息（含 A 的端口）
        assert excinfo.value.reason == "already_running"
        assert isinstance(excinfo.value, InstanceLockError)
        assert excinfo.value.holder is not None
        assert excinfo.value.holder["port"] == 8711
    finally:
        release_lock(first)


def test_release_then_reacquire_succeeds(tmp_path):
    first = acquire_lock(tmp_path, port=8711)
    release_lock(first)
    assert not _lock_path(tmp_path).exists()

    second = acquire_lock(tmp_path, port=8712)
    try:
        assert json.loads(_lock_path(tmp_path).read_text(encoding="utf-8"))["port"] == 8712
    finally:
        release_lock(second)


def test_stale_lock_with_dead_pid_is_taken_over(tmp_path):
    # 起一个真实进程并等它结束，拿到一个确实已死的 PID
    proc = subprocess.Popen([sys.executable, "-c", "pass"])
    dead_pid = proc.pid
    proc.wait()
    if instance_lock.is_process_alive(dead_pid):
        pytest.skip("刚结束的 PID 已被复用，跳过真实死进程用例")

    _lock_path(tmp_path).write_text(
        json.dumps({"pid": dead_pid, "port": 8000, "host": "127.0.0.1"}),
        encoding="utf-8",
    )
    lock = acquire_lock(tmp_path, port=8711)
    try:
        data = json.loads(_lock_path(tmp_path).read_text(encoding="utf-8"))
        assert data["pid"] == os.getpid()  # 陈旧锁已被覆盖
        assert data["port"] == 8711
    finally:
        release_lock(lock)


def test_stale_lock_via_mocked_liveness_is_taken_over(tmp_path, monkeypatch):
    _lock_path(tmp_path).write_text(
        json.dumps({"pid": 999_999_999, "port": 8000}),
        encoding="utf-8",
    )
    monkeypatch.setattr(instance_lock, "is_process_alive", lambda pid: False)
    lock = acquire_lock(tmp_path, port=8711)
    try:
        assert json.loads(_lock_path(tmp_path).read_text(encoding="utf-8"))["port"] == 8711
    finally:
        release_lock(lock)


@pytest.mark.skipif(os.name != "nt", reason="创建时间比对仅 Windows 支持")
def test_pid_reuse_is_detected_by_creation_time(tmp_path):
    # 锁里写着本进程的 PID，但创建时间明显不符 -> 判定为 PID 复用后的陈旧锁 -> 接管
    assert instance_lock.is_process_alive(os.getpid())
    _lock_path(tmp_path).write_text(
        json.dumps(
            {"pid": os.getpid(), "port": 8000, "process_started_at": 1.0},
        ),
        encoding="utf-8",
    )
    lock = acquire_lock(tmp_path, port=8711)
    try:
        data = json.loads(_lock_path(tmp_path).read_text(encoding="utf-8"))
        assert data["pid"] == os.getpid()
        assert data["process_started_at"] != 1.0
    finally:
        release_lock(lock)


def test_unreadable_lock_is_rejected(tmp_path):
    _lock_path(tmp_path).write_text("这不是合法的 JSON", encoding="utf-8")
    with pytest.raises(LockUnreadableError) as excinfo:
        acquire_lock(tmp_path, port=8711)
    # 不可解析与「已在运行」是两种可区分的失败原因
    assert excinfo.value.reason == "lock_unreadable"
    assert excinfo.value.reason != AlreadyRunningError.reason


def test_release_does_not_delete_foreign_lock(tmp_path):
    lock = acquire_lock(tmp_path, port=8711)
    # 锁文件被其它进程接管（PID 变化）
    _lock_path(tmp_path).write_text(
        json.dumps({"pid": os.getpid() + 1, "port": 8712}), encoding="utf-8"
    )
    release_lock(lock)
    assert _lock_path(tmp_path).exists()  # 不误删他人锁


def test_acquire_does_not_touch_books_dir(tmp_path):
    # 用与真实布局一致的 data/ + books/ 目录，确认抢锁只写 data/instance.lock
    books = tmp_path / "books"
    books.mkdir()
    sentinel = books / "某书" / "novel.db"
    sentinel.parent.mkdir()
    sentinel.write_text("不可动", encoding="utf-8")
    before = sentinel.read_text(encoding="utf-8")

    lock = acquire_lock(tmp_path / "data", port=8711)
    try:
        assert _lock_path(tmp_path / "data").exists()
        assert sorted(p.name for p in books.iterdir()) == ["某书"]
    finally:
        release_lock(lock)

    assert sentinel.read_text(encoding="utf-8") == before


def test_context_manager_releases(tmp_path):
    with acquire_lock(tmp_path, port=8711) as lock:
        assert _lock_path(tmp_path).exists()
        assert lock.info["port"] == 8711
    assert not _lock_path(tmp_path).exists()
