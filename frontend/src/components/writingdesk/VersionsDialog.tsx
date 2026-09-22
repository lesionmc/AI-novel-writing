import { useState } from 'react';
import type { ChapterVersion } from '@/types/api';
import { useVersions } from '@/hooks/queries';
import { useRestoreVersion } from '@/hooks/mutations/chapters';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Modal } from '@/components/common/Modal';
import { SkeletonRows } from '@/components/common/Skeleton';
import { formatDateTime, formatNumber } from '@/lib/format';
import { toast } from '@/stores/toastStore';
import styles from './VersionsDialog.module.css';

export interface VersionsDialogProps {
  open: boolean;
  slug: string;
  chapterId: number | null;
  onClose: () => void;
}

/**
 * 章节版本历史（R11 / TC-14）。
 * 快照时机仅三处：完成本章 / 手动存版本 / 回滚前 —— 由后端保证。
 * 回滚本身会先给当前内容存一次快照，因此回滚是可再找回的。
 */
export function VersionsDialog({ open, slug, chapterId, onClose }: VersionsDialogProps) {
  const query = useVersions(open ? chapterId : null);
  const restore = useRestoreVersion(slug);
  const [pending, setPending] = useState<ChapterVersion | null>(null);

  const versions = query.data ?? [];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="版本历史"
        subtitle="每次「完成本章」「存版本」「回滚」都会留下一个可还原的快照"
        footer={
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        }
      >
        <p className={styles.intro}>
          回滚会把正文恢复成该版本的内容；回滚前会自动为当前正文再存一个快照，所以这一步不会丢字。
        </p>
        {query.isPending ? (
          <div className={styles.loading}>
            <SkeletonRows count={3} />
          </div>
        ) : query.isError ? (
          <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
        ) : versions.length === 0 ? (
          <div className={styles.empty}>这一章还没有历史版本。点「完成本章」就会生成第一个快照。</div>
        ) : (
          <div className={styles.list}>
            {versions.map((v) => (
              <div className={styles.row} key={v.id}>
                <div className={styles.main}>
                  <div className={styles.time}>{formatDateTime(v.created_at)}</div>
                  {v.note ? <div className={styles.note}>{v.note}</div> : null}
                </div>
                <span className={styles.words}>{formatNumber(v.word_count)} 字</span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="history"
                  onClick={() => setPending(v)}
                >
                  回滚到该版本
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {pending ? (
        <ConfirmDialog
          open
          title="回滚到这一版？"
          confirmLabel="回滚"
          cancelLabel="取消"
          variant="primary"
          loading={restore.isPending}
          onCancel={() => {
            restore.reset();
            setPending(null);
          }}
          onConfirm={() => {
            if (chapterId === null) return;
            restore.mutate(
              { id: chapterId, vid: pending.id },
              {
                onSuccess: () => {
                  toast.success('已回滚到该版本');
                  setPending(null);
                  onClose();
                },
              },
            );
          }}
        >
          <p className={styles.dialogNote}>
            将把正文恢复为 {formatDateTime(pending.created_at)} 的版本（
            {formatNumber(pending.word_count)} 字）。当前正文会先存成新快照。
          </p>
          {restore.isError ? (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <ErrorBar error={restore.error} />
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
