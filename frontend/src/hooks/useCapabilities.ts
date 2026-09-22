import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { SystemCapabilities } from '@/types/api';

/**
 * 系统能力自检（Spec §12 / §5.8）
 * -----------------------------------------------------------------------------
 * 只读、无副作用；取自连接层启动自检（进程内缓存）。
 *   - 会话内 `staleTime: Infinity`：成功一次后本会话不再自动重取（不轮询）
 *   - **失败静默**：调用方据 `data` 的有无决定是否渲染 chip —— 请求出错时
 *     `data` 为 undefined，一个 chip 都不显示，避免误报降级（Spec §12.6）
 *   - 无 `?refresh`：`[重新检测]` 只是 `refetch()` 重新拉取缓存值
 *   - 出错后无缓存数据 → 下次进入写作台重新挂载会自动重试一次（staleTime 不拦空数据）
 */
export function useCapabilities() {
  return useQuery<SystemCapabilities>({
    queryKey: queryKeys.capabilities(),
    queryFn: api.getCapabilities,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
