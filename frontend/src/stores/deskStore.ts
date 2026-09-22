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
}

/**
 * 写作台会话内 UI 状态（客户端状态 → Zustand；服务端状态 → TanStack Query，对齐 09 §2.2）。
 * 不做持久化：刷新后回到"未选章节"，由页面自动选中第一章。
 */

/** 高亮令牌计数（模块级单调自增，跨 clear 仍递增 → 同一片段连点两次必定重新触发） */
let highlightTokenSeed = 0;

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

  wordCount: 0,
  setWordCount: (n) => set({ wordCount: n }),
  saveStatus: 'idle',
  savedAt: null,
  setSaveState: (status, savedAt) => set({ saveStatus: status, savedAt }),

  recallChars: 0,
  recallTokens: 0,
  setRecallBudget: (chars, tokens) => set({ recallChars: chars, recallTokens: tokens }),
}));
