/**
 * AI 对话工作台的会话留存（按作品分键，纯前端本地）。
 *
 * 用户的原话是：「有上下文，有记忆，有对话，**退出再进来还有记忆，可以继续做**」。
 * 取舍（OD-07 已拍板）：只做前端本地留存 —— 不建后端会话表、不改库结构。
 * 代价：换电脑 / 清浏览器缓存会丢。真需要跨设备同步时再升级成后端会话表。
 *
 * 已知局限：多标签页同开一本书时后写覆盖先写，影响仅限本地对话草稿
 * （库里的人物/设定/大纲数据不受影响）。修它需 BroadcastChannel + 合并，本轮未做。
 */

import type { AiChatContextUsed, AiChatDraft } from '@/types/api';
import { makeArchive } from '@/lib/localArchive';
import { asRecord, asText, isHubMessage, parseAiChatDraft, parseWebSources } from './hubModel';
import { parseHubReading } from './hubReading';
import type { HubMessage, HubSession } from './hubModel';

/** 载荷版本：结构变更时 +1，旧存档自动失效 */
const PAYLOAD_VERSION = 1;
const PREFIX = 'ainovel.aihub.';

/** 单本书最多保留的会话数与单会话消息数（防止长聊把 localStorage 撑爆） */
const MAX_SESSIONS = 20;
const MAX_MESSAGES = 120;

export interface HubArchive {
  sessions: HubSession[];
  activeId: string | null;
}

function parseContextUsed(v: unknown): AiChatContextUsed | null {
  const row = asRecord(v);
  if (!row) return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    characters: num(row.characters),
    foreshadows: num(row.foreshadows),
    outlines: num(row.outlines),
    has_prev_summary: row.has_prev_summary === true,
    injected_chars: num(row.injected_chars),
  };
}

/** 单条消息：形状不对整条丢弃；草稿归一失败则只丢草稿（保留那句话） */
function parseStoredMessage(v: unknown): HubMessage | null {
  if (!isHubMessage(v)) return null;
  const row = asRecord(v);
  if (!row) return null;
  const rawDraft = row.draft;
  const draftState =
    row.draftState === 'applied' || row.draftState === 'discarded' ? row.draftState : undefined;
  return {
    role: row.role === 'user' ? 'user' : 'assistant',
    content: typeof row.content === 'string' ? row.content : '',
    // 过一遍校验器才留下：形状不对就当没有草稿（否则会渲染出一张空卡片）
    draft: parseAiChatDraft(rawDraft) ? (rawDraft as AiChatDraft) : null,
    contextUsed: parseContextUsed(row.contextUsed),
    webSources: parseWebSources(row.webSources),
    // 只读报告同理：形状不对就整块丢掉（列表还会被截到上限，见 hubReading）
    reading: parseHubReading(row.reading),
    draftState,
    at: typeof row.at === 'number' && Number.isFinite(row.at) ? row.at : Date.now(),
  };
}

function parseStoredSession(v: unknown): HubSession | null {
  const row = asRecord(v);
  if (!row) return null;
  const id = asText(row.id);
  if (!id) return null;
  const messages = Array.isArray(row.messages)
    ? (row.messages.map(parseStoredMessage).filter(Boolean) as HubMessage[]).slice(-MAX_MESSAGES)
    : [];
  const createdAt = typeof row.createdAt === 'number' ? row.createdAt : Date.now();
  return {
    id,
    title: asText(row.title) ?? '新对话',
    messages,
    createdAt,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : createdAt,
  };
}

const archive = makeArchive<HubArchive>(PREFIX, PAYLOAD_VERSION, (payload) => {
  const list = Array.isArray(payload.sessions) ? payload.sessions : [];
  const sessions = list
    .map(parseStoredSession)
    .filter(Boolean)
    .slice(-MAX_SESSIONS) as HubSession[];
  if (sessions.length === 0) return null;
  const wanted = asText(payload.activeId);
  const matched = sessions.find((s) => s.id === wanted);
  return { sessions, activeId: matched ? matched.id : sessions[sessions.length - 1].id };
});

/** 读存档。无存档 / 不可用 / 损坏 → null（调用方回落到新建会话）。 */
export function loadHubArchive(slug: string): HubArchive | null {
  return archive.read(slug);
}

/** 写存档。写空表等于删键：会话全删光就不留空壳。 */
export function saveHubArchive(slug: string, data: HubArchive): void {
  if (data.sessions.length === 0) {
    archive.write(slug, null);
    return;
  }
  archive.write(slug, {
    v: PAYLOAD_VERSION,
    activeId: data.activeId,
    sessions: data.sessions.slice(-MAX_SESSIONS).map((s) => ({
      ...s,
      messages: s.messages.slice(-MAX_MESSAGES),
    })),
  });
}

export function clearHubArchive(slug: string): void {
  archive.remove(slug);
}
