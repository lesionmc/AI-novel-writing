"""敏感词库：解析、自动机构建与缓存（纯本地，不联网、不调用模型）。

## 文件格式

`<data_dir>/sensitive_words.txt`，每行一条：

```
# 以 # 开头的行为注释，忽略；空行忽略
词条A,违法
词条B,低俗
词条C                                   # 分类可省略，省略时归入 other
词条D|词条D变体|词条D拼音,illegal        # 用 | 分隔变体，全部纳入匹配
```

解析规则：去首尾空白 → 跳过空行与注释 → 按（半角或全角）逗号拆出「词条」与「分类」→
变体逐个展开 → **按归一化后的词形去重，保留首次出现的分类**。

## 分类标识

`politics` / `violence` / `porn` / `illegal` / `superstition` / `other`。
中文别名（如「违法」「低俗」）会自动映射到对应标识；无法识别的分类**原样保留**（不静默丢弃）。

## 缓存

自动机常驻内存：按词库文件的 `(mtime_ns, size)` 做键缓存，文件变更后自动重建。
避免每次请求重建自动机（10,000 条词库重建代价高，会直接拖垮性能要求）。
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

from app.services.audit.aho_corasick import AhoCorasick
from app.services.audit.normalize import normalize

WORDLIST_FILENAME = "sensitive_words.txt"

CATEGORY_IDS = ("politics", "violence", "porn", "illegal", "superstition", "other")
DEFAULT_CATEGORY = "other"

_CATEGORY_ALIASES: dict[str, str] = {
    "politics": "politics",
    "政治": "politics",
    "政治敏感": "politics",
    "violence": "violence",
    "暴力": "violence",
    "暴力血腥": "violence",
    "porn": "porn",
    "色情": "porn",
    "低俗": "porn",
    "色情低俗": "porn",
    "illegal": "illegal",
    "违法": "illegal",
    "违规": "illegal",
    "违法违规": "illegal",
    "违法乱纪": "illegal",
    "superstition": "superstition",
    "迷信": "superstition",
    "封建迷信": "superstition",
    "other": "other",
    "其他": "other",
    "其它": "other",
}


@dataclass(frozen=True)
class WordEntry:
    """一个可匹配词条；`word` 为词条原文（可能是某个变体），`category` 为分类标识。"""

    word: str
    category: str


@dataclass(frozen=True)
class WordList:
    path: Path
    entries: tuple[WordEntry, ...]
    automaton: AhoCorasick

    @property
    def count(self) -> int:
        """可匹配词条数（变体逐个计入、去重后）。"""
        return len(self.entries)

    def count_matches(self, raw_text: str) -> dict[WordEntry, int]:
        """在原始正文上匹配，返回 `{词条: 命中次数}`（内部先归一化）。"""
        text = normalize(raw_text)
        counts: dict[WordEntry, int] = {}
        if not text:
            return counts
        for _start, entry in self.automaton.scan(text):
            counts[entry] = counts.get(entry, 0) + 1
        return counts


def wordlist_path(data_dir: str | Path) -> Path:
    return Path(data_dir) / WORDLIST_FILENAME


def _canonical_category(raw: str) -> str:
    token = (raw or "").strip()
    if not token:
        return DEFAULT_CATEGORY
    low = token.lower()
    if low in CATEGORY_IDS:
        return low
    return _CATEGORY_ALIASES.get(token, token)


def parse_wordlist(raw_text: str) -> list[WordEntry]:
    """把词库文本解析为去重后的词条列表（纯函数，便于单测）。"""
    entries: list[WordEntry] = []
    seen: set[str] = set()
    for line in raw_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        word_part, sep, rest = line.replace("，", ",").partition(",")
        category = _canonical_category(rest.split(",")[0]) if sep else DEFAULT_CATEGORY
        for variant in word_part.split("|"):
            word = variant.strip()
            if not word:
                continue
            key = normalize(word)
            if not key or key in seen:
                continue
            seen.add(key)
            entries.append(WordEntry(word=word, category=category))
    return entries


def _build(entries: list[WordEntry], path: Path) -> WordList:
    automaton = AhoCorasick()
    for entry in entries:
        automaton.add(normalize(entry.word), entry)
    automaton.build()
    return WordList(path=path, entries=tuple(entries), automaton=automaton)


_cache: dict[Path, tuple[tuple[int, int], WordList]] = {}
_cache_lock = threading.Lock()


def load_wordlist(path: str | Path) -> WordList:
    """加载并缓存词库。文件缺失 / 为空 / 不可读时返回空词库（不报错）。"""
    p = Path(path)
    try:
        stat = p.stat()
    except OSError:
        return _build([], p)

    key = (stat.st_mtime_ns, stat.st_size)
    with _cache_lock:
        cached = _cache.get(p)
        if cached is not None and cached[0] == key:
            return cached[1]

    entries: list[WordEntry] = []
    if stat.st_size > 0:
        try:
            entries = parse_wordlist(p.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            entries = []
    wordlist = _build(entries, p)
    with _cache_lock:
        _cache[p] = (key, wordlist)
    return wordlist


def reset_cache_for_tests() -> None:
    """仅供测试使用：清空词库缓存，避免跨用例串状态。"""
    with _cache_lock:
        _cache.clear()
