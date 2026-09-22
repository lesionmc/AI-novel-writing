import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { Modal } from '@/components/common/Modal';
import { SkeletonRows } from '@/components/common/Skeleton';
import styles from './settings.module.css';

export interface AffectedChaptersDialogProps {
  open: boolean;
  characterName: string;
  chapterSeqs: number[];
  loading: boolean;
  error: unknown;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 设定变更追踪弹窗（约束 3 / TC-10）。
 * 保存人物卡前先查它被哪些章节引用过；有引用才弹，无引用直接保存。
 * 「取消」放弃本次修改；「仍然保存」让修改生效。
 */
export function AffectedChaptersDialog({
  open,
  characterName,
  chapterSeqs,
  loading,
  error,
  saving,
  onCancel,
  onConfirm,
}: AffectedChaptersDialogProps) {
  const preview = chapterSeqs.slice(0, 20);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`此修改会影响 ${chapterSeqs.length} 个章节`}
      subtitle={`这些章节里出现过「${characterName}」，改动后需要你自己判断是否要回去调整`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            取消修改
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={saving}>
            仍然保存
          </Button>
        </>
      }
    >
      {loading ? (
        <SkeletonRows count={3} />
      ) : error ? (
        <ErrorBar error={error} />
      ) : (
        <>
          <div className={styles.hintBlock}>
            <Icon name="warning" size={16} /> 这个产品不会自动重写已有章节，只负责把影响范围摆到你面前。
          </div>
          <div className={styles.affectedList}>
            {preview.map((n) => (
              <span key={n} className={styles.num}>
                第 {n} 章
              </span>
            ))}
            {chapterSeqs.length > preview.length ? (
              <span className={styles.num}>…等共 {chapterSeqs.length} 章</span>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );
}
