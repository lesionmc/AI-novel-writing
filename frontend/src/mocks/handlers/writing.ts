/** MSW 处理器：章节 + 版本 + 记忆（召回 / 回写） */

import { HttpResponse, delay, http } from 'msw';
import type { Chapter, ChapterBrief, ChapterVersion, UpdateChapterRequest } from '@/types/api';
import {
  MUTATE_DELAY,
  briefOf,
  clone,
  db,
  fail,
  nextId,
  ok,
  seedPlotArcs,
  seedRecall,
  type MockVersion,
} from '../db';

/** 契约 `ChapterVersion` 不含正文 —— 对外只暴露字段，正文仅内部用于回滚 */
const publicVersion = (v: MockVersion): ChapterVersion => ({
  id: v.id,
  chapter_id: v.chapter_id,
  word_count: v.word_count,
  note: v.note,
  created_at: v.created_at,
});

export const writingHandlers = [
  /* ---------------- chapters ---------------- */
  http.get('/api/books/:book/chapters', () =>
    ok(clone(db.chapters.map(briefOf)) as ChapterBrief[]),
  ),
  http.post('/api/books/:book/chapters', async ({ request }) => {
    await delay(MUTATE_DELAY);
    const b = (await request.json()) as { seq?: number; title?: string | null };
    const c: Chapter = {
      id: nextId(),
      seq: b.seq ?? db.chapters.length + 1,
      title: b.title ?? null,
      word_count: 0,
      status: 'draft',
      content: '',
      chapter_summary: null,
      hook: null,
      finalized_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.chapters.push(c);
    return ok(clone(c));
  }),
  http.get('/api/chapters/:id', ({ params }) => {
    const c = db.chapters.find((x) => x.id === Number(params.id));
    return c ? ok(clone(c)) : fail('CHAPTER_NOT_FOUND', 404);
  }),
  // 契约响应**仅 3 字段** { id, word_count, updated_at }（非 Chapter）
  http.patch('/api/chapters/:id', async ({ params, request }) => {
    await delay(MUTATE_DELAY);
    const c = db.chapters.find((x) => x.id === Number(params.id));
    if (!c) return fail('CHAPTER_NOT_FOUND', 404);
    const body = (await request.json()) as UpdateChapterRequest;
    Object.assign(c, body, { updated_at: new Date().toISOString() });
    if (typeof body.content === 'string') c.word_count = Math.max(1, Math.round(body.content.length / 3));
    return ok({ id: c.id, word_count: c.word_count, updated_at: c.updated_at });
  }),
  http.delete('/api/chapters/:id', ({ params }) => {
    db.chapters = db.chapters.filter((x) => x.id !== Number(params.id));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/chapters/:id/versions', () => ok(db.versions.map(publicVersion))),
  http.post('/api/chapters/:id/versions', async ({ params, request }) => {
    const c = db.chapters.find((x) => x.id === Number(params.id));
    if (!c) return fail('CHAPTER_NOT_FOUND', 404);
    const body = (await request.json()) as { note?: string | null };
    const v: MockVersion = {
      id: nextId(),
      chapter_id: c.id,
      content: c.content,
      word_count: c.word_count,
      note: body.note ?? null,
      created_at: new Date().toISOString(),
    };
    db.versions.unshift(v);
    return ok(publicVersion(v));
  }),
  http.post('/api/chapters/:id/versions/:vid/restore', ({ params }) => {
    const c = db.chapters.find((x) => x.id === Number(params.id));
    const v = db.versions.find((x) => x.id === Number(params.vid));
    if (!c || !v) return fail('VERSION_NOT_FOUND', 404);
    c.content = v.content;
    c.word_count = v.word_count;
    return ok(clone(c));
  }),

  /* ---------------- memory ---------------- */
  http.get('/api/chapters/:id/recall', async () => {
    await delay(500);
    return ok(clone(seedRecall));
  }),
  // 契约 `WritebackSuggestion`：closed_foreshadow_ids / raw_ai_output（无 parse_warning）
  http.post('/api/chapters/:id/finalize', async () => {
    await delay(800);
    return ok({
      chapter_summary: '沈砚在黑水城夜探玄阴宗据点，首次与对方交手，断剑的秘密初露端倪。',
      character_updates: [
        { name: '沈砚', state: '确认断剑与玄阴宗有关', reason: '本章夜探据点所得', accepted: true },
      ],
      plot_progress: [{ arc: '师父之死', progress: '线索指向玄阴宗', accepted: true }],
      new_foreshadows: [{ title: '据点密室里的铜牌', importance: 'medium', accepted: true }],
      closed_foreshadow_ids: [],
      hook: '铜牌上的字，沈砚认得。',
      raw_ai_output: null,
    });
  }),
  // 契约响应：落库结果摘要（无 chapter_id / status / written / next_chapter_id）
  http.post('/api/chapters/:id/finalize/confirm', async ({ params, request }) => {
    await delay(400);
    const body = (await request.json()) as {
      new_foreshadows?: { title: string; importance?: string }[];
      character_updates?: unknown[];
      plot_progress?: unknown[];
      closed_foreshadow_ids?: number[];
    };
    const c = db.chapters.find((x) => x.id === Number(params.id));
    if (c) c.status = 'done';
    (body.new_foreshadows ?? []).forEach((f) => {
      db.foreshadows.push({
        id: nextId(),
        title: f.title,
        planted_chapter_seq: c?.seq ?? null,
        planned_payoff_seq: null,
        actual_payoff_seq: null,
        status: 'open',
        importance: 'medium',
        note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
    return ok({
      character_states_written: (body.character_updates ?? []).length,
      foreshadows_created: (body.new_foreshadows ?? []).length,
      foreshadows_closed: (body.closed_foreshadow_ids ?? []).length,
      chunks_indexed: 1,
      plot_arcs_updated: (body.plot_progress ?? []).length,
    });
  }),
  http.get('/api/books/:book/memory/plot-arcs', () => ok(clone(seedPlotArcs))),
  http.get('/api/books/:book/recall-logs', () => ok([])),
];
