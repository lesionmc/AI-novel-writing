import type { ReactNode } from 'react';
import type { BadgeVariant, IconName } from '@/types/ui';
import { Icon } from './Icon';
import styles from './Badge.module.css';

export interface BadgeProps {
  variant?: BadgeVariant;
  /** 前置图标（走 Icon 单一入口），尺寸固定 16 */
  icon?: IconName;
  /** 去掉底色/边框，仅保留语义色文字（用于重要度点标记等） */
  plain?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({
  variant = 'neutral',
  icon,
  plain = false,
  className,
  children,
}: BadgeProps) {
  const classes = [styles.badge, styles[variant], plain ? styles.plain : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </span>
  );
}
