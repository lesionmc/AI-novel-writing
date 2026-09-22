import type { IconName } from '@/types/ui';
import { Icon } from '@/components/common/Icon';
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  key: T;
  label: string;
  icon?: IconName;
  count?: number;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  active: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
}

/** 轻量 Tab 容器（设定库三 Tab 共用）。Tab 状态入 URL query，便于深链。 */
export function Tabs<T extends string>({ items, active, onChange, ariaLabel }: TabsProps<T>) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={it.key === active}
          className={[styles.tab, it.key === active ? styles.tabActive : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(it.key)}
        >
          {it.icon ? <Icon name={it.icon} size={16} /> : null}
          {it.label}
          {typeof it.count === 'number' ? <span className={styles.count}>{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
