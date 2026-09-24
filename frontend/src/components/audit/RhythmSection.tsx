import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRhythm } from '@/hooks/queries';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { SkeletonRows } from '@/components/common/Skeleton';
import { bookPath } from '@/lib/slug';
import shell from './audit.module.css';
import styles from './rhythm.module.css';

export interface RhythmSectionProps {
  slug: string;
}

const W = 720;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 32 };

/**
 * 「爽点—节奏曲线」区块（PHASE 5 质检第四块）。
 * 纯本地统计（不调模型、不花额度）：把每章的对话占比 / 句长波动 / 对峙词密度
 * 合成 0–100 的「节奏强度」，画成一条曲线，连续低洼的段落标红 —— 那是最可能流水账/掉速的地方。
 *
 * 诚实边界（写进界面）：它衡量的是**文本节奏**，不是读者满意度；只指路，下结论还得人来读。
 */
export function RhythmSection({ slug }: RhythmSectionProps) {
  const navigate = useNavigate();
  const query = useRhythm(slug);
  const points = useMemo(() => query.data?.chapters ?? [], [query.data]);
  const threshold = query.data?.low_threshold ?? 40;
  const dips = query.data?.dips ?? [];

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (pace: number) => PAD.top + innerH - (Math.min(pace, 100) / 100) * innerH;
  const line = points.map((p, i) => `${x(i)},${y(p.pace)}`).join(' ');

  return (
    <section className={shell.section}>
      <div className={shell.sectionHead}>
        <div className={shell.sectionTitleWrap}>
          <span className={shell.sectionTitle}>
            <Icon name="stats" size={20} /> 爽点—节奏曲线
          </span>
          <span className={shell.sectionHint}>
            把每章的对话占比、句子长短起伏、对峙词密度合成一条「节奏强度」曲线（0–100）。
            连续低洼的一段最可能是流水账或掉速区 —— 这是本地统计，只指路，不代表读者一定无聊。
          </span>
        </div>
      </div>

      <div className={shell.sectionBody}>
        {query.isPending ? (
          <div className={styles.stateWrap}>
            <SkeletonRows count={2} />
          </div>
        ) : query.isError ? (
          <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
        ) : points.length === 0 ? (
          <div className={styles.empty}>
            还没有正文可分析。先去写作台写几章，回来这里看节奏有没有掉进低洼区。
            <div className={styles.emptyAction}>
              <Button variant="secondary" size="sm" icon="edit" onClick={() => navigate(bookPath(slug, '/desk'))}>
                去写正文
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.chartWrap}>
              <svg
                className={styles.chart}
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={`共 ${points.length} 章的节奏曲线，低洼阈值 ${threshold}`}
                preserveAspectRatio="none"
              >
                {/* 低洼参考线 */}
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(threshold)}
                  y2={y(threshold)}
                  className={styles.baseline}
                />
                {/* 低洼区背景带 */}
                {dips.map((d) => {
                  const startIdx = points.findIndex((p) => p.seq === d.start_seq);
                  const endIdx = points.findIndex((p) => p.seq === d.end_seq);
                  if (startIdx < 0 || endIdx < 0) return null;
                  const x0 = x(Math.max(0, startIdx - 0.5));
                  const x1 = x(Math.min(points.length - 1, endIdx + 0.5));
                  return (
                    <rect
                      key={`${d.start_seq}-${d.end_seq}`}
                      x={x0}
                      y={PAD.top}
                      width={Math.max(2, x1 - x0)}
                      height={innerH}
                      className={styles.dipBand}
                    />
                  );
                })}
                {/* 折线 */}
                <polyline points={line} className={styles.line} />
                {/* 数据点 */}
                {points.map((p, i) => (
                  <circle
                    key={p.seq}
                    cx={x(i)}
                    cy={y(p.pace)}
                    r={3}
                    className={p.pace < threshold ? styles.dotLow : styles.dot}
                  >
                    <title>{`第 ${p.seq} 章 ${p.title ?? ''}｜节奏 ${p.pace}｜对话 ${(p.dialogue_ratio * 100).toFixed(0)}%`}</title>
                  </circle>
                ))}
              </svg>
              <span className={styles.yAxisLabel} style={{ top: y(100) }}>
                100
              </span>
              <span className={styles.yAxisLabel} style={{ top: y(0) }}>
                0
              </span>
            </div>

            {dips.length > 0 ? (
              <ul className={styles.dipList}>
                {dips.map((d) => (
                  <li key={`${d.start_seq}-${d.end_seq}`}>
                    <Icon name="warning" size={16} />
                    第 {d.start_seq}
                    {d.start_seq === d.end_seq ? '' : `–${d.end_seq}`} 章连续偏低（节奏 &lt; {threshold}）
                    —— 回头看看这几章是不是都在交代、没有冲突落地。
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.okNote}>
                <Icon name="check" size={16} /> 没有发现连续低洼段。节奏起伏是够的，具体好不好仍要自己读。
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
