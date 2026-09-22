/**
 * 网络请求底层（唯一网络出入口的底座）
 * -----------------------------------------------------------------------------
 * 依据 `docs/spec-M1规格契约.md` §5 + `03-技术方案.md` §3。
 * 业务组件禁止直连 fetch —— 统一走 `api/client.ts`。
 *
 * [注意] `GET /api/chapters/{id}/recall` 有写副作用（写 recall_log），调用方必须
 *        使用 staleTime:0 + enabled 由章号驱动，一次进章仅触发一次（Spec §11 坑 7）。
 */

import { messageForCode } from './errorMessages';

const API_BASE = '/api';

/** 后端统一错误对象 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(code: string, status: number, detail: unknown) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** 从任意异常取「可直接展示给用户」的中文文案（永不返回技术原文） */
export function userMessageOf(e: unknown): string {
  if (isApiError(e)) return messageForCode(e.code);
  return messageForCode('NETWORK_ERROR');
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 毫秒；AI 相关调用需放宽 */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 查询参数（仅取已定义值） */
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 15000, signal, query } = options;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    window.clearTimeout(timer);
    if ((e as Error)?.name === 'AbortError' && signal?.aborted) throw e;
    throw new ApiError('TIMEOUT_ERROR', 0, null);
  } finally {
    window.clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // 非 JSON 响应（如后端异常直出）——不把原始文本暴露给用户
      throw new ApiError('INTERNAL_ERROR', res.status, null);
    }
  }

  if (!res.ok) {
    const code = (parsed as { error?: { code?: string } } | null)?.error?.code ?? 'INTERNAL_ERROR';
    const detail = (parsed as { error?: { detail?: unknown } } | null)?.error?.detail ?? null;
    throw new ApiError(code, res.status, detail);
  }

  return parsed as T;
}

/** 文件下载（导出 txt / docx）——不解析 JSON，直接触发浏览器下载 */
export async function downloadFile(
  path: string,
  query?: RequestOptions['query'],
): Promise<void> {
  const res = await fetch(buildUrl(path, query));
  if (!res.ok) {
    let code = 'INTERNAL_ERROR';
    try {
      const body = (await res.json()) as { error?: { code?: string } };
      code = body.error?.code ?? code;
    } catch {
      /* 忽略 */
    }
    throw new ApiError(code, res.status, null);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : 'export';

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/* ============================================================================
 * SSE 流式响应（目前只有「一致性审校」在用）
 * ----------------------------------------------------------------------------
 * 放在网络层而不是组件里 —— 与 `request` / `downloadFile` 同源，
 * 业务组件照样不许直连 fetch。
 * ==========================================================================*/

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
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
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
