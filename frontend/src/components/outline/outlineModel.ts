import type { OutlineNode } from '@/types/api';

/** 节点默认显示名（用户未命名时按层级回落） */
export function defaultNodeLabel(node: OutlineNode): string {
  if (node.title && node.title.trim()) return node.title.trim();
  if (node.level === 'total') return '总纲';
  if (node.level === 'volume') return `第 ${node.seq} 卷`;
  return `第 ${node.seq} 章 · 未命名`;
}

/* ---------------------------------------------------------------------------
   契约：`GET /outlines` 返回**扁平数组**（含 parent_id），**不返回 children**。
   建树由前端完成 —— 以下为唯一建树入口，禁止再依赖 `node.children`。
   ------------------------------------------------------------------------- */

/** 建树后的节点（`children` 由前端派生，非契约字段） */
export interface OutlineTreeNode extends OutlineNode {
  children: OutlineTreeNode[];
}

/** 按 `parent_id` 把扁平节点数组建成有序树（同级按 seq 升序） */
export function buildOutlineTree(nodes: OutlineNode[]): OutlineTreeNode[] {
  const byId = new Map<number, OutlineTreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: OutlineTreeNode[] = [];
  for (const n of nodes) {
    const node = byId.get(n.id);
    if (!node) continue;
    const parent = n.parent_id !== null ? byId.get(n.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRec = (list: OutlineTreeNode[]) => {
    list.sort((a, b) => a.seq - b.seq || a.id - b.id);
    for (const x of list) sortRec(x.children);
  };
  sortRec(roots);
  return roots;
}

/** 扁平数组中某父节点下的直接子节点（按 seq 升序） */
export function childrenOf(nodes: OutlineNode[], parentId: number | null): OutlineNode[] {
  return nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.seq - b.seq);
}

/** 扁平数组中某节点的全部后代 id（含自身），用于删除影响面提示 */
export function descendantIds(nodes: OutlineNode[], id: number): number[] {
  const out: number[] = [id];
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

/** 在扁平数组中按 id 查找节点 */
export function findOutlineNode(nodes: OutlineNode[], id: number): OutlineNode | null {
  return nodes.find((n) => n.id === id) ?? null;
}

/** 同一父节点下的下一个 seq */
export function nextSeqUnder(nodes: OutlineNode[], parentId: number | null): number {
  return nodes.filter((n) => n.parent_id === parentId).reduce((max, n) => Math.max(max, n.seq), 0) + 1;
}

/** 指定层级的下一个 seq（用于顶层总纲，避免与顶层卷纲串号） */
export function nextSeqForLevel(nodes: OutlineNode[], level: OutlineNode['level']): number {
  return nodes.filter((n) => n.level === level).reduce((max, n) => Math.max(max, n.seq), 0) + 1;
}
