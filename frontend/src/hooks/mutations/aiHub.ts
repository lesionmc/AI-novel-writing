import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { AiChatRequest, AiChatResponse } from '@/types/api';
import type { HubDraft } from '@/components/aihub/hubModel';

export interface HubChatHandlers {
  /** final 帧：完整回复（含草稿/联网来源）。流式 delta 只是它的渐进显示。 */
  onFinal: (res: AiChatResponse) => void;
  onError: (e: unknown) => void;
}

/**
 * 流式对话（`POST .../ai/chat/stream`）。**无状态、不落库** → 不 invalidate 缓存。
 * 不用 useMutation：SSE 的"边到边显示"是持续状态更新，mutation 的终态模型套不住它。
 * 草稿只在页面本地 state / localStorage 中流转，直到用户点「确认写入」才入库。
 */
export function useHubChat(slug: string) {
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => abortRef.current?.abort(), // 换书/离页时掐断在途的流
    [slug],
  );

  const run = useCallback(
    (payload: AiChatRequest, handlers: HubChatHandlers) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setStreamText('');
      void api
        .aiChatStream(
          slug,
          payload,
          (ev) => {
            if (ev.event === 'delta') {
              // 单帧解析失败静默丢：final 帧是全集，缺一片不影响终态
              try {
                const d = JSON.parse(ev.data) as { text: string };
                setStreamText((prev) => prev + d.text);
              } catch {
                /* ignore */
              }
            } else if (ev.event === 'final') {
              handlers.onFinal(JSON.parse(ev.data) as AiChatResponse);
            } else if (ev.event === 'error') {
              const d = JSON.parse(ev.data) as { code: string };
              handlers.onError(new ApiError(d.code, 200, null));
            }
          },
          { signal: ctrl.signal },
        )
        .catch((e: unknown) => {
          // 主动 abort（换书 / 重发 / 离页）不是错误：弹"网络异常"是假报警
          if (ctrl.signal.aborted) return;
          handlers.onError(e);
        })
        .finally(() => {
          // 旧流的收尾不许踩新流：只有"仍是当前流"时才清 busy/草稿
          if (abortRef.current !== ctrl) return;
          setBusy(false);
          setStreamText('');
        });
    },
    [slug],
  );

  return { run, busy, streamText };
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
