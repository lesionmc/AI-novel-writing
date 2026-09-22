import type { SetupDraftCharacter, SetupDraftWorldEntry } from '@/types/api';
import { Icon } from '@/components/common/Icon';
import { Input } from '@/components/common/Input';
import { DraftCharacterCard } from './DraftCharacterCard';
import { DraftWorldCard } from './DraftWorldCard';
import type { DraftState } from './aiModel';
import styles from './ai.module.css';

export interface SetupDraftReviewProps {
  draft: DraftState;
  onChange: (next: DraftState) => void;
}

/**
 * 草稿确认页 —— AI 出稿、人来把关（与「章末回写」同款红线）。
 * premise 可编辑；人物卡 / 世界词条均**默认全勾**，可改、可删、可取消勾选。
 * 只有被勾选的条目，才会在点「确认并写入设定库」时被逐条写入。
 */
export function SetupDraftReview({ draft, onChange }: SetupDraftReviewProps) {
  const patchChar = (key: string, patch: Partial<SetupDraftCharacter>) =>
    onChange({
      ...draft,
      characters: draft.characters.map((r) =>
        r.key === key ? { ...r, value: { ...r.value, ...patch } } : r,
      ),
    });

  const patchWorld = (key: string, patch: Partial<SetupDraftWorldEntry>) =>
    onChange({
      ...draft,
      worldEntries: draft.worldEntries.map((r) =>
        r.key === key ? { ...r, value: { ...r.value, ...patch } } : r,
      ),
    });

  const checkedChars = draft.characters.filter((r) => r.checked).length;
  const checkedWorld = draft.worldEntries.filter((r) => r.checked).length;
  const total = checkedChars + checkedWorld;

  return (
    <div className={styles.review}>
      <p className={styles.reviewNote}>
        <Icon name="info" size={16} />
        这些只是草稿。改一改、删掉不要的，再点「确认并写入设定库」——没勾的不会入库。
      </p>

      <Input
        label="一句话卖点"
        value={draft.premise}
        placeholder="用一句话说清这本书最抓人的地方"
        hint="会写进作品信息，之后在设置里也能改"
        onChange={(e) => onChange({ ...draft, premise: e.target.value })}
      />

      <section className={styles.group}>
        <div className={styles.groupHead}>
          <span className={styles.groupTitle}>
            <Icon name="user" size={16} />
            人物卡
          </span>
          <span className={styles.groupCount}>
            {checkedChars}/{draft.characters.length} 将写入
          </span>
        </div>
        {draft.characters.length === 0 ? (
          <p className={styles.groupEmpty}>这次没有生成人物卡，可以返回继续聊。</p>
        ) : (
          <div className={styles.cardList}>
            {draft.characters.map((row) => (
              <DraftCharacterCard
                key={row.key}
                row={row}
                onChange={(p) => patchChar(row.key, p)}
                onToggle={(checked) =>
                  onChange({
                    ...draft,
                    characters: draft.characters.map((r) =>
                      r.key === row.key ? { ...r, checked } : r,
                    ),
                  })
                }
                onRemove={() =>
                  onChange({
                    ...draft,
                    characters: draft.characters.filter((r) => r.key !== row.key),
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className={styles.group}>
        <div className={styles.groupHead}>
          <span className={styles.groupTitle}>
            <Icon name="world" size={16} />
            世界词条
          </span>
          <span className={styles.groupCount}>
            {checkedWorld}/{draft.worldEntries.length} 将写入
          </span>
        </div>
        {draft.worldEntries.length === 0 ? (
          <p className={styles.groupEmpty}>这次没有生成世界词条，可以返回继续聊。</p>
        ) : (
          <div className={styles.cardList}>
            {draft.worldEntries.map((row) => (
              <DraftWorldCard
                key={row.key}
                row={row}
                onChange={(p) => patchWorld(row.key, p)}
                onToggle={(checked) =>
                  onChange({
                    ...draft,
                    worldEntries: draft.worldEntries.map((r) =>
                      r.key === row.key ? { ...r, checked } : r,
                    ),
                  })
                }
                onRemove={() =>
                  onChange({
                    ...draft,
                    worldEntries: draft.worldEntries.filter((r) => r.key !== row.key),
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      {total === 0 ? (
        <p className={styles.reviewWarn}>还没勾选任何条目。至少勾一条再确认，或者返回继续聊。</p>
      ) : (
        <p className={styles.reviewSummary}>
          将写入 <strong>{checkedChars}</strong> 张人物卡、<strong>{checkedWorld}</strong> 条世界词条。
        </p>
      )}
    </div>
  );
}
