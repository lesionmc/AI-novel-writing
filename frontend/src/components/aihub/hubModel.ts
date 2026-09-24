/**
 * AI 对话工作台 —— 会话/消息形状 + 动作（能力入口）清单（无 React、无网络）。
 * 草稿的归一/校验在 `hubDraft.ts`（本文件重导出，调用方 import 路径不变）。
 * 红线：本层不做任何写库动作（"确认写入"见 `useHubDrafts`）。
 */

import type {
  AiChatContextUsed,
  AiChatDraft,
  AiChatWebSource,
  ChatRole,
} from '@/types/api';
import type { HubReading } from './hubReading';
import { asRecord, asText } from './hubDraft';

// 草稿归一层对外重导出：形状、校验器、卡标题（调用方仍从 hubModel 引）
export { parseAiChatDraft, draftLabel, asRecord, asText } from './hubDraft';
export type { HubDraft } from './hubDraft';

/** 一条消息。`draft` 存**服务端原样**的草稿，展示前过 `parseAiChatDraft`。 */
export interface HubMessage {
  role: ChatRole;
  content: string;
  draft?: AiChatDraft | null;
  contextUsed?: AiChatContextUsed | null;
  /** 本轮 AI 实际用到的联网资料（渲染为可点开的来源） */
  webSources?: AiChatWebSource[] | null;
  /** 本轮发起过联网检索但可能 0 命中（如实提示用） */
  webAttempted?: boolean;
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
  /** 需要先关联某本书（书名候选要 PATCH、复盘要读全书）—— 无作品模式不显示 */
  needsBook?: boolean;
  needsModel: boolean;
  hint: string;
}

export const HUB_ACTIONS: HubAction[] = [
  { key: 'auto', label: '自动', mode: 'chat', intent: 'auto', needsChapter: false, needsModel: true, hint: '让他自己判断该做什么' },
  { key: 'guide', label: '带我走一遍', mode: 'chat', intent: 'guide', needsChapter: false, needsModel: true, hint: '零基础友好：一次只问一个小问题，从「想写什么」一路聊到建书开写' },
  { key: 'characters', label: '建人物', mode: 'chat', intent: 'characters', needsChapter: false, needsModel: true, hint: '整理成人物卡' },
  { key: 'world', label: '世界观', mode: 'chat', intent: 'world_entries', needsChapter: false, needsModel: true, hint: '地点、势力、规则、道具' },
  { key: 'outline', label: '大纲', mode: 'chat', intent: 'outline_nodes', needsChapter: false, needsModel: true, hint: '往后的情节怎么走' },
  { key: 'titles', label: '起书名', mode: 'chat', intent: 'title_options', needsChapter: false, needsBook: true, needsModel: true, hint: '一次出十几个书名备选，你挑（定稿权在你）' },
  { key: 'retrospect', label: '复盘', mode: 'chat', intent: 'retrospect', needsChapter: false, needsBook: true, needsModel: true, hint: '把这本书的经验沉淀成下一本可复用的模板' },
  { key: 'continue', label: '写正文', mode: 'chat', intent: 'continue', needsChapter: true, needsModel: true, hint: '接着某章往下写一段' },
  { key: 'expand', label: '扩写', mode: 'chat', intent: 'expand', needsChapter: true, needsModel: true, hint: '把这段写得更丰满' },
  { key: 'plot', label: '情节方向', mode: 'chat', intent: 'plot_directions', needsChapter: true, needsModel: true, hint: '接下来可以往哪几个方向走' },
  { key: 'proofread', label: '校对', mode: 'proofread', intent: '', needsChapter: true, needsModel: true, hint: '挑出这一章的错别字、病句、前后矛盾' },
  { key: 'consistency', label: '审校', mode: 'consistency', intent: '', needsChapter: false, needsModel: true, hint: '通读全书，找前后对不上的地方' },
  { key: 'sensitive', label: '敏感词', mode: 'sensitive', intent: '', needsChapter: false, needsModel: false, hint: '按本地词库扫全书（不联网、不花模型额度）' },
];

export function actionOf(key: string): HubAction {
  return HUB_ACTIONS.find((a) => a.key === key) ?? HUB_ACTIONS[0];
}

/** 选好作品后，会话里的第一句话（AI 说的）。**本地预置，不发请求**；刻意短，不做功能清单。 */
export const HUB_WELCOME =
  '我在。这本书的设定、人物、伏笔和大纲我都记着，你直接说要干什么就行。' +
  '要查书外面的实时资料，把下面的「联网」打开再问。';

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

/** 存档校验用：这条消息形状是否可用（脏数据逐条剔除） */
export function isHubMessage(v: unknown): v is HubMessage {
  const row = asRecord(v);
  if (!row) return false;
  if (row.role !== 'user' && row.role !== 'assistant') return false;
  return typeof row.content === 'string';
}

/** 联网来源归一：URL 必须是 http(s)，否则整条丢弃（防 `javascript:` 之类注入） */
export function parseWebSources(v: unknown): AiChatWebSource[] {
  if (!Array.isArray(v)) return [];
  const out: AiChatWebSource[] = [];
  for (const item of v) {
    const row = asRecord(item);
    const url = asText(row?.url);
    if (!row || !url || !/^https?:\/\//i.test(url)) continue;
    out.push({
      title: asText(row.title) ?? url,
      url,
      snippet: typeof row.snippet === 'string' ? row.snippet.slice(0, 300) : '',
    });
  }
  return out.slice(0, 5);
}
