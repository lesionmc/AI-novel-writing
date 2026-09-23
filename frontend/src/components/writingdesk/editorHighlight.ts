/**
 * 编辑器「召回片段定位与高亮」的纯逻辑（从 `Editor.tsx` 拆出，守住单文件 ≤ 300 行）。
 * -----------------------------------------------------------------------------
 * 这里不持有 React 状态，只做三件事：
 *   1. 在编辑器文档里做**渐进前缀匹配**，命中后映射成 ProseMirror 位置；
 *   2. 用 Decoration（`setChunkHighlight`）高亮，**绝不改动正文**；
 *   3. DEV 下断言「装饰前后 `getHTML()` 逐字节一致」（高亮不污染正文，TC-33）。
 * 失配时返回 `false`，由调用方决定降级提示文案。
 */

import type { Editor } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import { buildDocTextIndex, mapMatchToPositions } from '@/lib/proseMirrorTextIndex';
import { findPrefixMatch } from '@/lib/chunkLocate';
import { setChunkHighlight } from './chunkHighlight';

/** 片段高亮自动消退时长（TC-33） */
export const HIGHLIGHT_TTL_MS = 4000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** 把某位置滚动到可视区居中（不改动文档 / 不移动光标） */
export function scrollPositionIntoView(view: EditorView, from: number): void {
  const domAt = view.domAtPos(from);
  const domNode = domAt.node;
  const el =
    domNode.nodeType === Node.TEXT_NODE ? domNode.parentElement : (domNode as HTMLElement);
  el?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/**
 * 在编辑器里定位并高亮 `text` 对应的片段，返回是否成功命中。
 * 「渐进前缀匹配（80→60→40→24→12）」由 `findPrefixMatch` 负责；命中即高亮，
 * 失配返回 false（调用方据此给中性提示，不抛错、不白屏）。
 */
export function highlightTextInEditor(editor: Editor, text: string): boolean {
  const index = buildDocTextIndex(editor.state.doc);
  const match = findPrefixMatch(index.text, text);
  const mapped = match ? mapMatchToPositions(index, match) : null;

  const beforeHtml = import.meta.env.DEV ? editor.getHTML() : '';
  let applied = false;
  if (mapped) {
    try {
      setChunkHighlight(editor.view, mapped);
      scrollPositionIntoView(editor.view, mapped.from);
      applied = true;
    } catch {
      applied = false;
    }
  }

  if (import.meta.env.DEV && applied && editor.getHTML() !== beforeHtml) {
    console.error('[TC-33] 高亮污染了正文：装饰前后 editor.getHTML() 不一致');
  }
  return applied;
}
