import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';

/**
 * 质检写操作（去 AI 味 / 敏感词）。
 * -----------------------------------------------------------------------------
 * 两个端点都是 POST，但**无落库副作用**（不写 DB、不改章节）——POST 只是因为
 * 需要请求体 / 触发一次计算。故不 invalidate 任何缓存，结果只存在于组件本地 state
 * （与 `hooks/mutations/topics.ts` 的 `useTopicAdvice` 同款处理）。
 *
 * 「采纳改写」会真正改章节正文，属写操作 —— 复用 `useSaveChapter`，见 chapters.ts。
 */

/** 去 AI 味（单章）：本地规则 + 命中片段 AI 改写建议 */
export function useAiFlavorAudit() {
  return useMutation({
    mutationFn: (chapterId: number) => api.auditAiFlavor(chapterId),
  });
}

/** 敏感词自查（整本书）：纯本地词库匹配，不调用 AI */
export function useSensitiveAudit() {
  return useMutation({
    mutationFn: (book: string) => api.auditSensitive(book),
  });
}
