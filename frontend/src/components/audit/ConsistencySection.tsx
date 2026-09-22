import { Badge } from '@/components/common/Badge';
import { Icon } from '@/components/common/Icon';
import styles from './audit.module.css';

/**
 * 一致性审校区块（04 §5.4 第一块）。
 * -----------------------------------------------------------------------------
 * 本轮**不实现**（后端 SSE 端点 `auditConsistencyStream` 亦未就绪）。
 * 但**区块位置保留**，做成「即将上线」的说明态 —— 与写作台 AI 菜单对未上线能力的
 * 处理方式一致：折成一条可读的说明，而不是摆一排点不动的死按钮，
 * 也绝不出现「(M2)」这类内部里程碑代号。
 */
export function ConsistencySection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitleWrap}>
          <span className={styles.sectionTitle}>
            <Icon name="target" size={20} /> 一致性审校
          </span>
          <span className={styles.sectionHint}>
            通读全书，找出前后对不上的地方——比如人物性格突变、时间线错乱、设定自相矛盾。
          </span>
        </div>
        <Badge variant="warning">即将上线</Badge>
      </div>

      <div className={styles.sectionBody}>
        <div className={styles.comingBox}>
          <Icon name="info" size={20} className={styles.comingIcon} />
          <div className={styles.comingBody}>
            <div className={styles.comingHead}>
              <span className={styles.comingTitle}>这项能力还在开发中</span>
            </div>
            <p className={styles.comingText}>
              上线后，点一下就会逐条列出全书里的矛盾：每条带上严重程度、涉及哪几章、矛盾描述和原文依据，
              还能直接跳到对应章节去改。在那之前，可以先用下面的「去 AI 味」和「敏感词自查」。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
