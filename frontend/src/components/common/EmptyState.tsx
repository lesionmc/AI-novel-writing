import type { IconName } from '@/types/ui';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './feedback.module.css';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
  /**
   * 行动按钮的图标。默认 `plus`（大多数空态的下一步是"新建"）。
   * 但行动不是"新建"而是"去某个页面"时必须显式换掉 —— 否则会出现
   * 「＋ 去写作台写第一章」这种图标与动作对不上的按钮。
   */
  actionIcon?: IconName;
}

/**
 * 空态：图标 + 一句说明 + 一个主行动按钮。
 * 空态必须给「下一步做什么」，不显示一堆空列表（04 §6.4 空态优先级）。
 */
export function EmptyState({
  icon = 'info',
  title,
  description,
  actionLabel,
  onAction,
  actionLoading,
  actionIcon = 'plus',
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={24} />
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      {description ? <p className={styles.emptyDesc}>{description}</p> : null}
      {actionLabel && onAction ? (
        <div className={styles.emptyAction}>
          <Button variant="primary" icon={actionIcon} loading={actionLoading} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
