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
import { slugSegment } from '@/lib/slug';

const API_BASE = '/api';

/**
 * 从当前路由取「正在编辑的作品」slug。
 * 只在 `/book/<slug>/...` 形态下取得到；首页 / 书库页返回 null（此时不带该头）。
 * 取到后 percent-encode 放进 `X-Book-Slug` —— 后端据此把 by-id 端点**限定在本作品内**，
 * 避免多标签页并发时把甲书的自动保存写进乙书（P0-2）。
 */
export function bookSlugHeader(): Record<string, string> {
  const match = /^\/book\/([^/]+)(?:\/|$)/.exec(window.location.pathname);
  if (!match) return {};
  const raw = match[1];
  let slug: string;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    // 路径里含非法百分号转义（典型来源：书名本身就是「100%达成」，而链接未编码）。
    //
    // [重要] 这里**绝不能** return {} 放弃作用域 —— 那会让 by-id 端点退回
    // 「全局当前作品指针」解析，等于把"跨书静默写错书"的入口重新打开（P0-2 的绕过路径）。
    // 退而求其次：拿原始段当 slug 用。它可能没被解码，但至少作用域是**限定**的，
    // 而后面还要再 encodeURIComponent 一次，所以这里最坏情况只是 slug 多了转义，
    // 也远比"无作用域"安全。
    slug = raw;
  }
  return slug ? { 'X-Book-Slug': slugSegment(slug) } : {};
}

/** 后端统一错误对象 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;
  /**
   * 后端给的中文人话 message（如"这一卷还没有挂着写完的章节"）。
   * 以前只留 code，前端按码表映射成泛化文案 —— 后端辛苦写好的具体原因全链丢失
   * （E2E 审查发现）。有 serverMessage 时优先展示它。
   */
  readonly serverMessage: string | null;

  constructor(code: string, status: number, detail: unknown, serverMessage?: string | null) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.serverMessage = serverMessage ?? null;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** 从任意异常取「可直接展示给用户」的中文文案（永不返回技术原文） */
export function userMessageOf(e: unknown): string {
  if (isApiError(e)) return e.serverMessage || messageForCode(e.code);
  return messageForCode('NETWORK_ERROR');
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 毫秒；AI 相关调用需放宽 */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 查询参数（仅取已定义值） */
  query?: Record<string, string | number | boolean | undefined | null>;
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
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
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...bookSlugHeader(),
      },
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
    const err = (parsed as { error?: { code?: string; message?: string; detail?: unknown } } | null)
      ?.error;
    throw new ApiError(err?.code ?? 'INTERNAL_ERROR', res.status, err?.detail ?? null, err?.message ?? null);
  }

  return parsed as T;
}

/** 文件下载（导出 txt / docx）——不解析 JSON，直接触发浏览器下载 */
export async function downloadFile(
  path: string,
  query?: RequestOptions['query'],
): Promise<void> {
  const res = await fetch(buildUrl(path, query), { headers: bookSlugHeader() });
  if (!res.ok) {
    let code = 'INTERNAL_ERROR';
    let serverMessage: string | null = null;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      serverMessage = body.error?.message ?? null;
    } catch {
      /* 忽略 */
    }
    throw new ApiError(code, res.status, null, serverMessage);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  // 必须优先取 RFC 5987 的 filename*：后端同时给 ASCII 兜底 filename="____"，
  // 先匹配 filename= 会让中文文件名永远变成一串下划线
  const rfc5987 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  const rawName = rfc5987?.[1] ?? plain?.[1];
  const filename = rawName ? decodeURIComponent(rawName) : 'export';

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 不能同步 revoke：下载是浏览器异步消费的，点击后立刻撤销会让传输中途失败
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
