import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { TopicAdviceRequest } from '@/types/api';

/**
 * `POST /api/topics/advice` —— 四问 + 三数据 → 蓝海细分方向。
 * **不落库、无副作用**，故不 invalidate 任何缓存；结果只存在于组件本地 state。
 */
export function useTopicAdvice() {
  return useMutation({
    mutationFn: (payload: TopicAdviceRequest) => api.getTopicAdvice(payload),
  });
}
