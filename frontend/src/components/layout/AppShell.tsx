import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useBook } from '@/hooks/queries';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Icon } from '@/components/common/Icon';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import type { IconName } from '@/types/ui';
import styles from './AppShell.module.css';

/** 从 /book/:slug/... 中稳健提取 slug（不依赖 layout route 的 useParams 行为） */
function slugFromPath(pathname: string): string | null {
  const m = /^\/book\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  to: (slug: string) => string;
  /** 是否依赖当前作品 */
  bookScoped: boolean;
}

const NAV: NavItem[] = [
  { key: 'library', label: '书库', icon: 'book', to: () => '/', bookScoped: false },
  { key: 'desk', label: '写作台', icon: 'edit', to: (s) => `/book/${s}/desk`, bookScoped: true },
  { key: 'settings', label: '设定库', icon: 'user', to: (s) => `/book/${s}/settings`, bookScoped: true },
  { key: 'outline', label: '大纲', icon: 'outline', to: (s) => `/book/${s}/outline`, bookScoped: true },
  { key: 'stats', label: '统计', icon: 'stats', to: (s) => `/book/${s}/stats`, bookScoped: true },
  { key: 'audit', label: '质检', icon: 'audit', to: (s) => `/book/${s}/audit`, bookScoped: true },
  // 模型配置是**全局**的：没有作品时也要能进（QA M6：「想先把 AI 配好再写，找不到设置在哪」）。
  // 有作品时仍落到该作品的设置页；书库页没有作品时落到全局 `/config`。
  {
    key: 'config',
    label: '设置',
    icon: 'settings',
    to: (s) => (s ? `/book/${s}/config` : '/config'),
    bookScoped: false,
  },
];

export interface AppShellProps {
  children?: ReactNode;
}

/**
 * 应用骨架（顶部一级导航 + 内容区），用于书库 / 设定库 / 大纲 / 质检 / 统计 / 设置 各页。
 * 写作台使用自有三栏骨架（WritingDesk），不套用本骨架（04 §2.1）。
 * 一级导航固定 7 项（书库 / 写作台 / 设定库 / 大纲 / 统计 / 质检 / 设置）。
 * [注意] 质检页里「一致性审校」区块尚未上线（后端 SSE 未就绪），页内以说明态标注。
 */
export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const online = useOnlineStatus();
  const slug = slugFromPath(location.pathname);
  const { data: book } = useBook(slug ?? undefined);

  return (
    <div className={styles.shell}>
      <header className={styles.topnav}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="edit" size={16} />
          </span>
          AI 小说创作工具
        </Link>

        <nav className={styles.nav} aria-label="一级导航">
          {NAV.map((item) => {
            const disabled = item.bookScoped && !slug;
            if (disabled) {
              return (
                <span
                  key={item.key}
                  className={[styles.navItem, styles.navItemDisabled].join(' ')}
                  title="请先打开一部作品"
                  aria-disabled="true"
                >
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </span>
              );
            }
            const to = slug ? item.to(slug) : item.to('');
            return (
              <NavLink
                key={item.key}
                to={to}
                end={item.key === 'library'}
                className={({ isActive }) =>
                  [styles.navItem, isActive ? styles.navItemActive : ''].join(' ')
                }
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {slug && book ? (
          <span className={styles.bookTag} title={book.title}>
            <Icon name="book" size={16} />
            <span className={styles.bookTagName}>{book.title}</span>
          </span>
        ) : null}
      </header>

      {!online ? (
        <OfflineBanner message="当前处于离线状态，本地功能照常可用；AI 相关操作暂不可用。" />
      ) : null}

      <div className={styles.body}>{children ?? <Outlet />}</div>
    </div>
  );
}

export interface SubNavItem {
  key: string;
  label: string;
  icon: IconName;
  to?: string;
  onClick?: () => void;
  active?: boolean;
}

/** 二级页左导航（240px） */
export function SubNav({ title, items }: { title: string; items: SubNavItem[] }) {
  return (
    <aside className={styles.subnav} aria-label={title}>
      <div className={styles.subnavTitle}>{title}</div>
      <ul>
        {items.map((it) => {
          const cls = [styles.subnavItem, it.active ? styles.subnavItemActive : '']
            .filter(Boolean)
            .join(' ');
          return (
            <li key={it.key}>
              {it.to ? (
                <NavLink to={it.to} className={cls}>
                  <Icon name={it.icon} size={16} />
                  {it.label}
                </NavLink>
              ) : (
                <button
                  type="button"
                  className={[cls, styles.subnavButton].join(' ')}
                  onClick={it.onClick}
                >
                  <Icon name={it.icon} size={16} />
                  {it.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
