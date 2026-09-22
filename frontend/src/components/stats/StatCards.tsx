import type { BookStats } from '@/types/api';
import { Icon } from '@/components/common/Icon';
import { formatNumber, formatWordCount, progressPercent } from '@/lib/format';
import styles from './stats.module.css';

export interface StatCardsProps {
  stats: BookStats;
  /** 目标字数来自作品详情（契约 `BookStats` 不含 target_words） */
  targetWords: number;
}

/** 统计总览卡片：总字数 / 章节 / 目标 / 完成度 */
export function StatCards({ stats, targetWords }: StatCardsProps) {
  const percent = progressPercent(stats.total_words, targetWords);
  const avg = stats.chapter_count > 0 ? Math.round(stats.total_words / stats.chapter_count) : 0;

  return (
    <div className={styles.cards}>
      <div className={styles.card}>
        <span className={styles.cardLabel}>
          <Icon name="hash" size={16} /> 总字数
        </span>
        <span className={styles.cardValue}>{formatWordCount(stats.total_words)}</span>
        <span className={styles.cardSub}>平均每章 {formatNumber(avg)} 字</span>
      </div>

      <div className={styles.card}>
        <span className={styles.cardLabel}>
          <Icon name="chapter" size={16} /> 章节
        </span>
        <span className={styles.cardValue}>{formatNumber(stats.chapter_count)}</span>
        <span className={styles.cardSub}>其中 {stats.done_chapters} 章已完成</span>
      </div>

      <div className={styles.card}>
        <span className={styles.cardLabel}>
          <Icon name="target" size={16} /> 目标字数
        </span>
        <span className={styles.cardValue}>
          {targetWords > 0 ? formatNumber(targetWords) : '—'}
        </span>
        <span className={styles.cardSub}>
          {targetWords > 0 ? `还差 ${formatWordCount(Math.max(0, targetWords - stats.total_words))}` : '未设目标'}
        </span>
      </div>

      <div className={styles.card}>
        <span className={styles.cardLabel}>
          <Icon name="trendingUp" size={16} /> 目标进度
        </span>
        <span className={styles.cardValue}>{targetWords > 0 ? `${percent}%` : '—'}</span>
        <span className={styles.cardSub}>
          {targetWords > 0 ? `已完成 ${percent}% 的书稿目标` : '在「设置」里可以补一个目标字数'}
        </span>
      </div>
    </div>
  );
}
