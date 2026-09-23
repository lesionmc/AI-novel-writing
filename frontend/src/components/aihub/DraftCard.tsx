import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { bookPath } from '@/lib/slug';
import { WORLD_CATEGORY_LABELS, OUTLINE_LEVEL_LABELS, ROLE_LABELS } from '@/lib/labels';
import { draftLabel } from './hubModel';
import type { HubDraft } from './hubModel';
import styles from './hub.module.css';

export interface DraftCardProps {
  slug: string;
  draft: HubDraft;
  /** 处理结果；未处理时不传 */
  state?: 'applied' | 'discarded';
  busy: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}

function CharacterRows({ draft }: { draft: Extract<HubDraft, { kind: 'characters' }> }) {
  return (
    <div className={styles.draftList}>
      {draft.characters.map((c, i) => (
        <div className={styles.draftItem} key={`${c.name}-${i}`}>
          <span className={styles.draftItemName}>
            {c.name}
            <span className={styles.draftItemMeta}>
              {c.role ? ROLE_LABELS[c.role] : '配角'}
              {c.surface_identity ? ` · ${c.surface_identity}` : ''}
            </span>
          </span>
          {c.secret_desire ? (
            <span className={styles.draftItemMeta}>想要：{c.secret_desire}</span>
          ) : null}
          {c.fatal_weakness ? (
            <span className={styles.draftItemMeta}>软肋：{c.fatal_weakness}</span>
          ) : null}
          {c.contradiction ? (
            <span className={styles.draftItemMeta}>矛盾：{c.contradiction}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WorldRows({ draft }: { draft: Extract<HubDraft, { kind: 'world_entries' }> }) {
  return (
    <div className={styles.draftList}>
      {draft.entries.map((w, i) => (
        <div className={styles.draftItem} key={`${w.name}-${i}`}>
          <span className={styles.draftItemName}>
            {w.name}
            <span className={styles.draftItemMeta}>
              {w.category ? WORLD_CATEGORY_LABELS[w.category] : '其他'}
            </span>
          </span>
          {w.content ? <span className={styles.draftItemMeta}>{w.content}</span> : null}
        </div>
      ))}
    </div>
  );
}

function OutlineRows({ draft }: { draft: Extract<HubDraft, { kind: 'outline_nodes' }> }) {
  return (
    <div className={styles.draftList}>
      {draft.nodes.map((n, i) => (
        <div className={styles.draftItem} key={`${n.title}-${i}`}>
          <span className={styles.draftItemName}>
            {n.title}
            <span className={styles.draftItemMeta}>{OUTLINE_LEVEL_LABELS[n.level]}</span>
          </span>
          {n.content ? <span className={styles.draftItemMeta}>{n.content}</span> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * 草稿卡片 = **AI 产出到落库之间的那道人工闸门**（红线 2）。
 * 用户点「确认写入」之前，一个字都不会进库；「丢弃」则只留在本机对话里。
 *
 * 正文（`prose`）是唯一例外：它**永不自动保存**，只提供「复制这段」+ 去写作台的入口，
 * 由作者自己粘贴、删改、定稿。
 */
export function DraftCard({ slug, draft, state, busy, onConfirm, onDiscard }: DraftCardProps) {
  const isProse = draft.kind === 'prose';
  const resolved = state !== undefined;

  return (
    <div className={[styles.draftCard, resolved ? styles.draftDone : ''].join(' ')}>
      <span className={styles.draftHead}>
        <Icon name="sparkles" size={16} />
        {draftLabel(draft)}
        {isProse ? '（草稿，不会自动保存）' : '（还没写进作品，等你确认）'}
      </span>

      {draft.kind === 'characters' ? <CharacterRows draft={draft} /> : null}
      {draft.kind === 'world_entries' ? <WorldRows draft={draft} /> : null}
      {draft.kind === 'outline_nodes' ? <OutlineRows draft={draft} /> : null}
      {draft.kind === 'prose' ? <div className={styles.prose}>{draft.text}</div> : null}

      {resolved ? (
        <span className={styles.draftStateText}>
          {state === 'discarded'
            ? '已丢弃，没有写进作品。'
            : isProse
              ? '已复制。到写作台粘贴，改完再保存。'
              : '已写进作品。'}
          {state === 'applied' && isProse ? (
            <>
              {' '}
              <Link to={bookPath(slug, '/desk')}>去写作台</Link>
            </>
          ) : null}
        </span>
      ) : (
        <div className={styles.draftActions}>
          <Button variant="primary" size="sm" loading={busy} onClick={onConfirm}>
            {isProse ? '复制这段' : '确认写入'}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>
            丢弃
          </Button>
        </div>
      )}
    </div>
  );
}
