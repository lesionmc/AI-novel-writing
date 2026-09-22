import { useMemo, useState } from 'react';
import type { WorldEntry, WorldEntryCategory, WorldEntryWriteRequest } from '@/types/api';
import { useWorldEntries } from '@/hooks/queries';
import {
  useCreateWorldEntry,
  useDeleteWorldEntry,
  useUpdateWorldEntry,
} from '@/hooks/mutations/settings';
import { WORLD_CATEGORY_LABELS } from '@/lib/labels';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { Select } from '@/components/common/Select';
import { SkeletonRows } from '@/components/common/Skeleton';
import { Textarea } from '@/components/common/Textarea';
import { toast } from '@/stores/toastStore';
import styles from './settings.module.css';

const BLANK: WorldEntryWriteRequest = {
  category: 'place',
  name: '',
  content: '',
  parent_id: null,
  tags: [],
};

const CATEGORY_OPTIONS = (Object.keys(WORLD_CATEGORY_LABELS) as WorldEntryCategory[]).map((v) => ({
  value: v,
  label: WORLD_CATEGORY_LABELS[v],
}));

interface TreeNode {
  entry: WorldEntry;
  depth: number;
}

/** 把扁平词条按 parent_id 组织成可渲染的层级序列（父 → 子） */
function buildTree(entries: WorldEntry[]): TreeNode[] {
  const byParent = new Map<number | null, WorldEntry[]>();
  const ids = new Set(entries.map((e) => e.id));
  for (const e of entries) {
    // 父级已被删除（parent 置空）或父级不在列表内 → 归为顶层
    const parent = e.parent_id !== null && ids.has(e.parent_id) ? e.parent_id : null;
    const list = byParent.get(parent) ?? [];
    list.push(e);
    byParent.set(parent, list);
  }
  const out: TreeNode[] = [];
  const walk = (parent: number | null, depth: number) => {
    const list = (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    for (const e of list) {
      out.push({ entry: e, depth });
      walk(e.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function WorldEntriesTab({ slug }: { slug: string }) {
  const query = useWorldEntries(slug);
  const create = useCreateWorldEntry(slug);
  const update = useUpdateWorldEntry(slug);
  const remove = useDeleteWorldEntry(slug);

  const [editing, setEditing] = useState<WorldEntry | 'new' | null>(null);
  const [value, setValue] = useState<WorldEntryWriteRequest>(BLANK);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<WorldEntry | null>(null);

  const entries = useMemo(() => query.data ?? [], [query.data]);
  const tree = useMemo(() => buildTree(entries), [entries]);
  const saving = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;

  const openNew = () => {
    setEditing('new');
    setValue(BLANK);
    setNameError(undefined);
  };

  const openEdit = (e: WorldEntry) => {
    setEditing(e);
    setValue({
      category: e.category,
      name: e.name,
      content: e.content ?? '',
      parent_id: e.parent_id,
      tags: e.tags ?? [],
    });
    setNameError(undefined);
  };

  const close = () => {
    setEditing(null);
    create.reset();
    update.reset();
  };

  const submit = () => {
    if (!value.name.trim()) {
      setNameError('名称不能为空');
      return;
    }
    const payload: WorldEntryWriteRequest = {
      ...value,
      name: value.name.trim(),
      content: value.content?.trim() || null,
    };
    if (editing === 'new') {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success('已新建世界词条');
          close();
        },
      });
    } else if (editing) {
      update.mutate(
        { id: editing.id, payload },
        {
          onSuccess: () => {
            toast.success('词条已保存');
            close();
          },
        },
      );
    }
  };

  if (query.isPending) {
    return (
      <div className={styles.stateWrap}>
        <SkeletonRows count={4} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className={styles.stateWrap}>
        <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  // 上级候选：编辑中排除自身（原写法在 editing===null 时对 null 取 .id，库里有词条就白屏）
  const editingId = editing && editing !== 'new' ? editing.id : null;
  const parentOptions = entries
    .filter((e) => e.id !== editingId)
    .map((e) => ({ value: String(e.id), label: `${e.name}（${WORLD_CATEGORY_LABELS[e.category]}）` }));

  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.hintBlock}>
          势力、地点、规则、物品都放这里，可以挂上下级（如「南疆」下挂「黑水城」）。
        </span>
        <span className={styles.toolbarSpacer} />
        <Button variant="primary" icon="plus" onClick={openNew}>
          新建词条
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon="world"
          title="还没有世界词条"
          description="把反复出现的地点、势力、规则记下来，写的时候右栏就能随手查到。"
          actionLabel="新建第一个词条"
          onAction={openNew}
        />
      ) : (
        <div className={styles.list}>
          {tree.map(({ entry, depth }) => (
            <div
              className={styles.listItem}
              key={entry.id}
              style={depth > 0 ? { paddingLeft: `calc(var(--space-4) + ${depth} * var(--space-6))` } : undefined}
            >
              <div className={styles.listItemMain}>
                <div className={styles.listItemTitle}>
                  {depth > 0 ? <Icon name="arrowRight" size={16} /> : null}
                  {entry.name}
                  <Badge variant="neutral">{WORLD_CATEGORY_LABELS[entry.category]}</Badge>
                  {entry.parent_id === null && tree.some((t) => t.entry.parent_id === entry.id) ? (
                    <Badge variant="primary" icon="layers">
                      含子级
                    </Badge>
                  ) : null}
                </div>
                {entry.content ? <div className={styles.listItemMeta}>{entry.content}</div> : null}
              </div>
              <div className={styles.listItemActions}>
                <Button size="sm" variant="ghost" icon="edit" onClick={() => openEdit(entry)}>
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="trash"
                  aria-label={`删除 ${entry.name}`}
                  title="删除"
                  onClick={() => setDeleting(entry)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? '新建世界词条' : `编辑「${editing?.name ?? ''}」`}
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
          <div className={styles.formGrid}>
            <Input
              label="名称"
              required
              value={value.name}
              error={nameError}
              placeholder="例如：南疆"
              onChange={(e) => {
                setValue((v) => ({ ...v, name: e.target.value }));
                if (nameError) setNameError(undefined);
              }}
            />
            <Select
              label="类别"
              options={CATEGORY_OPTIONS}
              value={value.category}
              onChange={(e) => setValue((v) => ({ ...v, category: e.target.value as WorldEntryCategory }))}
            />
          </div>
          <Select
            label="上级词条"
            options={parentOptions}
            placeholder="不设上级（顶层）"
            value={value.parent_id === null ? '' : String(value.parent_id)}
            onChange={(e) =>
              setValue((v) => ({ ...v, parent_id: e.target.value ? Number(e.target.value) : null }))
            }
            hint="删除上级时，下级不会被一起删掉，只会变回顶层"
          />
          <Textarea
            label="描述"
            rows={4}
            value={value.content ?? ''}
            placeholder="写清它在故事里的作用，以及会反复用到的细节"
            onChange={(e) => setValue((v) => ({ ...v, content: e.target.value }))}
          />
        </div>
      </Modal>

      {deleting ? (
        <ConfirmDialog
          open
          title="删除这个词条？"
          confirmLabel="删除"
          cancelLabel="取消"
          loading={remove.isPending}
          onCancel={() => {
            remove.reset();
            setDeleting(null);
          }}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success('词条已删除');
                setDeleting(null);
              },
            })
          }
        >
          <p className={styles.hintBlock}>
            删除「{deleting.name}」后，它的下级词条会变回顶层，不会被一起删除。
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
