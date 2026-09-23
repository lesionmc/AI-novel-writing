import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { CharacterRelationInput,
  CharacterWriteRequest,
  ForeshadowWriteRequest,
  WorldEntryWriteRequest,
} from '@/types/api';

/* ---------------- 人物卡（R1） ---------------- */

export function useCreateCharacter(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CharacterWriteRequest) => api.createCharacter(slug, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.characters(slug) });
    },
  });
}

export function useUpdateCharacter(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CharacterWriteRequest> }) =>
      api.updateCharacter(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.characters(slug) });
    },
  });
}

export function useDeleteCharacter(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteCharacter(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.characters(slug) });
    },
  });
}

/* ---------------- 世界词条（R1） ---------------- */

export function useCreateWorldEntry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorldEntryWriteRequest) => api.createWorldEntry(slug, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.worldEntries(slug) });
    },
  });
}

export function useUpdateWorldEntry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<WorldEntryWriteRequest> }) =>
      api.updateWorldEntry(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.worldEntries(slug) });
    },
  });
}

export function useDeleteWorldEntry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteWorldEntry(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.worldEntries(slug) });
    },
  });
}

/* ---------------- 伏笔台账（R1） ---------------- */

export function useCreateForeshadow(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ForeshadowWriteRequest) => api.createForeshadow(slug, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['foreshadows', slug] });
    },
  });
}

export function useUpdateForeshadow(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ForeshadowWriteRequest> }) =>
      api.updateForeshadow(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['foreshadows', slug] });
    },
  });
}

/* ---------------- 人物关系（图谱） ---------------- */

export function useCreateCharacterRelation(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CharacterRelationInput) => api.createCharacterRelation(slug, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.characterRelations(slug) });
    },
  });
}

export function useDeleteCharacterRelation(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteCharacterRelation(slug, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.characterRelations(slug) });
    },
  });
}
