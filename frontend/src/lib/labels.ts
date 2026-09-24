/**
 * 枚举 → 中文标签 / 视觉变体 映射
 * 集中一处，避免各页面各自翻译造成口径不一。
 */

import type { BadgeVariant } from '@/types/ui';
import type {
  CharacterRole,
  CharacterStatus,
  ConflictSeverity,
  ForeshadowStatus,
  Importance,
  OutlineLevel,
  ProofreadIssueType,
  TaskRole,
  WorldEntryCategory,
  WritingMode,
} from '@/types/api';

export const ROLE_LABELS: Record<CharacterRole, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  minor: '龙套',
};

export const ROLE_VARIANT: Record<CharacterRole, BadgeVariant> = {
  protagonist: 'primary',
  supporting: 'neutral',
  antagonist: 'danger',
  minor: 'neutral',
};

export const CHARACTER_STATUS_LABELS: Record<CharacterStatus, string> = {
  alive: '存活',
  dead: '已死亡',
  missing: '失踪',
  unknown: '未知',
};

export const FORESHADOW_STATUS_LABELS: Record<ForeshadowStatus, string> = {
  open: '未回收',
  closed: '已回收',
  abandoned: '已放弃',
};

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const IMPORTANCE_VARIANT: Record<Importance, BadgeVariant> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

export const OUTLINE_LEVEL_LABELS: Record<OutlineLevel, string> = {
  total: '总纲',
  volume: '卷纲',
  chapter: '章节卡',
};

export const WORLD_CATEGORY_LABELS: Record<WorldEntryCategory, string> = {
  force: '势力',
  place: '地点',
  rule: '规则',
  item: '物品',
  other: '其他',
};

/**
 * 模型分工（展示层口语化 —— QA M1：新手看不懂「架构规划 / 向量嵌入」）。
 * 术语（outline / content / review / embedding）保留在枚举值与内部文档里。
 */
export const TASK_ROLE_LABELS: Record<TaskRole, string> = {
  outline: '写大纲',
  content: '写正文',
  review: '检查前后一致（质检页）',
  embedding: '记住全文（便于搜索）',
};

export const TASK_ROLE_HINTS: Record<TaskRole, string> = {
  outline: '用来展开大纲、生成章节卡',
  content: '用来写正文、生成回写建议',
  review: '用来跑质检页的「一致性审校」；不指定时自动用默认模型',
  embedding: '用来把章节变成可搜索的记忆',
};

/**
 * 服务商显示名。**不是白名单** —— 契约里 provider 是自由字符串，
 * 这里只保证常见平台有友好中文名；未列出的平台直接显示原始标识。
 */
export const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek（深度求索）',
  qwen: '通义千问（阿里云百炼）',
  kimi: 'Kimi（月之暗面）',
  claude: 'Claude（Anthropic）',
  ollama: 'Ollama（本地模型）',
  openrouter: 'OpenRouter（聚合平台）',
  stepfun: '阶跃星辰 StepFun',
  zhipu: '智谱 GLM',
  minimax: 'MiniMax',
  siliconflow: '硅基流动',
  modelscope: '魔搭 ModelScope',
  custom: '自定义（OpenAI 兼容端点）',
};

/**
 * 取服务商显示名 —— **永远不要直接用 `PROVIDER_LABELS[x]`**。
 *
 * 由于 `provider` 是自由字符串（见 types/common.d.ts），用户完全可以用
 * `metaapi` / `my-proxy` 这类没进内置表的标识。直接下标取值会得到
 * `undefined`，界面上就会渲染出「undefined · deepseek-v4-flash」，
 * 用户会以为程序出错了。
 *
 * 约定：内置表命中就用友好中文名，未命中就原样回显标识本身。
 */
export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return '未指定平台';
  return PROVIDER_LABELS[provider] ?? provider;
}

export const WRITING_MODE_LABELS: Record<WritingMode, string> = {
  manual: '纯手动',
  assist: '辅助',
  semi: '半自动',
};

export const WRITING_MODE_HINTS: Record<WritingMode, string> = {
  manual: '不出现任何 AI 入口，就是一个干净的写作软件',
  assist: '顶栏出现 AI 菜单，需要你点了才动',
  semi: '和「辅助」一样；每章仍会先自动带出人物与线索，章末点「完成本章」由 AI 起草归档建议，确认后才入库',
};

/* ---------------- 只读质检类结果（校对 / 一致性审校） ---------------- */

/**
 * 一致性审校的严重度。
 * AI 对话工作台与质检页都要用，故集中在这里（此前质检页自带一份，口径一致，未强行合并）。
 */
export const CONFLICT_SEVERITY_LABELS: Record<ConflictSeverity, string> = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};

export const CONFLICT_SEVERITY_VARIANT: Record<ConflictSeverity, BadgeVariant> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

/** 校对问题类别（界面只说人话，不暴露英文枚举） */
export const PROOFREAD_TYPE_LABELS: Record<ProofreadIssueType, string> = {
  typo: '错别字',
  punctuation: '标点',
  grammar: '病句',
  name: '称呼不一致',
  setting: '与设定冲突',
  repeat: '重复表达',
};

/** 未知取值兜底：后端新增类别时不崩、不显示原始英文 */
export function proofreadTypeLabel(value: string): string {
  return PROOFREAD_TYPE_LABELS[value as ProofreadIssueType] ?? '其他问题';
}

export function conflictSeverityLabel(value: string): string {
  return CONFLICT_SEVERITY_LABELS[value as ConflictSeverity] ?? '待确认';
}

export function conflictSeverityVariant(value: string): BadgeVariant {
  return CONFLICT_SEVERITY_VARIANT[value as ConflictSeverity] ?? 'neutral';
}
