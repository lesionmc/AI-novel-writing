import { Button } from '@/components/common/Button';
import styles from './ChapterTree.module.css';

export interface TreeHeaderProps {
  count: number;
  onCreate: () => void;
  creating: boolean;
}

/** 章节树头部：标题 + 新建章节 */
export function TreeHeader({ count, onCreate, creating }: TreeHeaderProps) {
  return (
    <div className={styles.header}>
      <span className={styles.headerTitle}>
        章节{count > 0 ? ` · ${count}` : ''}
      </span>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="plus"
        aria-label="新建章节"
        title="新建章节"
        loading={creating}
        onClick={onCreate}
      />
    </div>
  );
}
