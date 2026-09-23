import { Suspense, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Icon } from '@/components/common/Icon';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import type { IconName } from '@/types/ui';
import { GlobalNav } from './GlobalNav';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children?: ReactNode;
}

/**
 * 应用骨架（顶部一级导航 + 内容区），用于书库 / 设定库 / 大纲 / 质检 / 统计 / 设置 各页。
 * 一级导航固定 7 项（书库 / 写作台 / 设定库 / 大纲 / 统计 / 质检 / 设置）+ 作品选择器，
 * 由 `GlobalNav` 提供 —— **写作台也用同一条导航**（用户实测要求"上面的导航是固定每个页面的"），
 * 所以导航不再写在本文件里，避免两份实现漂移。
 * 质检页依次渲染「一致性审校 / 去 AI 味 / 敏感词」三块，一致性审校已上线
 * （`AuditPage.tsx` → `ConsistencySection` → `api.auditConsistencyStream`）。
 */
export function AppShell({ children }: AppShellProps) {
  const online = useOnlineStatus();

  return (
    <div className={styles.shell}>
      <GlobalNav />

      {!online ? (
        <OfflineBanner message="当前处于离线状态，本地功能照常可用；AI 相关操作暂不可用。" />
      ) : null}

      {/* 懒加载 chunk 到达前只换内容区，导航壳保持在场（整壳重挂会闪白） */}
      <div className={styles.body}>
        {children ?? (
          <Suspense fallback={<p className="pageSubtitle">加载中…</p>}>
            <Outlet />
          </Suspense>
        )}
      </div>
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
