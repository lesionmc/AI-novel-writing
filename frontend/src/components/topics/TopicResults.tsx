import type { TopicAdviceResponse, TopicRecommendation } from '@/types/api';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import styles from './topics.module.css';

export interface TopicResultsProps {
  data: TopicAdviceResponse;
  /** 「就用这个方向建书」→ 由外层跳到新建作品并预填题材与卖点 */
  onUse: (rec: TopicRecommendation) => void;
}

/**
 * 选题结果：上面 N 张「蓝海细分方向」卡片，**底部单独一块「不建议写」**。
 * 指南里的方法：不仅告诉他写什么，也要明确告诉他哪些方向不要碰。
 */
export function TopicResults({ data, onUse }: TopicResultsProps) {
  const recs = data.recommendations ?? [];
  const avoid = data.avoid ?? [];

  return (
    <div className={styles.stack}>
      <p className={styles.resultHead}>
        根据你的回答，这几个方向「有人看、写得少」，比挤在红海里更有机会。挑一个顺眼的，直接建书。
      </p>

      {/* QA M7：卡片里出现「热度 90 / 竞争密度 60 / 蓝海指数 36」却没说标尺，
          小白不知道 36 是高还是低。这里补一句人话注解。 */}
      <p className={styles.resultLegend}>
        卡片里若提到「热度 / 竞争度 / 蓝海指数」，都是 0–100 的分数：热度越高＝看的人越多；
        竞争度越低越好；蓝海指数越高＝越值得现在就写。
      </p>

      {/* 诚实交代：题材库里这些方向的真实对标书单是空的，模型没有可靠的作品数据源。
          此前标签直接写「对标作品」，会让用户以为那是可查证的推荐书单，照着去研究选题
          —— 花的是真时间。改为「同类常见套路」并明确标注 AI 生成。 */}
      <p className={styles.resultLegend}>
        「同类常见套路」和「卖点示例」都是 <b>AI 当场生成的参考</b>，不是真实书单，
        也不代表这些作品真的存在 —— 用来开拓思路就好，要照它去查证请先自己核实。
      </p>

      <div className={styles.recList}>
        {recs.map((rec) => (
          <article className={styles.recCard} key={rec.niche}>
            <div className={styles.recNiche}>
              <Icon name="lightbulb" size={20} />
              {rec.niche}
            </div>
            <p className={styles.recReason}>{rec.reason}</p>
            {rec.benchmarks?.length ? (
              <div>
                <div className={styles.recLabel}>同类常见套路</div>
                <div className={styles.recBench}>
                  {rec.benchmarks.map((b) => (
                    <span className={styles.recBenchItem} key={b}>
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {rec.sample_premise ? (
              <>
                <div className={styles.recLabel}>卖点示例</div>
                <p className={styles.recPremise}>{rec.sample_premise}</p>
              </>
            ) : null}
            <div className={styles.recActions}>
              <Button variant="primary" size="sm" icon="plus" onClick={() => onUse(rec)}>
                就用这个方向建书
              </Button>
            </div>
          </article>
        ))}
      </div>

      {avoid.length ? (
        <section className={styles.avoidBlock} aria-labelledby="topic-avoid-title">
          <div className={styles.avoidTitle} id="topic-avoid-title">
            <Icon name="warning" size={20} />
            不建议写
          </div>
          <p className={styles.avoidIntro}>
            不是它们不能写，而是对新手的投入回报比明显偏低 —— 先避开这几个方向。
          </p>
          <div className={styles.avoidList}>
            {avoid.map((a) => (
              <div className={styles.avoidItem} key={a.direction}>
                <span className={styles.avoidDirection}>{a.direction}</span>
                <span className={styles.avoidReason}>{a.reason}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
