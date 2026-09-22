import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  /** 尺寸：sm=420（确认框）/ lg=640（回写弹窗） */
  size?: 'sm' | 'lg';
  /** 页脚两端对齐（左侧放「全选/全不选」等） */
  footerSpread?: boolean;
  /** 点击遮罩是否关闭；默认 true，回写弹窗应传 false 以避免误关丢失确认 */
  closeOnOverlay?: boolean;
  /** 是否显示右上角关闭按钮（回写弹窗显式关闭应走「取消」） */
  showClose?: boolean;
  /** 阻断 Esc 关闭 */
  disableEsc?: boolean;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 弹窗基座：焦点陷阱 + Esc 关闭 + aria-modal。
 * 焦点陷阱与回写弹窗共用；回写弹窗额外保证「确认即落库、取消即无操作、不做二次确认」。
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  size = 'sm',
  footerSpread = false,
  closeOnOverlay = true,
  showClose = true,
  disableEsc = false,
  children,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // onClose 每次渲染都是新函数（调用方几乎都传内联箭头）。用 ref 固定引用，
  // 让下面的 handleKeyDown 保持稳定身份，避免开合 effect 反复重跑。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableEsc) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    },
    [disableEsc],
  );

  // 键盘监听（Esc / Tab 焦点陷阱）：handleKeyDown 已稳定，只在开合时重挂。
  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, handleKeyDown]);

  // 开合副作用：滚动锁 + 记录/恢复焦点。**只依赖 open**。
  // 若把 handleKeyDown（随父组件渲染而变）放进依赖，父组件每敲一个字都会重跑本
  // effect：cleanup 把焦点还给弹窗外的元素、setup 又把焦点抢到弹窗首个元素 ——
  // 表现就是「输入框打一个字跳一次焦点」，表单像卡死。
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 初始聚焦：优先首个可聚焦元素，否则容器本身
    const root = containerRef.current;
    const firstFocusable = root?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? root)?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        className={[styles.dialog, size === 'lg' ? styles.lg : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title || showClose ? (
          <div className={styles.header}>
            <div className={styles.titleWrap}>
              {title ? (
                <h2 className={styles.title} id={titleId}>
                  {title}
                </h2>
              ) : null}
              {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
            </div>
            {showClose ? (
              <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
                <Icon name="close" size={20} />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={styles.body}>{children}</div>
        {footer ? (
          <div className={[styles.footer, footerSpread ? styles.footerSpread : ''].filter(Boolean).join(' ')}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
