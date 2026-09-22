import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';
import { draftTextToParagraphHtml } from './draftText';

export interface UseDraftInsertOptions {
  editor: Editor | null;
  /** 编辑器是否已载入正文（未载入时插入会落在旧内容上） */
  contentReady: boolean;
  seq: number;
  chapterId: number;
  reloadKey: number;
  /** 正文 HTML：变化说明已写入新内容，作为前置守卫生效的信号 */
  content: string;
  /**
   * 「当前已应用的是哪一章哪一版」的标记读取器（形如 `12:0`）。
   *
   * 由调用方传入读取函数而不是值：它是 ref，读值不会触发重渲染，
   * 必须在 effect 执行的那一刻现读，否则会永远读到打开编辑器时的旧值。
   */
  readAppliedKey: () => string | null;
}

/**
 * 消费「插入 AI 草稿」请求（M2-batch2 续写 / 扩写）。
 *
 * ## 只插入，不保存
 * 正文照旧走既有的自动保存链路，作者可以立刻改掉或 Ctrl+Z 撤销。
 * AI 草稿**不经作者确认不会成为最终稿**（红线 2 精神）。
 *
 * ## 为什么要有这么多守卫
 * 草稿是**跨组件**发起的（顶栏的 AI 菜单 → deskStore → 这里消费），
 * 中间可能发生切章、版本回滚、正文重载。所以插入前必须同时满足：
 *   ① 编辑器存在且未销毁；② 正文已载入；③ 请求的章号 == 当前章号；
 *   ④ 该令牌未被消费过；⑤ 当前正文确实是这一章这一版的。
 * 少任何一条都可能把草稿插进**别的章**，而那是用户无法接受的破坏。
 *
 * 从 `Editor.tsx` 拆出来，让编辑器主文件守住「单文件 ≤300 行」门禁。
 */
export function useDraftInsert({
  editor,
  contentReady,
  seq,
  chapterId,
  reloadKey,
  content,
  readAppliedKey,
}: UseDraftInsertOptions): void {
  const draftInsert = useDeskStore((s) => s.draftInsert);
  const clearDraftInsert = useDeskStore((s) => s.clearDraftInsert);
  /** 已处理的草稿令牌（同一段草稿连点两次也能重新插入） */
  const lastToken = useRef(0);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !contentReady || !draftInsert) return;
    if (draftInsert.seq !== seq) return;
    if (draftInsert.token === lastToken.current) return;
    if (readAppliedKey() !== `${chapterId}:${reloadKey}`) return;

    lastToken.current = draftInsert.token;
    const html = draftTextToParagraphHtml(draftInsert.text);
    if (!html) {
      clearDraftInsert();
      return;
    }

    const replaceSelection =
      draftInsert.mode === 'replace' && !editor.state.selection.empty;
    if (replaceSelection) {
      editor.chain().focus().deleteSelection().insertContent(html).run();
      toast.success('已用 AI 草稿替换选中内容，改完再定稿');
    } else {
      editor.chain().focus('end').insertContent(html).run();
      toast.success('AI 草稿已接到正文末尾，改完再定稿');
    }
    clearDraftInsert();
  }, [
    editor,
    contentReady,
    draftInsert,
    seq,
    chapterId,
    reloadKey,
    content,
    readAppliedKey,
    clearDraftInsert,
  ]);
}
