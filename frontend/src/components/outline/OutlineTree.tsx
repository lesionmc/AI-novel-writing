import type { OutlineNode, OutlineLevel } from '@/types/api';
import type { IconName } from '@/types/ui';
import { Icon } from '@/components/common/Icon';
import { buildOutlineTree, defaultNodeLabel, type OutlineTreeNode } from './outlineModel';
import styles from './outline.module.css';

const LEVEL_ICON: Record<OutlineLevel, IconName> = {
  total: 'book',
  volume: 'layers',
  chapter: 'chapter',
};

interface RowProps {
  node: OutlineTreeNode;
  depth: number;
  selectedId: number | null;
  /** 有未保存本地草稿的节点 id（切走不丢，见 OutlinePage 的 drafts） */
  dirtyIds: Set<number>;
  onSelect: (node: OutlineNode) => void;
}

function TreeRow({ node, depth, selectedId, dirtyIds, onSelect }: RowProps) {
  const hasChildren = node.children.length > 0;
  const dirty = dirtyIds.has(node.id);
  return (
    <li>
      <button
        type="button"
        className={[styles.treeRow, node.id === selectedId ? styles.treeRowActive : '']
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: `calc(var(--space-2) + ${depth} * var(--space-5))` }}
        onClick={() => onSelect(node)}
        aria-current={node.id === selectedId ? 'true' : undefined}
      >
        <Icon name={LEVEL_ICON[node.level]} size={16} className={styles.treeRowIcon} />
        <span className={styles.treeLabel}>{defaultNodeLabel(node)}</span>
        {dirty ? (
          <span className={styles.treeDirty} title="有未保存的修改" role="img" aria-label="有未保存的修改" />
        ) : null}
        {hasChildren && node.level !== 'chapter' ? (
          <span className={styles.treeCount}>{node.children.length}</span>
        ) : null}
      </button>
      {hasChildren ? (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              dirtyIds={dirtyIds}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export interface OutlineTreeProps {
  nodes: OutlineNode[];
  selectedId: number | null;
  dirtyIds: Set<number>;
  onSelect: (node: OutlineNode) => void;
}

/** 大纲左树：总纲 → 卷纲 → 章节卡，三级 */
export function OutlineTree({ nodes, selectedId, dirtyIds, onSelect }: OutlineTreeProps) {
  const tree = buildOutlineTree(nodes);
  return (
    <ul className={styles.treeRoot}>
      {tree.map((n) => (
        <TreeRow
          key={n.id}
          node={n}
          depth={0}
          selectedId={selectedId}
          dirtyIds={dirtyIds}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
