"""伏笔台账约束（R3 回写 / R4 召回）：模型超发的硬兜底 + 重要度分档默认 + 召回注入上限。

为什么单独成一个"规则文件"：本项目已有多次"模型不遵守提示词、最后必须靠代码层硬兜底"
的先例（如 setup 对话 3-5 轮）。伏笔是**会累积**的数据 —— 一旦被 AI 回写建议灌爆，
写前召回喂给模型的"未回收伏笔"提示价值被稀释，吃书正是从这里开始。
故把「每章新增上限 / 默认保留策略 / 召回注入上限」集中在此：改一处即可全局生效、便于审计。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")

# 重要度排序权重：越小越优先保留（high > medium > low）。
IMPORTANCE_ORDER: dict[str, int] = {"high": 0, "medium": 1, "low": 2}

# 每章最多保留 / 入库的新伏笔条数。
# 为什么是 3：M2 真跑 20 章时，章末回写每章抛 4~10 条 new_foreshadows 且默认全 accepted，
# 累积出 60 条未回收伏笔 —— 写第 21 章时"未回收伏笔"提示被稀释到等于没提示。
# 真实作者每章新增的「会被后文回收」的钩子通常 0~3 条；3 条足以覆盖，又不至于让台账失控。
MAX_NEW_FORESHADOWS_PER_CHAPTER = 3

# 后端给出的 accepted 默认值（权威默认；前端据此初始化勾选状态）。
# 高 / 中默认保留；低默认不保留（用户主动勾选才入库）。
# 为什么 low 默认 false：低重要度正是灌爆台账的主力，默认不收是最省事的安全网。
DEFAULT_ACCEPTED_BY_IMPORTANCE: dict[str, bool] = {
    "high": True,
    "medium": True,
    "low": False,
}

# 写前召回最多注入的未回收伏笔条数（按重要度排序后截断）。
# 为什么是 15：即使台账仍有几十条，也不能全塞进提示词把上下文挤爆；
# 因按重要度降序，high/medium 会天然优先进入这 15 条。
MAX_RECALL_FORESHADOWS = 15


def importance_rank(importance: str) -> int:
    """重要度 → 排序权重（未知值按 medium 处理）。"""
    return IMPORTANCE_ORDER.get(importance, IMPORTANCE_ORDER["medium"])


def default_accepted(importance: str) -> bool:
    """按重要度给出 accepted 默认值（未知值保守按 True，不误伤内容）。"""
    return DEFAULT_ACCEPTED_BY_IMPORTANCE.get(importance, True)


def keep_top_by_importance(
    items: list[T],
    importance_of: Callable[[T], str],
    limit: int,
) -> tuple[list[T], int]:
    """按重要度保留前 `limit` 条，返回 (保留项, 丢弃数)。

    同等重要度按原顺序保留（稳定）；保留下来的项也维持原顺序，避免打乱模型输出观感。
    """
    if len(items) <= limit:
        return list(items), 0
    keep_idx = set(
        sorted(range(len(items)), key=lambda i: importance_rank(importance_of(items[i])))[:limit]
    )
    kept = [items[i] for i in range(len(items)) if i in keep_idx]
    return kept, len(items) - len(kept)
