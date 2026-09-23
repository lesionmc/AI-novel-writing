import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { AiChatRequest } from '@/types/api';
import type { HubDraft } from '@/components/aihub/hubModel';

/**
 * `POST /api/books/{book}/ai/chat` —— 一轮「有记忆」的对话。
 * **无状态**（每轮带全量 messages）、**不落库** → 不 invalidate 任何缓存。
 * 草稿只在页面本地 state / localStorage 中流转，直到用户点「确认写入」才入库。
 */
export function useAiChat(slug: string) {
  return useMutation({
    mutationFn: (payload: AiChatRequest) => api.aiChat(slug, payload),
  });
}

/** 可写入库的草稿（`prose` 不在此列 —— 正文只交给用户自己删改，永不自动保存） */
export type WritableDraft = Exclude<HubDraft, { kind: 'prose' }>;

export interface HubDraftWriteResult {
  /** 实际写入的条数 */
  written: number;
  /** 给用户看的一句话（人话，不带术语） */
  label: string;
}

/**
 * 把确认后的草稿**逐条**写入 —— 复用已有的 create 端点，不新增后端接口。
 * 串行写入：避免瞬时并发打爆本地服务，也便于中途失败时如实报告已写条数。
 */
export function useWriteHubDraft(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: WritableDraft): Promise<HubDraftWriteResult> => {
      if (draft.kind === 'characters') {
        for (const c of draft.characters) await api.createCharacter(slug, c);
        return { written: draft.characters.length, label: '人物卡' };
      }
      if (draft.kind === 'world_entries') {
        for (const w of draft.entries) {
          // `category` 在 `parseAiChatDraft` 里已兜底为 other；这里显式写出是为了对齐契约必填字段
          await api.createWorldEntry(slug, { ...w, category: w.category ?? 'other' });
        }
        return { written: draft.entries.length, label: '世界设定' };
      }
      for (const n of draft.nodes) await api.createOutline(slug, n);
      return { written: draft.nodes.length, label: '大纲' };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.characters(slug) });
      void qc.invalidateQueries({ queryKey: queryKeys.worldEntries(slug) });
      void qc.invalidateQueries({ queryKey: queryKeys.outlines(slug) });
    },
  });
}
