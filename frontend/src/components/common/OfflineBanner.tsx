import { Icon } from './Icon';
import styles from './feedback.module.css';

export interface OfflineBannerProps {
  message: string;
  onDismiss?: () => void;
  tone?: 'warning' | 'info';
}

/**
 * 顶部黄条：离线 / 模型不可用提示。
 * 关键语义：**本地功能照常可用**（红线 3），不是"功能被禁用"。
 */
export function OfflineBanner({ message, onDismiss, tone = 'warning' }: OfflineBannerProps) {
  return (
    <div className={styles.banner} role="status" style={tone === 'info' ? { color: 'var(--color-info)' } : undefined}>
      <Icon name={tone === 'warning' ? 'warning' : 'info'} size={16} />
      <span className={styles.bannerMessage}>{message}</span>
      {onDismiss ? (
        <button
          type="button"
          className={styles.bannerDismiss}
          onClick={onDismiss}
          aria-label="关闭提示"
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}
