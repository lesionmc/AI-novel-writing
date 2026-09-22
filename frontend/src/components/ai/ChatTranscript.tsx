import { useEffect, useRef, useState } from 'react';
import type { SetupChatMessage } from '@/types/api';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { FINISH_PHRASE, QUICK_REPLIES } from './aiModel';
import styles from './ai.module.css';

export interface ChatTranscriptProps {
  messages: SetupChatMessage[];
  /** AI 正在回复（禁用输入与发送） */
  pending: boolean;
  onSend: (text: string) => void;
}

/**
 * 消息气泡流（用户右 / AI 左）+ 快捷回复 + 输入区。
 * 快捷回复**每一轮都在**（QA L5：只有第一轮有，之后全靠手打），
 * 并且始终给一个「可以了，帮我整理」的明确出口（QA L6：AI 爱追问不出草稿）。
 */
export function ChatTranscript({ messages, pending, onSend }: ChatTranscriptProps) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // 新消息进来时滚到底部（包含 AI 的等待态）
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending]);

  const send = (value: string) => {
    const t = value.trim();
    if (!t || pending) return;
    onSend(t);
    setText('');
  };

  return (
    <div className={styles.chat}>
      <div className={styles.transcript} aria-live="polite" aria-label="与 AI 的对话">
        {messages.map((m, i) => (
          <div
            key={i}
            className={[styles.row, m.role === 'user' ? styles.rowUser : styles.rowAi].join(' ')}
          >
            {m.role === 'assistant' ? (
              <span className={styles.avatar} aria-hidden="true">
                <Icon name="sparkles" size={16} />
              </span>
            ) : null}
            <div
              className={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi].join(
                ' ',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {pending ? (
          <div className={[styles.row, styles.rowAi].join(' ')}>
            <span className={styles.avatar} aria-hidden="true">
              <Icon name="sparkles" size={16} />
            </span>
            <div className={[styles.bubble, styles.bubbleAi, styles.typing].join(' ')}>
              <Icon name="loader" size={16} className={styles.typingIcon} />
              正在想…
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {!pending ? (
        <div className={styles.quickRow}>
          {QUICK_REPLIES.map((q) => (
            <button key={q} type="button" className={styles.quick} onClick={() => send(q)}>
              {q}
            </button>
          ))}
          <button
            type="button"
            className={[styles.quick, styles.quickFinish].join(' ')}
            onClick={() => send(FINISH_PHRASE)}
          >
            可以了，帮我整理
          </button>
        </div>
      ) : null}

      <div className={styles.composer}>
        <textarea
          className={styles.composerInput}
          rows={2}
          value={text}
          placeholder="随便说点什么，比如「主角是个落魄的药剂师」"
          aria-label="输入你想说的话"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <Button
          variant="primary"
          icon="send"
          onClick={() => send(text)}
          loading={pending}
          disabled={!text.trim()}
        >
          发送
        </Button>
      </div>
    </div>
  );
}
