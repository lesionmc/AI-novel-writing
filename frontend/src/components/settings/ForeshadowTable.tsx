import { useMemo, useState } from 'react';
import type {
  Foreshadow,
  ForeshadowStatus,
  ForeshadowWriteRequest,
  Importance,
} from '@/types/api';
import { useForeshadows } from '@/hooks/queries';
import { useCreateForeshadow, useUpdateForeshadow } from '@/hooks/mutations/settings';
import { FORESHADOW_STATUS_LABELS } from '@/lib/labels';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Modal } from '@/components/common/Modal';
import { SkeletonRows } from '@/components/common/Skeleton';
import { toast } from '@/stores/toastStore';
import { ForeshadowFilters } from './ForeshadowFilters';
import { ForeshadowForm } from './ForeshadowForm';
import { ForeshadowRow } from './ForeshadowRow';
import styles from './settings.module.css';

const BLANK: ForeshadowWriteRequest = {
  title: '',
  status: 'open',
  importance: 'medium',
  planted_chapter_seq: null,
  planned_payoff_seq: null,
  actual_payoff_seq: null,
  note: '',
};

const FORM_ID = 'foreshadow-form';

function toFormValue(f: Foreshadow): ForeshadowWriteRequest {
  return {
    title: f.title,
    status: f.status,
    importance: f.importance,
    planted_chapter_seq: f.planted_chapter_seq,
    planned_payoff_seq: f.planned_payoff_seq,
    actual_payoff_seq: f.actual_payoff_seq,
    note: f.note ?? '',
  };
}

/** 设定库 · 待回收的线索（R1 / TC-08）—— 行内改状态与重要度，闭环「埋设 → 回收」。
 *  [展示层口语化] 界面叫「线索」（`伏笔` 是语文词但 `台账` 是行话，QA M1 说看不懂）。 */
export function ForeshadowTable({ slug }: { slug: string }) {
  const [statusFilter, setStatusFilter] = useState<'' | ForeshadowStatus>('');
  const [importanceFilter, setImportanceFilter] = useState<'' | Importance>('');

  const filter = useMemo(
    () => ({
      status: statusFilter || undefined,
      importance: importanceFilter || undefined,
    }),
    [statusFilter, importanceFilter],
  );

  const query = useForeshadows(slug, filter);
  const create = useCreateForeshadow(slug);
  const update = useUpdateForeshadow(slug);

  const [editing, setEditing] = useState<Foreshadow | 'new' | null>(null);
  const [value, setValue] = useState<ForeshadowWriteRequest>(BLANK);
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<number | null>(null);

  const items = query.data ?? [];
  const saving = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;
  const filtered = statusFilter !== '' || importanceFilter !== '';

  const openNew = () => {
    setEditing('new');
    setValue(BLANK);
    setTitleError(undefined);
  };

  const openEdit = (f: Foreshadow) => {
    setEditing(f);
    setValue(toFormValue(f));
    setTitleError(undefined);
  };

  const close = () => {
    setEditing(null);
    create.reset();
    update.reset();
  };

  const patch = (p: Partial<ForeshadowWriteRequest>) => {
    setValue((v) => ({ ...v, ...p }));
    if (p.title !== undefined && titleError) setTitleError(undefined);
  };

  const submit = () => {
    if (!value.title.trim()) {
      setTitleError('线索标题不能为空');
      return;
    }
    const payload: ForeshadowWriteRequest = {
      ...value,
      title: value.title.trim(),
      note: value.note?.trim() || null,
    };
    if (editing === 'new') {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success('已记下这条线索');
          close();
        },
      });
    } else if (editing) {
      update.mutate(
        { id: editing.id, payload },
        {
          onSuccess: () => {
            toast.success('线索已保存');
            close();
          },
        },
      );
    }
  };

  const changeStatus = (id: number, status: ForeshadowStatus) => {
    setBusyId(id);
    update.mutate(
      { id, payload: { status } },
      {
        onSuccess: () => toast.success(`已标记为${FORESHADOW_STATUS_LABELS[status]}`),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const changeImportance = (id: number, importance: Importance) => {
    setBusyId(id);
    update.mutate(
      { id, payload: { importance } },
      { onSettled: () => setBusyId(null) },
    );
  };

  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.hintBlock}>
          埋下的每处线索都记一笔。写后面的章节时，还没回收的线索会自动出现在右栏提醒你，别让它们石沉大海。
        </span>
        <span className={styles.toolbarSpacer} />
        <Button variant="primary" icon="plus" onClick={openNew}>
          新建线索
        </Button>
      </div>

      <ForeshadowFilters
        status={statusFilter}
        importance={importanceFilter}
        onStatusChange={setStatusFilter}
        onImportanceChange={setImportanceFilter}
      />

      {query.isPending ? (
        <div className={styles.stateWrap}>
          <SkeletonRows count={4} />
        </div>
      ) : query.isError ? (
        <div className={styles.stateWrap}>
          <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon="filter"
            title="这个筛选下没有线索"
            description="换一个状态或重要度看看，或者清除筛选查看全部。"
            actionLabel="清除筛选"
            onAction={() => {
              setStatusFilter('');
              setImportanceFilter('');
            }}
          />
        ) : (
          <EmptyState
            icon="foreshadow"
            title="还没有记录线索"
            description="这一章埋了什么、准备第几章揭，随手记下一句，往下写就不会忘。"
            actionLabel="记下第一处线索"
            onAction={openNew}
          />
        )
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>线索</th>
                <th className={styles.th}>状态</th>
                <th className={styles.th}>重要度</th>
                <th className={styles.th}>埋设章</th>
                <th className={styles.th}>计划回收</th>
                <th className={styles.th}>实际回收</th>
                <th className={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <ForeshadowRow
                  key={f.id}
                  item={f}
                  busy={busyId === f.id}
                  onStatusChange={changeStatus}
                  onImportanceChange={changeImportance}
                  onEdit={openEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? '新建线索' : `编辑「${editing?.title ?? ''}」`}
        subtitle="埋设与回收的章节号对不上时，写作台右栏会提醒你这条线索还没回收"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={saving}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={submit}>
              保存
            </Button>
          </>
        }
      >
        <div className={styles.formStack}>
          {saveError ? <ErrorBar error={saveError} /> : null}
          <ForeshadowForm formId={FORM_ID} value={value} onChange={patch} titleError={titleError} />
        </div>
      </Modal>
    </>
  );
}
