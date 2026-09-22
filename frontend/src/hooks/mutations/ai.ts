import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type {
  CharacterWriteRequest,
  SetupChatRequest,
  WorldEntryWriteRequest,
} from '@/types/api';

/**
 * `POST /api/ai/setup-chat` —— 对话式建设定。
 * **无状态**（每轮带全量 messages）、**不落库** → 不 invalidate 任何缓存。
 * 草稿只在组件本地 state 中流转，直到用户点「确认并写入设定库」才真正入库。
 */
export function useSetupChat() {
  return useMutation({
    mutationFn: (payload: SetupChatRequest) => api.setupChat(payload),
  });
}

export interface WriteSetupDraftPayload {
  /** 用户勾选保留的人物卡（已由确认页映射为写入载荷） */
  characters: CharacterWriteRequest[];
  /** 用户勾选保留的世界词条 */
  worldEntries: WorldEntryWriteRequest[];
}

export interface WriteSetupDraftResult {
  characters: number;
  worldEntries: number;
}

/**
 * 把确认后的草稿**逐条**写入设定库 —— 复用已有的 create 端点，不新增后端接口。
 * 串行写入：避免瞬时并发打爆本地服务，也便于中途失败时如实报告已写条数。
 */
export function useWriteSetupDraft(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WriteSetupDraftPayload): Promise<WriteSetupDraftResult> => {
      let characters = 0;
      for (const c of payload.characters) {
        await api.createCharacter(slug, c);
        characters += 1;
      }
      let worldEntries = 0;
      for (const w of payload.worldEntries) {
        await api.createWorldEntry(slug, w);
        worldEntries += 1;
      }
      return { characters, worldEntries };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.characters(slug) });
      void qc.invalidateQueries({ queryKey: queryKeys.worldEntries(slug) });
    },
  });
}
