import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { OutlineExpandRequest, OutlineWriteRequest } from '@/types/api';

function invalidateOutlines(qc: QueryClient, slug: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.outlines(slug) });
}

export function useCreateOutline(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OutlineWriteRequest) => api.createOutline(slug, payload),
    onSuccess: () => invalidateOutlines(qc, slug),
  });
}

export function useUpdateOutline(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<OutlineWriteRequest> }) =>
      api.updateOutline(id, payload),
    onSuccess: () => invalidateOutlines(qc, slug),
  });
}

export function useDeleteOutline(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteOutline(id),
    onSuccess: () => invalidateOutlines(qc, slug),
  });
}

export function useSummarizeVolume(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.summarizeVolume(id),
    onSuccess: () => invalidateOutlines(qc, slug),
  });
}

/** AI 展开：只返回候选，**不落库**；由用户改完再保存（04 §5.3）。契约要求 body `{expand_level}` */
export function useExpandOutline() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: OutlineExpandRequest }) =>
      api.expandOutline(id, payload),
  });
}
