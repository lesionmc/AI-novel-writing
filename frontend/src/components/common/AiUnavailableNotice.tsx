import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './feedback.module.css';

export interface AiUnavailableNoticeProps {
  /** 标题，默认「还没有配置 AI 模型」 */
  title?: string;
  /** 说明正文 */
  children: ReactNode;
  /** 提供时显示行动按钮 */
  onOpenConfig?: () => void;
  /** 行动按钮文案 */
  configLabel?: string;
}

/**
 * 「未配置 AI 模型」的可读引导条 —— 与 RecallPanel 的降级条同款处理。
 * 铁律：入口不隐藏、不弹 alert，就地给一句人话 + 一个「去配置模型」按钮。
 * 按钮文案全项目统一为「去配置模型」（同一动作不要出现多种说法）。
 */
export function AiUnavailableNotice({
  title = '还没有配置 AI 模型',
  children,
  onOpenConfig,
  configLabel = '去配置模型',
}: AiUnavailableNoticeProps) {
  return (
    <div className={styles.notice} role="status">
      <Icon name="info" size={16} className={styles.noticeIcon} />
      <div className={styles.noticeBody}>
        <div className={styles.noticeTitle}>{title}</div>
        <div>{children}</div>
        {onOpenConfig ? (
          <div className={styles.noticeActions}>
            <Button size="sm" variant="secondary" icon="settings" onClick={onOpenConfig}>
              {configLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
