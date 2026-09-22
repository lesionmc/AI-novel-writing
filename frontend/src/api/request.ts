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
