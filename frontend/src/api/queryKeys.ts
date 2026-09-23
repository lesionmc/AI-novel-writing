/**
 * TanStack Query key 工厂 —— 集中管理，避免各处拼字符串造成失效不命中。
 */

export const queryKeys = {
  books: () => ['books'] as const,
  book: (slug: string) => ['book', slug] as const,

  characters: (slug: string) => ['characters', slug] as const,
  characterRelations: (slug: string) => ['character-relations', slug] as const,
  worldEntries: (slug: string) => ['world-entries', slug] as const,
  foreshadows: (slug: string, filter?: string) => ['foreshadows', slug, filter ?? 'all'] as const,

  outlines: (slug: string, level?: string) => ['outlines', slug, level ?? 'tree'] as const,

  /** 章节列表（不含正文，TC-13） */
  chapterBriefs: (slug: string) => ['chapters', slug] as const,
  chapter: (id: number) => ['chapter', id] as const,
  versions: (id: number) => ['chapter-versions', id] as const,

  /** [注意] 召回有写副作用：此 key 只用于一次性读取，禁止轮询/预取 */
  recall: (chapterId: number) => ['recall', chapterId] as const,
  characterStates: (slug: string, upto: number) => ['character-states', slug, upto] as const,
  plotArcs: (slug: string) => ['plot-arcs', slug] as const,
  recallLogs: (slug: string) => ['recall-logs', slug] as const,

  providers: () => ['providers'] as const,
  providerUsage: (id: number) => ['provider-usage', id] as const,

  /** 系统能力自检（Spec §12）：会话内 staleTime Infinity，不轮询 */
  capabilities: () => ['system-capabilities'] as const,

  stats: (slug: string) => ['stats', slug] as const,
  affectedChapters: (characterId: number) => ['affected-chapters', characterId] as const,
  search: (slug: string, q: string) => ['search', slug, q] as const,

  /** 题材库（选题向导的选项来源，M1 增项）：只读、可缓存 */
  topicGenres: () => ['topic-genres'] as const,

  /** 敏感词词库状态（质检 / 设置页共享）：只读、低频变化 */
  wordlistStatus: () => ['audit', 'wordlist-status'] as const,
};
