import type { BookStats } from '@/types/api';
import { formatNumber } from '@/lib/format';
import styles from './stats.module.css';

const MAX_DAYS = 14;

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export interface DailyChartProps {
  daily: BookStats['daily'];
}

/**
 * 日更曲线（纯 CSS 柱状图，无图表库）。
 * 只靠颜色区分数据是不够的 —— 这里同时给出数值标注、日期轴与文字图例（数据无障碍）。
 */
export function DailyChart({ daily }: DailyChartProps) {
  const recent = daily.slice(-MAX_DAYS);

  if (recent.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>日更曲线</span>
        </div>
        <div className={styles.emptyChart}>还没有写作记录 —— 写下的每一个字都会记在这里。</div>
      </div>
    );
  }

  const max = recent.reduce((m, d) => Math.max(m, d.words_added), 0);
  const total = recent.reduce((s, d) => s + d.words_added, 0);
  const summary = `近 ${recent.length} 天共新增 ${formatNumber(total)} 字，单日最高 ${formatNumber(max)} 字`;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>日更曲线</span>
        <span className={styles.panelNote}>近 {recent.length} 天</span>
      </div>

      <div className={styles.bars} role="img" aria-label={summary}>
        {recent.map((d) => {
          const ratio = max > 0 ? d.words_added / max : 0;
          const heightPct = d.words_added > 0 ? Math.max(6, Math.round(ratio * 100)) : 2;
          return (
            <div className={styles.barCol} key={d.date}>
              <span className={styles.barValue}>{d.words_added > 0 ? formatNumber(d.words_added) : ''}</span>
              <div
                className={[styles.bar, d.words_added === 0 ? styles.barEmpty : '']
                  .filter(Boolean)
                  .join(' ')}
                style={{ height: `${heightPct}%` }}
                title={`${d.date}：新增 ${formatNumber(d.words_added)} 字`}
              />
              <span className={styles.barDate}>{shortDate(d.date)}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendSwatch} aria-hidden="true" />
        {summary}
      </div>
    </div>
  );
}
