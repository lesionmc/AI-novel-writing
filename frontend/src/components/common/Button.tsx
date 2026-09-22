import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import type { ButtonSize, ButtonVariant, IconName } from '@/types/ui';
import { Icon } from './Icon';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** loading 态：显示 spinner、禁用点击、保留原宽度 */
  loading?: boolean;
  /** 前置图标（走 Icon 单一入口） */
  icon?: IconName;
  /** 仅图标（正方形），必须同时提供 aria-label */
  iconOnly?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const ICON_SIZE: Record<ButtonSize, 16 | 20> = { sm: 16, md: 16, lg: 20 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    iconOnly = false,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = [
    styles.btn,
    styles[variant],
    styles[size],
    iconOnly ? styles.iconOnly : '',
    fullWidth ? styles.fullWidth : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const resolvedIcon: IconName | undefined = loading ? 'loader' : icon;

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {resolvedIcon ? (
        <Icon
          name={resolvedIcon}
          size={ICON_SIZE[size]}
          className={loading ? styles.spinner : undefined}
        />
      ) : null}
      {!iconOnly && children ? <span>{children}</span> : null}
      {iconOnly ? children : null}
    </button>
  );
});
