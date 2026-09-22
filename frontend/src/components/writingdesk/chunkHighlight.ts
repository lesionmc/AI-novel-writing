/**
 * 「片段高亮」ProseMirror Decoration 插件（TC-33）
 * -----------------------------------------------------------------------------
 * 关键约束：**高亮绝不能污染正文文档**。
 * -----------------------------------------------------------------------------
 * 做法：用 ProseMirror 的 **Decoration**（视图层装饰）承载高亮，而非 mark /
 * `insertContent` 之类会改动 `state.doc` 的手段。触发高亮只派发一个
 * **仅带 meta 的事务**（`docChanged === false`）——TipTap 仅在 `docChanged` 时
 * 才 emit `update`（见 @tiptap/core dispatchTransaction），因此：
 *   - 不触发 Editor 的 `onUpdate`
 *   - 不改动 `editor.state.doc`
 *   - `editor.getHTML()` 前后**逐字节一致**
 * 天然的清空时机：用户下一次输入 / 切章（都会 `docChanged`）时自动清除。
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

/** 插件 meta：`{from,to}` 设置高亮；`null` 清空；`undefined` 无变化 */
export type ChunkHighlightMeta = { from: number; to: number } | null | undefined;

export const chunkHighlightKey = new PluginKey<DecorationSet>('chunkHighlight');

export interface ChunkHighlightOptions {
  /** 装饰类名（由 CSS Module 传入，保证唯一且走 Token） */
  className: string;
}

/** 创建「片段高亮」ProseMirror 插件（可独立单测：不依赖 TipTap Editor 实例） */
export function createChunkHighlightPlugin(className: string): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: chunkHighlightKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr: Transaction, value: DecorationSet, _old: EditorState, newState: EditorState) {
        const meta = tr.getMeta(chunkHighlightKey) as ChunkHighlightMeta;
        if (meta === null) return DecorationSet.empty;
        if (meta) {
          return DecorationSet.create(newState.doc, [
            Decoration.inline(meta.from, meta.to, { class: className }),
          ]);
        }
        // 无 meta：正文变更（输入 / 切章）时自动清除，否则随映射平移
        if (tr.docChanged) return DecorationSet.empty;
        return value.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state: EditorState) {
        return chunkHighlightKey.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

/** 创建「片段高亮」扩展（挂载到编辑器 extensions） */
export function createChunkHighlightExtension({ className }: ChunkHighlightOptions) {
  return Extension.create({
    name: 'chunkHighlight',
    addProseMirrorPlugins() {
      return [createChunkHighlightPlugin(className)];
    },
  });
}

/** 设置 / 清除片段高亮：仅派发 meta 事务，绝不改动文档 */
export function setChunkHighlight(view: EditorView, range: { from: number; to: number } | null): void {
  view.dispatch(view.state.tr.setMeta(chunkHighlightKey, range));
}
