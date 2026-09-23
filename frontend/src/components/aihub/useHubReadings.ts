/**
 * 对话工作台里的**只读能力**跑腿层（校对 / 一致性审校 / 敏感词自查）。
 *
 * ---------------------------------------------------------------------------
 * 三条纪律（改这里前先读）
 * ---------------------------------------------------------------------------
 * ① **只读**：这三项只产生"报告"，不产出草稿、不落库 —— 本文件里没有、
 *    也不许出现任何 create/update 端点的调用。报告只往对话流里追加一条消息。
 * ② **不另造流程**：一致性审校复用既有的 `api.auditConsistencyStream`（SSE 流式解析
 *    已经由 `api/request.ts` 的 `streamSse` 处理好，质检页也是走它），
 *    校对 / 敏感词复用 `api.proofread` / `api.auditSensitive`。
 * ③ **未配模型要区别对待（红线 3）**：校对与审校要读正文、必须有模型，没配时如实提示；
 *    敏感词自查是纯本地词库匹配（后端不调 AI、不联网），**没配模型也必须能跑**，
 *    且词库为空时必须说清"本次没有检查任何内容"（禁止假安全感）。
 */

import { useCallback, useRef, useState } from 'react';
import { api, userMessageOf } from '@/api/client';
import { toast } from '@/stores/toastStore';
import { appendConflict, emptyReading } from './hubReading';
import type { HubReading } from './hubReading';
import { titleFromText } from './hubModel';
import type { HubAction, HubMessage, HubSession } from './hubModel';

export interface HubReadingRunArgs {
  action: HubAction;
  /** 用户输入；空串时用一句默认文案代替（这三项本来就不一定要打字） */
  text: string;
  /** 追加前会话里的消息条数（= 用户消息的下标） */
  startIndex: number;
  /** 用户选中的章节（校对必填；敏感词用来做"这一章命中几条"的对照） */
  chapter: { id: number; seq: number } | null;
}

export interface HubReadingsApi {
  /** 有只读能力在跑（用于打字指示与按钮态） */
  busy: boolean;
  busyText: string;
  /** 正在流式累积的消息下标（一致性审校）；非流式任务为 null */
  streamIndex: number | null;
  run: (args: HubReadingRunArgs) => void;
  stop: () => void;
}

function defaultLabel(action: HubAction, chapter: { seq: number } | null): string {
  switch (action.mode) {
    case 'proofread':
      return `校对第 ${chapter?.seq ?? '?'} 章`;
    case 'consistency':
      return '通读全书，看看有没有前后对不上';
    case 'sensitive':
      return '扫一遍敏感词';
    default:
      return action.label;
  }
}

export function useHubReadings(args: {
  slug: string;
  activeId: string | null;
  /** 工作台里既有的「按 id 更新会话」函数 */
  patchSession: (id: string, fn: (s: HubSession) => HubSession) => void;
}): HubReadingsApi {
  const { slug, activeId, patchSession } = args;
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [streamIndex, setStreamIndex] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** 追加「用户一句话 + AI 一条报告消息」；返回报告消息的下标 */
  const openReport = useCallback(
    (sid: string, startIndex: number, label: string, content: string, reading: HubReading | null) => {
      const at = Date.now();
      const user: HubMessage = { role: 'user', content: label, at };
      const ai: HubMessage = { role: 'assistant', content, reading, at: at + 1 };
      patchSession(sid, (s) => ({
        ...s,
        title: s.messages.length === 0 ? titleFromText(label) : s.title,
        messages: [...s.messages, user, ai],
        updatedAt: at,
      }));
      return startIndex + 1;
    },
    [patchSession],
  );

  const patchAt = useCallback(
    (sid: string, index: number, fn: (m: HubMessage) => HubMessage) => {
      patchSession(sid, (s) => ({
        ...s,
        messages: s.messages.map((m, i) => (i === index ? fn(m) : m)),
      }));
    },
    [patchSession],
  );

  const runConsistency = useCallback(
    async (sid: string, index: number) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await api.auditConsistencyStream(
          slug,
          {
            onProgress: (p) =>
              patchAt(sid, index, (m) => ({ ...m, content: `正在通读全书… ${p.percent}% · ${p.note}` })),
            onConflict: (c) =>
              patchAt(sid, index, (m) => ({
                ...m,
                reading: m.reading ? appendConflict(m.reading, c) : emptyReading('consistency'),
              })),
            onDone: (s) =>
              patchAt(sid, index, (m) => ({
                ...m,
                reading:
                  m.reading?.kind === 'consistency'
                    ? { ...m.reading, summary: s }
                    : { kind: 'consistency', conflicts: [], summary: s },
                content: s.total
                  ? `通读完了：共 ${s.total} 条（严重 ${s.high} / 中等 ${s.medium} / 轻微 ${s.low}）。下面按严重程度排好了。`
                  : `通读了 ${s.reviewed} 章，没发现前后对不上的地方。`,
              })),
          },
          { signal: controller.signal },
        );
      } catch (e) {
        if (controller.signal.aborted) {
          patchAt(sid, index, (m) => ({ ...m, content: '已停止。已经发现的几条留在下面，随时可以重跑。' }));
        } else {
          patchAt(sid, index, (m) => ({ ...m, content: userMessageOf(e), reading: null }));
          toast.error(userMessageOf(e));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
        setStreamIndex(null);
      }
    },
    [patchAt, slug],
  );

  const runProofread = useCallback(
    async (sid: string, index: number, chapterId: number) => {
      try {
        const res = await api.proofread(chapterId);
        patchAt(sid, index, (m) => ({
          ...m,
          reading: { kind: 'proofread', issues: res.issues },
          content: res.issues.length
            ? `这一章挑了 ${res.issues.length} 处，都是小毛病，要不要改你自己定。`
            : '这一章没发现明显的错别字、病句和前后不一致。',
        }));
      } catch (e) {
        patchAt(sid, index, (m) => ({ ...m, content: userMessageOf(e), reading: null }));
        toast.error(userMessageOf(e));
      } finally {
        setBusy(false);
      }
    },
    [patchAt],
  );

  const runSensitive = useCallback(
    async (sid: string, index: number, chapterSeq: number | null) => {
      try {
        const res = await api.auditSensitive(slug);
        const mine = chapterSeq
          ? res.hits.filter((h) => h.chapter_seq === chapterSeq)
          : [];
        const scope = chapterSeq
          ? `扫的是全书；你选的第 ${chapterSeq} 章命中 ${mine.length} 处。`
          : '扫的是全书。';
        patchAt(sid, index, (m) => ({
          ...m,
          reading: { kind: 'sensitive', hits: res.hits, wordlistAvailable: res.wordlist_available },
          content: res.wordlist_available
            ? `扫完了，全书命中 ${res.total_hits} 处。${scope}`
            : `词库还没配，所以这次扫描没有检查任何内容 —— 命中 0 处不代表没问题。${scope}去设置里放一份词表再扫。`,
        }));
      } catch (e) {
        patchAt(sid, index, (m) => ({ ...m, content: userMessageOf(e), reading: null }));
        toast.error(userMessageOf(e));
      } finally {
        setBusy(false);
      }
    },
    [patchAt, slug],
  );

  const run = useCallback(
    (runArgs: HubReadingRunArgs) => {
      const { action, chapter, startIndex } = runArgs;
      const sid = activeId;
      if (!sid || busy) return;
      const label = runArgs.text.trim() || defaultLabel(action, chapter);

      if (action.mode === 'proofread') {
        if (!chapter) {
          toast.info('先在上面选一章，我才知道校对哪一章。');
          return;
        }
        setBusy(true);
        setBusyText(`正在逐句看第 ${chapter.seq} 章…`);
        const index = openReport(sid, startIndex, label, '正在逐句看这一章…', null);
        void runProofread(sid, index, chapter.id);
        return;
      }

      if (action.mode === 'consistency') {
        setBusy(true);
        setBusyText('正在通读全书…');
        setStreamIndex(startIndex + 1);
        const index = openReport(sid, startIndex, label, '正在通读全书…', emptyReading('consistency'));
        void runConsistency(sid, index);
        return;
      }

      setBusy(true);
      setBusyText('正在按本地词库扫全书…');
      const index = openReport(sid, startIndex, label, '正在按本地词库扫全书…', null);
      void runSensitive(sid, index, chapter?.seq ?? null);
    },
    [activeId, busy, openReport, runConsistency, runProofread, runSensitive],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { busy, busyText, streamIndex, run, stop };
}
