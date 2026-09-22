import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import type {
  ContinueRequest,
  ExpandRequest,
  PlotDirectionsRequest,
  ProofreadRequest,
} from '@/types/api';

/**
 * 正文辅助 AI 的四个 mutation（M2-batch2）。
 *
 * ## 为什么**不 invalidate 任何缓存**
 * 四个接口**全部无落库副作用**：
 *   · 剧情走向 / 校对 —— 只回建议与问题清单，不写库；
 *   · 续写 / 扩写 —— 只回草稿，是否落到正文由用户决定（前端拿到后放进编辑器，
 *     再由既有的自动保存链路去写）。
 * 所以这里没有任何 `invalidateQueries` —— 加了反而会让写作台无谓重取。
 *
 * 与 `useSetupChat` 的处理方式一致（同样是"AI 只出草稿、不落库"）。
 */

interface ChapterScoped<V> {
  chapterId: number;
  payload?: V;
}

/** 剧情走向（不产出正文，与「不在写的环节代笔」一致） */
export function usePlotDirections() {
  return useMutation({
    mutationFn: ({ chapterId, payload }: ChapterScoped<PlotDirectionsRequest>) =>
      api.plotDirections(chapterId, payload ?? {}),
  });
}

/** 校对（只挑错、不改字）。空 `issues` 是合法结果，不是错误 */
export function useProofread() {
  return useMutation({
    mutationFn: ({ chapterId, payload }: ChapterScoped<ProofreadRequest>) =>
      api.proofread(chapterId, payload ?? {}),
  });
}

/** 续写草稿（**不落库**） */
export function useContinueWriting() {
  return useMutation({
    mutationFn: ({ chapterId, payload }: ChapterScoped<ContinueRequest>) =>
      api.continueWriting(chapterId, payload ?? {}),
  });
}

/** 扩写草稿（**不落库**；`payload.text` 必填） */
export function useExpandWriting() {
  return useMutation({
    mutationFn: ({ chapterId, payload }: { chapterId: number; payload: ExpandRequest }) =>
      api.expand(chapterId, payload),
  });
}
