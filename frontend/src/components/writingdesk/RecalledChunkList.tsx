import type { RecallChunk } from '@/types/api';
import { Button } from '@/components/common/Button';
import { SkeletonRows } from '@/components/common/Skeleton';
import styles from './RecallPanel.module.css';

export interface RecalledChunkListProps {
  items: RecallChunk[];
  loading: boolean;
  /** 跳转到片段所在章并高亮：带上片段文本用于定位（TC-33） */
  onJump: (chapterSeq: number, text: string) => void;
}

/** 「相关历史片段」分区（默认折叠）：语义召回结果，展开显示相似度与跳转 */
export function RecalledChunkList({ items, loading, onJump }: RecalledChunkListProps) {
  if (loading) {
    return (
      <div className={styles.skeletonBox}>
        <SkeletonRows count={2} />
      </div>
    );
  }

  if (items.length === 0) {
    return <div className={styles.sectionEmpty}>没有找到相关的旧段落</div>;
  }

  return (
    <ul>
      {items.map((chunk) => (
        <li className={styles.item} key={chunk.chunk_id}>
          <div className={styles.itemHead}>
            <span className={styles.itemTitle}>第 {chunk.chapter_seq} 章</span>
            <span className={styles.score}>相似度 {chunk.score.toFixed(2)}</span>
          </div>
          <p className={styles.quote}>{chunk.text}</p>
          <div className={styles.itemActions}>
            <Button
              size="sm"
              variant="ghost"
              icon="jump"
              onClick={() => onJump(chunk.chapter_seq, chunk.text)}
            >
              跳到该章
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
