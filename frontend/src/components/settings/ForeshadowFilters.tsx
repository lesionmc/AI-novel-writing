import type { ForeshadowStatus, Importance } from '@/types/api';
import { FORESHADOW_STATUS_LABELS } from '@/lib/labels';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import styles from './settings.module.css';

const STATUS_FILTERS: { value: '' | ForeshadowStatus; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'open', label: FORESHADOW_STATUS_LABELS.open },
  { value: 'closed', label: FORESHADOW_STATUS_LABELS.closed },
  { value: 'abandoned', label: FORESHADOW_STATUS_LABELS.abandoned },
];

const IMPORTANCE_FILTERS: { value: '' | Importance; label: string }[] = [
  { value: '', label: '全部重要度' },
  { value: 'high', label: '高重要度' },
  { value: 'medium', label: '中重要度' },
  { value: 'low', label: '低重要度' },
];

export interface ForeshadowFiltersProps {
  status: '' | ForeshadowStatus;
  importance: '' | Importance;
  onStatusChange: (value: '' | ForeshadowStatus) => void;
  onImportanceChange: (value: '' | Importance) => void;
}

/** 伏笔台账筛选条：状态 + 重要度 */
export function ForeshadowFilters({
  status,
  importance,
  onStatusChange,
  onImportanceChange,
}: ForeshadowFiltersProps) {
  const filtered = status !== '' || importance !== '';
  const clear = () => {
    onStatusChange('');
    onImportanceChange('');
  };

  return (
    <div className={styles.filterBar}>
      <Icon name="filter" size={16} className={styles.filterIcon} />
      <span className={styles.filterLabel}>筛选</span>
      <select
        className={styles.inlineSelect}
        value={status}
        aria-label="按状态筛选"
        onChange={(e) => onStatusChange(e.target.value as '' | ForeshadowStatus)}
      >
        {STATUS_FILTERS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        className={styles.inlineSelect}
        value={importance}
        aria-label="按重要度筛选"
        onChange={(e) => onImportanceChange(e.target.value as '' | Importance)}
      >
        {IMPORTANCE_FILTERS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {filtered ? (
        <Button size="sm" variant="ghost" icon="close" onClick={clear}>
          清除筛选
        </Button>
      ) : null}
    </div>
  );
}
