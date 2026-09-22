import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type {
  DiscoverModelsRequest,
  ProviderUpdateRequest,
  ProviderWriteRequest,
  TestDraftRequest,
} from '@/types/api';

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProviderWriteRequest) => api.createProvider(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers() });
    },
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProviderUpdateRequest }) =>
      api.updateProvider(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers() });
    },
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteProvider(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers() });
    },
  });
}

/** 有效性检测：结果就地回填，不整体刷新列表（避免清掉其它行的检测状态） */
export function useTestProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.testProvider(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers() });
    },
  });
}

/** 拉取平台可用模型。**不落库、无副作用**，故不 invalidate 任何缓存 */
export function useDiscoverModels() {
  return useMutation({
    mutationFn: (payload: DiscoverModelsRequest) => api.discoverModels(payload),
  });
}

/** 保存前连通测试。**不落库、无副作用** */
export function useTestDraft() {
  return useMutation({
    mutationFn: (payload: TestDraftRequest) => api.testDraft(payload),
  });
}
