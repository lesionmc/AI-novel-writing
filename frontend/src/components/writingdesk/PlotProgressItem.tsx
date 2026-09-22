import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import type { EditablePlot } from './writebackModel';
import styles from './WritebackDialog.module.css';

export interface PlotProgressItemProps {
  item: EditablePlot;
  onChange: (patch: Partial<EditablePlot>) => void;
  onRemove: () => void;
}

/** 剧情线推进条目：可就地编辑推进描述、可删除 */
export function PlotProgressItem({ item, onChange, onRemove }: PlotProgressItemProps) {
  const [editing, setEditing] = useState(Boolean(item.arcEditable));

  return (
    <div className={styles.item}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={item.accepted}
        aria-label={`采纳 ${item.arc || '这条'} 的推进`}
        onChange={(e) => onChange({ accepted: e.target.checked })}
      />
      <div className={styles.itemMain}>
        <div className={styles.itemTop}>
          {item.arcEditable ? (
            <input
              className={styles.nameInput}
              value={item.arc}
              placeholder="剧情线名称，如：主线·复仇"
              aria-label="剧情线名称"
              onChange={(e) => onChange({ arc: e.target.value })}
            />
          ) : (
            <span className={styles.itemName}>{item.arc}</span>
          )}
        </div>
        {editing ? (
          <div className={styles.editRow}>
            <input
              className={styles.editInput}
              value={item.progress}
              autoFocus
              aria-label={`${item.arc} 的推进描述`}
              onChange={(e) => onChange({ progress: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditing(false);
              }}
            />
          </div>
        ) : (
          <div className={styles.itemText}>
            <Icon name="arrowRight" size={16} /> {item.progress}
          </div>
        )}
      </div>
      <div className={styles.itemActions}>
        <Button
          variant="ghost"
          size="sm"
          icon={editing ? 'check' : 'edit'}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? '完成' : '编辑'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon="trash"
          aria-label={`删除 ${item.arc} 的推进`}
          title="删除这条"
          onClick={onRemove}
        />
      </div>
    </div>
  );
}
