"""Aho-Corasick 自动机（多模式串匹配，纯算法，无业务、无副作用）。

为什么手写：项目约束**禁止新增第三方依赖**，而 `requirements.txt` 未含 `pyahocorasick`。
本实现是标准 trie + fail 指针 + 输出链（dict-suffix link），扫描时间对正文长度线性。

- `add(word, value)`：插入一个模式串，可携带任意 payload（本模块不解释 payload）；
- `build()`：BFS 构建 fail 指针与输出链（幂等，`add` 之后会自动重建）；
- `scan(text)`：迭代 `(start, value)`，`start` 为命中起点的字符偏移，支持重叠命中
  （如正文 "aaa" 上模式 "aa" 会命中 start=0 与 start=1）。

只做这三件事，不做词典压缩等扩展变体——符合需求即可，避免过度设计。
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterator
from typing import Any


class AhoCorasick:
    """多模式串匹配自动机。支持 10000+ 模式串常驻内存。"""

    def __init__(self) -> None:
        self._goto: list[dict[str, int]] = [{}]  # 每个节点的转移表
        self._fail: list[int] = [0]  # fail 指针
        self._out: list[list[tuple[str, Any]]] = [[]]  # 该节点结束的模式串
        self._out_link: list[int] = [0]  # 最近一个"有输出"的 fail 祖先
        self._built = False

    def add(self, word: str, value: Any = None) -> None:
        """插入模式串 `word`，命中时一并返回 `value`。空串忽略。"""
        if not word:
            return
        self._built = False
        node = 0
        for ch in word:
            nxt = self._goto[node].get(ch)
            if nxt is None:
                nxt = len(self._goto)
                self._goto.append({})
                self._fail.append(0)
                self._out.append([])
                self._out_link.append(0)
                self._goto[node][ch] = nxt
            node = nxt
        self._out[node].append((word, value))

    def build(self) -> None:
        """按 BFS 层序构建 fail 指针与输出链。"""
        goto, fail, out, out_link = self._goto, self._fail, self._out, self._out_link
        queue: deque[int] = deque()
        for child in goto[0].values():
            fail[child] = 0
            out_link[child] = 0
            queue.append(child)
        while queue:
            parent = queue.popleft()
            for ch, child in goto[parent].items():
                queue.append(child)
                f = fail[parent]
                while f and ch not in goto[f]:
                    f = fail[f]
                fail[child] = goto[f].get(ch, 0)
                fallback = fail[child]
                # 输出链：fail 节点自己有输出就指向它，否则继承它的输出链
                out_link[child] = fallback if out[fallback] else out_link[fallback]
        self._built = True

    def scan(self, text: str) -> Iterator[tuple[int, Any]]:
        """扫描 `text`，产出 `(起点偏移, payload)`；命中位置可能有重叠。"""
        if not self._built:
            self.build()
        goto, fail, out, out_link = self._goto, self._fail, self._out, self._out_link
        node = 0
        for i, ch in enumerate(text):
            while node and ch not in goto[node]:
                node = fail[node]
            node = goto[node].get(ch, 0)
            emitted = node
            while emitted:
                for word, value in out[emitted]:
                    yield i - len(word) + 1, value
                emitted = out_link[emitted]

    @property
    def pattern_count(self) -> int:
        """已插入的模式串总数（含重叠/重复插入）。"""
        return sum(len(items) for items in self._out)
