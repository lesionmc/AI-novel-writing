import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { OutlineCandidate, OutlineNode } from '@/types/api';
import { useOutlines, useProviders } from '@/hooks/queries';
import {
  useCreateOutline,
  useDeleteOutline,
  useUpdateOutline,
} from '@/hooks/mutations/outlines';
import { Button } from '@/components/common/Button';
import { PageHeader } from '@/components/common/PageHeader';
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
import { loadOutlineDrafts, saveOutlineDrafts } from '@/components/outline/outlineDrafts';
import type { OutlineDraftMap } from '@/components/outline/outlineDrafts';
import { toast } from '@/stores/toastStore';
import styles from '@/components/outline/outline.module.css';

/**
 * 大纲 `/book/:slug/outline`（R7）。
 * 三级树（总纲 → 卷纲 → 章节卡）+ 右详情。AI 展开只出候选，**填入编辑框，用户改完再保存**。
 *
 * 用 `key={slug}` 把工作区**按作品分段**：换作品时整块重挂载，
 * 未保存草稿的 state 与它的 localStorage 存档因此天然按作品隔离 ——
 * 既不会把上一本的草稿带到下一本，也不会拿新 slug 的键去覆盖旧内容。
 */
export function OutlinePage() {
  const { slug = '' } = useParams();
  return <OutlineWorkspace key={slug} slug={slug} />;
}

function OutlineWorkspace({ slug }: { slug: string }) {
  const query = useOutlines(slug);
  const providers = useProviders();
  const create = useCreateOutline(slug);
  const update = useUpdateOutline(slug);
  const remove = useDeleteOutline(slug);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  /**
   * 未保存的本地草稿，按节点 id 存。
   * 切换节点**不再丢弃**已填内容 —— 原先切走即被服务端内容覆盖、且没有任何提示，
   * 实测表现为「填完总纲点一下别的节点，刚写的内容凭空消失」（库里 title/content 仍为空）。
   *
   * 初始值从 localStorage 读回（同一作品刷新/关标签页也不丢，见 outlineDrafts.ts）。
   * 刻意**不新增任何写请求**：大纲更新走的是按 id 定位的 `PATCH /api/outlines/{id}`，
   * 而该端点存在「靠全局当前作品指针定归属」的未修复 P0，自动保存有把内容写进
   * 别的作品的风险。本地草稿 + 本地落盘刚好绕开它。
   */
  const [drafts, setDrafts] = useState<OutlineDraftMap>(() => loadOutlineDrafts(slug));
  const [candidates, setCandidates] = useState<OutlineCandidate[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<OutlineNode | null>(null);

  const nodes = useMemo(() => query.data ?? [], [query.data]);
  const node = selectedId !== null ? findOutlineNode(nodes, selectedId) : null;

  // 默认选中第一个节点
  useEffect(() => {
    if (selectedId !== null) return;
    const first = nodes[0];
    if (first) setSelectedId(first.id);
  }, [nodes, selectedId]);

  // 当前编辑缓冲：有本地草稿就用手里的（**切回来会自动恢复**），否则用服务端内容
  const draft: OutlineDraft = useMemo(() => {
    if (!node) return { title: '', content: '' };
    return drafts[node.id] ?? { title: node.title ?? '', content: node.content ?? '' };
  }, [node, drafts]);

  // 切节点丢掉上一个节点的 AI 候选（草稿不受影响，按 id 留在 drafts 里）
  useEffect(() => {
    setCandidates([]);
  }, [selectedId]);

  /**
   * 「与服务器不一致」的草稿子集 —— 一个判据同时服务三处：
   *   ① 左树的未保存圆点、② 详情里的「未保存」小标、③ 落盘内容。
   * 只把真正没保存的落盘，所以**保存成功后该条会自然从存档里消失**；
   * 同时只认当前存在的节点，历史遗留/已删节点的条目会在下一次落盘时被清掉。
   */
  const dirtyDrafts = useMemo(() => {
    const out: OutlineDraftMap = {};
    for (const n of nodes) {
      const d = drafts[n.id];
      if (d && (d.title !== (n.title ?? '') || d.content !== (n.content ?? ''))) out[n.id] = d;
    }
    return out;
  }, [nodes, drafts]);

  const dirtyIds = useMemo(() => new Set(Object.keys(dirtyDrafts).map(Number)), [dirtyDrafts]);
  const dirty = selectedId !== null && dirtyIds.has(selectedId);

  // 落盘。**必须等查询结束**：首屏 nodes 还是空的，此时写空表会把刚读到的存档冲掉。
  useEffect(() => {
    if (query.isPending) return;
    saveOutlineDrafts(slug, dirtyDrafts);
  }, [slug, query.isPending, dirtyDrafts]);

  /** 编辑当前节点：写进按 id 的草稿表（函数式合并，避免同一批事件互相覆盖） */
  const changeDraft = (patch: Partial<OutlineDraft>) => {
    if (!node) return;
    const id = node.id;
    const saved: OutlineDraft = { title: node.title ?? '', content: node.content ?? '' };
    setDrafts((m) => ({ ...m, [id]: { ...(m[id] ?? saved), ...patch } }));
  };

  const hasModel = (providers.data ?? []).some((p) => p.enabled);

  const select = useCallback((n: OutlineNode) => setSelectedId(n.id), []);

  const handleSave = () => {
    if (!node) return;
    const id = node.id;
    const title = draft.title.trim() || null;
    const content = draft.content.trim() || null;
    update.mutate(
      { id, payload: { title, content } },
      {
        onSuccess: () => {
          toast.success('大纲已保存');
          // 草稿对齐成「实际发出去的值」（已 trim），否则尾随空格会让它一直被当作未保存
          setDrafts((m) => ({ ...m, [id]: { title: title ?? '', content: content ?? '' } }));
          setCandidates([]);
        },
      },
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
        setDrafts((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        if (selectedId === id) setSelectedId(null);
        setDeleteTarget(null);
      },
    });
  };

  return (
    <main className="pageContent">
      <PageHeader
        title="大纲"
        subtitle="先立总纲，再拆卷纲，最后落到章节卡。写到哪一章，心里都有张地图。"
        actions={
          <Button variant="primary" icon="plus" onClick={addTotal} loading={create.isPending}>
            添加总纲
          </Button>
        }
      />

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
            <OutlineTree nodes={nodes} selectedId={selectedId} onSelect={select} dirtyIds={dirtyIds} />
          </aside>

          <section className={styles.detailPane}>
            {node ? (
              <OutlineDetail
                node={node}
                children={childrenOf(nodes, node.id)}
                draft={draft}
                dirty={dirty}
                onChange={changeDraft}
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
