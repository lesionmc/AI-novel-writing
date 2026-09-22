/**
 * MSW 内存数据层（开发用）。
 * 种子来自 `./data`；对外暴露可变 store 与几个响应/结构辅助函数。
 */

import { HttpResponse } from 'msw';
import type {
  Book,
  BookBrief,
  Chapter,
  ChapterBrief,
  ChapterVersion,
  Character,
  Foreshadow,
  OutlineNode,
  Provider,
  WorldEntry,
} from '@/types/api';
import {
  seedBooks,
  seedChapters,
  seedCharacters,
  seedForeshadows,
  seedOutlines,
  seedPlotArcs,
  seedProviders,
  seedRecall,
  seedWorldEntries,
} from './data';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export { clone, seedPlotArcs, seedRecall };

/**
 * 版本快照的 mock 内部形态：契约 `ChapterVersion` **不含正文**（正文按需单取），
 * 但 mock 需保存正文才能支持「回滚」，故内部多存一个 content，仅在 restore 时使用。
 */
export type MockVersion = ChapterVersion & { content: string };

export const db = {
  books: clone(seedBooks) as Book[],
  chapters: clone(seedChapters) as Chapter[],
  versions: [] as MockVersion[],
  characters: clone(seedCharacters) as Character[],
  worldEntries: clone(seedWorldEntries) as WorldEntry[],
  foreshadows: clone(seedForeshadows) as Foreshadow[],
  outlines: clone(seedOutlines) as OutlineNode[],
  providers: clone(seedProviders) as Provider[],
};

let idSeq = 10_000;
export const nextId = () => (idSeq += 1);

export const ok = (data: unknown) => HttpResponse.json(data as never);
export const fail = (code: string, status = 400) =>
  HttpResponse.json({ error: { code, message: code, detail: null } }, { status });

export const MUTATE_DELAY = 120;

/** 去掉正文相关字段，得到列表项（对应契约 `ChapterBrief`） */
export function briefOf(c: Chapter): ChapterBrief {
  const {
    content: _content,
    chapter_summary: _summary,
    hook: _hook,
    finalized_at: _finalized,
    created_at: _created,
    ...brief
  } = c;
  return brief;
}

/** 由完整 `Book` + 章节统计合成列表项 `BookBrief`（契约里 total_words/chapter_count 只在 Brief） */
export function briefOfBook(b: Book): BookBrief {
  return {
    slug: b.slug,
    title: b.title,
    genre: b.genre,
    total_words: db.chapters.reduce((s, c) => s + (c.word_count || 0), 0),
    chapter_count: db.chapters.length,
    updated_at: b.updated_at,
  };
}

/** 契约大纲为**扁平数组**：按 id 查找节点 */
export function collectOutline(
  nodes: OutlineNode[],
  id: number,
  fn: (n: OutlineNode) => void,
): boolean {
  const n = nodes.find((x) => x.id === id);
  if (!n) return false;
  fn(n);
  return true;
}
