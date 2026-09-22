import type { RecallCharacter } from '@/types/api';
import { ROLE_LABELS } from '@/lib/labels';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { SkeletonRows } from '@/components/common/Skeleton';
import type { BadgeVariant } from '@/types/ui';
import styles from './RecallPanel.module.css';

export interface CharacterStateListProps {
  items: RecallCharacter[];
  loading: boolean;
  onOpenProfile: (name: string) => void;
}

const ROLE_VARIANT: Record<string, BadgeVariant> = {
  protagonist: 'primary',
  supporting: 'neutral',
  antagonist: 'danger',
  minor: 'neutral',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}

function splitState(state: string): string[] {
  return state
    .split(/[；;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 「本章人物」分区：当前状态、上次出场、查看档案。
 * 关键红线：本区**不允许空列表**（空列表等于召回失效，04 §3.3）。
 * 数据侧兜底「最近出场前 3 位」由后端保证；前端为空时给出可行动的提示而非空白。
 */
export function CharacterStateList({ items, loading, onOpenProfile }: CharacterStateListProps) {
  if (loading) {
    return (
      <div className={styles.skeletonBox}>
        <SkeletonRows count={2} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.sectionEmpty}>
        这一章还没有匹配到人物。去设定库建一张人物卡，之后进章就会自动带出来。
      </div>
    );
  }

  return (
    <ul>
      {items.map((c) => (
        <li className={styles.item} key={c.character_id}>
          <div className={styles.itemHead}>
            <span className={styles.itemTitle} title={c.name}>
              {c.name}
            </span>
            <Badge variant={ROLE_VARIANT[c.role] ?? 'neutral'}>{roleLabel(c.role)}</Badge>
          </div>
          <div>
            {splitState(c.current_state ?? '').map((line, i) => (
              <div className={styles.stateLine} key={i}>
                <span className={styles.stateBullet} aria-hidden="true">
                  ·
                </span>
                <span>{line}</span>
              </div>
            ))}
          </div>
          {c.relation_notes ? <div className={styles.itemBody}>{c.relation_notes}</div> : null}
          <div className={styles.itemMeta}>
            {c.last_seen_seq != null ? `上次出场：第 ${c.last_seen_seq} 章` : '首次出场'}
          </div>
          <div className={styles.itemActions}>
            <Button size="sm" variant="ghost" icon="view" onClick={() => onOpenProfile(c.name)}>
              查看完整档案
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
