/**
 * API 类型契约（前端）—— 统一入口（barrel）
 * -----------------------------------------------------------------------------
 * **唯一依据：`06-API定义-openapi.yaml` 的 `components.schemas`（28 个命名 schema）。**
 * 字段名 / 类型 / 可选性 / 枚举值逐条以契约为准；本文件是契约的"镜像"，
 * 不再手写"类型假设"。前后端签名不一致 = 前端 `tsc --noEmit` 编译错误。
 *
 * 为遵守「单文件 ≤ 300 行」，按域拆为：
 *   · `common.d.ts` —— 统一错误体 + 全部枚举联合
 *   · `memory.d.ts` —— 召回 / 角色状态 / 剧情线 / 回写建议与确认（产品核心）
 *   · `system.d.ts` —— 模型配置（R5）+ 统计（R17）
 *   · `topics.d.ts` —— 选题向导（四问 + 三数据 → 蓝海细分方向，同步端点）
 *   · `ai.d.ts` —— AI 对话式建设定（AI 只出草稿，确认后由前端逐条入库）
 *   · `audit.d.ts` —— 质检（去 AI 味 / 敏感词 / 词库状态）
 *   · `writing.d.ts` —— 正文辅助 AI（剧情走向 / 校对 / 续写 / 扩写）+ 一致性审校 SSE
 * 业务代码统一 `import type { ... } from '@/types/api'`。统一前缀 /api。
 */

import type {
  ChapterStatus,
  CharacterRole,
  CharacterStatus,
  ForeshadowStatus,
  Importance,
  OutlineLevel,
  SearchSourceType,
  WorldEntryCategory,
  WritingMode,
} from './common';

export * from './common';
export * from './memory';
export * from './system';
export * from './topics';
export * from './ai';
export * from './audit';
export * from './writing';
export * from './relations';

/* ============================ books（R15） ============================ */

/** 契约 `BookBrief`（列表用，6 字段；**故意**不含 target_words/premise/writing_mode） */
export interface BookBrief {
  slug: string;
  title: string;
  genre: string | null;
  total_words: number;
  chapter_count: number;
  updated_at: string;
}

/** 契约 `Book`（详情用，10 字段） */
export interface Book {
  id: number;
  slug: string;
  title: string;
  genre: string | null;
  target_words: number;
  premise: string | null;
  summary: string | null;
  writing_mode: WritingMode;
  created_at: string;
  updated_at: string;
}

export interface CreateBookRequest {
  title: string;
  genre?: string | null;
  target_words?: number;
  premise?: string | null;
}

export interface UpdateBookRequest {
  title?: string;
  genre?: string | null;
  target_words?: number;
  premise?: string | null;
  summary?: string | null;
  writing_mode?: WritingMode;
}

/* ============================ settings（R1） ============================ */

/** 契约 `Character` = CharacterInput + {id, created_at, updated_at} */
export interface Character {
  id: number;
  name: string;
  alias: string | null;
  role: CharacterRole;
  surface_identity: string | null;
  secret_desire: string | null;
  fatal_weakness: string | null;
  contradiction: string | null;
  appearance: string | null;
  background: string | null;
  first_chapter_seq: number | null;
  status: CharacterStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/** 写入载荷（契约 `CharacterInput`，`required: [name]`） */
export interface CharacterWriteRequest {
  name: string;
  alias?: string | null;
  role?: CharacterRole;
  surface_identity?: string | null;
  secret_desire?: string | null;
  fatal_weakness?: string | null;
  contradiction?: string | null;
  appearance?: string | null;
  background?: string | null;
  first_chapter_seq?: number | null;
  status?: CharacterStatus;
  tags?: string[];
}

/** 契约 `affected-chapters` 响应为**裸数组**（无 `{character_id, chapter_seqs}` 包装） */
export interface AffectedChapter {
  chapter_seq: number;
  chapter_title: string | null;
  /** 命中位置：content / chapter_summary */
  matched_in: string;
}

/** 契约 `WorldEntry` = WorldEntryInput + {id, created_at, updated_at} */
export interface WorldEntry {
  id: number;
  category: WorldEntryCategory;
  name: string;
  content: string | null;
  parent_id: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface WorldEntryWriteRequest {
  category: WorldEntryCategory;
  name: string;
  content?: string | null;
  parent_id?: number | null;
  tags?: string[];
}

/** 契约 `Foreshadow` = ForeshadowInput + {id, created_at, updated_at} */
export interface Foreshadow {
  id: number;
  title: string;
  planted_chapter_seq: number | null;
  planned_payoff_seq: number | null;
  actual_payoff_seq: number | null;
  status: ForeshadowStatus;
  importance: Importance;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForeshadowWriteRequest {
  title: string;
  planted_chapter_seq?: number | null;
  planned_payoff_seq?: number | null;
  actual_payoff_seq?: number | null;
  status?: ForeshadowStatus;
  importance?: Importance;
  note?: string | null;
}

export interface ForeshadowListQuery {
  status?: ForeshadowStatus;
  importance?: Importance;
}

/** 契约 `SearchHit`（`/search` 响应为**裸数组**，无 `{query, results}` 包装） */
export interface SearchHit {
  source_type: SearchSourceType;
  source_id: number;
  chapter_seq: number | null;
  title: string;
  snippet: string;
}

/* ============================ outlines（R7） ============================ */

/** 契约 `Outline` = OutlineInput + {id, created_at, updated_at}。**扁平结构，无 `children`** */
export interface OutlineNode {
  id: number;
  level: OutlineLevel;
  parent_id: number | null;
  seq: number;
  title: string | null;
  content: string | null;
  /** level=chapter 时关联实际章节（未开写则为 null） */
  chapter_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface OutlineWriteRequest {
  level: OutlineLevel;
  parent_id?: number | null;
  seq?: number;
  title?: string | null;
  content?: string | null;
  chapter_id?: number | null;
}

/** 契约 `OutlineCandidate` */
export interface OutlineCandidate {
  level: 'volume' | 'chapter';
  title: string;
  content: string;
  seq: number;
  /** 生成理由，供用户判断是否采纳 */
  rationale: string;
}

/** 契约 `OutlineExpandRequest`（`required: [expand_level]`） */
export interface OutlineExpandRequest {
  expand_level: 'volume' | 'chapter';
  count?: number;
  context?: {
    include_book_premise?: boolean;
    include_open_foreshadows?: boolean;
    extra_notes?: string;
  };
}

/** 契约 `OutlineExpandResponse`（**不落库**，候选需用户采纳后再逐条写入） */
export interface OutlineExpandResponse {
  parent_id: number;
  expand_level: 'volume' | 'chapter';
  candidates: OutlineCandidate[];
  raw_ai_output: string | null;
}

/* ============================ chapters（R2 / R11） ============================ */

/** 契约 `ChapterBrief`（列表用，不含正文；6 字段） */
export interface ChapterBrief {
  id: number;
  seq: number;
  title: string | null;
  word_count: number;
  status: ChapterStatus;
  updated_at: string;
}

/** 契约 `Chapter` = ChapterBrief + 正文相关 5 字段 */
export interface Chapter extends ChapterBrief {
  content: string;
  chapter_summary: string | null;
  hook: string | null;
  finalized_at: string | null;
  created_at: string;
}

export interface CreateChapterRequest {
  seq?: number;
  title?: string | null;
}

/** 契约 `saveChapter` 请求体（title / content / hook） */
export interface UpdateChapterRequest {
  title?: string | null;
  /** TipTap HTML */
  content?: string;
  hook?: string | null;
}

/** 契约 `PATCH /api/chapters/{id}` 响应：**仅 3 字段的部分结果**，非 Chapter */
export interface SaveChapterResponse {
  id: number;
  word_count: number;
  updated_at: string;
}

/** 契约 `ChapterVersion`（**不含正文**，正文按需单取） */
export interface ChapterVersion {
  id: number;
  chapter_id: number;
  word_count: number;
  note: string | null;
  created_at: string;
}

export interface CreateVersionRequest {
  note?: string | null;
}

/* ============================ 前端专用 ============================ */

/** 写作台左侧树的卷分组（由章节列表 + 大纲卷纲合成，非 API 契约） */
export interface VolumeGroup {
  volumeId: number | null;
  title: string;
  chapters: ChapterBrief[];
}
