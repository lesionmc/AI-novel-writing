import type { RecallForeshadow } from '@/types/api';
import { IMPORTANCE_LABELS, IMPORTANCE_VARIANT } from '@/lib/labels';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { SkeletonRows } from '@/components/common/Skeleton';
import styles from './RecallPanel.module.css';

export interface ForeshadowListProps {
  items: RecallForeshadow[];
  loading: boolean;
  /** 正在标记回收的伏笔 id */
  markingId: number | null;
  onMarkClosed: (id: number) => void;
}

/** 老化阈值：距今超过 20 章用橙色高亮（04 §3.2 / TC-30） */
const AGING_THRESHOLD = 20;

/** 「未回收伏笔」分区：重要度降序 + 埋设章升序；埋得越久越靠前 */
export function ForeshadowList({ items, loading, markingId, onMarkClosed }: ForeshadowListProps) {
  if (loading) {
    return (
      <div className={styles.skeletonBox}>
        <SkeletonRows count={2} />
      </div>
    );
  }

  if (items.length === 0) {
    return <div className={styles.sectionEmpty}>暂无待回收的线索</div>;
  }

  const sorted = [...items].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    const d = rank[a.importance] - rank[b.importance];
    if (d !== 0) return d;
    return (a.planted_seq ?? 0) - (b.planted_seq ?? 0);
  });

  return (
    <ul>
      {sorted.map((f) => {
        const aging = f.age > AGING_THRESHOLD;
        return (
          <li className={styles.item} key={f.id}>
            <div className={styles.itemHead}>
              <Icon
                name="foreshadow"
                size={16}
                className={aging ? styles.agingText : undefined}
              />
              <span className={styles.itemTitle} title={f.title}>
                {f.title}
              </span>
              <Badge variant={IMPORTANCE_VARIANT[f.importance]}>
                {IMPORTANCE_LABELS[f.importance]}
              </Badge>
              <span className={styles.itemMeta}>
                {f.planted_seq != null ? `第 ${f.planted_seq} 章` : '—'}
              </span>
            </div>
            <div className={styles.itemBody}>
              <span className={aging ? styles.agingTextStrong : undefined}>
                距今已 {f.age} 章{aging ? ' · 埋了很久，别忘了它' : ''}
              </span>
            </div>
            <div className={styles.itemActions}>
              <Button
                size="sm"
                variant="ghost"
                icon="recover"
                loading={markingId === f.id}
                onClick={() => onMarkClosed(f.id)}
              >
                标记已回收
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
