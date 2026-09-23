/**
 * 开书向导的完成度查询 —— 把**已有**的 5 个读接口组装成一份 `GuideFacts`。
 *
 * 存在意义：让「向导不新增任何接口」这件事落成代码结构 —— 本文件只 import 现成的
 * `hooks/queries`，没有任何新的 `api.*` 调用。将来若真要做后端聚合接口，
 * 只需把这里换成一次请求，向导组件层零改动。
 *
 * 全部 `enabled` 由 slug 决定（`hooks/queries.ts` 内已处理），slug 为空时不发请求。
 */

import { useBook, useChapterBriefs, useCharacters, useForeshadows, useOutlines, useWorldEntries } from '@/hooks/queries';
import type { Book } from '@/types/api';
import { EMPTY_FACTS, stepDone, type GuideFacts, type StepDoneMap } from './onboardingModel';

export interface BookProgress {
  /** 作品详情；加载中 / 取不到时为 undefined */
  book: Book | undefined;
  /** 推断完成度用的事实（各计数在对应查询未回来时为 0） */
  facts: GuideFacts;
  /** 三步完成与否 */
  done: StepDoneMap;
  /** 任一查询仍在首屏加载 */
  loading: boolean;
  /** 作品详情本身读取失败（其余列表失败只表现为计数为 0，不阻断向导） */
  error: unknown;
  /** 重新拉一遍全部（从"去设定库"跳回来时用得上） */
  refetch: () => void;
}

export function useBookProgress(slug: string | undefined): BookProgress {
  const book = useBook(slug);
  const characters = useCharacters(slug);
  const worldEntries = useWorldEntries(slug);
  const foreshadows = useForeshadows(slug);
  const outlines = useOutlines(slug);
  const chapters = useChapterBriefs(slug);

  const facts: GuideFacts = {
    ...EMPTY_FACTS,
    genre: book.data?.genre ?? null,
    premise: book.data?.premise ?? null,
    characters: characters.data?.length ?? 0,
    worldEntries: worldEntries.data?.length ?? 0,
    foreshadows: foreshadows.data?.length ?? 0,
    outlines: outlines.data?.length ?? 0,
    chapters: chapters.data?.length ?? 0,
  };

  const queries = [book, characters, worldEntries, foreshadows, outlines, chapters];

  return {
    book: book.data,
    facts,
    done: stepDone(facts),
    loading: queries.some((q) => q.isPending),
    error: book.error,
    refetch: () => {
      for (const q of queries) void q.refetch();
    },
  };
}
