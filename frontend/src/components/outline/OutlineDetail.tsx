import type { OutlineCandidate, OutlineNode, OutlineLevel } from '@/types/api';
import { OUTLINE_LEVEL_LABELS } from '@/lib/labels';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { AiExpandButton } from './AiExpandButton';
import { ChapterCardList } from './ChapterCardList';
import { defaultNodeLabel } from './outlineModel';
import styles from './outline.module.css';

export interface OutlineDraft {
  title: string;
  content: string;
}

const FIELD_LABELS: Record<OutlineLevel, { title: string; content: string }> = {
  total: { title: '总纲标题', content: '全书走向（结构、主线、终局）' },
  volume: { title: '卷名', content: '本卷要点：这一卷从哪起、到哪落、留下什么钩子' },
  chapter: { title: '章节标题', content: '本章要点：发生什么、推进哪条线、埋或收哪处伏笔' },
};

export interface OutlineDetailProps {
  node: OutlineNode;
  /** 当前节点的直接子节点（由父级按扁平数组 + parent_id 派生，契约无 children 字段） */
  children: OutlineNode[];
  draft: OutlineDraft;
  /** 当前节点是否有未保存的本地草稿（切走不会丢，但要如实提示） */
  dirty: boolean;
  onChange: (patch: Partial<OutlineDraft>) => void;
  saving: boolean;
  saveError: unknown;
  onSave: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  addingChild: boolean;
  onSelectChild: (node: OutlineNode) => void;
  onDeleteChild: (node: OutlineNode) => void;
  /** 计算任意节点的直接子节点数（用于卷纲卡片上的「N 张章节卡」） */
  childCountOf: (node: OutlineNode) => number;
  candidates: OutlineCandidate[];
  onCandidates: (c: OutlineCandidate[]) => void;
  onClearCandidates: () => void;
  aiDisabled: boolean;
  aiDisabledHint: string;
}

function appendCandidates(content: string, candidates: OutlineCandidate[]): string {
  const base = content.trim();
  const block = candidates
    .map((c) => {
      const head = c.title.trim() || '（未命名）';
      const body = c.content.trim();
      return body ? `· ${head}：${body}` : `· ${head}`;
    })
    .join('\n');
  return base ? `${base}\n${block}` : block;
}

/** 大纲右侧详情：编辑当前节点（标题 + 要点/内容），可 AI 展开、增删子节点 */
export function OutlineDetail({
  node,
  children: childNodes,
  draft,
  dirty,
  onChange,
  saving,
  saveError,
  onSave,
  onDelete,
  onAddChild,
  addingChild,
  onSelectChild,
  onDeleteChild,
  childCountOf,
  candidates,
  onCandidates,
  onClearCandidates,
  aiDisabled,
  aiDisabledHint,
}: OutlineDetailProps) {
  const labels = FIELD_LABELS[node.level];
  const childLabel = node.level === 'volume' ? '章节卡' : '卷';

  return (
    <div>
      <div className={styles.detailHead}>
        <span className={styles.detailLevel}>
          <Icon name="outline" size={16} />
          {OUTLINE_LEVEL_LABELS[node.level]}
          {node.level !== 'total' ? <span className={styles.childSeq}>· 序号 {node.seq}</span> : null}
          {dirty ? <span className={styles.dirtyTag}>未保存</span> : null}
        </span>
        <div className={styles.detailActions}>
          {node.level !== 'chapter' ? (
            <AiExpandButton
              outlineId={node.id}
              level={node.level}
              onCandidates={onCandidates}
              disabled={aiDisabled}
              disabledHint={aiDisabledHint}
            />
          ) : null}
          <Button variant="primary" icon="save" loading={saving} onClick={onSave}>
            保存
          </Button>
          <Button
            variant="ghost"
            iconOnly
            icon="trash"
            aria-label="删除这个节点"
            title="删除节点"
            onClick={onDelete}
          />
        </div>
      </div>

      <div className={styles.fieldStack}>
        {saveError ? <ErrorBar error={saveError} /> : null}
        <Input
          label={labels.title}
          value={draft.title}
          placeholder={defaultNodeLabel(node)}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <Textarea
          label={labels.content}
          rows={node.level === 'chapter' ? 5 : 7}
          value={draft.content}
          placeholder="用要点记下这一段要发生的事，写到对应章节时就能对照着落笔"
          onChange={(e) => onChange({ content: e.target.value })}
        />

        {candidates.length > 0 ? (
          <div className={styles.candidateBox}>
            <div className={styles.candidateHint}>
              <Icon name="target" size={16} />
              AI 给出 {candidates.length} 条候选 —— 采纳后请自行修改，定稿权在你手里
            </div>
            {candidates.map((c, i) => (
              <div className={styles.candidateItem} key={`${i}-${c.title}`}>
                <Icon name="dot" size={16} />
                <span>
                  <strong>{c.title.trim() || '（未命名）'}</strong>
                  {c.content.trim() ? `：${c.content.trim()}` : ''}
                </span>
              </div>
            ))}
            <div className={styles.detailActions} style={{ marginTop: 'var(--space-2)' }}>
              <Button
                size="sm"
                variant="accent"
                icon="check"
                onClick={() => {
                  onChange({ content: appendCandidates(draft.content, candidates) });
                  onClearCandidates();
                }}
              >
                填入内容
              </Button>
              <Button size="sm" variant="ghost" icon="close" onClick={onClearCandidates}>
                丢弃候选
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {node.level !== 'chapter' ? (
        <div className={styles.childSection}>
          <div className={styles.childSectionHead}>
            <span className={styles.childSectionTitle}>
              <Icon name={node.level === 'total' ? 'layers' : 'chapter'} size={16} />
              {childLabel} · {childNodes.length}
            </span>
            <Button size="sm" variant="secondary" icon="plus" loading={addingChild} onClick={onAddChild}>
              添加{childLabel}
            </Button>
          </div>
          <ChapterCardList
            nodes={childNodes}
            onSelect={onSelectChild}
            onDelete={onDeleteChild}
            childCountOf={childCountOf}
          />
          {node.level === 'volume' && childNodes.length > 0 ? (
            <p className={styles.childMeta} style={{ marginTop: 'var(--space-3)' }}>
              <Icon name="info" size={16} /> 一节卷纲挂 3–5 张章节卡刚好，多了不好控节奏。
            </p>
          ) : null}
        </div>
      ) : (
        <div className={styles.childSection}>
          <Badge variant={node.chapter_id !== null ? 'success' : 'neutral'}>
            {node.chapter_id !== null ? '已关联正文，可在写作台编辑' : '尚未开写，去写作台建这一章'}
          </Badge>
        </div>
      )}
    </div>
  );
}
