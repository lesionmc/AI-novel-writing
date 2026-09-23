import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { countWords, htmlToPlainText } from '@/lib/wordCount';
import { useAutosave } from '@/hooks/useAutosave';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';
import { EditorToolbar } from './EditorToolbar';
import { FindBar } from './FindBar';
import { createChunkHighlightExtension, setChunkHighlight } from './chunkHighlight';
import { HIGHLIGHT_TTL_MS, highlightTextInEditor } from './editorHighlight';
import { useDraftInsert } from './useDraftInsert';
import styles from './Editor.module.css';

export interface EditorDoc {
  html: string;
  title: string;
}

export interface EditorProps {
  chapterId: number;
  seq: number;
  title: string;
  /** 目标正文（本地缓存优先，取回后覆盖） */
  content: string;
  /** 正文重载令牌：版本回滚等"同一章正文被替换"时自增，强制重新载入 */
  reloadKey?: number;
  /** 该章正文是否已就绪（未就绪时先渲染缓存内容，不等接口） */
  contentReady: boolean;
  loading: boolean;
  loadError: unknown;
  onRetryLoad: () => void;
  onSave: (doc: EditorDoc) => Promise<void>;
  onFinalize: () => void;
  readOnly?: boolean;
}

/**
 * TipTap 编辑器（写作台核心）。
 *  - 进章**立即渲染**（先用缓存内容），召回请求不阻塞此处（04 §2.2 / TC-28）
 *  - 停止输入 2s 自动保存；Ctrl+S 立即保存；Ctrl+Enter 完成本章（TC-11）
 *  - 字数走 Intl.Segmenter，上报顶栏
 *  - 「跳到该章」后高亮目标片段（TC-33）：走 ProseMirror Decoration，**不污染正文**
 */
export function Editor({
  chapterId,
  seq,
  title,
  content,
  reloadKey = 0,
  contentReady,
  loading,
  loadError,
  onRetryLoad,
  onSave,
  onFinalize,
  readOnly = false,
}: EditorProps) {
  const [doc, setDoc] = useState<EditorDoc>({ html: content, title });
  const [findOpen, setFindOpen] = useState(false);
  // 去重键 = 章号 + 重载令牌：同一章仅在"回滚/替换正文"时才会重新载入
  const appliedRef = useRef<string | null>(null);
  // 高亮消退定时器 + 已处理令牌（同一片段连点两次也能重新触发）
  const highlightTimer = useRef<number | null>(null);
  const lastHighlightToken = useRef(0);

  const setWordCount = useDeskStore((s) => s.setWordCount);
  const setSaveState = useDeskStore((s) => s.setSaveState);
  const toggleFocusMode = useDeskStore((s) => s.toggleFocusMode);
  const chunkHighlight = useDeskStore((s) => s.chunkHighlight);
  const clearChunkHighlight = useDeskStore((s) => s.clearChunkHighlight);
  const setSelectionText = useDeskStore((s) => s.setSelectionText);

  const highlightExtension = useMemo(
    () => createChunkHighlightExtension({ className: styles.chunkHighlight }),
    [],
  );

  const editor = useEditor({
    extensions: [StarterKit, highlightExtension],
    content,
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'editorProse', 'aria-label': '章节正文' },
    },
    onUpdate: ({ editor: ed }) => {
      setDoc((d) => ({ ...d, html: ed.getHTML() }));
    },
    /**
     * 实时把「当前选中的纯文本」上报到 store。
     * 顶栏的「扩写」要用它（顶栏不是编辑器的父组件，拿不到 editor 实例）。
     * 折叠选区（光标）时 `from === to` → `textBetween` 返回空串，正好表示"没有选中"。
     */
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection;
      setSelectionText(from === to ? '' : ed.state.doc.textBetween(from, to, '\n'));
    },
  });

  const handleSave = useCallback((d: EditorDoc) => onSave(d), [onSave]);
  const { status, savedAt, error, saveNow, reset } = useAutosave(doc, handleSave, {
    enabled: contentReady && !readOnly,
  });

  // 切换章节 / 首次取回正文 / 回滚替换正文：写入编辑器并重置自动保存基线（不触发保存）
  useEffect(() => {
    if (!editor || !contentReady) return;
    const key = `${chapterId}:${reloadKey}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;
    editor.commands.setContent(content, false);
    setDoc({ html: content, title });
    reset({ html: content, title });
  }, [editor, contentReady, chapterId, content, title, reset, reloadKey]);

  /**
   * TC-33：在目标章正文里定位召回片段并高亮。
   *  - 定位/映射/高亮/DEV 断言都在 `editorHighlight.ts`（保持本文件精简）
   *  - 失配**优雅降级**：中性提示，不抛错、不白屏
   */
  const applyChunkHighlight = useCallback(
    (text: string) => {
      if (!editor || editor.isDestroyed) return;
      const applied = highlightTextInEditor(editor, text);

      if (!applied) {
        toast.info(`已跳到第 ${seq} 章，未能精确定位该片段`);
        return;
      }

      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => {
        highlightTimer.current = null;
        if (!editor.isDestroyed) setChunkHighlight(editor.view, null);
      }, HIGHLIGHT_TTL_MS);
    },
    [editor, seq],
  );

  // 消费「片段高亮」请求：必须等本编辑器**已写入目标章正文**（appliedRef）后才定位，
  // 避免在旧章内容上匹配。声明在正文写入 effect 之后，保证同一次提交内先写正文后高亮。
  useEffect(() => {
    if (!editor || !contentReady || !chunkHighlight) return;
    if (chunkHighlight.seq !== seq) return;
    if (chunkHighlight.token === lastHighlightToken.current) return;
    if (appliedRef.current !== `${chapterId}:${reloadKey}`) return;
    lastHighlightToken.current = chunkHighlight.token;
    applyChunkHighlight(chunkHighlight.text);
    // 已消费：回写 null，避免编辑器重挂载时用陈旧请求误触发
    clearChunkHighlight();
  }, [
    editor,
    contentReady,
    chunkHighlight,
    seq,
    chapterId,
    reloadKey,
    content,
    applyChunkHighlight,
    clearChunkHighlight,
  ]);

  // 卸载时清理定时器
  useEffect(
    () => () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  // 消费「插入 AI 草稿」请求（续写 / 扩写）：守卫逻辑在 useDraftInsert 里，这里只装配。
  useDraftInsert({
    editor,
    contentReady,
    seq,
    chapterId,
    reloadKey,
    content,
    readAppliedKey: () => appliedRef.current,
  });

  // 字数上报顶栏
  useEffect(() => {
    setWordCount(countWords(doc.html));
  }, [doc.html, setWordCount]);

  // 保存状态上报状态栏
  useEffect(() => {
    setSaveState(status, savedAt);
  }, [status, savedAt, setSaveState]);

  // 快捷键：Ctrl+S 保存 / Ctrl+Enter 完成本章 / Ctrl+F 查找 / Ctrl+Shift+F 专注模式
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        void saveNow();
      } else if (key === 'enter') {
        e.preventDefault();
        onFinalize();
      } else if (key === 'f' && e.shiftKey) {
        e.preventDefault();
        toggleFocusMode();
      } else if (key === 'f') {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, onFinalize, toggleFocusMode]);

  const plainText = useMemo(() => htmlToPlainText(doc.html).trim(), [doc.html]);
  const isEmpty = plainText.length === 0;

  return (
    <div className={styles.wrap}>
      <EditorToolbar
        editor={editor}
        findOpen={findOpen}
        onToggleFind={() => setFindOpen((v) => !v)}
      />
      {findOpen ? <FindBar text={plainText} onClose={() => setFindOpen(false)} /> : null}

      <div className={styles.scroll}>
        <div className={styles.canvas}>
          <div className={styles.chapterHead}>
            <span className={styles.chapterSeq}>第 {seq} 章</span>
            <input
              className={styles.chapterTitleInput}
              value={doc.title}
              placeholder="给这一章起个标题"
              aria-label="章节标题"
              readOnly={readOnly}
              onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
            />
          </div>

          {loading ? (
            <div className={styles.loadingNotice} role="status">
              <Icon name="loader" size={16} />
              正在取回这一章的正文…
            </div>
          ) : null}

          {loadError ? (
            <ErrorBar
              error={loadError}
              onRetry={onRetryLoad}
              className={styles.errorNotice}
            />
          ) : null}

          <div className={styles.contentWrap}>
            <EditorContent editor={editor} />
            {isEmpty ? (
              <p className={styles.placeholder}>在这里写正文。停笔 2 秒会自动保存。</p>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <ErrorBar error={error} onRetry={() => void saveNow()} retryLabel="重新保存" />
      ) : null}
    </div>
  );
}
