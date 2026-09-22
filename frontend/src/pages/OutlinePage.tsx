import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { OutlineCandidate, OutlineNode } from '@/types/api';
import { useOutlines, useProviders } from '@/hooks/queries';
import {
  useCreateOutline,
  useDeleteOutline,
  useUpdateOutline,
} from '@/hooks/mutations/outlines';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { SkeletonRows } from '@/components/common/Skeleton';
import { OutlineTree } from '@/components/outline/OutlineTree';
import {
  childrenOf,
  defaultNodeLabel,
  descendantIds,
  findOutlineNode,
  nextSeqForLevel,
  nextSeqUnder,
} from '@/components/outline/outlineModel';
import { OutlineDetail } from '@/components/outline/OutlineDetail';
import type { OutlineDraft } from '@/components/outline/OutlineDetail';
import { toast } from '@/stores/toastStore';
import styles from '@/components/outline/outline.module.css';

/**
 * 大纲 `/book/:slug/outline`（R7）。
 * 三级树（总纲 → 卷纲 → 章节卡）+ 右详情。AI 展开只出候选，**填入编辑框，用户改完再保存**。
 */
export function OutlinePage() {
  const { slug = '' } = useParams();
  const query = useOutlines(slug);
  const providers = useProviders();
  const create = useCreateOutline(slug);
  const update = useUpdateOutline(slug);
  const remove = useDeleteOutline(slug);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<OutlineDraft>({ title: '', content: '' });
  const [candidates, setCandidates] = useState<OutlineCandidate[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<OutlineNode | null>(null);
  const syncRef = useRef('');

  const nodes = useMemo(() => query.data ?? [], [query.data]);
  const node = selectedId !== null ? findOutlineNode(nodes, selectedId) : null;

  // 默认选中第一个节点
  useEffect(() => {
    if (selectedId !== null) return;
    const first = nodes[0];
    if (first) setSelectedId(first.id);
  }, [nodes, selectedId]);

  // 选中节点 / 保存回填时同步草稿（用 updated_at 去重，避免打字被覆盖）
  useEffect(() => {
    if (!node) return;
    const key = `${node.id}:${node.updated_at}`;
    if (syncRef.current === key) return;
    syncRef.current = key;
    setDraft({ title: node.title ?? '', content: node.content ?? '' });
    setCandidates([]);
  }, [node]);

  const hasModel = (providers.data ?? []).some((p) => p.enabled);

  const select = useCallback((n: OutlineNode) => setSelectedId(n.id), []);

  const handleSave = () => {
    if (!node) return;
    update.mutate(
      { id: node.id, payload: { title: draft.title.trim() || null, content: draft.content.trim() || null } },
      { onSuccess: () => toast.success('大纲已保存') },
    );
  };

  const addChild = () => {
    if (!node || node.level === 'chapter') return;
    const level = node.level === 'total' ? 'volume' : 'chapter';
    create.mutate(
      { level, parent_id: node.id, seq: nextSeqUnder(nodes, node.id), title: '', content: '' },
      {
        onSuccess: (created) => {
          toast.success(level === 'volume' ? '已添加一卷' : '已添加一张章节卡');
          setSelectedId(created.id);
        },
      },
    );
  };

  const addTotal = () => {
    create.mutate(
      { level: 'total', seq: nextSeqForLevel(nodes, 'total'), title: '', content: '' },
      {
        onSuccess: (created) => {
          toast.success('已添加总纲');
          setSelectedId(created.id);
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    remove.mutate(id, {
      onSuccess: () => {
        toast.success('已删除');
        if (selectedId === id) setSelectedId(null);
        setDeleteTarget(null);
      },
    });
  };

  return (
    <main className="pageContent">
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">大纲</h1>
          <p className="pageSubtitle">
            先立总纲，再拆卷纲，最后落到章节卡。写到哪一章，心里都有张地图。
          </p>
        </div>
        <Button variant="primary" icon="plus" onClick={addTotal} loading={create.isPending}>
          添加总纲
        </Button>
      </header>

      {query.isPending ? (
        <div className={styles.detailPane}>
          <SkeletonRows count={5} />
        </div>
      ) : query.isError ? (
        <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
      ) : nodes.length === 0 ? (
        <EmptyState
          icon="outline"
          title="还没有大纲"
          description="从一条总纲开始：这本书大概讲什么、主角要走到哪。之后再慢慢拆成卷和章节卡。"
          actionLabel="添加总纲"
          onAction={addTotal}
          actionLoading={create.isPending}
        />
      ) : (
        <div className={styles.layout}>
          <aside className={styles.treePane}>
            <div className={styles.treePaneHead}>
              <span className={styles.treePaneTitle}>结构</span>
            </div>
            <OutlineTree nodes={nodes} selectedId={selectedId} onSelect={select} />
          </aside>

          <section className={styles.detailPane}>
            {node ? (
              <OutlineDetail
                node={node}
                children={childrenOf(nodes, node.id)}
                draft={draft}
                onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                saving={update.isPending}
                saveError={update.error}
                onSave={handleSave}
                onDelete={() => setDeleteTarget(node)}
                onAddChild={addChild}
                addingChild={create.isPending}
                onSelectChild={select}
                onDeleteChild={setDeleteTarget}
                childCountOf={(n) => childrenOf(nodes, n.id).length}
                candidates={candidates}
                onCandidates={setCandidates}
                onClearCandidates={() => setCandidates([])}
                aiDisabled={!hasModel}
                aiDisabledHint="未配置可用的 AI 模型，先到「设置」里添加并启用一个"
              />
            ) : (
              <div className={styles.placeholderBox}>从左侧选一个节点开始编辑</div>
            )}
          </section>
        </div>
      )}

      {deleteTarget ? (
        <ConfirmDialog
          open
          title="删除这个节点？"
          confirmLabel="删除"
          cancelLabel="取消"
          loading={remove.isPending}
          onCancel={() => {
            remove.reset();
            setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        >
          <p className={styles.childMeta}>
            将删除「{defaultNodeLabel(deleteTarget)}」
            {descendantIds(nodes, deleteTarget.id).length > 1
              ? ` 及其下 ${descendantIds(nodes, deleteTarget.id).length - 1} 个下级节点`
              : ''}
            。已写好的正文不受影响。
          </p>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
