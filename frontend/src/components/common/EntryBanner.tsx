import type { IconName } from '@/types/ui';
import { Icon } from './Icon';
import styles from './feedback.module.css';

export interface EntryBannerProps {
  icon: IconName;
  title: string;
  description: string;
  onClick: () => void;
  /** 空态下更突出（加粗描边 + 主色底） */
  prominent?: boolean;
}

/**
 * 「AI 能力入口」横幅 —— 书库的「让 AI 帮你选题」与设定库的「跟 AI 聊聊」共用。
 * 入口**永不隐藏**（红线 3 精神）：未配模型时点击给可读引导，而不是把它藏起来。
 */
export function EntryBanner({ icon, title, description, onClick, prominent }: EntryBannerProps) {
  return (
    <button
      type="button"
      className={[styles.entry, prominent ? styles.entryProminent : ''].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className={styles.entryIcon}>
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.entryBody}>
        <span className={styles.entryTitle}>{title}</span>
        <span className={styles.entryDesc}>{description}</span>
      </span>
      <Icon name="chevronRight" size={20} className={styles.entryChevron} />
    </button>
  );
}
