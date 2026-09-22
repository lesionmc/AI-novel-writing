import type { ReactNode } from 'react';
import type { ButtonVariant } from '@/types/ui';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 通用确认弹窗（删除作品 / 设定变更追踪等）。
 * 与 WritebackDialog 共用 Modal 基座；**回写弹窗不做二次确认**，此处仅用于真正的破坏性操作。
 */
export function ConfirmDialog({
  open,
  title,
  subtitle,
  children,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      subtitle={subtitle}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
