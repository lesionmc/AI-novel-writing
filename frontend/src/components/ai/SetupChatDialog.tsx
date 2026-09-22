import { useEffect, useState } from 'react';
import type { BookContext, SetupChatMessage } from '@/types/api';
import { useSetupChat, useWriteSetupDraft, type WriteSetupDraftResult } from '@/hooks/mutations/ai';
import { AiUnavailableNotice } from '@/components/common/AiUnavailableNotice';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Modal } from '@/components/common/Modal';
import { clearSetupChat, loadSetupChat, saveSetupChat } from './setupChatArchive';
import { ChatTranscript } from './ChatTranscript';
import { SetupDraftReview } from './SetupDraftReview';
import {
  SETUP_CHAT_OPENING,
  toCharacterWrite,
  toDraftState,
  toWorldWrite,
  type DraftState,
} from './aiModel';
import styles from './ai.module.css';

export interface SetupChatDialogProps {
  slug: string;
  bookContext: BookContext;
  noModel: boolean;
  onOpenConfig: () => void;
  onClose: () => void;
  /** 写入成功后回调（toast / 切 Tab） */
  onWritten: (result: WriteSetupDraftResult) => void;
}

const OPENING: SetupChatMessage = { role: 'assistant', content: SETUP_CHAT_OPENING };

/**
 * AI 对话式建设定 —— 两态：对话流 ↔ 草稿确认。
 * -----------------------------------------------------------------------------
 * 红线（team-lead 明令，不得自作主张）：
 *   1. AI **只出草稿**，绝不直接入库 —— 必须用户点「确认并写入」才调 create 端点。
 *   2. `role` / `category` 用**英文枚举**（在 aiModel 里映射，界面只显示中文标签）。
 *   3. 未配模型时入口不藏，就地给可读引导（AiUnavailableNotice），不弹 alert。
 */
export function SetupChatDialog({
  slug,
  bookContext,
  noModel,
  onOpenConfig,
  onClose,
  onWritten,
}: SetupChatDialogProps) {
  // 会话留存：父级每次打开都会 chatKey+1 强制重挂载，只靠 useState 必然清空。
  // 首帧从本地存档恢复（没有存档则从开场白开始），之后每次变化写回存档。
  const [archive] = useState(() => loadSetupChat(slug));
  const [messages, setMessages] = useState<SetupChatMessage[]>(
    () => archive?.messages ?? [OPENING],
  );
  const [draft, setDraft] = useState<DraftState | null>(() => archive?.draft ?? null);
  const chat = useSetupChat();
  const write = useWriteSetupDraft(slug);

  useEffect(() => {
    saveSetupChat(slug, { messages, draft });
  }, [slug, messages, draft]);

  const runChat = (msgs: SetupChatMessage[]) => {
    chat.mutate(
      { messages: msgs, book_context: bookContext },
      {
        onSuccess: (res) => {
          setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
          if (res.done && res.draft) setDraft(toDraftState(res.draft));
        },
      },
    );
  };

  const send = (text: string) => {
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    runChat(next);
  };

  const confirmWrite = () => {
    if (!draft) return;
    const characters = draft.characters
      .filter((r) => r.checked && r.value.name.trim())
      .map((r) => toCharacterWrite(r.value));
    const worldEntries = draft.worldEntries
      .filter((r) => r.checked && r.value.name.trim())
      .map((r) => toWorldWrite(r.value));
    write.mutate(
      { characters, worldEntries },
      {
        onSuccess: (res) => {
          // 内容已落库。清掉存档并**丢弃草稿** ——
          // 否则重新打开时草稿被恢复，用户再点一次「确认并写入」会重复插入人物/词条。
          // 对话正文保留（就是一段文字，重复无害），方便回看刚才聊了什么。
          clearSetupChat(slug);
          setDraft(null);
          onWritten(res);
        },
      },
    );
  };

  const checkedCount = draft
    ? draft.characters.filter((r) => r.checked).length +
      draft.worldEntries.filter((r) => r.checked).length
    : 0;

  const inReview = draft !== null;
  const title = inReview ? '确认一下草稿' : '跟 AI 聊聊';
  const subtitle = inReview
    ? '勾掉不要的、改改不对的，只有确认后才会写进设定库。'
    : '想到哪说到哪。我来帮你把人物和世界观理顺，你改改就行。'
      + '（对话会自动留在本机，关掉再打开还在）';

  const footer = inReview ? (
    <>
      <Button variant="ghost" onClick={() => setDraft(null)} disabled={write.isPending}>
        返回继续聊
      </Button>
      <Button
        variant="accent"
        icon="check"
        loading={write.isPending}
        disabled={checkedCount === 0}
        onClick={confirmWrite}
      >
        确认并写入设定库
      </Button>
    </>
  ) : (
    <Button variant="ghost" onClick={onClose} disabled={chat.isPending}>
      关闭
    </Button>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      subtitle={subtitle}
      closeOnOverlay={!chat.isPending && !write.isPending}
      disableEsc={chat.isPending || write.isPending}
      footer={footer}
    >
      {noModel ? (
        <AiUnavailableNotice onOpenConfig={onOpenConfig} configLabel="去配置模型">
          这个功能要用模型来生成草稿。配置一个模型后，聊几句就能把人物卡和世界观建起来。
        </AiUnavailableNotice>
      ) : write.isError ? (
        <div className={styles.review}>
          <ErrorBar error={write.error} onRetry={confirmWrite} />
        </div>
      ) : inReview ? (
        <SetupDraftReview draft={draft} onChange={setDraft} />
      ) : (
        <div className={styles.chat}>
          {chat.isError ? (
            <ErrorBar error={chat.error} onRetry={() => runChat(messages)} />
          ) : null}
          <ChatTranscript messages={messages} pending={chat.isPending} onSend={send} />
        </div>
      )}
    </Modal>
  );
}
