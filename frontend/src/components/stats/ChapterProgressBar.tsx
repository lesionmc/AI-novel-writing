import type { BookStats } from '@/types/api';
import { formatNumber, formatWordCount, progressPercent } from '@/lib/format';
import styles from './stats.module.css';

export interface ChapterProgressBarProps {
  stats: BookStats;
  /** 目标字数来自作品详情（契约 `BookStats` 不含 target_words） */
  targetWords: number;
}

/** 章节完成度 + 目标字数进度（两条进度条，均带文字数值） */
export function ChapterProgressBar({ stats, targetWords }: ChapterProgressBarProps) {
  const chapterPercent =
    stats.chapter_count > 0 ? Math.round((stats.done_chapters / stats.chapter_count) * 100) : 0;
  const wordPercent = progressPercent(stats.total_words, targetWords);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>进度</span>
      </div>

      <div className={styles.progressRow}>
        <div className={styles.progressHead}>
          <span>章节完成度</span>
          <span className={styles.progressValue}>
            {stats.done_chapters} / {stats.chapter_count} 章（{chapterPercent}%）
          </span>
        </div>
        <div
          className={styles.track}
          role="progressbar"
          aria-valuenow={chapterPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="章节完成度"
        >
          <div className={styles.fill} style={{ width: `${chapterPercent}%` }} />
        </div>
      </div>

      <div className={styles.progressRow}>
        <div className={styles.progressHead}>
          <span>目标字数</span>
          <span className={styles.progressValue}>
            {targetWords > 0
              ? `${formatWordCount(stats.total_words)} / ${formatNumber(targetWords)}（${wordPercent}%）`
              : '未设目标'}
          </span>
        </div>
        <div
          className={styles.track}
          role="progressbar"
          aria-valuenow={wordPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="目标字数进度"
        >
          <div
            className={[styles.fill, styles.fillAccent].join(' ')}
            style={{ width: `${wordPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
