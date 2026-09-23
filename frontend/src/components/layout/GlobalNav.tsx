import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon } from '@/components/common/Icon';
import type { IconName } from '@/types/ui';
import { bookPath } from '@/lib/slug';
import { BookSwitcher } from './BookSwitcher';
import styles from './AppShell.module.css';

/**
 * 从 /book/:slug/... 中稳健提取 slug（不依赖 layout route 的 useParams 行为）。
 * 只有本文件用得到，故不导出 —— 导出非组件会触发 react-refresh 的
 * "only-export-components" 警告，而这条警告是在提醒别把组件和工具混在一个文件里。
 */
function slugFromPath(pathname: string): string | null {
  const m = /^\/book\/([^/]+)/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    // 非法百分号转义（书名含 % 且链接未编码）时不能让整个取 slug 流程失败，
    // 否则该页所有 book-scoped 能力都会失去作用域。原样返回，交给下游再编码。
    return m[1];
  }
}

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  /** 是否依赖当前作品 */
  bookScoped: boolean;
  /** 作品内子路径；非作品页为 null（书库） */
  sub: string | null;
  to: (slug: string) => string;
}

const NAV: NavItem[] = [
  { key: 'library', label: '书库', icon: 'book', bookScoped: false, sub: null, to: (_s) => '/' },
  // 开书向导：按六阶段「立项 → 骨架 → 包装」走完再进写作台。
  // 放在书库之后、写作台之前 —— 它本来就是「动笔之前该做的事」。
  // 补这一项的原因：向导此前**没有任何导航入口**，用户新建完就再也回不去了
  // （optimizer-ui 审计 P0-1）；且 BookSwitcher 的子页白名单也漏了 '/start'，会导致换书时掉回写作台。
  {
    key: 'start',
    label: '开书',
    icon: 'bookOpen',
    bookScoped: true,
    sub: '/start',
    to: (s) => bookPath(s, '/start'),
  },
  // AI 助手：一个 AI 做完全部的对话工作台（有上下文、有记忆、退出再进来还能接着做）。
  // `bookScoped: false` —— **没有作品也能进**（进去后先让他选一部作品，而不是先撞一堵墙）。
  {
    key: 'chat',
    label: 'AI 助手',
    icon: 'chat',
    bookScoped: false,
    sub: '/chat',
    to: (s) => (s ? bookPath(s, '/chat') : '/chat'),
  },
  {
    key: 'desk',
    label: '写作台',
    icon: 'edit',
    bookScoped: true,
    sub: '/desk',
    to: (s) => bookPath(s, '/desk'),
  },
  {
    key: 'settings',
    label: '设定库',
    icon: 'user',
    bookScoped: true,
    sub: '/settings',
    to: (s) => bookPath(s, '/settings'),
  },
  {
    key: 'outline',
    label: '大纲',
    icon: 'outline',
    bookScoped: true,
    sub: '/outline',
    to: (s) => bookPath(s, '/outline'),
  },
  {
    key: 'stats',
    label: '统计',
    icon: 'stats',
    bookScoped: true,
    sub: '/stats',
    to: (s) => bookPath(s, '/stats'),
  },
  {
    key: 'audit',
    label: '质检',
    icon: 'audit',
    bookScoped: true,
    sub: '/audit',
    to: (s) => bookPath(s, '/audit'),
  },
  // 模型配置是**全局**的：没有作品时也要能进（QA M6：「想先把 AI 配好再写，找不到设置在哪」）。
  // 有作品时仍落到该作品的设置页；书库页没有作品时落到全局 `/config`。
  {
    key: 'config',
    label: '设置',
    icon: 'settings',
    bookScoped: false,
    sub: '/config',
    to: (s) => (s ? bookPath(s, '/config') : '/config'),
  },
];

/**
 * 全局一级导航（书库 / 开书 / AI 助手 / 写作台 / 设定库 / 大纲 / 统计 / 质检 / 设置 + 作品选择器）。
 *
 * 抽成独立组件的理由：**写作台与其它页面必须是同一条导航**。
 * 此前写作台是唯一不套 AppShell 的页面，「上面的导航没有」正是用户实测的抱怨；
 * 复制第二份导航条迟早会改一处漏一处，所以两处共用本组件。
 */
export function GlobalNav() {
  const location = useLocation();
  const slug = slugFromPath(location.pathname);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  /** 没作品时点了某个作品内导航项 → 记下他要去哪一页，选完作品直接落到那一页 */
  const [pendingSub, setPendingSub] = useState<string | null>(null);

  const closeSwitcher = (next: boolean) => {
    setSwitcherOpen(next);
    if (!next) setPendingSub(null);
  };

  return (
    <header className={styles.topnav}>
      <Link to="/" className={styles.brand}>
        <span className={styles.brandMark}>
          <Icon name="edit" size={16} />
        </span>
        AI 小说创作工具
      </Link>

      <nav className={styles.nav} aria-label="一级导航">
        {NAV.map((item) => {
          // 没有当前作品时**不置灰**：置灰会让用户以为"这些功能压根不存在"
          // （用户实测原话：「上面的导航是灰的选不了，是没有这个功能还是怎么样」）。
          // 功能一直都在，缺的只是作品上下文 —— 所以这里照样可点，点了就开作品选择器。
          if (item.bookScoped && !slug) {
            return (
              <button
                key={item.key}
                type="button"
                className={styles.navItem}
                title={`选一部作品后进入${item.label}`}
                aria-haspopup="dialog"
                aria-expanded={switcherOpen && pendingSub === item.sub}
                onClick={() => {
                  setPendingSub(item.sub);
                  setSwitcherOpen(true);
                }}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
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

      <BookSwitcher
        slug={slug}
        open={switcherOpen}
        pendingSub={pendingSub}
        onOpenChange={closeSwitcher}
      />
    </header>
  );
}
