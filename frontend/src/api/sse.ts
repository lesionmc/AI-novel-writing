/**
 * SSE 流式响应（「一致性审校」与「AI 对话」共用）。
 * ----------------------------------------------------------------------------
 * 从 request.ts 拆出：同一网络底座（buildUrl / X-Book-Slug / ApiError），
 * 业务组件照样不许直连 fetch。request.ts 原路径重导出，调用方无需改 import。
 */
import { ApiError, bookSlugHeader, buildUrl } from './request';

export interface SseEvent {
  /** 事件名（后端发 `event: xxx`；缺省为 `message`） */
  event: string;
  /** 事件数据（原始字符串，调用方自己 JSON.parse） */
  data: string;
}

/** 找下一个 SSE 帧边界；同时兼容 `\n\n` 与 `\r\n\r\n`（反代可能改写换行） */
function nextFrameBoundary(buffer: string): { index: number; length: number } {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  if (lf !== -1) return { index: lf, length: 2 };
  return { index: -1, length: 0 };
}

/** 解析单个 SSE 帧（`event:` / `data:` 行；`:` 开头是注释/心跳，忽略） */
export function parseSseFrame(block: string): SseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const raw of block.split(/\r?\n/)) {
    if (!raw || raw.startsWith(':')) continue;
    const idx = raw.indexOf(':');
    const field = idx === -1 ? raw : raw.slice(0, idx);
    const value = idx === -1 ? '' : raw.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0 && event === 'message') return null;
  return { event, data: dataLines.join('\n') };
}

export interface StreamOptions {
  signal?: AbortSignal;
  /**
   * 整体超时。审校全书要跑多次模型调用，默认给 10 分钟 ——
   * 比单次请求的 15s 宽得多，因为这是"整条流"的预算而不是一次往返。
   */
  timeoutMs?: number;
}

/**
 * 发起 SSE 请求并逐帧回调。
 *
 * **关键约定**：后端在开流之前如果发现"没配模型"这类错误，会返回**普通 JSON 错误**
 * （不是 SSE）。所以这里先看 `res.ok`，非 2xx 一律按 `ApiError` 抛出 ——
 * 否则调用方只会看到"流莫名断掉"，拿不到可读原因。
 */
export async function streamSse(
  path: string,
  body: unknown,
  onEvent: (e: SseEvent) => void,
  options: StreamOptions = {},
): Promise<void> {
  const { signal, timeoutMs = 600000 } = options;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...bookSlugHeader(),
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
  } catch (e) {
    window.clearTimeout(timer);
    if ((e as Error)?.name === 'AbortError' && signal?.aborted) throw e;
    throw new ApiError('TIMEOUT_ERROR', 0, null);
  }

  if (!res.ok || !res.body) {
    window.clearTimeout(timer);
    let code = 'INTERNAL_ERROR';
    let detail: unknown = null;
    try {
      const parsed = (await res.json()) as { error?: { code?: string; detail?: unknown } };
      code = parsed.error?.code ?? code;
      detail = parsed.error?.detail ?? null;
    } catch {
      /* 非 JSON 的错误体：保留默认 code */
    }
    throw new ApiError(code, res.status, detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const boundary = nextFrameBoundary(buffer);
        if (boundary.index === -1) break;
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const frame = parseSseFrame(block);
        if (frame) onEvent(frame);
      }
    }
    // 流结束时缓冲区里可能还剩最后一帧（后端没补空行）
    const tail = parseSseFrame(buffer);
    if (tail) onEvent(tail);
  } finally {
    window.clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch {
      /* 已释放 */
    }
  }
}
