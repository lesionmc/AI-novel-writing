/**
 * 正文辅助 AI + 一致性审校的端点封装（M2-batch2）。
 * -----------------------------------------------------------------------------
 * 从 `api/client.ts` 拆出来，让主 client 守住「单文件 ≤300 行」门禁；
 * 对外仍是同一个 `api` 对象（client.ts 用展开合并），调用方写法不变：
 *
 *     import { api } from '@/api/client';
 *     await api.plotDirections(chapterId);
 *
 * ## 定位提示（改这里前先读）
 * 前四个能力**全部无落库副作用**：
 *   · 剧情走向 / 校对 —— 只给方向与问题清单，**不产出正文**；
 *   · 续写 / 扩写 —— 只产出草稿，由调用方放进编辑器让作者删改。
 * 所以这里没有任何"保存"语义。
 */

import { slugSegment } from '@/lib/slug';
import { request } from './request';
import { streamSse } from './sse';
import type {
  ConsistencyConflict,
  ConsistencyProgress,
  ConsistencySummary,
  ContinueRequest,
  DraftTextResponse,
  ExpandRequest,
  PlotDirectionsRequest,
  PlotDirectionsResponse,
  ProofreadRequest,
  ProofreadResponse,
} from '@/types/api';

export const writingApi = {
  /* --- 5.11 writing（正文辅助 AI） --- */

  plotDirections: (chapterId: number, payload: PlotDirectionsRequest = {}) =>
    request<PlotDirectionsResponse>(`/chapters/${chapterId}/plot-directions`, {
      method: 'POST',
      body: payload,
      timeoutMs: 120000,
    }),

  /** 校对：`payload.text` 缺省 = 校对整章。空 `issues` 是合法结果（没有问题） */
  proofread: (chapterId: number, payload: ProofreadRequest = {}) =>
    request<ProofreadResponse>(`/chapters/${chapterId}/proofread`, {
      method: 'POST',
      body: payload,
      timeoutMs: 120000,
    }),

  /** 续写草稿（**不落库**） */
  continueWriting: (chapterId: number, payload: ContinueRequest = {}) =>
    request<DraftTextResponse>(`/chapters/${chapterId}/continue`, {
      method: 'POST',
      body: payload,
      timeoutMs: 180000,
    }),

  /** 扩写草稿（**不落库**）。`payload.text` 必填 */
  expand: (chapterId: number, payload: ExpandRequest) =>
    request<DraftTextResponse>(`/chapters/${chapterId}/expand`, {
      method: 'POST',
      body: payload,
      timeoutMs: 180000,
    }),

  /* --- 5.12 一致性审校（SSE 流式） --- */

  /**
   * 一致性审校。**不走 `request`** —— 要读流，用 `streamSse`。
   *
   * 回调三个事件：`onProgress` / `onConflict` / `onDone`；函数在**流结束时** resolve。
   * 未配置模型时后端在开流前返回普通 JSON 错误 → 这里抛 `ApiError('LLM_NOT_CONFIGURED')`，
   * 调用方拿去展示即可（不会收到半截流）。
   */
  auditConsistencyStream: (
    book: string,
    handlers: {
      onProgress?: (p: ConsistencyProgress) => void;
      onConflict?: (c: ConsistencyConflict) => void;
      onDone?: (s: ConsistencySummary) => void;
    },
    options: { scope?: string; signal?: AbortSignal } = {},
  ): Promise<void> =>
    streamSse(
      `/books/${slugSegment(book)}/audit/consistency/stream`,
      { scope: options.scope ?? null },
      (frame) => {
        try {
          if (frame.event === 'progress') {
            handlers.onProgress?.(JSON.parse(frame.data) as ConsistencyProgress);
          } else if (frame.event === 'conflict') {
            handlers.onConflict?.(JSON.parse(frame.data) as ConsistencyConflict);
          } else if (frame.event === 'done') {
            handlers.onDone?.(JSON.parse(frame.data) as ConsistencySummary);
          }
        } catch {
          /* 单帧解析失败不该中断整条流 —— 后面还有 conflict/done 要收 */
        }
      },
      { signal: options.signal },
    ),
};
