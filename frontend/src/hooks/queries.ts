/**
 * 读查询 hooks（TanStack Query v5）
 * 业务组件禁止直连 fetch；服务端状态一律经此处。
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { ForeshadowListQuery, OutlineLevel } from '@/types/api';

const STALE = {
  /** 元信息 30s */
  meta: 30_000,
  /** 列表类 15s */
  list: 15_000,
  /** 正文 / 章节详情（自动保存后需快速反映） */
  content: 0,
};

export function useBooks() {
  return useQuery({
    queryKey: queryKeys.books(),
    queryFn: api.listBooks,
    staleTime: STALE.meta,
  });
}

export function useBook(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book(slug ?? ''),
    queryFn: () => api.getBook(slug as string),
    enabled: Boolean(slug),
    staleTime: STALE.meta,
  });
}

export function useCharacters(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.characters(slug ?? ''),
    queryFn: () => api.listCharacters(slug as string),
    enabled: Boolean(slug),
    staleTime: STALE.list,
  });
}

export function useWorldEntries(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.worldEntries(slug ?? ''),
    queryFn: () => api.listWorldEntries(slug as string),
    enabled: Boolean(slug),
    staleTime: STALE.list,
  });
}

export function useForeshadows(slug: string | undefined, filter?: ForeshadowListQuery) {
  const key = filter ? `${filter.status ?? 'all'}:${filter.importance ?? 'all'}` : undefined;
  return useQuery({
    queryKey: queryKeys.foreshadows(slug ?? '', key),
    queryFn: () => api.listForeshadows(slug as string, filter),
    enabled: Boolean(slug),
    staleTime: STALE.list,
  });
}

export function useOutlines(slug: string | undefined, level?: OutlineLevel) {
  return useQuery({
    queryKey: queryKeys.outlines(slug ?? '', level),
    queryFn: () => api.listOutlines(slug as string, level),
    enabled: Boolean(slug),
    staleTime: STALE.list,
  });
}

/** 章节列表（不含正文；用于左栏章节树，TC-13 <500ms） */
export function useChapterBriefs(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.chapterBriefs(slug ?? ''),
    queryFn: () => api.listChapters(slug as string),
    enabled: Boolean(slug),
    staleTime: STALE.list,
  });
}

export function useChapter(id: number | null) {
  return useQuery({
    queryKey: queryKeys.chapter(id ?? -1),
    queryFn: () => api.getChapter(id as number),
    enabled: id !== null,
    staleTime: STALE.content,
  });
}

export function useVersions(id: number | null) {
  return useQuery({
    queryKey: queryKeys.versions(id ?? -1),
    queryFn: () => api.listVersions(id as number),
    enabled: id !== null,
    staleTime: STALE.list,
  });
}

export function useProviders() {
  return useQuery({
    queryKey: queryKeys.providers(),
    queryFn: api.listProviders,
    staleTime: STALE.meta,
  });
}

export function useProviderUsage(id: number | null) {
  return useQuery({
    queryKey: queryKeys.providerUsage(id ?? -1),
    queryFn: () => api.getProviderUsage(id as number),
    enabled: id !== null,
    staleTime: STALE.meta,
  });
}

export function useStats(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stats(slug ?? ''),
    queryFn: () => api.getStats(slug as string),
    enabled: Boolean(slug),
    staleTime: STALE.list,
  });
}

export function usePlotArcs(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plotArcs(slug ?? ''),
    queryFn: () => api.getPlotArcs(slug as string),
    enabled: Boolean(slug),
    staleTime: STALE.list,
  });
}

export function useRecallLogs(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recallLogs(slug ?? ''),
    queryFn: () => api.listRecallLogs(slug as string),
    enabled: Boolean(slug),
    staleTime: STALE.list,
  });
}

/** 设定变更追踪：查该人物被哪些章节引用过（约束 3 / TC-10） */
export function useAffectedChapters(characterId: number | null) {
  return useQuery({
    queryKey: queryKeys.affectedChapters(characterId ?? -1),
    queryFn: () => api.getAffectedChapters(characterId as number),
    enabled: characterId !== null,
    staleTime: 0,
  });
}

/** 题材库（选题向导选项来源，M1 增项）。题材数据近乎静态，长缓存 */
export function useTopicGenres(enabled = true) {
  return useQuery({
    queryKey: queryKeys.topicGenres(),
    queryFn: api.listTopicGenres,
    enabled,
    staleTime: 10 * 60_000,
  });
}

/** 敏感词词库状态（质检页 / 设置页共享）。只读、低频变化，元信息级缓存 */
export function useWordlistStatus() {
  return useQuery({
    queryKey: queryKeys.wordlistStatus(),
    queryFn: api.getWordlistStatus,
    staleTime: STALE.meta,
  });
}
