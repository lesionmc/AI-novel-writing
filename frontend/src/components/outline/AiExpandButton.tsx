import type { OutlineCandidate, OutlineLevel } from '@/types/api';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { useExpandOutline } from '@/hooks/mutations/outlines';
import styles from './outline.module.css';

export interface AiExpandButtonProps {
  outlineId: number;
  /** 当前节点层级：total → 展开为卷纲(volume)，volume → 展开为章节卡(chapter) */
  level: OutlineLevel;
  /** 候选直接交给父级填入编辑框，**由用户改完再保存** —— AI 只出候选，定稿权在人 */
  onCandidates: (candidates: OutlineCandidate[]) => void;
  /** AI 是否可用（未配模型时禁用） */
  disabled?: boolean;
  disabledHint?: string;
}

/**
 * AI 展开候选（`POST /api/outlines/{id}/expand`，契约需 body `{expand_level}`）。
 * 红线：结果只**填入编辑框，等用户改完再保存**，绝不自动落库。
 */
export function AiExpandButton({
  outlineId,
  level,
  onCandidates,
  disabled = false,
  disabledHint,
}: AiExpandButtonProps) {
  const expand = useExpandOutline();

  const run = () => {
    // total 的下一级是卷纲；volume 的下一级是章节卡（chapter 层级不会渲染本按钮）
    const expand_level = level === 'total' ? 'volume' : 'chapter';
    expand.mutate(
      { id: outlineId, payload: { expand_level } },
      {
        onSuccess: (res) => onCandidates(res.candidates),
      },
    );
  };

  return (
    <div className={styles.expandWrap}>
      <Button
        variant="secondary"
        icon="target"
        loading={expand.isPending}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        onClick={run}
      >
        AI 展开候选
      </Button>
      {expand.isError ? <ErrorBar error={expand.error} onRetry={run} /> : null}
    </div>
  );
}
