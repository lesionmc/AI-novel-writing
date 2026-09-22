import type { CharacterRole, SetupDraftCharacter } from '@/types/api';
import { ROLE_LABELS } from '@/lib/labels';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import type { DraftCharacterRow } from './aiModel';
import styles from './ai.module.css';

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as CharacterRole[]).map((v) => ({
  value: v,
  label: ROLE_LABELS[v],
}));

export interface DraftCharacterCardProps {
  row: DraftCharacterRow;
  onChange: (patch: Partial<SetupDraftCharacter>) => void;
  onToggle: (checked: boolean) => void;
  onRemove: () => void;
}

/**
 * 草稿确认页的一张人物卡：可勾选 / 可改 / 可删。
 * 「定位」下拉用**英文枚举**作为值（protagonist|supporting|antagonist|minor），
 * 只把中文标签显示给用户 —— 绝不把中文传回后端。
 */
export function DraftCharacterCard({ row, onChange, onToggle, onRemove }: DraftCharacterCardProps) {
  const c = row.value;

  return (
    <div className={[styles.card, row.checked ? '' : styles.cardOff].filter(Boolean).join(' ')}>
      <div className={styles.cardHead}>
        <input
          type="checkbox"
          className={styles.check}
          checked={row.checked}
          aria-label={`保留人物 ${c.name || '未命名'}`}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <div className={styles.cardName}>
          <Input
            value={c.name}
            placeholder="姓名"
            aria-label="人物姓名"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className={styles.cardRole}>
          <Select
            options={ROLE_OPTIONS}
            value={c.role ?? 'supporting'}
            aria-label="人物定位"
            onChange={(e) => onChange({ role: e.target.value as CharacterRole })}
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="trash"
          aria-label={`删除 ${c.name || '该人物'}`}
          title="删除"
          onClick={onRemove}
        />
      </div>

      <div className={styles.cardGrid}>
        <Input
          label="表面身份"
          value={c.surface_identity ?? ''}
          placeholder="别人眼中的他"
          onChange={(e) => onChange({ surface_identity: e.target.value })}
        />
        <Input
          label="秘密欲望"
          value={c.secret_desire ?? ''}
          placeholder="心里其实想要什么"
          onChange={(e) => onChange({ secret_desire: e.target.value })}
        />
        <Input
          label="致命弱点"
          value={c.fatal_weakness ?? ''}
          placeholder="一击即溃的地方"
          onChange={(e) => onChange({ fatal_weakness: e.target.value })}
        />
        <Input
          label="矛盾行为"
          value={c.contradiction ?? ''}
          placeholder="说的和做的不一致之处"
          onChange={(e) => onChange({ contradiction: e.target.value })}
        />
      </div>
    </div>
  );
}
