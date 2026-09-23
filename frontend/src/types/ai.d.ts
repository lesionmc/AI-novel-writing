/**
 * API 契约 · AI 对话式建设定（M1 增项：聊几句 → AI 出草稿 → 人工确认后入库）
 * -----------------------------------------------------------------------------
 * 端点 `POST /api/ai/setup-chat`：无状态（每轮带全量 `messages`），**不落库**。
 * 红线：AI **只出草稿**，绝不直接写入设定库 —— 必须经用户确认后，由前端逐条
 *       调用已有的 `POST /books/{book}/characters` 与 `/world-entries`。
 *
 * [关键] 草稿里的 `role` / `category` 一律用**英文枚举**，与契约 common.d.ts 一致：
 *   role:     protagonist | supporting | antagonist | minor
 *   category: force | place | rule | item | other
 * 由 `api.d.ts` 统一再导出。
 */

import type {
  CharacterRole,
  CharacterStatus,
  OutlineLevel,
  WorldEntryCategory,
} from './common';

export type ChatRole = 'user' | 'assistant';

/** 一轮对话消息（角色 + 内容） */
export interface SetupChatMessage {
  role: ChatRole;
  content: string;
}

/** 可选的作品上下文（让 AI 的草稿贴合现有题材 / 卖点） */
export interface BookContext {
  title: string;
  genre?: string | null;
  premise?: string | null;
}

/**
 * 草稿人物卡 —— 字段对齐契约 `CharacterInput`（除 id/时间戳），
 * 但**全部字段可选、仅 `name` 必给**：AI 不一定每项都填，缺项在确认页留空即可。
 */
export interface SetupDraftCharacter {
  name: string;
  alias?: string | null;
  role?: CharacterRole;
  status?: CharacterStatus;
  surface_identity?: string | null;
  secret_desire?: string | null;
  fatal_weakness?: string | null;
  contradiction?: string | null;
  appearance?: string | null;
  background?: string | null;
  tags?: string[];
}

/** 草稿世界词条 —— 字段对齐契约 `WorldEntryInput`，仅 `name` 必给 */
export interface SetupDraftWorldEntry {
  category?: WorldEntryCategory;
  name: string;
  content?: string | null;
  tags?: string[];
}

/** `done:true` 时返回的整份草稿 */
export interface SetupDraft {
  premise: string | null;
  characters: SetupDraftCharacter[];
  world_entries: SetupDraftWorldEntry[];
}

/** `POST /api/ai/setup-chat` 请求体 */
export interface SetupChatRequest {
  messages: SetupChatMessage[];
  book_context?: BookContext;
}

/** `POST /api/ai/setup-chat` 响应：`done:true` 且带 `draft` → 前端切「草稿确认」 */
export interface SetupChatResponse {
  reply: string;
  done: boolean;
  draft?: SetupDraft | null;
}

/* ============================================================================
 * AI 对话工作台（M2-batch3）
 * ----------------------------------------------------------------------------
 * 端点 `POST /api/books/{book}/ai/chat`。定位：一个 AI 做完全部 ——
 * 有上下文、有记忆、有对话，退出再进来还能接着做。
 *
 * [关键] 上下文**不在前端拼**：记忆包由服务端 `services/writing_context.py` 组装
 * （与 5 个写作 AI 能力同源）；前端只带 `messages`（存 localStorage）与可选的
 * `chapter_id` / `intent`。若前端自己去拉 characters/world-entries/foreshadows
 * 再拼一份，就会造出第二个真源（审计点过名的双真源反模式）。
 *
 * [红线] `draft` 一律是**草稿**：必须用户在界面上点确认才由前端调已有写入端点落库。
 * ========================================================================== */

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
}

/** 「这次 AI 读了什么」—— 给用户看的，让"有记忆"这件事可见 */
export interface AiChatContextUsed {
  characters: number;
  foreshadows: number;
  outlines: number;
  has_prev_summary: boolean;
  injected_chars: number;
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
}
