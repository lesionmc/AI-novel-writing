/**
 * 草稿的人工闸门（红线 2）：确认 / 丢弃 的全部落库动作集中在这一个 hook。
 *
 * 四类落点：
 *   · prose        → 永不自动保存，只复制到剪贴板，由作者自己粘贴定稿；
 *   · book_plan    → **无书对话的交接**：确认后建书，并把当前会话存档带进新书（对话不断链）；
 *   · 其余草稿     → 走既有 create 端点写进当前作品（未关联作品时只提示、不写）；
 *   · discard      → 只在本地标记，库里不留痕。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, userMessageOf } from '@/api/client';
import { bookPath } from '@/lib/slug';
import { toast } from '@/stores/toastStore';
import { useWriteHubDraft } from '@/hooks/mutations/aiHub';
import { saveHubArchive } from './hubArchive';
import type { HubArchive } from './hubArchive';
import { parseAiChatDraft } from './hubModel';
import type { HubDraft, HubSession } from './hubModel';

function withMarkedDraft(
  session: HubSession,
  index: number,
  state: 'applied' | 'discarded',
): HubSession {
  return {
    ...session,
    messages: session.messages.map((m, i) => (i === index ? { ...m, draftState: state } : m)),
  };
}

export interface HubDraftActions {
  confirm: (index: number) => void;
  discard: (index: number) => void;
  /** 正在落库的草稿下标（DraftCard 的 busy 态） */
  busyIndex: number | null;
}

export function useHubDrafts(opts: {
  slug: string;
  archive: HubArchive;
  active: HubSession | null;
  patchSession: (id: string, fn: (s: HubSession) => HubSession) => void;
}): HubDraftActions {
  const { slug, archive, active, patchSession } = opts;
  const navigate = useNavigate();
  const writeDraft = useWriteHubDraft(slug);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);

  const draftAt = (index: number): HubDraft | null =>
    parseAiChatDraft(active?.messages[index]?.draft);

  /** 立项卡 → 建书 + 会话交接：这是「聊完即开书」流程的落点 */
  const createFromPlan = async (draft: Extract<HubDraft, { kind: 'book_plan' }>, index: number) => {
    if (!active) return;
    const created = await api.createBook({
      title: draft.title,
      genre: draft.genre,
      readers: draft.readers,
      premise: draft.premise,
      target_words: draft.targetWords ?? 0,
    });
    const carried: HubArchive = {
      ...archive,
      sessions: archive.sessions.map((s) =>
        s.id === active.id ? withMarkedDraft(s, index, 'applied') : s,
      ),
    };
    saveHubArchive(created.slug, carried);
    toast.success(`《${created.title}》建好了，这轮对话已带进新书，可以接着往下聊`);
    navigate(bookPath(created.slug, '/chat'));
  };

  const confirm = (index: number) => {
    if (!active) return;
    const draft = draftAt(index);
    if (!draft) return;
    const sessionId = active.id;

    if (draft.kind === 'prose') {
      // 正文永不自动保存：只复制走，让作者自己粘、自己改、自己定稿
      void navigator.clipboard
        .writeText(draft.text)
        .then(() => {
          patchSession(sessionId, (s) => withMarkedDraft(s, index, 'applied'));
          toast.success('已复制。到写作台粘贴，改完记得保存。');
        })
        .catch(() => toast.error('复制失败。可以手动选中这段文字复制。'));
      return;
    }

    if (draft.kind === 'book_plan') {
      setBusyIndex(index);
      void (async () => {
        try {
          await createFromPlan(draft, index);
        } catch (e) {
          toast.error(userMessageOf(e));
          setBusyIndex(null);
        }
      })();
      return;
    }

    if (!slug) {
      toast.info('还没关联作品 —— 在左栏「当前作品」选一部，再确认写入。'); // 落库必须有归属
      return;
    }
    setBusyIndex(index);
    writeDraft.mutate(draft, {
      onSuccess: (res) => {
        patchSession(sessionId, (s) => withMarkedDraft(s, index, 'applied'));
        toast.success(`已把 ${res.written} 条${res.label}写进作品`);
      },
      onError: (e) => toast.error(userMessageOf(e)),
      onSettled: () => setBusyIndex(null),
    });
  };

  const discard = (index: number) => {
    if (!active) return;
    patchSession(active.id, (s) => withMarkedDraft(s, index, 'discarded'));
    toast.info('已丢弃，没有写进作品');
  };

  return { confirm, discard, busyIndex };
}
