import type { OutlineNode } from '@/types/api';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { defaultNodeLabel } from './outlineModel';
import styles from './outline.module.css';

export interface ChapterCardListProps {
  nodes: OutlineNode[];
  onSelect: (node: OutlineNode) => void;
  onDelete: (node: OutlineNode) => void;
  /** 计算某节点的直接子节点数（契约无 children，由父级据扁平数组派生） */
  childCountOf: (node: OutlineNode) => number;
}

/**
 * 下级节点列表（卷纲下是章节卡，总纲下是各卷）。
 * 点行进入该节点的详情；章节卡若已关联实际章节，显示「已开写」。
 */
export function ChapterCardList({ nodes, onSelect, onDelete, childCountOf }: ChapterCardListProps) {
  if (nodes.length === 0) {
    return (
      <p className={styles.childMeta}>还没有下级节点，点上面的「添加」开始。</p>
    );
  }

  return (
    <div className={styles.childList}>
      {nodes.map((node) => (
        <div
          key={node.id}
          className={styles.childItem}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(node)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(node);
            }
          }}
        >
          <span className={styles.childSeq}>
            {node.level === 'volume' ? `卷 ${node.seq}` : `第 ${node.seq} 章`}
          </span>
          <div className={styles.childMain}>
            <div className={styles.childTitle}>{defaultNodeLabel(node)}</div>
            <div className={styles.childMeta}>
              {node.level === 'chapter'
                ? node.chapter_id !== null
                  ? '已关联正文'
                  : '章节卡（尚未开写）'
                : `${childCountOf(node)} 张章节卡`}
              {node.content ? ` · ${node.content}` : ''}
            </div>
          </div>
          {node.level === 'chapter' && node.chapter_id !== null ? (
            <Badge variant="primary" icon="chapter">
              正文已存在
            </Badge>
          ) : null}
          <Icon name="chevronRight" size={16} className={styles.childArrow} />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon="trash"
            aria-label={`删除 ${defaultNodeLabel(node)}`}
            title="删除"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
          />
        </div>
      ))}
    </div>
  );
}
