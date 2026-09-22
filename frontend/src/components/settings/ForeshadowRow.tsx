import type { Foreshadow, ForeshadowStatus, Importance } from '@/types/api';
import { FORESHADOW_STATUS_LABELS, IMPORTANCE_LABELS } from '@/lib/labels';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import styles from './settings.module.css';

const STATUS_ORDER: ForeshadowStatus[] = ['open', 'closed', 'abandoned'];
const IMPORTANCE_ORDER: Importance[] = ['high', 'medium', 'low'];

/** 状态行内下拉（未回收 / 已回收 / 已放弃） */
function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: ForeshadowStatus;
  disabled?: boolean;
  onChange: (next: ForeshadowStatus) => void;
}) {
  return (
    <select
      className={styles.inlineSelect}
      value={value}
      disabled={disabled}
      aria-label="回收状态"
      onChange={(e) => onChange(e.target.value as ForeshadowStatus)}
    >
      {STATUS_ORDER.map((v) => (
        <option key={v} value={v}>
          {FORESHADOW_STATUS_LABELS[v]}
        </option>
      ))}
    </select>
  );
}

/** 重要度行内下拉（高 / 中 / 低） */
function ImportanceSelect({
  value,
  disabled,
  onChange,
}: {
  value: Importance;
  disabled?: boolean;
  onChange: (next: Importance) => void;
}) {
  return (
    <select
      className={styles.inlineSelect}
      value={value}
      disabled={disabled}
      aria-label="重要度"
      onChange={(e) => onChange(e.target.value as Importance)}
    >
      {IMPORTANCE_ORDER.map((v) => (
        <option key={v} value={v}>
          {IMPORTANCE_LABELS[v]}
        </option>
      ))}
    </select>
  );
}

function seqText(n: number | null): string {
  return n === null ? '—' : `第 ${n} 章`;
}

export interface ForeshadowRowProps {
  item: Foreshadow;
  busy: boolean;
  onStatusChange: (id: number, status: ForeshadowStatus) => void;
  onImportanceChange: (id: number, importance: Importance) => void;
  onEdit: (item: Foreshadow) => void;
}

/** 伏笔台账单行：标题/备注 + 状态/重要度行内改 + 埋设·回收章 + 行操作 */
export function ForeshadowRow({
  item,
  busy,
  onStatusChange,
  onImportanceChange,
  onEdit,
}: ForeshadowRowProps) {
  const stale = item.status === 'open' && item.importance === 'high';

  return (
    <tr className={styles.tableRow}>
      <td className={styles.td}>
        <div className={styles.cellTitle} title={item.title}>
          {stale ? <Icon name="foreshadow" size={16} className={styles.rowIcon} /> : null}
          {item.title}
        </div>
        {item.note ? <div className={styles.listItemMeta}>{item.note}</div> : null}
      </td>
      <td className={styles.td}>
        <StatusSelect
          value={item.status}
          disabled={busy}
          onChange={(v) => onStatusChange(item.id, v)}
        />
      </td>
      <td className={styles.td}>
        <ImportanceSelect
          value={item.importance}
          disabled={busy}
          onChange={(v) => onImportanceChange(item.id, v)}
        />
      </td>
      <td className={styles.td}>
        <span className={styles.num}>{seqText(item.planted_chapter_seq)}</span>
      </td>
      <td className={styles.td}>
        <span className={styles.num}>{seqText(item.planned_payoff_seq)}</span>
      </td>
      <td className={styles.td}>
        <span className={styles.num}>{seqText(item.actual_payoff_seq)}</span>
      </td>
      <td className={styles.td}>
        <div className={styles.listItemActions}>
          <Button size="sm" variant="ghost" icon="edit" disabled={busy} onClick={() => onEdit(item)}>
            编辑
          </Button>
        </div>
      </td>
    </tr>
  );
}
