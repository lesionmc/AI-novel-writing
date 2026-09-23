import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '@/hooks/queries';
import { bookPath } from '@/lib/slug';
import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/common/Button';
import type { HubSession } from './hubModel';
import styles from './hub.module.css';

/**
 * 作品选择器。换书 = 导航到 `/book/<slug>/chat`（对话因此天然按作品隔离）。
 * 从 `/chat`（还没选作品）选一部，就落到那本书的对话页。
 */
export function BookPicker({ slug }: { slug: string }) {
  const { data: books, isPending } = useBooks();
  const navigate = useNavigate();
  const list = books ?? [];

  if (isPending) return <span className={styles.bookPickerName}>正在读取作品…</span>;
  if (list.length === 0) return <span className={styles.bookPickerName}>书库里还没有作品</span>;

  return (
    <label className={styles.bookPicker}>
      <Icon name="book" size={16} />
      <span className={styles.srOnly}>当前作品</span>
      <select
        className={styles.select}
        value={slug}
        onChange={(e) => {
          if (e.target.value) navigate(bookPath(e.target.value, '/chat'));
        }}
      >
        {slug ? null : <option value="">选择一部作品</option>}
        {list.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.title}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface SessionRailProps {
  slug: string;
  sessions: HubSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

function formatAt(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 左栏：作品选择器 + 会话列表（新建 / 切换 / 重命名 / 删除）。
 * 会话按作品分键存在 localStorage —— 换书不串，退出再进来还在（见 hubArchive.ts）。
 */
export function SessionRail({
  slug,
  sessions,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: SessionRailProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const commit = () => {
    if (editingId) onRename(editingId, draftTitle.trim() || '新对话');
    setEditingId(null);
  };

  return (
    <aside className={styles.rail} aria-label="对话列表">
      <div className={styles.railHead}>
        <span className={styles.railLabel}>当前作品</span>
        <BookPicker slug={slug} />
        <Button variant="primary" icon="plus" size="sm" fullWidth onClick={onCreate}>
          新建对话
        </Button>
      </div>

      <div className={styles.sessionList}>
        {sessions.length === 0 ? (
          <p className={styles.sideHint}>还没有对话，点上面「新建对话」开始。</p>
        ) : null}
        {sessions.map((s) => {
          const active = s.id === activeId;
          return (
            <div
              key={s.id}
              className={[styles.session, active ? styles.sessionActive : ''].join(' ')}
            >
              {editingId === s.id ? (
                <input
                  className={styles.select}
                  value={draftTitle}
                  aria-label="对话名称"
                  autoFocus
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.sessionMain}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(s.id)}
                >
                  <span className={styles.sessionTitle}>{s.title}</span>
                  <span className={styles.sessionMeta}>
                    {s.messages.length} 条 · {formatAt(s.updatedAt)}
                  </span>
                </button>
              )}
              <span className={styles.sessionTools}>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon="edit"
                  aria-label="重命名"
                  title="重命名"
                  onClick={() => {
                    setEditingId(s.id);
                    setDraftTitle(s.title);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon="trash"
                  aria-label="删除"
                  title="删除"
                  onClick={() => onDelete(s.id)}
                />
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
