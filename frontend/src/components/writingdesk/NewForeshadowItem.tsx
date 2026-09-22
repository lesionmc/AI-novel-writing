import type { Importance } from '@/types/api';
import { IMPORTANCE_LABELS } from '@/lib/labels';
import { Button } from '@/components/common/Button';
import type { EditableNewForeshadow } from './writebackModel';
import styles from './WritebackDialog.module.css';

export interface NewForeshadowItemProps {
  item: EditableNewForeshadow;
  onChange: (patch: Partial<EditableNewForeshadow>) => void;
  onRemove: () => void;
}

const IMPORTANCE_ORDER: Importance[] = ['high', 'medium', 'low'];

/** 新埋伏笔条目：可就地改标题与重要度、可删除 */
export function NewForeshadowItem({ item, onChange, onRemove }: NewForeshadowItemProps) {
  return (
    <div className={styles.item}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={item.accepted}
        aria-label={`采纳新线索 ${item.title}`}
        onChange={(e) => onChange({ accepted: e.target.checked })}
      />
      <div className={styles.foreshadowRow}>
        <input
          className={styles.foreshadowTitleInput}
          value={item.title}
          aria-label="线索内容"
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <select
          className={styles.importanceSelect}
          value={item.importance}
          aria-label="重要度"
          onChange={(e) => onChange({ importance: e.target.value as Importance })}
        >
          {IMPORTANCE_ORDER.map((v) => (
            <option key={v} value={v}>
              {IMPORTANCE_LABELS[v]}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon="trash"
          aria-label={`删除新线索 ${item.title}`}
          title="删除这条"
          onClick={onRemove}
        />
      </div>
    </div>
  );
}
