import { useState } from 'react';
import type { ChapterVersion } from '@/types/api';
import { api, userMessageOf } from '@/api/client';
import { useChapter, useVersions } from '@/hooks/queries';
import { useRestoreVersion } from '@/hooks/mutations/chapters';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Modal } from '@/components/common/Modal';
import { SkeletonRows } from '@/components/common/Skeleton';
import { formatDateTime, formatNumber } from '@/lib/format';
import { diffLines, diffStats, type DiffLine } from '@/lib/textDiff';
import { htmlToPlainText } from '@/lib/wordCount';
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
 * 「对比当前」用行级 diff（`lib/textDiff`）展示该版与现在正文的差异。
 */
/** 该版 vs 现在的行级差异：红=这版里有、现在没了；绿=现在新加的 */
function DiffView({ lines }: { lines: DiffLine[] }) {
  const { added, removed } = diffStats(lines);
  return (
    <div className={styles.diffBox}>
      <div className={styles.diffHead}>
        对比结果：新增 {added} 段 · 删除 {removed} 段（上=该版，下=现在的差异合并显示）
      </div>
      {lines.map((l, i) => (
        <div
          key={i}
          className={[
            styles.diffLine,
            l.kind === 'add' ? styles.diffAdd : l.kind === 'del' ? styles.diffDel : '',
          ].join(' ')}
        >
          <span className={styles.diffSign}>{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
          {l.text || '（空行）'}
        </div>
      ))}
    </div>
  );
}

export function VersionsDialog({ open, slug, chapterId, onClose }: VersionsDialogProps) {
  const query = useVersions(open ? chapterId : null);
  const chapter = useChapter(open ? chapterId : null);
  const restore = useRestoreVersion(slug);
  const [pending, setPending] = useState<ChapterVersion | null>(null);
  const [diffLinesShown, setDiffLinesShown] = useState<{ vid: number; lines: DiffLine[] } | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);

  const versions = query.data ?? [];

  const compare = async (v: ChapterVersion) => {
    if (chapterId === null) return;
    if (diffLinesShown?.vid === v.id) {
      setDiffLinesShown(null);
      return;
    }
    setDiffBusy(true);
    try {
      const [version, current] = await Promise.all([
        api.getChapterVersionContent(chapterId, v.id),
        chapter.data
          ? Promise.resolve(chapter.data)
          : api.getChapter(chapterId),
      ]);
      setDiffLinesShown({
        vid: v.id,
        lines: diffLines(
          htmlToPlainText(version.content),
          htmlToPlainText(current.content ?? ''),
        ),
      });
    } catch (e) {
      toast.error(userMessageOf(e));
    } finally {
      setDiffBusy(false);
    }
  };

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
              <div className={styles.rowGroup} key={v.id}>
                <div className={styles.row}>
                  <div className={styles.main}>
                    <div className={styles.time}>{formatDateTime(v.created_at)}</div>
                    {v.note ? <div className={styles.note}>{v.note}</div> : null}
                  </div>
                  <span className={styles.words}>{formatNumber(v.word_count)} 字</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="view"
                    loading={diffBusy && diffLinesShown?.vid !== v.id}
                    onClick={() => void compare(v)}
                  >
                    {diffLinesShown?.vid === v.id ? '收起对比' : '对比当前'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="history"
                    onClick={() => setPending(v)}
                  >
                    回滚到该版本
                  </Button>
                </div>
                {diffLinesShown?.vid === v.id ? <DiffView lines={diffLinesShown.lines} /> : null}
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
