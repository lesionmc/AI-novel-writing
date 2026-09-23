/**
 * API 契约 · 模型配置与服务商（R5）+ 统计（R17）+ 系统能力（§12）
 * -----------------------------------------------------------------------------
 * **逐字段对齐 `06-API定义-openapi.yaml` 的 `components.schemas`**：
 *   LLMProvider / ProviderUsage / BookStats / SystemCapabilities。
 * 由 `api.d.ts` 统一再导出。
 *
 * [关键] 契约中 `is_default` / `enabled` 是 **integer（0/1）**，非 boolean；
 *        前端消费处须 `Boolean()` 转换（见 ProviderCard）。
 */

import type { ProviderName, TaskRole } from './common';

/** 契约 `LLMProvider`（字段取名严格按契约；无 `connected` / `latency_ms` / `created_at`） */
export interface Provider {
  id: number;
  provider: ProviderName;
  model: string;
  base_url: string | null;
  /** 密钥环引用名；**绝不返回密钥明文** */
  key_ref: string | null;
  task_role: TaskRole | null;
  /**
   * 该模型承担的全部角色（**可多个**）—— 角色路由以它为准。
   * 旧字段 `task_role` 仍返回但**不再参与路由**；省略时按空数组处理。
   */
  task_roles?: TaskRole[];
  /** 契约 `type: integer` —— 0/1 */
  is_default: number;
  /** 契约 `type: integer` —— 0/1 */
  enabled: number;
}

/** `POST /api/providers` 请求体（契约 `required: [provider, model, api_key]`） */
export interface ProviderWriteRequest {
  provider: ProviderName;
  model: string;
  api_key: string;
  base_url?: string | null;
  task_role?: TaskRole | null;
  /** 省略时按 `task_role` 挂一个角色；传了就按这个集合挂 */
  task_roles?: TaskRole[];
}

/** `PATCH /api/providers/{id}` 请求体 */
export interface ProviderUpdateRequest {
  model?: string;
  base_url?: string | null;
  task_role?: TaskRole | null;
  /** 传了就**整体替换**角色集合；传 `[]` 即解除全部分配 */
  task_roles?: TaskRole[];
  is_default?: number;
  enabled?: number;
  /** 仅在需要更换密钥时传入 */
  api_key?: string;
}

/** 契约 `POST /api/providers/{id}/test` 响应 */
export interface ProviderTestResponse {
  ok: boolean;
  latency_ms: number | null;
  /** 失败时为可读错误文案（后端已给中文，前端直接展示） */
  error: string | null;
}

/* ---------- 拉取平台模型（不落库）/ 保存前连通测试（不落库） ---------- */

/**
 * `POST /api/providers/discover-models` 请求体。
 * `api_key` 可省略：编辑已有 provider 时留空，后端自动取密钥环里的 key。
 */
export interface DiscoverModelsRequest {
  provider: ProviderName;
  base_url?: string | null;
  api_key?: string;
}

/** 契约响应：`note` 用于「该平台不支持列出模型」等提示，此时 `models` 为空数组 */
export interface DiscoverModelsResponse {
  models: string[];
  count: number;
  note: string | null;
}

/**
 * `POST /api/providers/test-draft` 请求体 —— **保存前**即可测。
 * `api_key` 可省略（同 discover）；不落库、不产生 provider 记录。
 */
export interface TestDraftRequest {
  provider: ProviderName;
  model: string;
  base_url?: string | null;
  api_key?: string;
}

/** 契约响应：与 `ProviderTestResponse` 同形 */
export interface TestDraftResponse {
  ok: boolean;
  latency_ms: number | null;
  error: string | null;
}

/** 契约 `ProviderUsage`（本机估算，非厂商账单） */
export interface ProviderUsageResponse {
  provider_id: number;
  model: string;
  period: { from: string | null; to: string | null };
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  currency: string;
  /** 恒为 true：本机估算 */
  estimated: boolean;
}

/* ==================== system capabilities（Spec §5.8 / §12） ==================== */

/**
 * 契约 `SystemCapabilities`。**只读、无副作用**，取自连接层启动自检（进程内缓存）。
 * `vector_available` / `fts_available` 为**启动快照**（M1 不做运行时重算、无 `?refresh`）；
 * `llm_configured` 反映**当前**配置（模型配置即时生效，非启动快照）。
 */
export interface SystemCapabilities {
  /** 语义召回（向量检索扩展）是否可用 */
  vector_available: boolean;
  /** 全文检索（FTS5）是否可用 */
  fts_available: boolean;
  /** 当前是否已配置至少一个可用 AI 模型 */
  llm_configured: boolean;
}

/* ============================ export / stats（R16 / R17） ============================ */

/** 契约 `BookStats`（**无** `target_words`；`done_chapters` 非 `done_chapter_count`） */
export interface BookStats {
  total_words: number;
  chapter_count: number;
  done_chapters: number;
  daily: { date: string; words_added: number }[];
}

/** 联网搜索配置（`GET/PUT /api/system/web-search`）。两者留空 = 默认直连 DuckDuckGo。 */
export interface WebSearchSettings {
  endpoint: string | null;
  proxy: string | null;
}
