import { Button } from '@/components/common/Button';
import styles from './WritebackDialog.module.css';

export interface DialogFooterProps {
  accepted: number;
  total: number;
  allAccepted: boolean;
  confirming: boolean;
  onToggleAll: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 回写弹窗页脚。
 * 关键：**不做二次确认** —— 点「确认并保存」即落库并跳下一章；
 * 点「取消」= 什么都不做（章节仍为 draft，TC-24）。
 */
export function DialogFooter({
  accepted,
  total,
  allAccepted,
  confirming,
  onToggleAll,
  onCancel,
  onConfirm,
}: DialogFooterProps) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel} disabled={confirming}>
        取消
      </Button>
      <span className={styles.footerCount}>
        将写入 {accepted} / {total} 条
      </span>
      <Button variant="secondary" onClick={onToggleAll} disabled={confirming || total === 0}>
        {allAccepted ? '全不选' : '全选'}
      </Button>
      <Button variant="accent" icon="check" loading={confirming} onClick={onConfirm}>
        确认并保存
      </Button>
    </>
  );
}
