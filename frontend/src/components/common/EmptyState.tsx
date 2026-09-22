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
          <Button variant="primary" icon="plus" loading={actionLoading} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
