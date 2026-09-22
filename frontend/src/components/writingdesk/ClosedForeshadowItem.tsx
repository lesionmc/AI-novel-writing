import type { EditableClosedForeshadow } from './writebackModel';
import styles from './WritebackDialog.module.css';

export interface ClosedForeshadowItemProps {
  item: EditableClosedForeshadow;
  onChange: (patch: Partial<EditableClosedForeshadow>) => void;
}

/** 已回收伏笔条目：勾选即表示「本章把它回收了」 */
export function ClosedForeshadowItem({ item, onChange }: ClosedForeshadowItemProps) {
  return (
    <div className={styles.item}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={item.accepted}
        aria-label={`确认交代线索 ${item.title}`}
        onChange={(e) => onChange({ accepted: e.target.checked })}
      />
      <div className={styles.itemMain}>
        <div className={styles.itemText}>「{item.title}」</div>
        <div className={styles.itemReason}>确认后把这条线索标记为已交代</div>
      </div>
    </div>
  );
}
