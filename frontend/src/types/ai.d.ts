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

import type { CharacterRole, CharacterStatus, WorldEntryCategory } from './common';

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
