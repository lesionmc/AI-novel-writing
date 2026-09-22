import type { ReactNode } from 'react';
import type { IconName } from '@/types/ui';
import { Icon } from '@/components/common/Icon';
import styles from './WritebackDialog.module.css';

export interface WritebackSectionProps {
  icon: IconName;
  title: string;
  /** 采纳/总数，如 2/3 */
  countLabel?: string;
  children: ReactNode;
}

/** 回写弹窗的区块容器（摘要 / 人物状态 / 新伏笔 / 已回收 / 剧情线） */
export function WritebackSection({ icon, title, countLabel, children }: WritebackSectionProps) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHead}>
        <Icon name={icon} size={16} />
        {title}
        {countLabel ? <span className={styles.sectionCount}>({countLabel})</span> : null}
      </h3>
      {children}
    </section>
  );
}

/** 区块内的条目列表容器 */
export function WritebackItemList({ children }: { children: ReactNode }) {
  return <div className={styles.itemList}>{children}</div>;
}
