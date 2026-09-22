import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { useDeskStore } from '@/stores/deskStore';
import type { CreateChapterRequest, CreateVersionRequest, UpdateChapterRequest } from '@/types/api';

export function useCreateChapter(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateChapterRequest) => api.createChapter(slug, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.chapterBriefs(slug) });
    },
  });
}

/**
 * 保存正文（自动保存 / Ctrl+S）。
 * [契约] `PATCH /api/chapters/{id}` 响应**只有 3 字段** `{id, word_count, updated_at}`（见 openapi L526-536），
 *        绝非完整 Chapter —— 因此**不可** `setQueryData` 整体写回，否则会把缓存里的
 *        content / title / seq 全部冲掉。改为让章节详情失效重拉（编辑器凭 chapterId 守卫不回吐）。
 */
export function useSaveChapter(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateChapterRequest }) =>
      api.updateChapter(id, payload),
    onSuccess: (_res, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.chapter(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.chapterBriefs(slug) });
    },
  });
}

export function useDeleteChapter(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteChapter(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.chapter(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.chapterBriefs(slug) });
    },
  });
}

export function useCreateVersion(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CreateVersionRequest }) =>
      api.createVersion(id, payload),
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.versions(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.chapterBriefs(slug) });
    },
  });
}

export function useRestoreVersion(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vid }: { id: number; vid: number }) => api.restoreVersion(id, vid),
    onSuccess: (chapter) => {
      // 回滚返回**完整 Chapter**（含正文），可直接写回缓存
      qc.setQueryData(queryKeys.chapter(chapter.id), chapter);
      // 同一章正文被替换 → 通知编辑器重新载入（chapterId 未变，靠令牌突破去重守卫）
      useDeskStore.getState().reloadChapterContent();
      void qc.invalidateQueries({ queryKey: queryKeys.versions(chapter.id) });
      void qc.invalidateQueries({ queryKey: queryKeys.chapterBriefs(slug) });
    },
  });
}
