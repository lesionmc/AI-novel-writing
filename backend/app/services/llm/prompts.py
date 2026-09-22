"""提示词模板加载与插值（prompts/*.md，支持 provider 覆盖文件）。"""

from __future__ import annotations

import re
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
_PLACEHOLDER_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def load_prompt(name: str, provider: str | None = None) -> str:
    """优先读取 name.<provider>.md，不存在则回落 name.md（多模型适配）。"""
    if provider:
        override = PROMPTS_DIR / f"{name}.{provider}.md"
        if override.is_file():
            return override.read_text(encoding="utf-8")
    base = PROMPTS_DIR / f"{name}.md"
    return base.read_text(encoding="utf-8")


def render(template: str, variables: dict[str, object]) -> str:
    def _sub(match: re.Match[str]) -> str:
        key = match.group(1)
        value = variables.get(key, "")
        return "" if value is None else str(value)

    return _PLACEHOLDER_RE.sub(_sub, template)


def build_prompt(name: str, variables: dict[str, object], provider: str | None = None) -> str:
    return render(load_prompt(name, provider), variables)
