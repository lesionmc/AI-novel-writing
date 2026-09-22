import { create } from 'zustand';
import type { AutosaveStatus } from '@/hooks/useAutosave';

export type RightTab = 'recall' | 'settings';

/**
 * 「跳到该章并高亮片段」请求（TC-33）。
 * `token` 单调自增：同一片段**连续点两次**也能重新触发（不被去重逻辑吃掉）。
 */
export interface ChunkHighlightRequest {
  /** 目标章号 */
  seq: number;
  /** 片段文本（用于在目标章正文中定位） */
  text: string;
  /** 自增令牌：每次请求都不同，驱动编辑器重新定位 */
  token: number;
}

/**
 * 「把 AI 草稿放进编辑器」请求（M2-batch2 续写 / 扩写）。
 *
 * 为什么用"请求 → 编辑器消费"而不是把 editor 实例提到 store：
 * 与 `chunkHighlight` 完全同一套做法 —— 编辑器重挂载（切章 / 版本回滚）后
 * 不会拿到失效的编辑器引用，也不会出现"草稿插进上一章"的错位（用 `seq` 对齐）。
 *
 * **注意**：请求只负责"插入"，**不负责保存** —— 正文照旧走既有的自动保存链路，
 * 作者可以立刻改掉或撤销。AI 草稿不经确认不会成为最终稿（红线 2 精神）。
 */
export interface DraftInsertRequest {
  /** 目标章号（与当前章不符则忽略，防错位） */
  seq: number;
  /** 草稿正文（纯文本，编辑器按段落插入） */
  text: string;
  /**
   * 插入方式：
   *   · `append` —— 追加到正文末尾（续写）
   *   · `replace` —— 替换当前选区；**没有选区时退化为 append**（扩写）
   */
  mode: 'append' | 'replace';
  /** 自增令牌：同一段草稿连点两次也能重新触发 */
  token: number;
}

interface DeskState {
  /** 当前打开的章节 id */
  activeChapterId: number | null;
  setActiveChapter: (id: number | null) => void;

  /** 右栏 Tab：默认停在「召回」（TC-28） */
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;

  /** 焦点模式：中栏全屏，隐藏左右栏（Ctrl+Shift+F） */
  focusMode: boolean;
  toggleFocusMode: () => void;

  /** 左右栏手动折叠 */
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;

  /**
   * 正文重载令牌：版本回滚等"同一章正文被替换"的场景下自增，
   * 让编辑器重新载入正文（否则 `chapterId` 未变会被去重守卫挡住）。
   */
  contentReloadKey: number;
  reloadChapterContent: () => void;

  /** 待处理的「片段高亮」请求；编辑器消费后回写 null，避免重挂载时误触发 */
  chunkHighlight: ChunkHighlightRequest | null;
  requestChunkHighlight: (seq: number, text: string) => void;
  clearChunkHighlight: () => void;

  /** 待处理的「插入 AI 草稿」请求；同样由编辑器消费后回写 null */
  draftInsert: DraftInsertRequest | null;
  requestDraftInsert: (seq: number, text: string, mode: DraftInsertRequest['mode']) => void;
  clearDraftInsert: () => void;

  /** 编辑器上报的瞬时状态，供顶栏 / 状态栏读取 */
  wordCount: number;
  setWordCount: (n: number) => void;
  saveStatus: AutosaveStatus;
  savedAt: string | null;
  setSaveState: (status: AutosaveStatus, savedAt: string | null) => void;

  /** 召回注入预算（状态栏显示） */
  recallChars: number;
  recallTokens: number;
  setRecallBudget: (chars: number, tokens: number) => void;

  /**
   * 编辑器里当前选中的文本（由编辑器实时上报）。
   *
   * 为什么要放进 store：顶栏的「扩写」需要拿到选中文本，但顶栏**不是**编辑器的父组件，
   * 没有别的办法在不做大规模 prop 穿透的前提下拿到它。放 store 里也让将来任何
   * 需要"对选区做事"的能力（比如翻译选中段落）都能直接复用。
   * 空字符串表示没有选区。
   */
  selectionText: string;
  setSelectionText: (text: string) => void;
}

/**
 * 写作台会话内 UI 状态（客户端状态 → Zustand；服务端状态 → TanStack Query，对齐 09 §2.2）。
 * 不做持久化：刷新后回到"未选章节"，由页面自动选中第一章。
 */

/** 高亮令牌计数（模块级单调自增，跨 clear 仍递增 → 同一片段连点两次必定重新触发） */
let highlightTokenSeed = 0;
/** 草稿插入令牌计数（同上，保证连点两次都能触发） */
let insertTokenSeed = 0;

export const useDeskStore = create<DeskState>((set) => ({
  activeChapterId: null,
  setActiveChapter: (id) => set({ activeChapterId: id }),

  rightTab: 'recall',
  setRightTab: (tab) => set({ rightTab: tab }),

  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  leftCollapsed: false,
  rightCollapsed: false,
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),

  contentReloadKey: 0,
  reloadChapterContent: () => set((s) => ({ contentReloadKey: s.contentReloadKey + 1 })),

  chunkHighlight: null,
  requestChunkHighlight: (seq, text) => {
    highlightTokenSeed += 1;
    set({ chunkHighlight: { seq, text, token: highlightTokenSeed } });
  },
  clearChunkHighlight: () => set({ chunkHighlight: null }),

  draftInsert: null,
  requestDraftInsert: (seq, text, mode) => {
    insertTokenSeed += 1;
    set({ draftInsert: { seq, text, mode, token: insertTokenSeed } });
  },
  clearDraftInsert: () => set({ draftInsert: null }),

  wordCount: 0,
  setWordCount: (n) => set({ wordCount: n }),
  saveStatus: 'idle',
  savedAt: null,
  setSaveState: (status, savedAt) => set({ saveStatus: status, savedAt }),

  recallChars: 0,
  recallTokens: 0,
  setRecallBudget: (chars, tokens) => set({ recallChars: chars, recallTokens: tokens }),

  selectionText: '',
  setSelectionText: (text) => set({ selectionText: text }),
}));
