import { useState } from 'react';
import { Button } from '@/components/common/Button';
import type { EditableCharacter } from './writebackModel';
import styles from './WritebackDialog.module.css';

export interface CharacterUpdateItemProps {
  item: EditableCharacter;
  onChange: (patch: Partial<EditableCharacter>) => void;
  onRemove: () => void;
}

/** 人物状态变更条目：默认勾选（`state` 为空的除外，见 fromSuggestions）、可就地编辑（TC-25）、可删除 */
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
        {/* 空状态行默认不勾选（见 writebackModel.fromSuggestions），
            原因必须写出来 —— 否则用户看到单独一条没勾选会以为界面出错了。
            只在「仍为空且仍未勾选」时提示：填上内容、或自己勾上，提示就消失。
            样式复用 itemReason（本文件无独立 CSS，WritebackDialog.module.css 已到 300 行上限，不再新增类） */}
        {!item.accepted && !item.state.trim() ? (
          <div className={styles.itemReason}>内容为空，已默认不勾选</div>
        ) : null}
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
