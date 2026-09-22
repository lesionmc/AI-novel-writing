import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { ConfirmWritebackRequest } from '@/types/api';

/** 生成回写建议（**不落库**，红线 2：未确认条目绝不入库） */
export function useFinalizeChapter() {
  return useMutation({
    mutationFn: (chapterId: number) => api.finalize(chapterId),
  });
}

/** 确认回写：后端单事务 8 步原子写入，全部成功或全部回滚（TC-26） */
export function useConfirmWriteback(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, payload }: { chapterId: number; payload: ConfirmWritebackRequest }) =>
      api.confirmWriteback(chapterId, payload),
    onSuccess: (_res, { chapterId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.chapter(chapterId) });
      void qc.invalidateQueries({ queryKey: queryKeys.chapterBriefs(slug) });
      void qc.invalidateQueries({ queryKey: ['foreshadows', slug] });
      void qc.invalidateQueries({ queryKey: queryKeys.plotArcs(slug) });
      void qc.invalidateQueries({ queryKey: queryKeys.stats(slug) });
      void qc.invalidateQueries({ queryKey: queryKeys.book(slug) });
      // [QA M5] 归档本章后右栏「本章提醒」必须跟着刷新 ——
      // 否则面板还显示「线索 0 / 剧情线 0」，用户以为没存上，只能手动刷新页面。
      // 该 key 有写副作用（写 recall_log），但这是**用户确认归档后的显式一次**，
      // 不属于轮询/预取，符合 useRecall 的约束。
      void qc.invalidateQueries({ queryKey: queryKeys.recall(chapterId) });
    },
  });
}
