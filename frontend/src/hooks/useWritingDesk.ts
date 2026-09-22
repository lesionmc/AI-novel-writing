import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Chapter, ConfirmWritebackRequest, WritingMode } from '@/types/api';
import { isApiError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { EMPTY_WRITEBACK_SUGGESTION, writebackDoneText } from '@/components/writingdesk/writebackModel';
import { useBook, useChapter, useChapterBriefs } from '@/hooks/queries';
import { useRecall } from '@/hooks/useRecall';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useChunkJump } from '@/hooks/useChunkJump';
import { useCreateChapter, useDeleteChapter, useSaveChapter } from '@/hooks/mutations/chapters';
import { useConfirmWriteback, useFinalizeChapter } from '@/hooks/mutations/memory';
import { useUpdateForeshadow } from '@/hooks/mutations/settings';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';
import type { EditorDoc } from '@/components/writingdesk/Editor';

/**
 * 写作台控制器：把查询 / Zustand UI 状态 / 派生值 / 全部副作用收敛到一处，
 * 让 `WritingDeskPage` 只剩骨架与 JSX（单文件 ≤ 300 行纪律）。
 *
 * 红线落地：
 *  1) 进章**立即渲染编辑器**（先用缓存内容），召回并行加载，**绝不阻塞编辑**（TC-28）
 *  2) 召回分级展示由 RecallPanel 负责；回写弹窗默认全勾、可编辑可删、不做二次确认；取消 = 无写入
 */
export function useWritingDesk() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const isWide = useMediaQuery('(min-width: 1200px)');
  const isMid = useMediaQuery('(min-width: 900px)');

  const bookQuery = useBook(slug);
  const briefsQuery = useChapterBriefs(slug);

  const s = useDeskStore();
  const {
    activeChapterId,
    setActiveChapter,
    rightTab,
    setRightTab,
    focusMode,
    toggleFocusMode,
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
    setRecallBudget,
  } = s;

  const chapterQuery = useChapter(activeChapterId);
  const recallQuery = useRecall(activeChapterId);
  const capabilitiesQuery = useCapabilities();

  const saveChapter = useSaveChapter(slug);
  const createChapter = useCreateChapter(slug);
  const deleteChapter = useDeleteChapter(slug);
  const finalize = useFinalizeChapter();
  const confirmWriteback = useConfirmWriteback(slug);
  const updateForeshadow = useUpdateForeshadow(slug);

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [writebackOpen, setWritebackOpen] = useState(false);
  const [markingId, setMarkingId] = useState<number | null>(null);
  /** 兜底：即便前置判断说"有模型"，若 finalize 实返 LLM_NOT_CONFIGURED 也切手动录入 */
  const [manualFallback, setManualFallback] = useState(false);

  const briefs = useMemo(() => briefsQuery.data ?? [], [briefsQuery.data]);
  const writingMode: WritingMode = bookQuery.data?.writing_mode ?? 'assist';

  useEffect(() => {
    if (activeChapterId !== null) return;
    const first = briefs[0];
    if (first) setActiveChapter(first.id);
  }, [briefs, activeChapterId, setActiveChapter]);

  useEffect(() => {
    const b = recallQuery.data?.budget;
    setRecallBudget(b?.injected_chars ?? 0, b?.injected_tokens_est ?? 0);
  }, [recallQuery.data, setRecallBudget]);

  // 先用缓存内容渲染（不等接口）—— 让用户点开就能写
  const cached =
    activeChapterId !== null
      ? queryClient.getQueryData<Chapter>(queryKeys.chapter(activeChapterId))
      : undefined;
  const chapter = chapterQuery.data ?? cached;
  const content = chapter?.content ?? '';
  const contentReady = Boolean(chapter);

  const activeBrief = briefs.find((c) => c.id === activeChapterId);
  const seq = chapter?.seq ?? activeBrief?.seq ?? null;
  const chapterTitle = chapter?.title ?? activeBrief?.title ?? '';
  const bookWordCount = useMemo(
    () => briefs.reduce((sum, c) => sum + (c.word_count || 0), 0),
    [briefs],
  );
  const activeIndex = briefs.findIndex((c) => c.id === activeChapterId);

  const handleSave = useCallback(
    async (doc: EditorDoc) => {
      if (activeChapterId === null) return;
      await saveChapter.mutateAsync({
        id: activeChapterId,
        payload: { content: doc.html, title: doc.title.trim() || null },
      });
    },
    [activeChapterId, saveChapter],
  );
  /* ---------------- 完成本章 → 回写确认 ---------------- */
  // 契约 RecallResult 无 degraded → 用全局 capabilities.llm_configured 判「未配模型」
  const noModel = capabilitiesQuery.data?.llm_configured === false;
  const manualWriteback = writingMode === 'manual' || noModel || manualFallback;
  const openWriteback = () => {
    if (activeChapterId === null) return;
    setWritebackOpen(true);
    if (manualWriteback) return;
    finalize.mutate(activeChapterId, {
      // 兜底比任何前置判断都可靠：模型可能运行途中不可用 / 密钥失效
      onError: (err) => {
        if (isApiError(err) && err.code === 'LLM_NOT_CONFIGURED') setManualFallback(true);
      },
    });
  };
  const handleConfirmWriteback = (payload: ConfirmWritebackRequest) => {
    if (activeChapterId === null) return;
    confirmWriteback.mutate(
      { chapterId: activeChapterId, payload },
      {
        onSuccess: (res) => {
          setWritebackOpen(false);
          finalize.reset();
          // 报出写入条数并让右栏刷新（QA M5：只说"已保存"用户以为没存上）
          toast.success(writebackDoneText(res));
          // 契约 confirm 响应无 next_chapter_id：用当前章 seq 从章节列表推下一章
          const next = seq !== null ? briefs.find((c) => c.seq === seq + 1) : undefined;
          if (next) setActiveChapter(next.id);
        },
      },
    );
  };

  const cancelWriteback = () => {
    // 取消 = 什么都不做：章节仍为 draft，character_state 无新增（TC-24）
    setWritebackOpen(false);
    finalize.reset();
    confirmWriteback.reset();
  };

  /* ---------------- 其他动作 ---------------- */
  const selectChapter = useCallback(
    (id: number) => {
      setActiveChapter(id);
      setRightTab('recall');
    },
    [setActiveChapter, setRightTab],
  );

  const createAndSelect = () => {
    createChapter.mutate(
      {},
      {
        onSuccess: (ch) => {
          setActiveChapter(ch.id);
          toast.success(`已新建第 ${ch.seq} 章`);
        },
      },
    );
  };

  // TC-33：「跳到该章」编排（含片段高亮请求），抽离以守住单文件行数纪律
  const jumpToSeq = useChunkJump(briefs, selectChapter);

  const markForeshadowClosed = (id: number) => {
    setMarkingId(id);
    updateForeshadow.mutate(
      { id, payload: { status: 'closed', actual_payoff_seq: seq } },
      {
        onSuccess: async () => {
          toast.success('已标记为已回收');
          await recallQuery.refetch();
        },
        onSettled: () => setMarkingId(null),
      },
    );
  };

  const confirmDeleteChapter = () => {
    if (activeChapterId === null) return;
    const id = activeChapterId;
    const fallback = briefs.find((c) => c.id !== id)?.id ?? null;
    deleteChapter.mutate(id, {
      onSuccess: () => {
        toast.success('章节已删除');
        setDeleteOpen(false);
        setActiveChapter(fallback);
      },
    });
  };

  const expandLeft = () => {
    if (focusMode) toggleFocusMode();
    if (leftCollapsed) toggleLeft();
  };
  const expandRight = () => {
    if (focusMode) toggleFocusMode();
    if (rightCollapsed) toggleRight();
  };

  const writebackSuggestions = manualWriteback
    ? EMPTY_WRITEBACK_SUGGESTION
    : (finalize.data ?? null);

  return {
    slug,
    navigate,
    toLibrary: () => navigate('/'),
    toConfig: () => navigate(`/book/${encodeURIComponent(slug)}/config`),
    toProfile: (name: string) =>
      navigate(`/book/${encodeURIComponent(slug)}/settings?tab=characters&highlight=${encodeURIComponent(name)}`),

    online,
    isWide,
    isMid,
    focusMode,
    leftCollapsed,
    rightCollapsed,

    bookTitle: bookQuery.data?.title ?? '',
    bookError: bookQuery.isError,
    writingMode,
    briefs,
    briefsPending: briefsQuery.isPending,

    activeChapterId,
    content,
    contentReady,
    contentReloadKey: s.contentReloadKey,
    seq,
    chapterTitle,
    bookWordCount,
    activeIndex,

    chapterQuery,
    recallQuery,
    rightTab,
    setRightTab,
    wordCount: s.wordCount,
    saveStatus: s.saveStatus,
    savedAt: s.savedAt,
    recallChars: s.recallChars,
    recallTokens: s.recallTokens,
    onToggleFocus: toggleFocusMode,

    capabilities: capabilitiesQuery.data,
    onRefetchCapabilities: () => void capabilitiesQuery.refetch(),

    versionsOpen,
    setVersionsOpen,
    deleteOpen,
    setDeleteOpen,
    deleting: deleteChapter.isPending,
    deleteError: deleteChapter.error,
    confirmDeleteChapter,

    writebackOpen,
    manualWriteback,
    noModel,
    writebackSuggestions,
    writebackLoading: !manualWriteback && finalize.isPending,
    writebackError: manualWriteback ? null : finalize.error,
    confirming: confirmWriteback.isPending,
    confirmError: confirmWriteback.error,
    markingId,
    finalizing: finalize.isPending,

    handleSave,
    openWriteback,
    handleConfirmWriteback,
    cancelWriteback,
    retryFinalize: () => activeChapterId !== null && finalize.mutate(activeChapterId),
    selectChapter,
    createAndSelect,
    creating: createChapter.isPending,
    jumpToSeq,
    markForeshadowClosed,
    expandLeft,
    expandRight,
    onPrev: () => activeIndex > 0 && selectChapter(briefs[activeIndex - 1].id),
    onNext: () =>
      activeIndex >= 0 && activeIndex < briefs.length - 1 && selectChapter(briefs[activeIndex + 1].id),
  };
}
