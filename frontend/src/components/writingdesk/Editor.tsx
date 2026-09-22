import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { EditorView } from '@tiptap/pm/view';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { countWords, htmlToPlainText } from '@/lib/wordCount';
import { buildDocTextIndex, mapMatchToPositions } from '@/lib/proseMirrorTextIndex';
import { findPrefixMatch } from '@/lib/chunkLocate';
import { useAutosave } from '@/hooks/useAutosave';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';
import { EditorToolbar } from './EditorToolbar';
import { FindBar } from './FindBar';
import { createChunkHighlightExtension, setChunkHighlight } from './chunkHighlight';
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

/** 片段高亮自动消退时长（TC-33） */
const HIGHLIGHT_TTL_MS = 4000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** 把某位置滚动到可视区居中（不改动文档 / 不移动光标） */
function scrollPositionIntoView(view: EditorView, from: number): void {
  const domAt = view.domAtPos(from);
  const domNode = domAt.node;
  const el = domNode.nodeType === Node.TEXT_NODE ? domNode.parentElement : (domNode as HTMLElement);
  el?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
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
   *  - 渐进前缀匹配（80→60→40→24→12），命中即用 Decoration 高亮
   *  - 失配**优雅降级**：中性提示，不抛错、不白屏
   *  - DEV 断言探针：装饰前后 `getHTML()` 必须逐字节一致（高亮不污染正文）
   */
  const applyChunkHighlight = useCallback(
    (text: string) => {
      if (!editor || editor.isDestroyed) return;
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
