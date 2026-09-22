import styles from './Skeleton.module.css';

interface BlockProps {
  width?: string | number;
  height?: number;
  radius?: string;
  className?: string;
}

/** 基础骨架块（列表行 / 文本 / 卡片共用）。刻意不使用全屏遮罩（04 §6.1）。 */
export function SkeletonBlock({ width = '100%', height = 12, radius, className }: BlockProps) {
  return (
    <div
      className={[styles.skeleton, className ?? ''].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** 多行文本骨架，末行收窄模拟段落 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.stack} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} height={12} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </div>
  );
}

/** 列表行骨架：左侧头像块 + 两行文字 */
export function SkeletonRow() {
  return (
    <div className={styles.row} aria-hidden="true">
      <SkeletonBlock width={16} height={16} radius="var(--radius-circle)" />
      <div className={styles.grow}>
        <SkeletonBlock height={11} width="46%" />
        <div style={{ height: 'var(--space-2)' }} />
        <SkeletonBlock height={11} width="80%" />
      </div>
    </div>
  );
}

/** 卡片骨架 */
export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div
      className={styles.skeleton}
      style={{ width: '100%', height, borderRadius: 'var(--radius-card)' }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.stack} style={{ gap: 'var(--space-4)' }} role="status" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
      <span className="srOnly">内容加载中</span>
    </div>
  );
}
