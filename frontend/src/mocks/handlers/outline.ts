/** MSW 处理器：大纲（**扁平结构** + AI 展开） */

import { HttpResponse, delay, http } from 'msw';
import type { OutlineExpandRequest, OutlineNode } from '@/types/api';
import { MUTATE_DELAY, clone, db, fail, nextId, ok } from '../db';

/** 收集某节点的全部后代 id（含自身），用于级联删除 */
function descendantIds(nodes: OutlineNode[], id: number): number[] {
  const out = [id];
  let frontier = [id];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const n of nodes) {
      if (n.parent_id !== null && frontier.includes(n.parent_id) && !out.includes(n.id)) {
        out.push(n.id);
        next.push(n.id);
      }
    }
    frontier = next;
  }
  return out;
}

export const outlineHandlers = [
  // 契约：返回**扁平数组**（含 parent_id，无 children）
  http.get('/api/books/:book/outlines', () => ok(clone(db.outlines))),
  http.post('/api/books/:book/outlines', async ({ request }) => {
    await delay(MUTATE_DELAY);
    const b = (await request.json()) as Partial<OutlineNode>;
    const node: OutlineNode = {
      id: nextId(),
      level: b.level ?? 'chapter',
      parent_id: b.parent_id ?? null,
      seq: b.seq ?? 1,
      title: b.title ?? null,
      content: b.content ?? null,
      chapter_id: b.chapter_id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.outlines.push(node);
    return ok(clone(node));
  }),
  http.patch('/api/outlines/:id', async ({ params, request }) => {
    const node = db.outlines.find((n) => n.id === Number(params.id));
    if (!node) return fail('OUTLINE_NOT_FOUND', 404);
    Object.assign(node, (await request.json()) as Partial<OutlineNode>);
    return ok(clone(node));
  }),
  // 契约：删除节点时级联删除其子节点
  http.delete('/api/outlines/:id', ({ params }) => {
    const ids = descendantIds(db.outlines, Number(params.id));
    db.outlines = db.outlines.filter((n) => !ids.includes(n.id));
    return new HttpResponse(null, { status: 204 });
  }),
  // 契约 `OutlineExpandResponse`：{ parent_id, expand_level, candidates[], raw_ai_output }
  http.post('/api/outlines/:id/expand', async ({ params, request }) => {
    await delay(600);
    const body = (await request.json()) as OutlineExpandRequest;
    const level = body.expand_level ?? 'chapter';
    const candidates =
      level === 'volume'
        ? [
            { level: 'volume' as const, title: '第一卷·断剑之始', content: '捡到断剑，卷入旧案。', seq: 1, rationale: '承接总纲开篇' },
            { level: 'volume' as const, title: '第二卷·玄阴宗', content: '追查线索，初次交锋。', seq: 2, rationale: '推进主线冲突' },
          ]
        : [
            { level: 'chapter' as const, title: '旧货摊', content: '主角在旧货摊发现断剑，引发追查。', seq: 1, rationale: '开篇钩子' },
            { level: 'chapter' as const, title: '旧识上门', content: '旧识警告，暗示此地不宜久留。', seq: 2, rationale: '制造悬念' },
            { level: 'chapter' as const, title: '夜遇', content: '当夜遭遇不明身份者，首次交手。', seq: 3, rationale: '抬升冲突' },
          ];
    return ok({
      parent_id: Number(params.id),
      expand_level: level,
      candidates,
      raw_ai_output: null,
    });
  }),
];
