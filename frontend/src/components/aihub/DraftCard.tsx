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
  /** 书名候选卡专用：点某一行 = 采用该书名 */
  onPickTitle?: (title: string) => void;
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

/** 立项卡：无书对话的落点 —— 确认后一键建书，方向原样带进新书 */
function BookPlanRows({ draft }: { draft: Extract<HubDraft, { kind: 'book_plan' }> }) {
  const rows: Array<[string, string | null]> = [
    ['书名（可后改）', draft.title],
    ['题材', draft.genre],
    ['写给谁', draft.readers],
    ['一句话卖点', draft.premise],
    ['目标体量', draft.targetWords ? `${Math.round(draft.targetWords / 10000)} 万字` : null],
  ];
  return (
    <div className={styles.draftList}>
      {rows
        .filter((r): r is [string, string] => Boolean(r[1]))
        .map(([label, value]) => (
          <div className={styles.draftItem} key={label}>
            <span className={styles.draftItemName}>{label}</span>
            <span className={styles.draftItemMeta}>{value}</span>
          </div>
        ))}
    </div>
  );
}

/**
 * 草稿卡片 = **AI 产出到落库之间的那道人工闸门**（红线 2）。
 * 用户点「确认写入」之前，一个字都不会进库；「丢弃」则只留在本机对话里。
 *
 * 三个不落当前作品库的特例：`prose`（只复制）、`retrospective`（只复制）、
 * `title_options`（点某一行才 PATCH 成书名 —— AI 出量、人拍板）。
 */
export function DraftCard({
  slug,
  draft,
  state,
  busy,
  onConfirm,
  onDiscard,
  onPickTitle,
}: DraftCardProps) {
  const isProse = draft.kind === 'prose';
  const isRetro = draft.kind === 'retrospective';
  const isPlan = draft.kind === 'book_plan';
  const isTitles = draft.kind === 'title_options';
  const resolved = state !== undefined;

  const headNote = isProse
    ? '（草稿，不会自动保存）'
    : isRetro
      ? '（复制带走，存进你的方法论文件夹）'
      : isPlan
        ? '（点确认后这本书就正式建起来）'
        : isTitles
          ? '（点中意的书名即采用 —— 定稿权在你）'
          : '（还没写进作品，等你确认）';

  return (
    <div className={[styles.draftCard, resolved ? styles.draftDone : ''].join(' ')}>
      <span className={styles.draftHead}>
        <Icon name="sparkles" size={16} />
        {draftLabel(draft)}
        {headNote}
      </span>

      {draft.kind === 'characters' ? <CharacterRows draft={draft} /> : null}
      {draft.kind === 'world_entries' ? <WorldRows draft={draft} /> : null}
      {draft.kind === 'outline_nodes' ? <OutlineRows draft={draft} /> : null}
      {draft.kind === 'book_plan' ? <BookPlanRows draft={draft} /> : null}
      {draft.kind === 'prose' ? <div className={styles.prose}>{draft.text}</div> : null}
      {draft.kind === 'retrospective' ? (
        <div className={styles.prose}>{draft.content}</div>
      ) : null}
      {draft.kind === 'title_options' ? (
        <div className={styles.titleGrid}>
          {draft.titles.map((t) => (
            <button
              key={t}
              type="button"
              className={styles.titleChip}
              disabled={busy || resolved}
              onClick={() => onPickTitle?.(t)}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      {resolved ? (
        <span className={styles.draftStateText}>
          {state === 'discarded'
            ? '已丢弃，没有写进作品。'
            : isProse
              ? '已复制。到写作台粘贴，改完再保存。'
              : isRetro
                ? '复盘已复制。'
                : isTitles
                  ? '书名已采用，随时能再改。'
                  : isPlan
                    ? '书已建好，这轮对话已带进新书。'
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
          {isTitles ? null : (
            <Button variant="primary" size="sm" loading={busy} onClick={onConfirm}>
              {isProse ? '复制这段' : isRetro ? '复制复盘' : isPlan ? '就建这本' : '确认写入'}
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>
            {isTitles ? '不用了' : '丢弃'}
          </Button>
        </div>
      )}
    </div>
  );
}
