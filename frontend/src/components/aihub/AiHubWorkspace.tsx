import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { userMessageOf } from '@/api/client';
import { useChapterBriefs } from '@/hooks/queries';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useHubChat } from '@/hooks/mutations/aiHub';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/stores/toastStore';
import { ChatHead } from './ChatHead';
import { ChatStream } from './ChatStream';
import { ContextPanel } from './ContextPanel';
import { HubComposer } from './HubComposer';
import { NoBookBar } from './NoBookBar';
import { ModelWarn } from './ModelWarn';
import { SessionRail } from './SessionRail';
import {
  HUB_ACTIONS,
  HUB_WELCOME,
  actionOf,
  newSession,
  titleFromText,
} from './hubModel';
import type { HubMessage, HubSession } from './hubModel';
import { useHubReadings } from './useHubReadings';
import { useHubDrafts } from './useHubDrafts';
import { loadHubArchive, saveHubArchive } from './hubArchive';
import type { HubArchive } from './hubArchive';
import styles from './hub.module.css';

function initialArchive(slug: string): HubArchive {
  const saved = loadHubArchive(slug);
  if (saved) return saved;
  const fresh = newSession();
  return { sessions: [fresh], activeId: fresh.id };
}

/**
 * AI 对话工作台（`/chat` 与 `/book/:slug/chat`）—— 唯一的 AI 对话入口。
 * **无作品也能进**（slug=''）：进来就聊，服务端走空记忆包；写草稿时会提示先关联作品。
 *
 * 三栏：左会话列表 / 中对话流 / 右「这次 AI 读了什么」。
 * 对话史存本机（`hubArchive`，按作品分键）；**上下文由服务端组装**，前端从不自己拼。
 * 能力分两类（见 `HUB_ACTIONS`）：产草稿的**必须用户点「确认写入」才落库**，正文只能复制走；
 * 只读的（校对/审校/敏感词）只出报告、**没有任何落库路径**（见 `useHubReadings`）。
 */
export function AiHubWorkspace({ slug }: { slug: string }) {
  const chapters = useChapterBriefs(slug);
  const capabilities = useCapabilities();
  const noModel = capabilities.data?.llm_configured === false;
  const chat = useHubChat(slug);

  const [archive, setArchive] = useState<HubArchive>(() => initialArchive(slug));
  const [actionKey, setActionKey] = useState('auto');
  const [chapterId, setChapterId] = useState<number | null>(null);
  /** 联网开关：开着时服务端会让模型判断要不要实时检索外部资料 */
  const [useWeb, setUseWeb] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HubSession | null>(null);
  const autoPicked = useRef(false);

  // 退出再进来还在 —— 每次改动都落盘；存不上要**说出来**（数据没丢、认知不能丢）
  const storageWarned = useRef(false);
  useEffect(() => {
    if (saveHubArchive(slug, archive) || storageWarned.current) return;
    storageWarned.current = true;
    toast.error('本机存储写入失败（可能已满或被禁用），本次会话刷新后不会保留。');
  }, [slug, archive]);

  // 默认落在最新一章：用户说"接着写"时最自然的落点
  useEffect(() => {
    if (autoPicked.current) return;
    const list = chapters.data ?? [];
    if (list.length === 0) return;
    autoPicked.current = true;
    setChapterId(list[list.length - 1].id);
  }, [chapters.data]);

  const active = useMemo(
    () => archive.sessions.find((s) => s.id === archive.activeId) ?? archive.sessions[0] ?? null,
    [archive],
  );
  // 显式 useMemo：否则每次渲染都新建数组，下游 useMemo（右栏的"读了什么"）会一直重算
  const messages = useMemo(() => active?.messages ?? [], [active]);
  const lastUsed = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const used = messages[i].contextUsed;
      if (messages[i].role === 'assistant' && used) return used;
    }
    return null;
  }, [messages]);

  const patchSession = useCallback((id: string, fn: (s: HubSession) => HubSession) => {
    setArchive((a) => ({ ...a, sessions: a.sessions.map((s) => (s.id === id ? fn(s) : s)) }));
  }, []);

  const chapterList = chapters.data ?? [];
  // 无作品模式只留不依赖具体书的对话动作（草稿能聊出来，写入时会被引导先关联作品）
  const availableActions = useMemo(
    () => (slug ? HUB_ACTIONS : HUB_ACTIONS.filter((a) => !a.needsBook && !(a.mode === 'chat' && a.needsChapter))),
    [slug],
  );

  // 只读能力（校对 / 审校 / 敏感词）：结果只进对话流，不进草稿通道
  const readings = useHubReadings({ slug, activeId: active?.id ?? null, patchSession });
  /** 草稿的人工闸门：确认 / 丢弃（含「立项卡 → 一键建书」的交接） */
  const drafts = useHubDrafts({ slug, archive, active, patchSession });

  const createSession = () => {
    const fresh = newSession();
    setArchive((a) => ({ sessions: [...a.sessions, fresh], activeId: fresh.id }));
  };

  const renameSession = (id: string, title: string) =>
    patchSession(id, (s) => ({ ...s, title }));

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setArchive((a) => {
      const kept = a.sessions.filter((s) => s.id !== id);
      if (kept.length === 0) {
        const fresh = newSession();
        return { sessions: [fresh], activeId: fresh.id };
      }
      return { sessions: kept, activeId: a.activeId === id ? kept[kept.length - 1].id : a.activeId };
    });
    setDeleteTarget(null);
  };

  const send = (text: string) => {
    if (!active) return;
    const action = actionOf(actionKey);

    // 只读的三项（校对/审校/敏感词）不走对话端点：只出报告，没有任何落库路径
    if (action.mode !== 'chat') {
      readings.run({
        action,
        text,
        startIndex: active.messages.length,
        chapter: chapterList.find((c) => c.id === chapterId) ?? null,
      });
      return;
    }

    const sessionId = active.id;
    const now = Date.now();
    const userMsg: HubMessage = { role: 'user', content: text, at: now };
    const history = [...active.messages, userMsg];
    patchSession(sessionId, (s) => ({
      ...s,
      title: s.messages.length === 0 ? titleFromText(text) : s.title,
      messages: history,
      updatedAt: now,
    }));

    chat.run(
      {
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        chapter_id: chapterId,
        intent: actionKey === 'auto' ? null : actionOf(actionKey).intent,
        use_web: useWeb,
      },
      {
        onFinal: (res) => {
          if (res.corrected) toast.info('刚才的回复中途跑偏了，已按完整重写的版本更正');
          const at = Date.now();
          patchSession(sessionId, (s) => ({
            ...s,
            messages: [
              ...s.messages,
              {
                role: 'assistant',
                content: res.reply,
                draft: res.draft ?? null,
                contextUsed: res.context_used,
                webSources: res.web_sources?.length ? res.web_sources : null,
                webAttempted: res.web_attempted === true,
                at,
              },
            ],
            updatedAt: at,
          }));
        },
        onError: (e) => toast.error(userMessageOf(e)),
      },
    );
  };

  const needChapter = actionOf(actionKey).needsChapter && chapterId === null;

  return (
    <div className={styles.hub}>
      <SessionRail
        slug={slug}
        sessions={archive.sessions}
        activeId={active?.id ?? null}
        onSelect={(id) => setArchive((a) => ({ ...a, activeId: id }))}
        onCreate={createSession}
        onRename={renameSession}
        onDelete={(id) =>
          setDeleteTarget(archive.sessions.find((s) => s.id === id) ?? null)
        }
      />

      <section className={styles.main}>
        <ChatHead chapterId={chapterId} onChapterChange={setChapterId} chapters={chapterList} />

        {!slug ? <NoBookBar /> : null}

        {noModel ? <ModelWarn slug={slug} /> : null}

        <ChatStream
          slug={slug}
          messages={messages}
          opening={HUB_WELCOME}
          pending={chat.busy || readings.busy}
          pendingText={readings.busy ? readings.busyText : chat.streamText || undefined}
          busyIndex={drafts.busyIndex}
          streamIndex={readings.streamIndex}
          onConfirmDraft={drafts.confirm}
          onDiscardDraft={drafts.discard}
          onPickTitle={drafts.applyTitle}
          onStopReading={readings.stop}
        />

        <HubComposer
          actionKey={actionKey}
          onActionChange={setActionKey}
          useWeb={useWeb}
          onUseWebChange={setUseWeb}
          onSend={send}
          pending={chat.busy || readings.busy}
          disabled={noModel}
          disabledHint="还没配好 AI 模型，配了就能对话、校对和审校。"
          needChapter={needChapter}
          actions={availableActions}
        />
      </section>

      <ContextPanel used={lastUsed} />

      {deleteTarget ? (
        <ConfirmDialog
          open
          title="删除这个对话？"
          confirmLabel="删除"
          cancelLabel="取消"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        >
          <p>{`将删除「${deleteTarget.title}」及其 ${deleteTarget.messages.length} 条对话记录。写进作品的人物、设定和大纲不受影响。`}</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
