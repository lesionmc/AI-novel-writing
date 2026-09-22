import type { Character } from '@/types/api';
import { CHARACTER_STATUS_LABELS, ROLE_LABELS, ROLE_VARIANT } from '@/lib/labels';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import styles from './settings.module.css';

export interface CharacterRowProps {
  character: Character;
  onEdit: (character: Character) => void;
  onDelete: (character: Character) => void;
}

/** 人物卡列表行：姓名 + 定位/状态徽标 + 四要素摘要 + 行操作 */
export function CharacterRow({ character: c, onEdit, onDelete }: CharacterRowProps) {
  const core = [c.surface_identity, c.secret_desire, c.fatal_weakness, c.contradiction]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={styles.listItem}>
      <div className={styles.listItemMain}>
        <div className={styles.listItemTitle}>
          {c.name}
          <Badge variant={ROLE_VARIANT[c.role]}>{ROLE_LABELS[c.role]}</Badge>
          <Badge variant={c.status === 'alive' ? 'success' : 'neutral'}>
            {CHARACTER_STATUS_LABELS[c.status]}
          </Badge>
        </div>
        <div className={styles.listItemMeta}>
          {core || '四要素还没填，右栏提醒时只能匹配到名字'}
        </div>
      </div>
      <div className={styles.listItemActions}>
        <Button size="sm" variant="ghost" icon="edit" onClick={() => onEdit(c)}>
          编辑
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="trash"
          aria-label={`删除 ${c.name}`}
          title="删除"
          onClick={() => onDelete(c)}
        />
      </div>
    </div>
  );
}
