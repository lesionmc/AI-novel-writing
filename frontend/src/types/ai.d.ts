/**
 * API 契约 · AI 对话工作台（唯一的 AI 对话入口）
 * -----------------------------------------------------------------------------
 * 端点 `POST /api/books/{book}/ai/chat`。定位：一个 AI 做完全部 ——
 * 有上下文、有记忆、有对话，还能按需联网查证。
 * （原「对话式建设定」`/api/ai/setup-chat` 已于 2026-09-23 并入本端点并删除。）
 *
 * [关键] 上下文**不在前端拼**：记忆包由服务端 `services/writing_context.py` 组装
 * （与写作 AI 能力同源）；前端只带 `messages`（存 localStorage）与可选的
 * `chapter_id` / `intent` / `use_web`。若前端自己去拉数据再拼一份，
 * 就会造出第二个真源（审计点过名的反模式）。
 *
 * [红线] `draft` 一律是**草稿**：必须用户在界面上点确认才由前端调已有写入端点落库。
 *
 * [关键] 草稿里的 `role` / `category` 一律用**英文枚举**，与契约 common.d.ts 一致：
 *   role:     protagonist | supporting | antagonist | minor
 *   category: force | place | rule | item | other
 * 由 `api.d.ts` 统一再导出。
 */

import type {
  CharacterRole,
  OutlineLevel,
  WorldEntryCategory,
} from './common';

export type ChatRole = 'user' | 'assistant';

/** 草稿类型。`payload` 形状与对应写入端点对齐（`payload` 故意宽类型，渲染前必须校验）。 */
export type AiChatDraftKind = 'characters' | 'world_entries' | 'outline_nodes' | 'prose';

export interface AiChatMessage {
  role: ChatRole;
  content: string;
}

/** `POST /api/books/{book}/ai/chat` 请求体 */
export interface AiChatRequest {
  /** 完整对话历史（含最新一条用户消息） */
  messages: AiChatMessage[];
  /** 在哪一章说话（可选）；给了就把该章上下文也带上 */
  chapter_id?: number | null;
  /** 要干什么（可选）；`auto` / 缺省 = 由 AI 自己判断 */
  intent?: string | null;
  /** 本轮允许联网检索（服务端还会让模型二次判断要不要搜、搜什么） */
  use_web?: boolean;
}

/** 「这次 AI 读了什么」—— 给用户看的，让"有记忆"这件事可见 */
export interface AiChatContextUsed {
  characters: number;
  foreshadows: number;
  outlines: number;
  has_prev_summary: boolean;
  injected_chars: number;
}

/** 一条联网检索结果（渲染为可点开的来源链接） */
export interface AiChatWebSource {
  title: string;
  url: string;
  snippet: string;
}

/** 结构化草稿。`kind` 决定 `payload` 形状；形状不对的草稿由 `parseAiChatDraft` 丢弃。 */
export interface AiChatDraft {
  kind: AiChatDraftKind;
  payload: Record<string, unknown>;
}

/**
 * 草稿·人物卡（`kind: 'characters'` 的 `payload.characters`）。
 * 字段与 `CharacterInput` 对齐，可由前端直接投给 `createCharacter`。
 */
export interface AiChatDraftCharacter {
  name: string;
  role?: CharacterRole;
  surface_identity?: string | null;
  secret_desire?: string | null;
  fatal_weakness?: string | null;
  contradiction?: string | null;
  appearance?: string | null;
  background?: string | null;
}

/** 草稿·世界词条（`kind: 'world_entries'` 的 `payload.entries`） */
export interface AiChatDraftWorldEntry {
  category?: WorldEntryCategory;
  name: string;
  content?: string | null;
}

/** 草稿·大纲节点（`kind: 'outline_nodes'` 的 `payload.nodes`；**不落库**，确认后才建节点） */
export interface AiChatDraftOutlineNode {
  level: OutlineLevel;
  title: string;
  content: string;
}

export interface AiChatResponse {
  reply: string;
  draft?: AiChatDraft | null;
  context_used: AiChatContextUsed;
  /** 本轮实际注入提示词的联网资料；空数组 = 没搜或没搜到 */
  web_sources: AiChatWebSource[];
  /** 本轮确实发起过联网检索（哪怕 0 命中）—— 用于如实提示 */
  web_attempted: boolean;
}
