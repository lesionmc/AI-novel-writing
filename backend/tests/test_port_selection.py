"""T-A 回归：端口选择**优先稳定默认端口**，只有被占用才回落到自选空闲端口。

背景：纯随机端口会让写死在脚本 / 书签 / 文档 / 快捷方式里的地址每次重启就失效
（本轮实测同一项目出现过 2874 → 5273 → 10514 三个不同端口）。
"被占用时自选"的行为必须保留（多实例共存），所以本文件同时钉住两条路径。
"""

from __future__ import annotations

import socket

from app import __main__ as main_mod


def _listen_on_free_port() -> tuple[socket.socket, int]:
    """占用一个空闲端口并**保持监听**；调用方负责 close。"""
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)
    return srv, int(srv.getsockname()[1])


def test_default_port_is_a_plausible_stable_port():
    assert 5000 <= main_mod._DEFAULT_PORT <= 9999


def test_pick_port_prefers_stable_default_when_free(monkeypatch):
    """默认端口空闲 → 必须选它（这正是「地址重启不变」的全部意义）。"""
    srv, free = _listen_on_free_port()
    srv.close()  # 让出来给 _pick_port 绑
    monkeypatch.setattr(main_mod, "_DEFAULT_PORT", free)
    assert main_mod._pick_port("127.0.0.1", 0) == free


def test_pick_port_falls_back_when_default_occupied(monkeypatch):
    """默认端口被占用（例如已开第二个实例）→ 回落自选空闲端口，不再撞车。"""
    srv, busy = _listen_on_free_port()
    monkeypatch.setattr(main_mod, "_DEFAULT_PORT", busy)
    try:
        chosen = main_mod._pick_port("127.0.0.1", 0)
    finally:
        srv.close()
    assert chosen != busy
    assert 1 <= chosen <= 65535


def test_pick_port_honours_explicit_port_over_default(monkeypatch):
    """显式指定（AINOVEL_PORT）优先级最高：默认端口空闲也不用它。"""
    srv, free = _listen_on_free_port()
    srv.close()
    monkeypatch.setattr(main_mod, "_DEFAULT_PORT", free)
    assert main_mod._pick_port("127.0.0.1", 4321) == 4321
