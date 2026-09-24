import { useEffect, useRef } from 'react';
import { Icon } from '@/components/common/Icon';
import { DraftCard } from './DraftCard';
import { ReadingCard } from './ReadingCard';
import { parseAiChatDraft, parseWebSources } from './hubModel';
import { parseHubReading } from './hubReading';
import type { HubMessage } from './hubModel';
import styles from './hub.module.css';

export interface ChatStreamProps {
  slug: string;
  messages: HubMessage[];
  /** 开场白（本地预置，不落存档、也不发给模型） */
  opening: string;
  /** 正在回复（对话或只读能力在跑） */
  pending: boolean;
  /** 等待时给用户看的一句话（不同能力做的事不一样，不要千篇一律） */
  pendingText?: string;
  /** 正在写入的草稿所在消息下标（null = 没在写） */
  busyIndex: number | null;
  /** 正在流式累积的只读报告下标（一致性审校；其余情况为 null） */
  streamIndex: number | null;
  onConfirmDraft: (index: number) => void;
  onDiscardDraft: (index: number) => void;
  /** 书名候选卡：点某行 = 采用该书名 */
  onPickTitle: (index: number, title: string) => void;
  /** 停止流式审校 */
  onStopReading: () => void;
}

/** 对话流：用户气泡靠右、AI 气泡靠左；AI 气泡里带草稿/只读报告时渲染对应卡片。 */
export function ChatStream({
  slug,
  messages,
  opening,
  pending,
  pendingText,
  busyIndex,
  streamIndex,
  onConfirmDraft,
  onDiscardDraft,
  onPickTitle,
  onStopReading,
}: ChatStreamProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending]);

  return (
    <div className={styles.stream} aria-live="polite" aria-label="与 AI 的对话">
      {messages.length === 0 ? (
        <div className={[styles.row, styles.rowAi].join(' ')}>
          <span className={styles.avatar} aria-hidden="true">
            <Icon name="sparkles" size={16} />
          </span>
          <div className={styles.msgWrap}>
            <div className={[styles.bubble, styles.bubbleAi].join(' ')}>{opening}</div>
          </div>
        </div>
      ) : null}

      {messages.map((m, index) => {
        const draft = m.role === 'assistant' ? parseAiChatDraft(m.draft) : null;
        const reading = m.role === 'assistant' ? parseHubReading(m.reading) : null;
        const sources = m.role === 'assistant' ? parseWebSources(m.webSources) : [];
        return (
          <div
            key={index}
            className={[styles.row, m.role === 'user' ? styles.rowUser : styles.rowAi].join(' ')}
          >
            {m.role === 'assistant' ? (
              <span className={styles.avatar} aria-hidden="true">
                <Icon name="sparkles" size={16} />
              </span>
            ) : null}
            <div className={styles.msgWrap}>
              <div
                className={[
                  styles.bubble,
                  m.role === 'user' ? styles.bubbleUser : styles.bubbleAi,
                ].join(' ')}
              >
                {m.content}
              </div>
              {sources.length > 0 ? (
                <div className={styles.webSources}>
                  <Icon name="world" size={16} />
                  <span>联网来源</span>
                  {sources.map((s) => (
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={s.snippet || s.title}
                    >
                      {s.title}
                    </a>
                  ))}
                </div>
              ) : m.role === 'assistant' && m.webAttempted ? (
                <div className={styles.webSources}>
                  <Icon name="world" size={16} />
                  <span>
                    联网检索没有命中 —— 可能是本机网络到不了搜索引擎（可在「设置 →
                    联网搜索」填代理或自建端点）、搜索引擎限流，或确实没有结果；
                    也可以关掉「联网」直接问。
                  </span>
                </div>
              ) : null}
              {draft ? (
                <DraftCard
                  slug={slug}
                  draft={draft}
                  state={m.draftState}
                  busy={busyIndex === index}
                  onConfirm={() => onConfirmDraft(index)}
                  onDiscard={() => onDiscardDraft(index)}
                  onPickTitle={(title) => onPickTitle(index, title)}
                />
              ) : null}
              {reading ? (
                <ReadingCard
                  reading={reading}
                  streaming={streamIndex === index}
                  onStop={onStopReading}
                />
              ) : null}
            </div>
          </div>
        );
      })}

      {pending ? (
        <div className={[styles.row, styles.rowAi].join(' ')}>
          <span className={styles.avatar} aria-hidden="true">
            <Icon name="sparkles" size={16} />
          </span>
          <div className={[styles.bubble, styles.bubbleAi, styles.typing].join(' ')}>
            <Icon name="loader" size={16} className={styles.typingIcon} />
            {pendingText ?? '正在读你这本书的资料，想一下…'}
          </div>
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
