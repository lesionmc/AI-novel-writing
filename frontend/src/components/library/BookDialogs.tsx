import { useState } from 'react';
import type { BookBrief } from '@/types/api';
import { useUpdateBook } from '@/hooks/mutations/books';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { formatNumber } from '@/lib/format';
import styles from './BookDialogs.module.css';

/** 重命名作品（书库卡片菜单入口） */
export function RenameBookDialog({
  book,
  onClose,
  onSuccess,
}: {
  book: BookBrief;
  onClose: () => void;
  onSuccess: (title: string) => void;
}) {
  const [title, setTitle] = useState(book.title);
  const update = useUpdateBook(book.slug);

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    update.mutate(
      { title: t },
      {
        onSuccess: () => {
          onSuccess(t);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="重命名作品"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} loading={update.isPending}>
            保存
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        {update.isError ? <ErrorBar error={update.error} /> : null}
        <Input
          label="书名"
          required
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </div>
    </Modal>
  );
}

/** 删除作品（移入回收目录，不物理删除） */
export function DeleteBookDialog({
  book,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  book: BookBrief;
  loading: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open
      title="删除这个作品？"
      confirmLabel="移入回收目录"
      cancelLabel="取消"
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className={styles.dialogBody}>
        {error ? <ErrorBar error={error} /> : null}
        <p className={styles.dialogNote}>
          将把《{book.title}》整个目录移入回收目录，不会物理删除，之后还能恢复。
        </p>
        <ul className={styles.dangerList}>
          <li>{book.chapter_count} 个章节</li>
          <li>{formatNumber(book.total_words)} 字的正文</li>
          <li>全部设定、伏笔与角色状态</li>
        </ul>
      </div>
    </ConfirmDialog>
  );
}
