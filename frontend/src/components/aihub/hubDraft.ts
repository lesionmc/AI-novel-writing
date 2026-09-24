/**
 * AI 草稿的归一层（无 React、无网络）：`parseAiChatDraft` 是**唯一校验器**，
 * 同时服务"刚收到的响应"和"localStorage 里的旧存档"——形状不对 / 空壳 /
 * 认不出的 kind 一律归 null，绝不摆半张卡片给用户点「确认写入」。
 * 从 hubModel 拆出（草稿类型膨胀后单文件超 300 行门禁）。
 */
import type {
  AiChatDraftCharacter,
  AiChatDraftOutlineNode,
  AiChatDraftWorldEntry,
} from '@/types/api';

const ROLES = ['protagonist', 'supporting', 'antagonist', 'minor'] as const;
const CATEGORIES = ['force', 'place', 'rule', 'item', 'other'] as const;
const LEVELS = ['total', 'volume', 'chapter'] as const;

/** 归一后的草稿：渲染层只认这个形状，不必再猜 `payload` 里有什么。 */
export type HubDraft =
  | { kind: 'characters'; characters: AiChatDraftCharacter[] }
  | { kind: 'world_entries'; entries: AiChatDraftWorldEntry[] }
  | { kind: 'outline_nodes'; nodes: AiChatDraftOutlineNode[] }
  | { kind: 'prose'; text: string }
  /** 无书对话聊定方向后的建书交接单：确认 = 建书（书名可空，包装步再定） */
  | {
      kind: 'book_plan';
      title: string | null;
      genre: string | null;
      readers: string | null;
      premise: string | null;
      targetWords: number | null;
    }
  /** 书名候选：点一个才 PATCH 成正式书名（AI 出量，人拍板） */
  | { kind: 'title_options'; titles: string[] }
  /** 复盘卡：结构化 markdown，复制带走（跨书复用靠导出/备份） */
  | { kind: 'retrospective'; title: string; content: string };

/** 草稿卡标题（人话 + 数量） */
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
    case 'book_plan':
      return '立项方案 · 建书交接单';
    case 'title_options':
      return `书名候选 · ${draft.titles.length} 个`;
    case 'retrospective':
      return '写作复盘';
  }
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function asText(v: unknown): string | null {
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

/** 把服务端草稿（或存档里的旧草稿）归一为可渲染形状；不可用 → null。 */
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
    case 'book_plan': {
      const genre = asText(payload.genre);
      const premise = asText(payload.premise);
      // 与后端同判据：题材或卖点至少一样，否则不是一张能建书的卡
      if (!genre && !premise) return null;
      const tw = payload.target_words;
      return {
        kind: 'book_plan',
        title: asText(payload.title),
        genre,
        readers: asText(payload.readers),
        premise,
        targetWords: typeof tw === 'number' && tw > 0 && tw <= 10_000_000 ? Math.round(tw) : null,
      };
    }
    case 'title_options': {
      const seen = new Set<string>();
      const raw = payload.titles;
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const t = asText(item);
          if (t) seen.add(t);
        }
      }
      // 少于两个候选没有「备选」的意义，退回纯文字回答
      return seen.size >= 2 ? { kind: 'title_options', titles: [...seen].slice(0, 20) } : null;
    }
    case 'retrospective': {
      const content = asText(payload.content);
      if (!content) return null;
      return { kind: 'retrospective', title: asText(payload.title) ?? '写作复盘', content };
    }
    default:
      return null;
  }
}
