/** MSW 处理器：书库 + 设定库（人物 / 世界词条 / 伏笔） */

import { HttpResponse, delay, http } from 'msw';
import type { AffectedChapter, Book, Character, Foreshadow, WorldEntry } from '@/types/api';
import { MUTATE_DELAY, briefOfBook, clone, db, fail, nextId, ok } from '../db';

const now = () => new Date().toISOString();

export const catalogHandlers = [
  /* ---------------- books ---------------- */
  // 契约列表返回 BookBrief（6 字段）
  http.get('/api/books', () => ok(db.books.map(briefOfBook))),
  http.post('/api/books', async ({ request }) => {
    await delay(MUTATE_DELAY);
    const body = (await request.json()) as Partial<Book>;
    const book: Book = {
      id: nextId(),
      slug: `demo-${db.books.length + 1}`,
      title: body.title ?? '未命名作品',
      genre: body.genre ?? null,
      target_words: body.target_words ?? 0,
      premise: body.premise ?? null,
      summary: null,
      writing_mode: 'assist',
      created_at: now(),
      updated_at: now(),
    };
    db.books.push(book);
    return ok(book);
  }),
  http.get('/api/books/:book', ({ params }) => {
    const book = db.books.find((b) => b.slug === params.book);
    return book ? ok(clone(book)) : fail('BOOK_NOT_FOUND', 404);
  }),
  http.patch('/api/books/:book', async ({ params, request }) => {
    const book = db.books.find((b) => b.slug === params.book);
    if (!book) return fail('BOOK_NOT_FOUND', 404);
    Object.assign(book, await request.json(), { updated_at: now() });
    return ok(clone(book));
  }),
  // 契约：删除作品 → 204（无响应体）
  http.delete('/api/books/:book', ({ params }) => {
    const idx = db.books.findIndex((b) => b.slug === params.book);
    if (idx < 0) return fail('BOOK_NOT_FOUND', 404);
    db.books.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  /* ---------------- characters ---------------- */
  http.get('/api/books/:book/characters', () => ok(clone(db.characters))),
  http.post('/api/books/:book/characters', async ({ request }) => {
    await delay(MUTATE_DELAY);
    const b = (await request.json()) as Partial<Character>;
    const c: Character = {
      id: nextId(),
      name: b.name ?? '未命名',
      alias: b.alias ?? null,
      role: b.role ?? 'supporting',
      surface_identity: b.surface_identity ?? null,
      secret_desire: b.secret_desire ?? null,
      fatal_weakness: b.fatal_weakness ?? null,
      contradiction: b.contradiction ?? null,
      appearance: b.appearance ?? null,
      background: b.background ?? null,
      first_chapter_seq: b.first_chapter_seq ?? null,
      status: b.status ?? 'alive',
      tags: b.tags ?? [],
      created_at: now(),
      updated_at: now(),
    };
    db.characters.push(c);
    return ok(clone(c));
  }),
  http.patch('/api/characters/:id', async ({ params, request }) => {
    const c = db.characters.find((x) => x.id === Number(params.id));
    if (!c) return fail('CHARACTER_NOT_FOUND', 404);
    Object.assign(c, await request.json());
    return ok(clone(c));
  }),
  http.delete('/api/characters/:id', ({ params }) => {
    db.characters = db.characters.filter((x) => x.id !== Number(params.id));
    return new HttpResponse(null, { status: 204 });
  }),
  // 契约：响应为**裸数组** `[{chapter_seq, chapter_title, matched_in}]`
  http.get('/api/characters/:id/affected-chapters', ({ params }) => {
    const id = Number(params.id);
    const seqs = id === 201 ? [1, 2] : id === 202 ? [2] : [];
    const hits: AffectedChapter[] = seqs.map((seq) => {
      const ch = db.chapters.find((c) => c.seq === seq);
      return { chapter_seq: seq, chapter_title: ch?.title ?? null, matched_in: 'content' };
    });
    return ok(hits);
  }),

  /* ---------------- world entries ---------------- */
  http.get('/api/books/:book/world-entries', () => ok(clone(db.worldEntries))),
  http.post('/api/books/:book/world-entries', async ({ request }) => {
    await delay(MUTATE_DELAY);
    const b = (await request.json()) as Partial<WorldEntry>;
    const e: WorldEntry = {
      id: nextId(),
      category: b.category ?? 'other',
      name: b.name ?? '未命名',
      content: b.content ?? null,
      parent_id: b.parent_id ?? null,
      tags: b.tags ?? [],
      created_at: now(),
      updated_at: now(),
    };
    db.worldEntries.push(e);
    return ok(clone(e));
  }),
  http.patch('/api/world-entries/:id', async ({ params, request }) => {
    const e = db.worldEntries.find((x) => x.id === Number(params.id));
    if (!e) return fail('ENTRY_NOT_FOUND', 404);
    Object.assign(e, await request.json());
    return ok(clone(e));
  }),
  http.delete('/api/world-entries/:id', ({ params }) => {
    const id = Number(params.id);
    db.worldEntries = db.worldEntries.filter((x) => x.id !== id);
    db.worldEntries.forEach((x) => {
      if (x.parent_id === id) x.parent_id = null; // 父删子变顶层（TC-08）
    });
    return new HttpResponse(null, { status: 204 });
  }),

  /* ---------------- foreshadows ---------------- */
  http.get('/api/books/:book/foreshadows', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const importance = url.searchParams.get('importance');
    let list = db.foreshadows;
    if (status) list = list.filter((f) => f.status === status);
    if (importance) list = list.filter((f) => f.importance === importance);
    return ok(clone(list));
  }),
  http.post('/api/books/:book/foreshadows', async ({ request }) => {
    await delay(MUTATE_DELAY);
    const b = (await request.json()) as Partial<Foreshadow>;
    const f: Foreshadow = {
      id: nextId(),
      title: b.title ?? '未命名伏笔',
      planted_chapter_seq: b.planted_chapter_seq ?? null,
      planned_payoff_seq: b.planned_payoff_seq ?? null,
      actual_payoff_seq: b.actual_payoff_seq ?? null,
      status: b.status ?? 'open',
      importance: b.importance ?? 'medium',
      note: b.note ?? null,
      created_at: now(),
      updated_at: now(),
    };
    db.foreshadows.push(f);
    return ok(clone(f));
  }),
  http.patch('/api/foreshadows/:id', async ({ params, request }) => {
    const f = db.foreshadows.find((x) => x.id === Number(params.id));
    if (!f) return fail('FORESHADOW_NOT_FOUND', 404);
    Object.assign(f, await request.json());
    return ok(clone(f));
  }),
];
