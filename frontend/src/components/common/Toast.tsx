import { createPortal } from 'react-dom';
import { useToastStore } from '@/stores/toastStore';
import type { ToastType } from '@/stores/toastStore';
import { Icon } from './Icon';
import styles from './Toast.module.css';

const ICON: Record<ToastType, 'check' | 'error' | 'info'> = {
  success: 'check',
  error: 'error',
  info: 'info',
};

const ICON_CLASS: Record<ToastType, string> = {
  success: styles.iconSuccess,
  error: styles.iconError,
  info: styles.iconInfo,
};

/** 轻提示视口（挂载于应用根部）。3s 自动消失，不做文案占位。 */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className={styles.viewport} role="region" aria-label="通知">
      {toasts.map((t) => (
        <div key={t.id} className={[styles.toast, styles[t.type]].join(' ')} role="status">
          <Icon name={ICON[t.type]} size={16} className={ICON_CLASS[t.type]} />
          <span className={styles.message}>{t.message}</span>
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => dismiss(t.id)}
            aria-label="关闭通知"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
