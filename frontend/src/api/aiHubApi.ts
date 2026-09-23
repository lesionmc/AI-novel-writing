/**
 * AI 对话工作台的端点封装（M2-batch3）。
 * -----------------------------------------------------------------------------
 * 单独一个文件是为了让 `api/client.ts` 守住「单文件 ≤300 行」门禁；
 * 对外仍是同一个 `api` 对象（client.ts 用展开合并），调用方写法不变：
 *
 *     import { api } from '@/api/client';
 *     await api.aiChat(slug, { messages });
 *
 * ## 定位
 * 前端**不带上下文**：只发对话历史 + 可选章节 + 可选意图。记忆包由服务端
 * `services/writing_context.py` 组装（唯一的组装点），避免造出第二个真源。
 *
 * ## 红线
 * 响应里的 `draft` 是**草稿**：必须用户确认后，由前端调 `createCharacter` /
 * `createWorldEntry` / `createOutline` 落库。本文件不含任何"保存草稿"的语义。
 */

import { slugSegment } from '@/lib/slug';
import { request } from './request';
import type { AiChatRequest, AiChatResponse } from '@/types/api';

export const aiHubApi = {
  /**
   * 一轮「有记忆」的对话。**无写入副作用**。
   * 要读设定库全文再让模型推理，慢模型可能几十秒，超时放宽到 120s。
   */
  aiChat: (book: string, payload: AiChatRequest) =>
    request<AiChatResponse>(`/books/${slugSegment(book)}/ai/chat`, {
      method: 'POST',
      body: payload,
      timeoutMs: 120000,
    }),
};
