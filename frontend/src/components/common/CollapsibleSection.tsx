import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import type { IconName } from '@/types/ui';
import { Icon } from './Icon';
import styles from './feedback.module.css';

export interface CollapsibleSectionProps {
  title: string;
  /** 标题右侧条数徽标 */
  count?: number;
  icon?: IconName;
  /** 默认展开态（召回面板：伏笔/人物 = true，片段/剧情线 = false） */
  defaultOpen?: boolean;
  /** 用「伏笔老化」橙色标记标题（仅未回收伏笔） */
  aging?: boolean;
  /** 折叠态下给的一眼价值（如「最高相似度 0.83」） */
  collapsedHint?: string;
  /** 受控开合（可选）；不传则内部自管 */
  open?: boolean;
  onToggle?: (next: boolean) => void;
  children: ReactNode;
}

/**
 * 折叠区容器（召回面板四个分区共用）。
 * 动效 200ms --ease-standard，reduced-motion 下由 design-tokens 全局归零。
 */
export function CollapsibleSection({
  title,
  count,
  icon,
  defaultOpen = true,
  aging = false,
  collapsedHint,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const bodyId = useId();

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInternalOpen(next);
    onToggle?.(next);
  };

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
      >
        <Icon
          name="chevronRight"
          size={16}
          className={[styles.sectionChevron, isOpen ? styles.sectionChevronOpen : '']
            .filter(Boolean)
            .join(' ')}
        />
        {icon ? (
          <Icon
            name={icon}
            size={16}
            className={[styles.sectionIcon, aging ? styles.sectionAging : '']
              .filter(Boolean)
              .join(' ')}
          />
        ) : null}
        <span className={[styles.sectionTitle, aging ? styles.sectionAging : ''].filter(Boolean).join(' ')}>
          {title}
        </span>
        {typeof count === 'number' ? <span className={styles.sectionCount}>{count}</span> : null}
        {!isOpen && collapsedHint ? (
          <span className={styles.sectionCollapsedHint}>{collapsedHint}</span>
        ) : null}
      </button>
      <div
        id={bodyId}
        className={[styles.sectionBody, isOpen ? '' : styles.sectionBodyCollapsed]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.sectionBodyInner}>{children}</div>
      </div>
    </section>
  );
}
