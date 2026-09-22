import type { ChapterBrief } from '@/types/api';
import { Icon } from '@/components/common/Icon';
import styles from './ChapterTree.module.css';

export interface ChapterRowProps {
  chapter: ChapterBrief;
  active: boolean;
  onSelect: (id: number) => void;
}

/** 章节树单行：序号 + 标题 + 完成标记 */
export function ChapterRow({ chapter, active, onSelect }: ChapterRowProps) {
  const label = chapter.title?.trim() || '未命名';
  return (
    <button
      type="button"
      className={[styles.row, active ? styles.rowActive : ''].filter(Boolean).join(' ')}
      onClick={() => onSelect(chapter.id)}
      aria-current={active ? 'true' : undefined}
      title={`第 ${chapter.seq} 章 · ${label}`}
    >
      <span className={styles.seq}>{chapter.seq}</span>
      <span className={styles.rowTitle}>{label}</span>
      {chapter.status === 'done' ? (
        <Icon name="recover" size={16} className={styles.rowDot} label="已完成" />
      ) : null}
    </button>
  );
}
