r"""从模型**流式输出的 JSON** 里增量抽出 `"reply"` 字段的可读文本。

## 为什么需要这个
AI 对话被要求严格输出 `{"reply": "...", "draft": ...}`（草稿校验依赖它），
但流式体验需要"人话"边生成边显示——直接转发原始 JSON 会让用户看到
`{"reply": "你好，今天想推` 这种半截结构。本提取器在字节流上找到
`"reply": "` 起点后按 JSON 字符串规则解码（含 \n、\uXXXX 转义），
遇到闭合引号即停。

## 失败姿态
模型没按格式来（找不到 `"reply": "`、坏转义）→ 一律返回空片段，
**绝不猜**；调用方仍有 final 帧兜底完整回复，宁可晚显示、不显示乱码。
"""

from __future__ import annotations

import re

_NEEDLE_RE = re.compile(r'"reply"\s*:\s*"')
_ESCAPES = {'n': '\n', 'r': '\r', 't': '\t', '"': '"', '\\': '\\', '/': '/', 'b': '\b', 'f': '\f'}
# seek 阶段只可能靠尾部匹配；缓冲超长就丢掉绝大部分（留 64 字符防切断 needle）
_SEEK_KEEP = 64


class ReplyStreamExtractor:
    _SEEK, _VALUE, _DONE = 0, 1, 2

    def __init__(self) -> None:
        self._buf = ""
        self._state = self._SEEK
        self._esc = False

    def feed(self, chunk: str) -> str:
        """喂入一段原始输出，返回本次新解码出的可读文本（可能为空）。"""
        if self._state == self._DONE:
            return ""
        self._buf += chunk

        if self._state == self._SEEK:
            m = _NEEDLE_RE.search(self._buf)
            if not m:
                if len(self._buf) > 2048:
                    self._buf = self._buf[-_SEEK_KEEP:]
                return ""
            self._buf = self._buf[m.end():]
            self._state = self._VALUE

        out: list[str] = []
        i = 0
        n = len(self._buf)
        while i < n:
            ch = self._buf[i]
            if self._esc:
                if ch == "u":
                    if i + 4 >= n:
                        break  # \uXXXX 还没收全，留在缓冲等下一段
                    try:
                        out.append(chr(int(self._buf[i + 1 : i + 5], 16)))
                    except ValueError:
                        self._state = self._DONE  # 坏转义：停止提取，交给 final 帧
                        break
                    i += 5
                    self._esc = False
                    continue
                decoded = _ESCAPES.get(ch)
                if decoded is None:
                    self._state = self._DONE
                    break
                out.append(decoded)
                i += 1
                self._esc = False
                continue
            if ch == "\\":
                self._esc = True
                i += 1
                continue
            if ch == '"':
                self._state = self._DONE
                i += 1
                break
            out.append(ch)
            i += 1

        if self._state != self._DONE:
            self._buf = self._buf[i:]
        else:
            self._buf = ""
        return "".join(out)
