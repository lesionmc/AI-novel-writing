/**
 * 草稿的人工闸门（红线 2）：确认 / 丢弃 的全部落库动作集中在这一个 hook。
 *
 * 各类型落点：
 *   · prose        → 永不自动保存，只复制到剪贴板，由作者自己粘贴定稿；
 *   · book_plan    → **无书对话的交接**：确认后建书，并把当前会话存档带进新书（对话不断链）；
 *   · title_options→ AI 出量、人拍板：点某个书名才 PATCH 成正式书名（不点不改）；
 *   · retrospective→ 复制带走（一书一库，跨书复用靠导出/备份，不塞进本作品库）；
 *   · 其余草稿     → 走既有 create 端点写进当前作品（未关联作品时只提示、不写）；
 *   · discard      → 只在本地标记，库里不留痕。
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, userMessageOf } from '@/api/client';
import { bookPath } from '@/lib/slug';
import { toast } from '@/stores/toastStore';
import { useUpdateBook } from '@/hooks/mutations/books';
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
  /** 书名候选卡：点某个书名 → PATCH 为正式书名 */
  applyTitle: (index: number, title: string) => void;
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
  const updateBook = useUpdateBook(slug);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  /** busyIndex 要等下一次渲染才拦住按钮；连点在同一帧里得手挡（防并发 PATCH） */
  const inFlight = useRef(false);

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

  const copyText = (text: string, index: number, doneToast: string) => {
    if (!active) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        patchSession(active.id, (s) => withMarkedDraft(s, index, 'applied'));
        // 「已复制」只在剪贴板真的写进去之后说 —— 失败了别再演成功
        toast.success(doneToast);
      })
      .catch(() => toast.error('复制失败。可以手动选中这段文字复制。'));
  };

  const confirm = (index: number) => {
    if (!active) return;
    const draft = draftAt(index);
    if (!draft) return;
    const sessionId = active.id;

    if (draft.kind === 'prose') {
      // 正文永不自动保存：只复制走，让作者自己粘、自己改、自己定稿
      copyText(draft.text, index, '已复制。到写作台粘贴，改完记得保存。');
      return;
    }

    if (draft.kind === 'retrospective') {
      copyText(draft.content, index, '复盘已复制。存进你的方法论文件夹，下一本直接对着用。');
      return;
    }

    if (draft.kind === 'title_options') {
      // 书名要点具体某一个才算数；「确认」不代拍板，提示即可
      toast.info('看中哪个书名，点它那一行就行 —— 定稿权在你。');
      return;
    }

    if (draft.kind === 'book_plan') {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyIndex(index);
      void (async () => {
        try {
          await createFromPlan(draft, index);
        } catch (e) {
          toast.error(userMessageOf(e));
          inFlight.current = false;
          setBusyIndex(null);
        }
      })();
      return;
    }

    if (!slug) {
      toast.info('还没关联作品 —— 在左栏「当前作品」选一部，再确认写入。'); // 落库必须有归属
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyIndex(index);
    writeDraft.mutate(draft, {
      onSuccess: (res) => {
        patchSession(sessionId, (s) => withMarkedDraft(s, index, 'applied'));
        toast.success(`已把 ${res.written} 条${res.label}写进作品`);
      },
      onError: (e) => toast.error(userMessageOf(e)),
      onSettled: () => {
        inFlight.current = false;
        setBusyIndex(null);
      },
    });
  };

  const applyTitle = (index: number, title: string) => {
    if (!active || !slug) {
      toast.info('还没关联作品 —— 先在左栏选一部，再定书名。');
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    const sessionId = active.id;
    setBusyIndex(index);
    // 走 useUpdateBook：成功后作废书列表/书详情缓存，侧栏和页头立刻显新名
    updateBook.mutate(
      { title },
      {
        onSuccess: () => {
          patchSession(sessionId, (s) => withMarkedDraft(s, index, 'applied'));
          toast.success(`书名定为《${title}》了，随时能再改。`);
        },
        onError: (e) => toast.error(userMessageOf(e)),
        onSettled: () => {
          inFlight.current = false;
          setBusyIndex(null);
        },
      },
    );
  };

  const discard = (index: number) => {
    if (!active) return;
    patchSession(active.id, (s) => withMarkedDraft(s, index, 'discarded'));
    toast.info('已丢弃，没有写进作品');
  };

  return { confirm, discard, applyTitle, busyIndex };
}
