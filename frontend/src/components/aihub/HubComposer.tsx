import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { HUB_ACTIONS, actionOf, type HubAction } from './hubModel';
import styles from './hub.module.css';

export interface HubComposerProps {
  actionKey: string;
  onActionChange: (key: string) => void;
  /** 联网开关（本轮是否允许 AI 检索外部实时资料） */
  useWeb: boolean;
  onUseWebChange: (v: boolean) => void;
  onSend: (text: string) => void;
  pending: boolean;
  /** 还没配模型（页面级状态） */
  disabled: boolean;
  /** 为什么不能发言 —— 如实说明，不许整页禁用不解释 */
  disabledHint?: string;
  /** 当前动作需要先选章节（写正文 / 校对） */
  needChapter: boolean;
  /** 可用动作（无作品模式只给不依赖书的几项）；缺省 = 全部 */
  actions?: HubAction[];
}

const PLACEHOLDER = '说点什么，比如「帮我加一个反派，跟我哥是死对头」';

/**
 * 底栏：能力入口（动作选择）+ 输入框。
 *
 * 八件事分两类（见 `HUB_ACTIONS`）：
 *   · 前五项走对话，可能要用户确认草稿；
 *   · 后三项（校对 / 审校 / 敏感词）**只出报告、不落库**，所以不打字也能点发送。
 *
 * 红线 3：**没配模型不能整页禁用** —— 敏感词自查是纯本地词库匹配，
 * 没配模型照样能用；只有要读正文的那几项才拦，并如实说明原因。
 */
export function HubComposer({
  actionKey,
  onActionChange,
  useWeb,
  onUseWebChange,
  onSend,
  pending,
  disabled,
  disabledHint,
  needChapter,
  actions = HUB_ACTIONS,
}: HubComposerProps) {
  const [text, setText] = useState('');
  const action = actionOf(actionKey);
  // 没配模型时，只有"要读正文给模型看"的动作才真的不能跑
  const blockedByModel = disabled && action.needsModel;
  // 只读的三项本来就不一定要打字（可以直接说"校对这一章"）
  const needsText = action.mode === 'chat';
  const blocked = blockedByModel || pending || needChapter || (needsText && !text.trim());
  const send = () => {
    const value = text.trim();
    if (blocked) return;
    onSend(value);
    setText('');
  };

  const hint = blockedByModel
    ? (disabledHint ?? '现在还不能用，请先配置模型。')
    : needChapter
      ? `「${action.label}」要先在上面选一章 —— 不然我不知道看哪一章。`
      : action.mode === 'chat'
        ? `Enter 发送，Shift+Enter 换行。当前：${action.label}（${action.hint}）`
        : `Enter 发送。当前：${action.label}（${action.hint}）`;

  return (
    <div className={styles.composer}>
      <div className={styles.actionRow} role="group" aria-label="这次想做什么">
        <span className={styles.railLabel}>这次想做什么</span>
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            className={[styles.actionChip, a.key === actionKey ? styles.actionChipActive : ''].join(
              ' ',
            )}
            title={a.hint}
            aria-pressed={a.key === actionKey}
            onClick={() => onActionChange(a.key)}
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          className={[styles.actionChip, useWeb ? styles.actionChipActive : ''].join(' ')}
          title="打开后，AI 会自己判断这句话要不要联网查外部资料（时事 / 数据 / 专业知识），查到会附来源"
          aria-pressed={useWeb}
          onClick={() => onUseWebChange(!useWeb)}
        >
          联网
        </button>
      </div>

      <div className={styles.composerRow}>
        <textarea
          className={styles.composerInput}
          rows={2}
          value={text}
          placeholder={action.mode === 'chat' ? PLACEHOLDER : `想补充点什么就说（也可以直接发送）${action.label}`}
          aria-label="输入你想说的话"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button
          variant="primary"
          icon="send"
          loading={pending}
          disabled={blocked}
          onClick={send}
        >
          发送
        </Button>
      </div>

      <p className={styles.composerHint}>{hint}</p>
    </div>
  );
}
