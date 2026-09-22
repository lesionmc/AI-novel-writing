import type { PlotArc } from '@/types/api';
import { SkeletonRows } from '@/components/common/Skeleton';
import styles from './RecallPanel.module.css';

export interface PlotArcListProps {
  items: PlotArc[];
  loading: boolean;
}

/** 「剧情线」分区（默认折叠）：辅助信息，无需常驻视野 */
export function PlotArcList({ items, loading }: PlotArcListProps) {
  if (loading) {
    return (
      <div className={styles.skeletonBox}>
        <SkeletonRows count={2} />
      </div>
    );
  }

  if (items.length === 0) {
    return <div className={styles.sectionEmpty}>暂无剧情线记录</div>;
  }

  return (
    <ul>
      {items.map((arc) => (
        <li className={styles.item} key={arc.id}>
          <div className={styles.itemHead}>
            <span className={styles.itemTitle} title={arc.name}>
              {arc.name}
            </span>
            <span className={styles.itemMeta}>
              {arc.last_chapter_seq != null ? `更新至第 ${arc.last_chapter_seq} 章` : '尚未推进'}
            </span>
          </div>
          <div className={styles.itemBody}>{arc.content || '暂无进展记录'}</div>
        </li>
      ))}
    </ul>
  );
}
