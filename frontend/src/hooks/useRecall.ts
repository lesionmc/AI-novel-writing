import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { RecallResponse } from '@/types/api';

/**
 * 写前召回（产品灵魂 / 红线 1）
 * -----------------------------------------------------------------------------
 * [注意] `GET /api/chapters/{id}/recall` **有写副作用**（写 recall_log）：
 *   - 禁缓存：staleTime 0，永不作为"新鲜数据"复用
 *   - 禁并发重复触发：enabled 由当前章号驱动；refetchOnMount / Focus / Reconnect 全关，
 *     一次进章只触发一次（否则 recall_log 灌水、毁掉调优依据）
 *   - 手动重试只能由用户显式点击（refetch）触发
 *
 * 降级：未配模型时后端仍返回结构化结果（characters / open_foreshadows），
 *       面板绝不整体空白（TC-19 / 红线 3）。
 */
export function useRecall(chapterId: number | null) {
  return useQuery<RecallResponse>({
    queryKey: queryKeys.recall(chapterId ?? -1),
    queryFn: ({ signal }) => api.recall(chapterId as number, signal),
    enabled: chapterId !== null,
    staleTime: 0,
    gcTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
