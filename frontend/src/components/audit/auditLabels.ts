/**
 * 质检页文案映射（枚举 → 人话）
 * -----------------------------------------------------------------------------
 * 铁律：**不把英文枚举直接摆给用户**（QA：小白看不懂 `cliche` / `violence`）。
 * 集中一处翻译，避免各组件各自解释造成口径不一（对齐 `lib/labels.ts` 的做法）。
 *
 * 取值可能超出已知枚举（后端新增类别）——所有取值函数都带兜底文案，
 * 未知取值不崩溃、不显示原始英文。
 */

import type { BadgeVariant } from '@/types/ui';
import type { AiFlavorHitType, SensitiveCategory } from '@/types/api';

/* ---------------- 去 AI 味：命中类别 ---------------- */

export const AI_FLAVOR_TYPE_LABELS: Record<AiFlavorHitType, string> = {
  cliche: '套话连接词',
  emotion_label: '直接说情绪',
  adjective_density: '程度词过多',
};

/** 一句话解释「这类问题为什么读起来像 AI」（鼠标悬停时给用户看） */
export const AI_FLAVOR_TYPE_HINTS: Record<AiFlavorHitType, string> = {
  cliche: '「总而言之」「不难看出」这类词用多了，会显得像机器在总结',
  emotion_label: '直接写「他很愤怒」，不如用动作和细节让读者自己感受到',
  adjective_density: '「非常」「极其」「十分」堆在一起，反而削弱了力度',
};

export function aiFlavorTypeLabel(value: string): string {
  return AI_FLAVOR_TYPE_LABELS[value as AiFlavorHitType] ?? '其他问题';
}

export function aiFlavorTypeHint(value: string): string {
  return AI_FLAVOR_TYPE_HINTS[value as AiFlavorHitType] ?? '这段读起来有点机械，可以再改得自然些';
}

/* ---------------- AI 味评分分档 ---------------- */

export interface ScoreBand {
  /** 分档名称（如「轻微」） */
  label: string;
  /** 一句人话说明 */
  hint: string;
  variant: BadgeVariant;
}

/**
 * 把 0-100 的 AI 味评分翻成一句人话。
 * 注意：分数越高 = AI 味越重（契约定义），不是高分好。
 */
export function scoreBand(score: number): ScoreBand {
  if (score <= 0) {
    return { label: '很自然', hint: '没有发现明显的 AI 味，这一段读起来挺顺', variant: 'success' };
  }
  if (score < 34) {
    return { label: '轻微', hint: '只有一点点机器味，挑几处改改就好', variant: 'neutral' };
  }
  if (score < 67) {
    return { label: '偏重', hint: '有几处明显像 AI 写的，建议按提示改一下', variant: 'warning' };
  }
  return { label: '很重', hint: 'AI 味比较明显，建议逐条采纳下面的改写建议', variant: 'danger' };
}

/* ---------------- 敏感词：分类 ---------------- */

export const SENSITIVE_CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  politics: '政治敏感',
  violence: '暴力血腥',
  porn: '色情低俗',
  illegal: '违法违规',
  superstition: '封建迷信',
  other: '其他',
};

/** 分类筛选的展示顺序（固定，避免每次渲染顺序抖动） */
export const SENSITIVE_CATEGORY_ORDER: SensitiveCategory[] = [
  'politics',
  'violence',
  'porn',
  'illegal',
  'superstition',
  'other',
];

/**
 * 写词表时**可用的另一种写法**（中文别名）。
 *
 * 后端的 `_CATEGORY_ALIASES`（services/audit/wordlist.py）中英文都收，
 * 会归一化成同一套 id。格式说明弹窗给出示例用了中文（`词条A,违法`），
 * 若「可用的分类」只列英文 id，用户会以为示例写错了 —— 两种都列出来。
 * `other` 同时是默认归入项，故注明「可省略不写」。
 */
export const SENSITIVE_CATEGORY_INPUT_ALIASES: Record<SensitiveCategory, string> = {
  politics: '政治',
  violence: '暴力',
  porn: '色情、低俗',
  illegal: '违法、违规',
  superstition: '迷信',
  other: '其他，可省略不写',
};

export function sensitiveCategoryLabel(value: string): string {
  return SENSITIVE_CATEGORY_LABELS[value as SensitiveCategory] ?? '其他';
}
