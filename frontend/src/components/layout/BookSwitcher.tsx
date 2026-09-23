import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBook, useBooks } from '@/hooks/queries';
import { Icon } from '@/components/common/Icon';
import { bookPath } from '@/lib/slug';
import styles from './BookSwitcher.module.css';

/** 作品内子页白名单（与 App.tsx 路由表一一对应，改路由时同步改这里） */
const SUB_ROUTES = ['/start', '/chat', '/desk', '/settings', '/outline', '/audit', '/stats', '/config'];

/**
 * 取当前地址里的「作品内子页」。换书时保持在同一类子页是用户的默认预期
 * （在 A 的大纲上换成 B，应该看 B 的大纲，而不是被弹回写作台）。
 * 拿不到或不是已知子页时回落到写作台。
 */
function subPathOf(pathname: string): string {
  const m = /^\/book\/[^/]+(\/[^/?#]*)?/.exec(pathname);
  const sub = m?.[1] ?? '';
  return SUB_ROUTES.includes(sub) ? sub : '/desk';
}

export interface BookSwitcherProps {
  /** 当前作品 slug（来自地址）；不在作品页时为 null */
  slug: string | null;
  open: boolean;
  /** 导航项要求的目标子页：没有作品时点「大纲」→ '/outline'。null = 保持当前子页 */
  pendingSub: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * 作品选择器（导航条右侧固定入口）。
 * 为什么需要它：导航条此前只有"当前作品名"这一块只读标签，
 * 想换个作品只能先回书库再点进去（用户实测原话：「上面这些导航页里面应该是可以选择书本的」）。
 * 搜索框是必要的 —— 作品一多，纯列表滚起来找不到。
 */
export function BookSwitcher({ slug, open, pendingSub, onOpenChange }: BookSwitcherProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: books, isPending } = useBooks();
  const { data: current } = useBook(slug ?? undefined);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const keyword = query.trim().toLowerCase();
  const list = useMemo(() => {
    const all = books ?? [];
    if (!keyword) return all;
    return all.filter(
      (b) =>
        b.title.toLowerCase().includes(keyword) ||
        (b.genre ?? '').toLowerCase().includes(keyword),
    );
  }, [books, keyword]);

  // 打开时清空上次的关键词，并让焦点直接落在搜索框（打开即可输入）
  useEffect(() => {
    if (!open) return;
    setQuery('');
    inputRef.current?.focus();
  }, [open]);

  // 点外部 / Esc 关闭：与 Menu 的行为一致，避免"打开后只能再点一次触发器"
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onOpenChange]);

  /** 选中一部作品：URL 一律经 bookPath() 拼（幂等编码，避免双重编码导致 404） */
  const select = (nextSlug: string) => {
    const sub = pendingSub ?? subPathOf(location.pathname);
    onOpenChange(false);
    if (nextSlug === slug && sub === subPathOf(location.pathname)) return;
    navigate(bookPath(nextSlug, sub));
  };

  const title = current?.title ?? '';
  const total = books?.length ?? 0;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title ? `当前作品：${title}。点这里换一部作品` : '还没选定作品，点这里选一部'}
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="book" size={16} />
        <span className={title ? styles.triggerName : styles.triggerEmpty}>
          {title || '选择作品'}
        </span>
        <Icon name="chevronDown" size={16} />
      </button>

      {open ? (
        <div className={styles.popover} role="dialog" aria-label="选择作品">
          <div className={styles.searchRow}>
            <Icon name="search" size={16} />
            <input
              ref={inputRef}
              className={styles.search}
              type="search"
              value={query}
              placeholder="搜索作品名或题材"
              aria-label="搜索作品"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {isPending ? (
            <p className={styles.hint}>正在读取作品列表…</p>
          ) : total === 0 ? (
            <p className={styles.hint}>书库里还没有作品，先去「书库」新建一部。</p>
          ) : list.length === 0 ? (
            <p className={styles.hint}>没有匹配「{query.trim()}」的作品，换个词试试。</p>
          ) : (
            <ul className={styles.list}>
              {list.map((b) => {
                const active = b.slug === slug;
                return (
                  <li key={b.slug}>
                    <button
                      type="button"
                      className={[styles.item, active ? styles.itemActive : ''].join(' ')}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => select(b.slug)}
                    >
                      <span className={styles.itemMain}>
                        <span className={styles.itemTitle} title={b.title}>
                          {b.title}
                        </span>
                        <span className={styles.itemMeta}>
                          {b.genre ?? '未设题材'} · {b.chapter_count} 章
                        </span>
                      </span>
                      {active ? <Icon name="check" size={16} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
