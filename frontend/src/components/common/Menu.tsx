import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ButtonSize, ButtonVariant, IconName } from '@/types/ui';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './Menu.module.css';

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** 在该项之前插入分隔线 */
  separatorBefore?: boolean;
}

export interface MenuProps {
  /** 触发按钮文字（与 icon 至少提供一个） */
  triggerLabel?: string;
  triggerIcon?: IconName;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerIconOnly?: boolean;
  triggerAriaLabel?: string;
  items: MenuItem[];
  align?: 'start' | 'end';
  /** 受控开合（可选） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 在触发器右侧附加内容（如状态点） */
  trailing?: ReactNode;
}

/** 下拉菜单：点击外部 / Esc 关闭，支持方向键移动焦点 */
export function Menu({
  triggerLabel,
  triggerIcon = 'more',
  triggerVariant = 'ghost',
  triggerSize = 'md',
  triggerIconOnly = false,
  triggerAriaLabel,
  items,
  align = 'end',
  open,
  onOpenChange,
  trailing,
}: MenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [isOpen, setOpen]);

  useEffect(() => {
    if (isOpen) {
      const first = listRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
      first?.focus();
    }
  }, [isOpen]);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const nodes = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    );
    if (nodes.length === 0) return;
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'ArrowDown'
        ? nodes[(idx + 1) % nodes.length]
        : nodes[(idx - 1 + nodes.length) % nodes.length];
    e.preventDefault();
    next.focus();
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        icon={triggerIcon}
        iconOnly={triggerIconOnly}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={triggerIconOnly ? (triggerAriaLabel ?? triggerLabel) : triggerAriaLabel}
        title={triggerIconOnly ? (triggerAriaLabel ?? triggerLabel) : undefined}
        onClick={() => setOpen(!isOpen)}
      >
        {triggerIconOnly ? undefined : triggerLabel}
      </Button>
      {trailing}
      {isOpen ? (
        <div
          ref={listRef}
          className={[styles.menu, align === 'end' ? styles.alignEnd : styles.alignStart].join(' ')}
          role="menu"
          onKeyDown={onListKeyDown}
        >
          {items.map((it) => (
            <div key={it.key}>
              {it.separatorBefore ? <div className={styles.separator} role="separator" /> : null}
              <button
                type="button"
                role="menuitem"
                className={[styles.item, it.danger ? styles.itemDanger : ''].filter(Boolean).join(' ')}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.icon ? <Icon name={it.icon} size={16} /> : null}
                {it.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
