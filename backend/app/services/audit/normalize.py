"""敏感词匹配前的正文归一化（纯函数，无业务、无副作用）。

## 为什么归一化
直接匹配原始正文会漏掉"用插入符号绕过"的写法（如「敏*感」「敏 感」「敏感」的全角变体，
或夹入零宽字符）。归一化先把这些干扰抹平，再做自动机匹配。

## 归一化口径（本模块的明确定义）

按顺序执行：

1. **Unicode NFKC 规范化**：统一全角/半角（全角字母数字标点转半角），并折叠兼容字符。
2. **段落/换行边界 → 哨兵字符 `\x00`（保留、不删）**：
   换行（`\\n` / `\\r\\n` / `\\r`）、行分隔符（U+2028 / U+2029 / U+0085）一律替换为
   `PARAGRAPH_BOUNDARY = "\\x00"`。该字符不会是任何词条的组成部分，因此**跨段无法拼词**：
   `<p>敏</p><p>感</p>`（strip_html 后为 `敏\\n感`）归一为 `敏\\x00感`，**不命中「敏感」**。
3. **删除段内干扰字符**（`translate` 成空），用于**捕捉故意用符号绕过**的写法：
   - 段内空白：空格 / Tab / `\\v` / `\\f` / 全角空格 U+3000 / 不间断空格等；
   - 零宽与格式控制字符：U+200B–U+200F、U+FEFF、U+00AD、U+180E、U+2060–U+2064；
   - 常见"词内插入"绕过符号：`* . · ・ • ﹒ ﹕ ˙ ∙ ⋅ _ ‐ ‑ ‒ ~ ^ | ｜ / ／ \\ ＼`。
     **刻意不删中文句读**（，。！？、；：）——句读同样是不可跨越的边界，避免把相邻句子粘连误报。
4. **英文小写化**（`str.lower()`），实现英文词条大小写不敏感。

### 行为小结（段内可跨、跨段不可跨）
| 输入 | 归一化结果 | 命中「敏感」？ |
|---|---|---|
| `敏 感` | `敏感` | 是（段内空格被删） |
| `敏*感` / `敏.感` | `敏感` | 是（段内符号被删） |
| 全角 / 零宽字符 | 归一后同形 | 是 |
| `敏\\n感`（不同段落） | `敏\\x00感` | **否**（换行是边界） |
| `敏。感`（不同句子） | `敏。感` | **否**（句读保留） |

## 长度与位置（重要）
归一化会替换/删除字符，改变字符串长度，因此归一化后的偏移**不能**当作原文偏移。
契约 `auditSensitive` 的响应只有 `word / category / chapter_seq / count`，**不返回位置**，
故本功能只需保证**计数**正确，无需做"归一化位置 → 原文位置"的映射。
（`ai-flavor` 的位置口径走另一条路：在**未归一化**的去 HTML 纯文本上直接取偏移。）
"""

from __future__ import annotations

import unicodedata

# 段落边界哨兵：词库中不可能出现，保留不删，使跨段无法拼词。
PARAGRAPH_BOUNDARY = "\x00"

_BREAK_CHARS = ("\r\n", "\r", "\n", "\u2028", "\u2029", "\u0085")

_WHITESPACE = (
    " \t\v\f"
    "\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u202f\u205f\u3000"
)
_ZERO_WIDTH = "\u00ad\u180e\u200b\u200c\u200d\u200e\u200f\u2060\u2061\u2062\u2063\u2064\ufeff"
_BYPASS_SYMBOLS = "*.\u00b7\u30fb\u2022\ufe52\ufe55\u2027\u2219\u22c5_\u2010\u2011\u2012~^|\uff5c/\uff0f\\\uff3c"

_STRIP_TABLE = {ord(ch): None for ch in _WHITESPACE + _ZERO_WIDTH + _BYPASS_SYMBOLS}


def normalize(text: str) -> str:
    """按模块 docstring 的口径归一化正文或词条。空输入返回空串。"""
    if not text:
        return ""
    widened = unicodedata.normalize("NFKC", text)
    for br in _BREAK_CHARS:
        widened = widened.replace(br, PARAGRAPH_BOUNDARY)
    stripped = widened.translate(_STRIP_TABLE)
    return stripped.lower()
