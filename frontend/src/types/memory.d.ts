/**
 * API 契约 · 记忆（R3 / R4，产品核心）
 * -----------------------------------------------------------------------------
 * **逐字段对齐 `06-API定义-openapi.yaml` 的 `components.schemas`**：
 *   RecallResult / WritebackSuggestion / CharacterStateView / PlotArc / RecallLog。
 * 由 `api.d.ts` 统一再导出。
 */

import type { CharacterRole, CharacterStateSource, Importance, PlotArcType } from './common';

/** `RecallResult.characters[]` */
export interface RecallCharacter {
  character_id: number;
  name: string;
  role: CharacterRole | string;
  current_state: string | null;
  last_seen_seq: number | null;
  relation_notes: string | null;
}

/** `RecallResult.open_foreshadows[]` */
export interface RecallForeshadow {
  id: number;
  title: string;
  planted_seq: number | null;
  importance: Importance;
  /** 距今已 N 章（>20 用老化色高亮） */
  age: number;
}

/** `RecallResult.recalled_chunks[]` */
export interface RecallChunk {
  chunk_id: number;
  chapter_seq: number;
  text: string;
  score: number;
}

/**
 * 召回注入预算。
 * `semantic_available` 为 false 表示语义路不可用（未配模型 / 向量扩展缺失）——
 * 前端据此提示"相关片段"区降级，**不依赖任何 `degraded` 字段**。
 */
export interface RecallBudget {
  injected_chars: number;
  injected_tokens_est: number;
  truncated: boolean;
  semantic_available: boolean;
}

/**
 * 写前召回响应（产品心脏）。
 * [注意] 该接口 **有写副作用**（写 recall_log）→ 前端禁缓存、禁并发重复触发。
 * 契约中**没有** `degraded` / `degraded_reason`；"是否未配模型"由全局
 * `capabilities.llm_configured` 判断（见 useWritingDesk）。
 */
export interface RecallResponse {
  chapter_seq: number;
  characters: RecallCharacter[];
  open_foreshadows: RecallForeshadow[];
  recalled_chunks: RecallChunk[];
  plot_arcs: PlotArc[];
  budget: RecallBudget;
}

/** `GET /books/{book}/memory/summary` */
export interface MemorySummaryResponse {
  summary: string | null;
  updated_at: string | null;
}

/** 契约 `CharacterStateView` */
export interface CharacterStatePoint {
  character_id: number;
  name: string;
  role: string;
  chapter_seq: number;
  state: string;
  source: CharacterStateSource;
}

/** 契约 `PlotArc` */
export interface PlotArc {
  id: number;
  name: string;
  type: PlotArcType | string;
  content: string;
  last_chapter_seq: number | null;
}

/** 契约 `RecallLog`（仅 8 个统计字段，**不暴露** hit_chunk_ids / hit_scores） */
export interface RecallLog {
  id: number;
  chapter_seq: number;
  query_text: string | null;
  structured_hits: number;
  semantic_hits: number;
  injected_chars: number;
  injected_tokens_est: number;
  created_at: string;
}

/* --- 回写建议（契约 `WritebackSuggestion`：finalize 返回 / 用户改 / confirm 落库，三处共用） --- */

/*
 * 关于 `accepted`（重要，别当成普通可选字段）：
 *   它是「是否保留该条」的**权威默认值**，由**后端按重要度给出** ——
 *   新增伏笔 `high`/`medium` 默认 true，**`low` 默认 false**（防止线索台账被灌爆）。
 *   前端**必须用它初始化勾选状态**，不要一律按 true 处理。
 *   声明为可选是因为老版本后端可能不返回该字段；调用方统一用 `?? true` 兜底。
 */

export interface CharacterUpdateSuggestion {
  name: string;
  state: string;
  reason: string | null;
  accepted?: boolean;
}

export interface PlotProgressSuggestion {
  arc: string;
  progress: string;
  accepted?: boolean;
}

export interface NewForeshadowSuggestion {
  title: string;
  importance: Importance;
  accepted?: boolean;
}

/**
 * 章末回写建议（契约 `WritebackSuggestion`）。
 * 注：契约用 `closed_foreshadow_ids: integer[]`（**非** `{id,title}[]`）；
 * UI 若要展示伏笔标题，由前端据 id 自行映射。
 */
export interface WritebackSuggestion {
  chapter_summary: string;
  character_updates: CharacterUpdateSuggestion[];
  plot_progress: PlotProgressSuggestion[];
  new_foreshadows: NewForeshadowSuggestion[];
  closed_foreshadow_ids: number[];
  hook: string | null;
  /** 原始 AI 输出，便于排查解析失败 */
  raw_ai_output: string | null;
}

/** confirm 的请求体 —— 契约即 `WritebackSuggestion`（同一结构） */
export type ConfirmWritebackRequest = WritebackSuggestion;

/** 契约 `confirmChapterWriteback` 响应：落库结果摘要 */
export interface ConfirmWritebackResponse {
  character_states_written: number;
  foreshadows_created: number;
  foreshadows_closed: number;
  chunks_indexed: number;
  /** 后端实测额外返回（契约未列，非破坏性） */
  plot_arcs_updated?: number;
}
