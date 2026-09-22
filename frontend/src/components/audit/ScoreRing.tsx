import styles from './audit.module.css';

export type ScoreRingTone = 'success' | 'neutral' | 'warning' | 'danger';

export interface ScoreRingProps {
  /** 0-100，越高 = AI 味越重 */
  score: number;
  tone: ScoreRingTone;
  /** 圆环直径（px） */
  size?: number;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * AI 味评分环形（04 §5.4：去 AI 味给「0-100 环形」）。
 * 纯 SVG 手绘：描边走语义 token，`prefers-reduced-motion` 下过渡由 design-tokens 归零。
 */
export function ScoreRing({ score, tone, size = 108 }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className={styles.ringWrap} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img"
        aria-label={`AI 味评分 ${clamped} 分，满分 100，分越高越重`}>
        <circle
          className={styles.ringTrack}
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
        />
        <circle
          className={[styles.ringValue, styles[`tone_${tone}`]].join(' ')}
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className={styles.ringCenter} aria-hidden="true">
        <span className={styles.ringScore}>{clamped}</span>
        <span className={styles.ringUnit}>/ 100</span>
      </div>
    </div>
  );
}
