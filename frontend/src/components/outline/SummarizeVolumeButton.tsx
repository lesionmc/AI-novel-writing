import { useParams } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { useSummarizeVolume } from '@/hooks/mutations/outlines';
import { toast } from '@/stores/toastStore';
import styles from './outline.module.css';

export interface SummarizeVolumeButtonProps {
  outlineId: number;
  disabled?: boolean;
  disabledHint?: string;
}

/**
 * 「汇总本卷」（`POST /api/outlines/{id}/summarize-volume`）—— 记忆金字塔的入口：
 * AI 读本卷各章摘要，压成 250 字卷摘要写回卷纲末尾（带【本卷摘要】标记，重跑只替换）。
 * 写的是大纲节点正文，本来就由人编辑保存 —— 不触碰"设定必须人工确认"红线之外的数据。
 */
export function SummarizeVolumeButton({
  outlineId,
  disabled = false,
  disabledHint,
}: SummarizeVolumeButtonProps) {
  const { slug = '' } = useParams();
  const summarize = useSummarizeVolume(slug);

  const run = () => {
    summarize.mutate(outlineId, {
      onSuccess: () => toast.success('卷摘要已写进本卷要点末尾，往上翻一眼、不满意就改'),
    });
  };

  return (
    <div className={styles.expandWrap}>
      <Button
        variant="ghost"
        icon="archive"
        loading={summarize.isPending}
        disabled={disabled}
        title={disabled ? disabledHint : '把本卷已完成的章节压成一段远期记忆，供后续章节引用'}
        onClick={run}
      >
        汇总本卷
      </Button>
      {summarize.isError ? <ErrorBar error={summarize.error} onRetry={run} /> : null}
    </div>
  );
}
