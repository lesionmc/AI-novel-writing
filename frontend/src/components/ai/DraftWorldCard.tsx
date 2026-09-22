import type { SetupDraftWorldEntry, WorldEntryCategory } from '@/types/api';
import { WORLD_CATEGORY_LABELS } from '@/lib/labels';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Textarea } from '@/components/common/Textarea';
import type { DraftWorldRow } from './aiModel';
import styles from './ai.module.css';

const CATEGORY_OPTIONS = (Object.keys(WORLD_CATEGORY_LABELS) as WorldEntryCategory[]).map((v) => ({
  value: v,
  label: WORLD_CATEGORY_LABELS[v],
}));

export interface DraftWorldCardProps {
  row: DraftWorldRow;
  onChange: (patch: Partial<SetupDraftWorldEntry>) => void;
  onToggle: (checked: boolean) => void;
  onRemove: () => void;
}

/**
 * 草稿确认页的一条世界词条：可勾选 / 可改 / 可删。
 * 「类别」下拉用**英文枚举**作为值（force|place|rule|item|other），只显示中文标签。
 */
export function DraftWorldCard({ row, onChange, onToggle, onRemove }: DraftWorldCardProps) {
  const w = row.value;

  return (
    <div className={[styles.card, row.checked ? '' : styles.cardOff].filter(Boolean).join(' ')}>
      <div className={styles.cardHead}>
        <input
          type="checkbox"
          className={styles.check}
          checked={row.checked}
          aria-label={`保留词条 ${w.name || '未命名'}`}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <div className={styles.cardName}>
          <Input
            value={w.name}
            placeholder="名称"
            aria-label="词条名称"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className={styles.cardRole}>
          <Select
            options={CATEGORY_OPTIONS}
            value={w.category ?? 'other'}
            aria-label="词条类别"
            onChange={(e) => onChange({ category: e.target.value as WorldEntryCategory })}
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="trash"
          aria-label={`删除 ${w.name || '该词条'}`}
          title="删除"
          onClick={onRemove}
        />
      </div>

      <Textarea
        rows={2}
        value={w.content ?? ''}
        placeholder="它在故事里的作用，以及会反复用到的细节"
        aria-label="词条描述"
        onChange={(e) => onChange({ content: e.target.value })}
      />
    </div>
  );
}
