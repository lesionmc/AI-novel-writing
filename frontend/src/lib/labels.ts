/**
 * 枚举 → 中文标签 / 视觉变体 映射
 * 集中一处，避免各页面各自翻译造成口径不一。
 */

import type { BadgeVariant } from '@/types/ui';
import type {
  ChapterStatus,
  CharacterRole,
  CharacterStatus,
  ForeshadowStatus,
  Importance,
  OutlineLevel,
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

export const CHARACTER_STATUS_VARIANT: Record<CharacterStatus, BadgeVariant> = {
  alive: 'success',
  dead: 'neutral',
  missing: 'warning',
  unknown: 'neutral',
};

export const FORESHADOW_STATUS_LABELS: Record<ForeshadowStatus, string> = {
  open: '未回收',
  closed: '已回收',
  abandoned: '已放弃',
};

export const FORESHADOW_STATUS_VARIANT: Record<ForeshadowStatus, BadgeVariant> = {
  open: 'aging',
  closed: 'success',
  abandoned: 'neutral',
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

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  draft: '草稿',
  done: '已完成',
};

export const CHAPTER_STATUS_VARIANT: Record<ChapterStatus, BadgeVariant> = {
  draft: 'neutral',
  done: 'success',
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
  review: '检查前后一致',
  embedding: '记住全文（便于搜索）',
};

export const TASK_ROLE_HINTS: Record<TaskRole, string> = {
  outline: '用来展开大纲、生成章节卡',
  content: '用来写正文、生成回写建议',
  review: '用来检查前后设定有没有打架',
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
  semi: '帮你记住前文、章末自动整理归档建议，但仍需你确认后才入库',
};
