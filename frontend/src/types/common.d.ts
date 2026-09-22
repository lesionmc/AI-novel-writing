/**
 * API 契约 · 公共类型（错误体 + 全部枚举联合）
 * -----------------------------------------------------------------------------
 * **本文件的枚举与 `06-API定义-openapi.yaml` 的 `components.schemas` 逐字对齐**
 * （字段名 / 类型 / 可选性 / 枚举值均以契约为唯一依据）。
 * 被 `api.d.ts` / `memory.d.ts` / `system.d.ts` 共同引用；由 `api.d.ts` 统一再导出，
 * 因此业务代码仍然只需要 `import type { ... } from '@/types/api'`。
 */

/** 后端统一错误响应体（契约 `ErrorResponse`） */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    detail: unknown;
  };
}

export type WritingMode = 'manual' | 'assist' | 'semi';
export type CharacterRole = 'protagonist' | 'supporting' | 'antagonist' | 'minor';
export type CharacterStatus = 'alive' | 'dead' | 'missing' | 'unknown';
export type ForeshadowStatus = 'open' | 'closed' | 'abandoned';
export type Importance = 'high' | 'medium' | 'low';
export type ChapterStatus = 'draft' | 'done';
export type OutlineLevel = 'total' | 'volume' | 'chapter';
export type WorldEntryCategory = 'force' | 'place' | 'rule' | 'item' | 'other';
export type TaskRole = 'outline' | 'content' | 'review' | 'embedding';
/**
 * 服务商标识 —— **自由字符串**，不是枚举。
 *
 * 契约口径（06 LLMProvider.provider = `type: string`；05 建表无 CHECK 约束）：
 * 任何 OpenAI 兼容端点都必须能配上（OpenRouter / 阶跃 / 自建中转等）。
 * 内置的 deepseek/qwen/kimi/claude/ollama 只是**便利默认值**（见 lib/labels.ts 的
 * PROVIDER_LABELS 与 components/config/providers.ts 的 DEFAULT_BASE_URL），**不是白名单**。
 */
export type ProviderName = string;
/** `PlotArc.type` 契约枚举 */
export type PlotArcType = 'main' | 'sub' | 'romance' | 'growth';
/** `SearchHit.source_type` 契约枚举 */
export type SearchSourceType = 'chapter' | 'character' | 'world_entry';
/** `OutlineExpandRequest.expand_level` 契约枚举 */
export type OutlineExpandLevel = 'volume' | 'chapter';
/** `CharacterStateView.source` 契约枚举 */
export type CharacterStateSource = 'ai' | 'manual';
