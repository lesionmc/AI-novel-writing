import type { ChapterBrief } from '@/types/api';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';

/**
 * 「跳到该章」编排（TC-33）。
 * 在章节列表里定位目标章并切换；若带上片段文本，则写入高亮请求，
 * 由编辑器在目标章正文中定位并高亮该片段（编辑器消费后自行消退）。
 * 抽为独立 hook，避免 `useWritingDesk` 继续膨胀（单文件 ≤ 300 行纪律）。
 */
export function useChunkJump(
  briefs: ChapterBrief[],
  selectChapter: (id: number) => void,
): (targetSeq: number, targetText?: string) => void {
  const requestChunkHighlight = useDeskStore((s) => s.requestChunkHighlight);

  return (targetSeq, targetText) => {
    const target = briefs.find((c) => c.seq === targetSeq);
    if (!target) {
      toast.info(`第 ${targetSeq} 章还没有正文`);
      return;
    }
    selectChapter(target.id);
    if (targetText) requestChunkHighlight(targetSeq, targetText);
  };
}
