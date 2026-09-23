/**
 * 类型化 API client（唯一网络出入口）
 * -----------------------------------------------------------------------------
 * 依据 `docs/spec-M1规格契约.md` §5 + `03-技术方案.md` §3。
 * 业务组件禁止直连 fetch —— 统一走本文件（Spec §9.3 组件纪律）。
 * 底层请求 / 错误对象在 `./request`，此处按 Spec §5 分组封装全部端点。
 *
 * [注意] `GET /api/chapters/{id}/recall` 有写副作用（写 recall_log），调用方必须
 *        使用 staleTime:0 + enabled 由章号驱动，一次进章仅触发一次（Spec §11 坑 7）。
 */

import { slugSegment } from '@/lib/slug';
import { downloadFile, request } from './request';
import { aiHubApi } from './aiHubApi';
import { writingApi } from './writingApi';
import type {
  AffectedChapter,
  AiFlavorResult,
  Book,
  BookBrief,
  BookStats,
  Chapter,
  ChapterBrief,
  ChapterVersion,
  Character,
  CharacterStatePoint,
  CharacterWriteRequest,
  ConfirmWritebackRequest,
  ConfirmWritebackResponse,
  CreateBookRequest,
  CreateChapterRequest,
  CreateVersionRequest,
  DiscoverModelsRequest,
  DiscoverModelsResponse,
  Foreshadow,
  ForeshadowListQuery,
  ForeshadowWriteRequest,
  OutlineExpandRequest,
  OutlineExpandResponse,
  OutlineNode,
  OutlineWriteRequest,
  PlotArc,
  Provider,
  ProviderTestResponse,
  ProviderUpdateRequest,
  ProviderUsageResponse,
  ProviderWriteRequest,
  RecallLog,
  RecallResponse,
  SaveChapterResponse,
  SearchHit,
  SensitiveAuditResult,
  SystemCapabilities,
  TestDraftRequest,
  TestDraftResponse,
  TopicAdviceRequest,
  TopicAdviceResponse,
  TopicGenresResponse,
  UpdateBookRequest,
  UpdateChapterRequest,
  WordlistStatus,
  WorldEntry,
  WorldEntryWriteRequest,
  WritebackSuggestion,
} from '@/types/api';

export { ApiError, isApiError, userMessageOf } from './request';

/* ============================================================
   端点封装（按 Spec §5 分组）
   ============================================================ */

export const api = {
  // 正文辅助 AI + 一致性审校（M2-batch2）：在 `./writingApi` 里分组维护，
  // 展开进同一个 `api` 对象 —— 调用方仍写 `api.plotDirections(...)`，且主 client 不超行数门禁。
  ...writingApi,

  // AI 对话工作台（M2-batch3）：同上，分组在 `./aiHubApi`（`api.aiChat(...)`）。
  ...aiHubApi,

  /* --- 5.1 books（R15） --- */
  /** 列表返回契约 `BookBrief`（6 字段，故意不含 target_words/premise/writing_mode） */
  listBooks: () => request<BookBrief[]>('/books'),
  createBook: (payload: CreateBookRequest) =>
    request<Book>('/books', { method: 'POST', body: payload }),
  getBook: (book: string) => request<Book>(`/books/${slugSegment(book)}`),
  updateBook: (book: string, payload: UpdateBookRequest) =>
    request<Book>(`/books/${slugSegment(book)}`, { method: 'PATCH', body: payload }),
  /** 契约 204 无响应体 */
  deleteBook: (book: string) =>
    request<void>(`/books/${slugSegment(book)}`, { method: 'DELETE' }),

  /* --- 5.2 settings（R1） --- */
  listCharacters: (book: string) =>
    request<Character[]>(`/books/${slugSegment(book)}/characters`),
  createCharacter: (book: string, payload: CharacterWriteRequest) =>
    request<Character>(`/books/${slugSegment(book)}/characters`, {
      method: 'POST',
      body: payload,
    }),
  updateCharacter: (id: number, payload: Partial<CharacterWriteRequest>) =>
    request<Character>(`/characters/${id}`, { method: 'PATCH', body: payload }),
  deleteCharacter: (id: number) => request<void>(`/characters/${id}`, { method: 'DELETE' }),
  /** 契约响应为**裸数组**（非 `{character_id, chapter_seqs}` 包装） */
  getAffectedChapters: (id: number) =>
    request<AffectedChapter[]>(`/characters/${id}/affected-chapters`),

  listWorldEntries: (book: string) =>
    request<WorldEntry[]>(`/books/${slugSegment(book)}/world-entries`),
  createWorldEntry: (book: string, payload: WorldEntryWriteRequest) =>
    request<WorldEntry>(`/books/${slugSegment(book)}/world-entries`, {
      method: 'POST',
      body: payload,
    }),
  updateWorldEntry: (id: number, payload: Partial<WorldEntryWriteRequest>) =>
    request<WorldEntry>(`/world-entries/${id}`, { method: 'PATCH', body: payload }),
  deleteWorldEntry: (id: number) => request<void>(`/world-entries/${id}`, { method: 'DELETE' }),

  listForeshadows: (book: string, q?: ForeshadowListQuery) =>
    request<Foreshadow[]>(`/books/${slugSegment(book)}/foreshadows`, {
      query: { status: q?.status, importance: q?.importance },
    }),
  createForeshadow: (book: string, payload: ForeshadowWriteRequest) =>
    request<Foreshadow>(`/books/${slugSegment(book)}/foreshadows`, {
      method: 'POST',
      body: payload,
    }),
  updateForeshadow: (id: number, payload: Partial<ForeshadowWriteRequest>) =>
    request<Foreshadow>(`/foreshadows/${id}`, { method: 'PATCH', body: payload }),

  /** 契约响应为**裸数组** `SearchHit[]`（非 `{query, results}` 包装） */
  searchBook: (book: string, q: string) =>
    request<SearchHit[]>(`/books/${slugSegment(book)}/search`, { query: { q } }),

  /* --- 5.3 outlines（R7） --- */
  listOutlines: (book: string, level?: string) =>
    request<OutlineNode[]>(`/books/${slugSegment(book)}/outlines`, { query: { level } }),
  createOutline: (book: string, payload: OutlineWriteRequest) =>
    request<OutlineNode>(`/books/${slugSegment(book)}/outlines`, {
      method: 'POST',
      body: payload,
    }),
  updateOutline: (id: number, payload: Partial<OutlineWriteRequest>) =>
    request<OutlineNode>(`/outlines/${id}`, { method: 'PATCH', body: payload }),
  deleteOutline: (id: number) => request<void>(`/outlines/${id}`, { method: 'DELETE' }),
  /** 契约 `required: [expand_level]` —— 必须带 body；AI 只回候选，不落库 */
  expandOutline: (id: number, payload: OutlineExpandRequest) =>
    request<OutlineExpandResponse>(`/outlines/${id}/expand`, {
      method: 'POST',
      body: payload,
      timeoutMs: 60000,
    }),

  /* --- 5.4 chapters（R2 / R11） --- */
  listChapters: (book: string) =>
    request<ChapterBrief[]>(`/books/${slugSegment(book)}/chapters`),
  createChapter: (book: string, payload: CreateChapterRequest) =>
    request<Chapter>(`/books/${slugSegment(book)}/chapters`, {
      method: 'POST',
      body: payload,
    }),
  getChapter: (id: number) => request<Chapter>(`/chapters/${id}`),
  /** 契约响应**仅 3 字段** `{id, word_count, updated_at}`，非 Chapter → 调用方勿整体写缓存 */
  updateChapter: (id: number, payload: UpdateChapterRequest) =>
    request<SaveChapterResponse>(`/chapters/${id}`, { method: 'PATCH', body: payload }),
  deleteChapter: (id: number) => request<void>(`/chapters/${id}`, { method: 'DELETE' }),

  listVersions: (id: number) => request<ChapterVersion[]>(`/chapters/${id}/versions`),
  createVersion: (id: number, payload: CreateVersionRequest) =>
    request<ChapterVersion>(`/chapters/${id}/versions`, { method: 'POST', body: payload }),
  restoreVersion: (id: number, vid: number) =>
    request<Chapter>(`/chapters/${id}/versions/${vid}/restore`, { method: 'POST' }),

  /* --- 5.5 memory（R3 / R4） --- */
  /** [注意] 有写副作用（recall_log）——调用方须 staleTime:0 + 单次触发 */
  recall: (chapterId: number, signal?: AbortSignal) =>
    request<RecallResponse>(`/chapters/${chapterId}/recall`, { timeoutMs: 30000, signal }),
  finalize: (chapterId: number) =>
    request<WritebackSuggestion>(`/chapters/${chapterId}/finalize`, {
      method: 'POST',
      timeoutMs: 120000,
    }),
  confirmWriteback: (chapterId: number, payload: ConfirmWritebackRequest) =>
    request<ConfirmWritebackResponse>(`/chapters/${chapterId}/finalize/confirm`, {
      method: 'POST',
      body: payload,
      timeoutMs: 60000,
    }),
  getCharacterStates: (book: string, uptoSeq: number) =>
    request<CharacterStatePoint[]>(`/books/${slugSegment(book)}/memory/character-states`, {
      query: { upto_seq: uptoSeq },
    }),
  getPlotArcs: (book: string) =>
    request<PlotArc[]>(`/books/${slugSegment(book)}/memory/plot-arcs`),
  listRecallLogs: (book: string) =>
    request<RecallLog[]>(`/books/${slugSegment(book)}/recall-logs`),

  /* --- 5.6 providers（R5） --- */
  listProviders: () => request<Provider[]>('/providers'),
  createProvider: (payload: ProviderWriteRequest) =>
    request<Provider>('/providers', { method: 'POST', body: payload }),
  updateProvider: (id: number, payload: ProviderUpdateRequest) =>
    request<Provider>(`/providers/${id}`, { method: 'PATCH', body: payload }),
  deleteProvider: (id: number) => request<void>(`/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: number) =>
    request<ProviderTestResponse>(`/providers/${id}/test`, { method: 'POST', timeoutMs: 30000 }),
  getProviderUsage: (id: number) => request<ProviderUsageResponse>(`/providers/${id}/usage`),
  /**
   * 拉取平台可用模型（**不落库**）。`api_key` 可省略 —— 编辑已有 provider 时留空，
   * 后端自动取密钥环里的 key。列表接口可能较慢（15-20s），故放宽超时。
   */
  discoverModels: (payload: DiscoverModelsRequest) =>
    request<DiscoverModelsResponse>('/providers/discover-models', {
      method: 'POST',
      body: payload,
      timeoutMs: 60000,
    }),
  /** **保存前**用当前表单值测连通（不落库、不产生 provider 记录） */
  testDraft: (payload: TestDraftRequest) =>
    request<TestDraftResponse>('/providers/test-draft', {
      method: 'POST',
      body: payload,
      timeoutMs: 60000,
    }),

  /* --- 5.7 export / stats / search --- */
  getStats: (book: string) => request<BookStats>(`/books/${slugSegment(book)}/stats`),
  exportBook: (book: string, format: 'txt' | 'docx', range?: string) =>
    downloadFile(`/books/${slugSegment(book)}/export`, { format, range }),

  /* --- 5.8 system（能力探测，Spec §12） --- */
  /** 只读无副作用；M1 无 `?refresh`，返回值恒为启动自检缓存 */
  getCapabilities: () => request<SystemCapabilities>('/system/capabilities'),

  /* --- 5.9 topics（选题向导，M1 增项） --- */
  /**
   * 题材库（真实热度 / 竞争度 / 蓝海评分）。只读、可缓存。
   * **同步端点**：team-lead 已将原 `advice/stream`（SSE）改判为同步。
   */
  listTopicGenres: () => request<TopicGenresResponse>('/topics/genres'),
  /**
   * 四问 + 三数据 → 蓝海细分方向推荐。**不落库、无副作用**。
   * 真后端实测单次 ~48s（要读题材库全文再让模型推理），超时放到 120s。
   */
  getTopicAdvice: (payload: TopicAdviceRequest) =>
    request<TopicAdviceResponse>('/topics/advice', {
      method: 'POST',
      body: payload,
      timeoutMs: 120000,
    }),

  /* --- 5.10 ai（AI 对话式建设定，M1 增项） --- */
  /* --- 5.11 audit（质检：去 AI 味 / 敏感词 / 词库状态，M1 增项） --- */
  /**
   * 去 AI 味（**单章**）。先跑本地规则（套话 / 情感标签 / 形容词密度），
   * 再对命中片段给 AI 改写建议。
   * **红线 3**：不配模型时也必须 200（本地规则部分），故调用方不得以「未配模型」禁用入口；
   * 命中片段多时逐条要建议会较慢，超时放宽到 60s。
   */
  auditAiFlavor: (chapterId: number) =>
    request<AiFlavorResult>(`/chapters/${chapterId}/audit/ai-flavor`, {
      method: 'POST',
      timeoutMs: 60000,
    }),
  /**
   * 敏感词自查（**整本书**）：纯本地词库匹配，不调用 AI、不联网。
   * 全书扫描，超时放宽到 60s。
   */
  auditSensitive: (book: string) =>
    request<SensitiveAuditResult>(`/books/${slugSegment(book)}/audit/sensitive`, {
      method: 'POST',
      timeoutMs: 60000,
    }),
  /** 词库状态（设置页展示：未配置 / 已配置 N 条）。只读、无副作用 */
  getWordlistStatus: () => request<WordlistStatus>('/audit/wordlist-status'),
};
