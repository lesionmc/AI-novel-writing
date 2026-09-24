"""E2E 用的假 LLM 服务（OpenAI 兼容，仅标准库实现，无第三方依赖）。

用途：让自动化测试（Playwright）在**没有真实模型密钥**的情况下，
完整走一遍 AI 对话（含 SSE 流式）、草稿确认、卷摘要、大纲展开等链路。
仅供开发/测试：`python docs/tools/mock_llm_server.py [port]`（默认 8899）。

行为：按 prompt 里的特征词分派不同"剧本"，其余一律回一句通用 mock 回复。
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899


def _reply_for(prompt: str) -> str:
    if "检索规划器" in prompt:
        return json.dumps({"need_search": False, "query": ""}, ensure_ascii=False)
    if "卷摘要" in prompt and "各章" in prompt:
        return json.dumps(
            {"summary": "（mock 卷摘要）主角夜探老楼，发现楼内有人活动，留下悬念。"},
            ensure_ascii=False,
        )
    if "展开" in prompt and "candidates" in prompt:
        return json.dumps(
            {
                "candidates": [
                    {"title": "（mock）第一章候选", "content": "开篇事件", "level": "chapter"},
                    {"title": "（mock）第二章候选", "content": "冲突升级", "level": "chapter"},
                ]
            },
            ensure_ascii=False,
        )
    # 按注入的意图行精确分派（提示词正文本来就含"人物卡"等字样，不能拿它当特征词）
    if "他要**起书名**" in prompt:
        return json.dumps(
            {
                "reply": "给你一批候选，我最推荐「（mock）书名甲」，反差感最强。",
                "draft": {
                    "kind": "title_options",
                    "payload": {"titles": ["（mock）书名甲", "（mock）书名乙", "（mock）书名丙"]},
                },
            },
            ensure_ascii=False,
        )
    if "复盘沉淀" in prompt:
        return json.dumps(
            {
                "reply": "这本书的复盘写好了，复制走存进你的方法论文件夹。",
                "draft": {
                    "kind": "retrospective",
                    "payload": {
                        "title": "（mock）复盘",
                        "content": "## 立住了什么\n（mock）祖碑设定\n## 哪里掉速\n第 1 章交代过多",
                    },
                },
            },
            ensure_ascii=False,
        )
    if "把这本书开起来" in prompt:
        # 引导模式（guide 意图）：立项聊定 → 产出建书交接卡
        return json.dumps(
            {
                "reply": "方向齐了，我把它整理成了建书卡，点「就建这本」就能正式开起来。",
                "draft": {
                    "kind": "book_plan",
                    "payload": {
                        "title": "自动化测试之书立项卡",
                        "genre": "自动化测试题材",
                        "readers": "番茄男频 · 通勤读者",
                        "premise": "（mock）一键建书交接的卖点",
                        "target_words": 1500000,
                    },
                },
            },
            ensure_ascii=False,
        )
    if "他想整理人物" in prompt:
        return json.dumps(
            {
                "reply": "我把这个人整理成了人物卡，你看看要不要改。",
                "draft": {
                    "kind": "characters",
                    "payload": {
                        "characters": [
                            {
                                "name": "（mock）白衣人",
                                "role": "antagonist",
                                "surface_identity": "深夜出现在老楼的人",
                                "secret_desire": "取回楼里藏的东西",
                                "fatal_weakness": "怕光",
                                "contradiction": "行为像在躲谁，又像在等人",
                            }
                        ]
                    },
                },
            },
            ensure_ascii=False,
        )
    if "回写" in prompt or "状态变更" in prompt:
        return json.dumps(
            {
                "chapter_summary": "（mock 摘要）陈默进入老楼。",
                "character_states": [],
                "plot_progress": [],
                "new_foreshadows": [],
                "closed_foreshadow_ids": [],
            },
            ensure_ascii=False,
        )
    return json.dumps(
        {"reply": "（mock 回复）收到，我在。这本书的情况我都记着，直接说下一步想干什么。", "draft": None},
        ensure_ascii=False,
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:  # 安静
        return

    def _read_body(self) -> dict | None:
        """坏 JSON 要如实报 400：吞掉伪装成 {} 会让后端的请求序列化回归悄悄溜过 E2E。"""
        length = int(self.headers.get("content-length") or 0)
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return None

    def do_GET(self) -> None:  # noqa: N802
        if self.path.endswith("/models"):
            payload = {"data": [{"id": "mock-gpt"}, {"id": "mock-embed"}]}
            self._send(json.dumps(payload).encode())
        else:
            self.send_error(404)

    def do_POST(self) -> None:  # noqa: N802
        body = self._read_body()
        if body is None:
            self.send_error(400, "mock: invalid JSON body")
            return
        messages = body.get("messages") or [{}]
        prompt = str(messages[-1].get("content") or "")
        content = _reply_for(prompt)
        if body.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            # 按 8 字符切片发 delta，模拟逐 token 到达
            for i in range(0, len(content), 8):
                chunk = {"choices": [{"delta": {"content": content[i : i + 8]}}]}
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.write(b"data: [DONE]\n\n")
            return
        if "test" in self.path or body.get("max_tokens") == 1:  # 连接测试
            content = "ok"
        payload = {
            "id": "mock",
            "object": "chat.completion",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}}],
        }
        self._send(json.dumps(payload, ensure_ascii=False).encode())

    def _send(self, data: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print(f"mock LLM listening on http://127.0.0.1:{PORT}/v1/chat/completions")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
