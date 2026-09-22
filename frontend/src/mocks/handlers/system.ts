/** MSW 处理器：模型配置 + 统计 + 导出 + 兜底 */

import { HttpResponse, delay, http } from 'msw';
import type { Provider, ProviderWriteRequest } from '@/types/api';
import { PROVIDER_LABELS } from '@/lib/labels';
import { MUTATE_DELAY, clone, db, fail, nextId, ok } from '../db';

/** 可列出模型的平台（示例清单；`claude` / `custom` 故意缺席以演示 note 分支） */
const MOCK_DISCOVERABLE: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  qwen: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen3-235b-a22b'],
  kimi: ['kimi-k2-0905-preview', 'moonshot-v1-128k', 'moonshot-v1-32k'],
  openrouter: ['qwen/qwen3.8-27b:free', 'z-ai/glm-5.2:free', 'deepseek/deepseek-chat-v3:free'],
  stepfun: ['step-5-preview', 'step-4-turbo', 'step-2-16k'],
  zhipu: ['glm-4.6', 'glm-4-flash', 'glm-4-air'],
  minimax: ['MiniMax-M2', 'abab6.5s-chat'],
  siliconflow: ['Qwen/Qwen3-235B-A22B', 'deepseek-ai/DeepSeek-V3', 'BAAI/bge-m3'],
  modelscope: ['Qwen/Qwen3-235B-A22B', 'deepseek-ai/DeepSeek-V3'],
  ollama: ['qwen3:8b', 'llama3.1:8b', 'deepseek-r1:7b'],
};

export const systemHandlers = [
  /* ---------------- providers ---------------- */
  http.get('/api/providers', () => ok(clone(db.providers))),
  http.post('/api/providers', async ({ request }) => {
    await delay(MUTATE_DELAY);
    const b = (await request.json()) as Partial<ProviderWriteRequest>;
    // 与真后端对齐：`ProviderCreate.task_role` 是非空 Literal（默认 'content'），
    // 传 null 会被校验拒成 400 —— mock 也照此拒绝，防止前端又把 null 发回来。
    if ('task_role' in b && (b.task_role === null || b.task_role === undefined)) {
      return fail('VALIDATION_ERROR', 400);
    }
    const p: Provider = {
      id: nextId(),
      provider: b.provider ?? 'deepseek',
      model: b.model ?? '',
      base_url: b.base_url ?? null,
      key_ref: b.api_key ? `keyring:${b.provider}:${nextId()}` : null,
      // 省略时走后端默认值（'content'），不是 null
      task_role: b.task_role ?? 'content',
      // 契约 `is_default` / `enabled` 为 integer(0/1)；新建默认启用
      is_default: 0,
      enabled: 1,
    };
    db.providers.push(p);
    return ok(clone(p));
  }),
  http.patch('/api/providers/:id', async ({ params, request }) => {
    const p = db.providers.find((x) => x.id === Number(params.id));
    if (!p) return fail('PROVIDER_NOT_FOUND', 404);
    const body = (await request.json()) as Record<string, unknown>;
    delete body.api_key; // 密钥绝不回写
    // 与真后端对齐：`task_role: null` 的语义是「**不修改**该字段」，不是「清空」
    // （库里是 NOT NULL DEFAULT 'content'）。故 null 直接剔除。
    if (body.task_role === null) delete body.task_role;
    Object.assign(p, body);
    return ok(clone(p));
  }),
  http.delete('/api/providers/:id', ({ params }) => {
    db.providers = db.providers.filter((x) => x.id !== Number(params.id));
    return new HttpResponse(null, { status: 204 });
  }),
  // 契约响应：{ ok, latency_ms, error }（无 provider_id / connected / error_code）
  http.post('/api/providers/:id/test', async ({ params }) => {
    await delay(700);
    const p = db.providers.find((x) => x.id === Number(params.id));
    const connected = Boolean(p?.key_ref);
    return ok({
      ok: connected,
      latency_ms: connected ? 380 + Math.round(Math.random() * 200) : null,
      error: connected ? null : '没能连上，请检查密钥与网络后重试',
    });
  }),

  /**
   * 拉取平台可用模型（不落库）。
   * `claude` / `custom` 故意不在表内 —— 用于演示「该平台不支持列出模型」的 note 分支。
   */
  http.post('/api/providers/discover-models', async ({ request }) => {
    await delay(1800);
    const b = (await request.json()) as { provider?: string };
    const models = MOCK_DISCOVERABLE[b.provider ?? ''] ?? [];
    if (models.length > 0) return ok({ models, count: models.length, note: null });
    const label = PROVIDER_LABELS[b.provider ?? ''] || b.provider || '该平台';
    return ok({ models: [], count: 0, note: `${label} 不支持列出模型，请手动填写模型名称` });
  }),

  /** 保存前连通测试（不落库）——不需要先保存 provider 记录 */
  http.post('/api/providers/test-draft', async ({ request }) => {
    await delay(900);
    const b = (await request.json()) as {
      provider?: string;
      model?: string;
      base_url?: string | null;
      api_key?: string;
    };
    if (!b.model?.trim()) {
      return ok({ ok: false, latency_ms: null, error: '请先填写模型名称' });
    }
    if (b.provider === 'custom' && !b.base_url?.trim()) {
      return ok({ ok: false, latency_ms: null, error: '自定义平台必须填写接入地址' });
    }
    return ok({ ok: true, latency_ms: 600 + Math.round(Math.random() * 2600), error: null });
  }),

  /* ---------------- stats / export ---------------- */
  http.get('/api/books/:book/stats', () => {
    const total = db.chapters.reduce((s, c) => s + c.word_count, 0);
    // 契约 `BookStats`：{ total_words, chapter_count, done_chapters, daily:[{date,words_added}] }
    const daily = Array.from({ length: 14 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return {
        date: d.toISOString().slice(0, 10),
        words_added: Math.max(0, 1800 - i * 120 + ((i * 137) % 400)),
      };
    });
    return ok({
      total_words: total,
      chapter_count: db.chapters.length,
      done_chapters: db.chapters.filter((c) => c.status === 'done').length,
      daily,
    });
  }),
  http.get('/api/books/:book/export', ({ request }) => {
    const format = new URL(request.url).searchParams.get('format') ?? 'txt';
    const body = db.chapters
      .map((c) => `第 ${c.seq} 章 ${c.title ?? ''}\n\n${c.content}`)
      .join('\n\n');
    return new HttpResponse(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="demo.${format}"`,
      },
    });
  }),

  /* ---------------- system capabilities（Spec §5.8 / §12） ---------------- */
  http.get('/api/system/capabilities', () => {
    // 开发/复验开关：localStorage['mock:noModel'] = '1' 可强制「未配置模型」降级态
    const forced =
      typeof window !== 'undefined' && window.localStorage.getItem('mock:noModel') === '1';
    return ok({
      // 向量扩展可用（召回 mock 有 recalled_chunks，保持自洽）
      vector_available: true,
      // mock 未实现 FTS 检索端点，如实标注为不可用 → 便于验证「全文检索未启用」降级 chip
      fts_available: false,
      // 有任一启用中的模型即为已配置（配置即时生效，非启动快照）
      llm_configured: forced ? false : db.providers.some((p) => p.enabled),
    });
  }),

  /* 兜底：未覆盖的接口返回空 */
  http.all('/api/*', () => ok(null)),
];
