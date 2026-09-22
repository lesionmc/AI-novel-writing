import { useBook, useCharacters, useWorldEntries } from '@/hooks/queries';
import { ROLE_LABELS, WORLD_CATEGORY_LABELS } from '@/lib/labels';
import { Badge } from '@/components/common/Badge';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { ErrorBar } from '@/components/common/ErrorBar';
import { SkeletonRows } from '@/components/common/Skeleton';
import styles from './RecallPanel.module.css';

/** 右栏「设定」Tab：写作时随手可查的只读设定摘要（不依赖 AI） */
export function SettingsDigest({ slug }: { slug: string }) {
  const book = useBook(slug);
  const characters = useCharacters(slug);
  const world = useWorldEntries(slug);

  return (
    <>
      <CollapsibleSection title="全书摘要" icon="book" defaultOpen>
        {book.isPending ? (
          <div className={styles.skeletonBox}>
            <SkeletonRows count={2} />
          </div>
        ) : book.isError ? (
          <div style={{ padding: 'var(--space-3)' }}>
            <ErrorBar error={book.error} onRetry={() => void book.refetch()} />
          </div>
        ) : (
          <div className={styles.item}>
            <div className={styles.itemBody}>
              {book.data?.summary?.trim() || '这本书还没有全书摘要。写完一章并确认归档后会自动累积。'}
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="人物设定"
        icon="users"
        defaultOpen
        count={characters.data?.length ?? 0}
      >
        {characters.isPending ? (
          <div className={styles.skeletonBox}>
            <SkeletonRows count={3} />
          </div>
        ) : characters.isError ? (
          <div style={{ padding: 'var(--space-3)' }}>
            <ErrorBar error={characters.error} onRetry={() => void characters.refetch()} />
          </div>
        ) : (characters.data?.length ?? 0) === 0 ? (
          <div className={styles.sectionEmpty}>还没有人物卡。去设定库建第一张。</div>
        ) : (
          <ul>
            {characters.data?.map((c) => (
              <li className={styles.item} key={c.id}>
                <div className={styles.itemHead}>
                  <span className={styles.itemTitle}>{c.name}</span>
                  <Badge variant={c.role === 'protagonist' ? 'primary' : 'neutral'}>
                    {ROLE_LABELS[c.role]}
                  </Badge>
                </div>
                {c.surface_identity ? (
                  <div className={styles.stateLine}>
                    <span className={styles.stateBullet}>表面身份</span>
                    <span>{c.surface_identity}</span>
                  </div>
                ) : null}
                {c.secret_desire ? (
                  <div className={styles.stateLine}>
                    <span className={styles.stateBullet}>秘密欲望</span>
                    <span>{c.secret_desire}</span>
                  </div>
                ) : null}
                {c.fatal_weakness ? (
                  <div className={styles.stateLine}>
                    <span className={styles.stateBullet}>致命弱点</span>
                    <span>{c.fatal_weakness}</span>
                  </div>
                ) : null}
                {c.contradiction ? (
                  <div className={styles.stateLine}>
                    <span className={styles.stateBullet}>矛盾行为</span>
                    <span>{c.contradiction}</span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="世界词条"
        icon="world"
        defaultOpen={false}
        count={world.data?.length ?? 0}
      >
        {world.isPending ? (
          <div className={styles.skeletonBox}>
            <SkeletonRows count={2} />
          </div>
        ) : (world.data?.length ?? 0) === 0 ? (
          <div className={styles.sectionEmpty}>还没有世界词条</div>
        ) : (
          <ul>
            {world.data?.map((w) => (
              <li className={styles.item} key={w.id}>
                <div className={styles.itemHead}>
                  <span className={styles.itemTitle}>{w.name}</span>
                  <Badge variant="neutral">{WORLD_CATEGORY_LABELS[w.category]}</Badge>
                </div>
                {w.content ? <div className={styles.itemBody}>{w.content}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </>
  );
}
