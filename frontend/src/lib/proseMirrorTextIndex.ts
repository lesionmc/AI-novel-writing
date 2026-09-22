/**
 * ProseMirror 文档 → 规范化纯文本索引（TC-33）
 * -----------------------------------------------------------------------------
 * 把编辑器 doc 拍平成「规范化纯文本 + 每个字符对应的 ProseMirror 位置」，
 * 从而能把「文本匹配到的区间」映射回可渲染 Decoration 的 PM 位置：
 *   - 文本节点：逐字符记录其所在位置 `pos + i`
 *   - 块级边界：折叠为一个空格（与 `normalizeForMatch` 的折叠规则一致）
 * 生成的 `text` 天然是规范化形态（单空格分隔、无首尾空白），
 * 可直接交给 `findPrefixMatch` 与片段文本比对。
 * 纯函数，仅依赖 `@tiptap/pm/model` 的类型。
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import type { MatchRange } from './chunkLocate';

export interface DocTextIndex {
  /** 规范化纯文本 */
  text: string;
  /** 与 `text` 等长：第 i 个字符在文档中的 ProseMirror 位置 */
  posAt: number[];
}

/** 拍平文档为规范化文本 + 位置索引 */
export function buildDocTextIndex(doc: PMNode): DocTextIndex {
  let text = '';
  const posAt: number[] = [];
  let started = false;
  /** 待补的折叠空格（跨空白 / 跨块时置位，下一个实字前落一个空格） */
  let pendingSpace = false;

  const pushChar = (ch: string, pos: number) => {
    text += ch;
    posAt.push(pos);
  };

  doc.descendants((node, pos) => {
    if (node.isText) {
      const raw = node.text ?? '';
      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (/\s/.test(ch)) {
          pendingSpace = started;
          continue;
        }
        if (pendingSpace) {
          pushChar(' ', pos + i);
          pendingSpace = false;
        }
        started = true;
        pushChar(ch, pos + i);
      }
    } else if (node.isBlock && started) {
      pendingSpace = true;
    }
    return true;
  });

  return { text, posAt };
}

/**
 * 把规范化文本区间映射为可渲染的 PM 区间 `{ from, to }`。
 * 返回 null 表示区间非法（越界 / 空）——调用方据此降级，不做任何假设。
 */
export function mapMatchToPositions(
  index: DocTextIndex,
  range: MatchRange,
): { from: number; to: number } | null {
  if (range.end <= range.start) return null;
  const startPos = index.posAt[range.start];
  const lastPos = index.posAt[range.end - 1];
  if (startPos === undefined || lastPos === undefined) return null;
  const from = Math.min(startPos, lastPos);
  const to = Math.max(startPos, lastPos) + 1;
  if (from < 0 || to <= from) return null;
  return { from, to };
}
