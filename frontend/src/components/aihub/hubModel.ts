/**
 * AI 对话工作台 —— 纯数据/映射层（无 React、无网络）。
 *
 * 职责：
 *   ① 校验并归一服务端返回的草稿（`parseAiChatDraft`）—— **一个校验器**同时服务
 *      "刚收到的响应"和"从 localStorage 读回的存档"，因此存档里的脏数据天然被剔除。
 *   ② 定义会话/消息形状与动作（能力入口）清单。
 *
 * 红线：本层不做任何写库动作。"确认写入"由组件调用既有 create 端点完成。
 */

import type {
  AiChatContextUsed,
  AiChatDraft,
  AiChatDraftCharacter,
  AiChatDraftOutlineNode,
  AiChatDraftWorldEntry,
  ChatRole,
} from '@/types/api';
import type { HubReading } from './hubReading';

const ROLES = ['protagonist', 'supporting', 'antagonist', 'minor'] as const;
const CATEGORIES = ['force', 'place', 'rule', 'item', 'other'] as const;
const LEVELS = ['total', 'volume', 'chapter'] as const;

/** 归一后的草稿：渲染层只认这个形状，不必再猜 `payload` 里有什么。 */
export type HubDraft =
  | { kind: 'characters'; characters: AiChatDraftCharacter[] }
  | { kind: 'world_entries'; entries: AiChatDraftWorldEntry[] }
  | { kind: 'outline_nodes'; nodes: AiChatDraftOutlineNode[] }
  | { kind: 'prose'; text: string };

/** 一条消息。`draft` 存**服务端原样**的草稿，展示前过 `parseAiChatDraft`。 */
export interface HubMessage {
  role: ChatRole;
  content: string;
  draft?: AiChatDraft | null;
  contextUsed?: AiChatContextUsed | null;
  /** 只读能力的报告（校对/审校/敏感词）。**没有草稿、没有确认按钮**。 */
  reading?: HubReading | null;
  /** 草稿处理结果；未处理时不带该字段 */
  draftState?: 'applied' | 'discarded';
  at: number;
}

export interface HubSession {
  id: string;
  title: string;
  messages: HubMessage[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 动作的**执行方式**：
 *   · `chat`      —— 走对话端点，可能带回草稿（要用户确认才落库）；
 *   · `proofread` / `consistency` / `sensitive` —— 只读能力，结果直接渲染，**没有落库路径**。
 */
export type HubActionMode = 'chat' | 'proofread' | 'consistency' | 'sensitive';

/**
 * 一条动作（能力入口）。
 * `intent` 只在 `mode === 'chat'` 时发给后端；`needsChapter` 的动作用户须先选章节；
 * `needsModel` 为 false 的动作（敏感词自查是纯本地词库匹配）**未配模型也必须能用**。
 */
export interface HubAction {
  key: string;
  label: string;
  mode: HubActionMode;
  intent: string;
  needsChapter: boolean;
  needsModel: boolean;
  hint: string;
}

export const HUB_ACTIONS: HubAction[] = [
  { key: 'auto', label: '自动', mode: 'chat', intent: 'auto', needsChapter: false, needsModel: true, hint: '让他自己判断该做什么' },
  { key: 'characters', label: '建人物', mode: 'chat', intent: 'characters', needsChapter: false, needsModel: true, hint: '整理成人物卡' },
  { key: 'world', label: '世界观', mode: 'chat', intent: 'world_entries', needsChapter: false, needsModel: true, hint: '地点、势力、规则、道具' },
  { key: 'outline', label: '大纲', mode: 'chat', intent: 'outline_nodes', needsChapter: false, needsModel: true, hint: '往后的情节怎么走' },
  { key: 'continue', label: '写正文', mode: 'chat', intent: 'continue', needsChapter: true, needsModel: true, hint: '接着某章往下写一段' },
  { key: 'proofread', label: '校对', mode: 'proofread', intent: '', needsChapter: true, needsModel: true, hint: '挑出这一章的错别字、病句、前后矛盾' },
  { key: 'consistency', label: '审校', mode: 'consistency', intent: '', needsChapter: false, needsModel: true, hint: '通读全书，找前后对不上的地方' },
  { key: 'sensitive', label: '敏感词', mode: 'sensitive', intent: '', needsChapter: false, needsModel: false, hint: '按本地词库扫全书（不联网、不花模型额度）' },
];

/** 只读动作（不产出草稿、不落库）——渲染层据此走报告卡片而不是草稿卡 */
export function isReadOnlyAction(action: HubAction): boolean {
  return action.mode !== 'chat';
}

export function actionOf(key: string): HubAction {
  return HUB_ACTIONS.find((a) => a.key === key) ?? HUB_ACTIONS[0];
}

/** 选好作品后，会话里的第一句话（AI 说的）。**本地预置，不发请求**。 */
export const HUB_WELCOME =
  '我是你的写作搭子。这本书的设定、人物、伏笔和大纲我都记着，你直接说要干什么就行——' +
  '想加个人、排排后面的情节、接着往下写一段都可以；也能让我校对某一章、通读全书挑前后矛盾，' +
  '或者用本地词库扫一遍敏感词。这三样只出报告，不会动你的稿子。';

export function newSessionId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 用第一句用户消息给会话起个名（会话一多，光看时间找不到） */
export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '新对话';
  return clean.length > 14 ? `${clean.slice(0, 14)}…` : clean;
}

export function newSession(title = '新对话'): HubSession {
  const now = Date.now();
  return { id: newSessionId(), title, messages: [], createdAt: now, updatedAt: now };
}

/** 草稿的展示标题（草稿卡片顶部 + 会话摘要都用它） */
export function draftLabel(draft: HubDraft): string {
  switch (draft.kind) {
    case 'characters':
      return `人物卡 · ${draft.characters.length} 个人物`;
    case 'world_entries':
      return `世界设定 · ${draft.entries.length} 条`;
    case 'outline_nodes':
      return `剧情安排 · ${draft.nodes.length} 条`;
    case 'prose':
      return '正文片段';
  }
}

/* ============================================================
   草稿校验（唯一校验器：响应与存档共用）
   ============================================================ */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** 可选文本：空串 / 非字符串一律归 null（不保留半截假值） */
function optText(v: unknown): string | null {
  return asText(v);
}

function oneOf<T extends string>(v: unknown, pool: readonly T[]): T | null {
  const text = typeof v === 'string' ? v.trim() : '';
  return (pool as readonly string[]).includes(text) ? (text as T) : null;
}

function parseCharacters(payload: Record<string, unknown>): AiChatDraftCharacter[] {
  const raw = payload.characters;
  if (!Array.isArray(raw)) return [];
  const out: AiChatDraftCharacter[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const name = asText(row?.name);
    if (!row || !name) continue;
    out.push({
      name,
      role: oneOf(row.role, ROLES) ?? 'supporting',
      surface_identity: optText(row.surface_identity),
      secret_desire: optText(row.secret_desire),
      fatal_weakness: optText(row.fatal_weakness),
      contradiction: optText(row.contradiction),
      appearance: optText(row.appearance),
      background: optText(row.background),
    });
  }
  return out;
}

function parseWorldEntries(payload: Record<string, unknown>): AiChatDraftWorldEntry[] {
  const raw = payload.entries;
  if (!Array.isArray(raw)) return [];
  const out: AiChatDraftWorldEntry[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const name = asText(row?.name);
    if (!row || !name) continue;
    out.push({
      category: oneOf(row.category, CATEGORIES) ?? 'other',
      name,
      content: optText(row.content),
    });
  }
  return out;
}

function parseOutlineNodes(payload: Record<string, unknown>): AiChatDraftOutlineNode[] {
  const raw = payload.nodes;
  if (!Array.isArray(raw)) return [];
  const out: AiChatDraftOutlineNode[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const title = asText(row.title);
    const content = asText(row.content);
    if (!title && !content) continue;
    out.push({
      level: oneOf(row.level, LEVELS) ?? 'chapter',
      title: title ?? '未命名',
      content: content ?? '',
    });
  }
  return out;
}

/**
 * 把服务端草稿（或存档里的旧草稿）归一为可渲染形状。
 * 入参故意收 `unknown`：同一个校验器同时服务"刚收到的响应"和"localStorage 里的旧数据"，
 * 后者天然是 `unknown`。
 * 形状不对 / 空壳 / 认不出的 `kind` → 返回 null（**不摆半张卡片**给用户点"确认写入"）。
 */
export function parseAiChatDraft(draft: unknown): HubDraft | null {
  const row = asRecord(draft);
  if (!row) return null;
  const payload = asRecord(row.payload);
  if (!payload) return null;
  switch (row.kind) {
    case 'characters': {
      const characters = parseCharacters(payload);
      return characters.length ? { kind: 'characters', characters } : null;
    }
    case 'world_entries': {
      const entries = parseWorldEntries(payload);
      return entries.length ? { kind: 'world_entries', entries } : null;
    }
    case 'outline_nodes': {
      const nodes = parseOutlineNodes(payload);
      return nodes.length ? { kind: 'outline_nodes', nodes } : null;
    }
    case 'prose': {
      const text = asText(payload.text);
      return text ? { kind: 'prose', text } : null;
    }
    default:
      return null;
  }
}

/** 存档校验用：这条消息形状是否可用（脏数据逐条剔除） */
export function isHubMessage(v: unknown): v is HubMessage {
  const row = asRecord(v);
  if (!row) return false;
  if (row.role !== 'user' && row.role !== 'assistant') return false;
  return typeof row.content === 'string';
}

export { asRecord, asText };
