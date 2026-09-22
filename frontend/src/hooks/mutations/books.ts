import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { CreateBookRequest, UpdateBookRequest } from '@/types/api';

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBookRequest) => api.createBook(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.books() });
    },
  });
}

export function useUpdateBook(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateBookRequest) => api.updateBook(slug, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.books() });
      void qc.invalidateQueries({ queryKey: queryKeys.book(slug) });
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.deleteBook(slug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.books() });
    },
  });
}
