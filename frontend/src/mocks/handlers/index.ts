/**
 * MSW 处理器聚合（开发用，`VITE_USE_MOCK=true` 时启用）。
 * 形状严格对齐 `src/types/api.d.ts`；逻辑从简，只为让 6 个页面可点可跑。
 */

/**
 * MSW 处理器聚合（开发用，`VITE_USE_MOCK=true` 时启用）。
 * 形状严格对齐 `src/types/api.d.ts`；逻辑从简，只为让 6 个页面可点可跑。
 *
 * [顺序很重要] MSW 命中**第一个**匹配的 handler。`system.ts` 末尾有一条兜底
 * `http.all('/api/*')`，必须排在所有具体端点**之后**，否则会把新端点一起吞掉。
 */

import { catalogHandlers } from './catalog';
import { outlineHandlers } from './outline';
import { writingHandlers } from './writing';
import { aiHandlers } from './ai';
import { systemHandlers } from './system';

export const handlers = [
  ...catalogHandlers,
  ...outlineHandlers,
  ...writingHandlers,
  ...aiHandlers,
  // 兜底 `http.all('/api/*')` 在 systemHandlers 内，务必保持最后
  ...systemHandlers,
];
