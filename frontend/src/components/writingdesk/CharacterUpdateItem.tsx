import { useState } from 'react';
import { Button } from '@/components/common/Button';
import type { EditableCharacter } from './writebackModel';
import styles from './WritebackDialog.module.css';

export interface CharacterUpdateItemProps {
  item: EditableCharacter;
  onChange: (patch: Partial<EditableCharacter>) => void;
  onRemove: () => void;
}

/** 人物状态变更条目：默认勾选、可就地编辑（TC-25）、可删除 */
export function CharacterUpdateItem({ item, onChange, onRemove }: CharacterUpdateItemProps) {
  // 手工新增的条目直接进入编辑态，省掉一次「点编辑」
  const [editing, setEditing] = useState(Boolean(item.nameEditable));

  return (
    <div className={styles.item}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={item.accepted}
        aria-label={`采纳 ${item.name} 的状态变更`}
        onChange={(e) => onChange({ accepted: e.target.checked })}
      />
      <div className={styles.itemMain}>
        <div className={styles.itemTop}>
          {item.nameEditable ? (
            <input
              className={styles.nameInput}
              value={item.name}
              placeholder="角色名"
              aria-label="角色名"
              onChange={(e) => onChange({ name: e.target.value })}
            />
          ) : (
            <span className={styles.itemName}>{item.name}</span>
          )}
        </div>
        {editing ? (
          <textarea
            className={styles.editInput}
            value={item.state}
            rows={2}
            autoFocus
            aria-label={`${item.name} 的状态描述`}
            onChange={(e) => onChange({ state: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <div className={styles.itemText}>{item.state}</div>
        )}
        {item.reason ? <div className={styles.itemReason}>变更依据：{item.reason}</div> : null}
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
          aria-label={`删除 ${item.name} 的状态变更`}
          title="删除这条"
          onClick={onRemove}
        />
      </div>
    </div>
  );
}
