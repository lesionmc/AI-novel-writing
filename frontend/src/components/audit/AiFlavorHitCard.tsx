import type { AiFlavorHit } from '@/types/api';
import { aiFlavorTypeHint, aiFlavorTypeLabel } from './auditLabels';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import styles from './audit.module.css';

export interface AiFlavorHitCardProps {
  hit: AiFlavorHit;
  /** 跳到命中位置（该章 + 高亮）。质检页不改正文，改不改由作者决定 */
  onLocate: () => void;
}

/**
 * 单条「去 AI 味」命中：类别 + 原文片段 + 改写建议 + [去改这一处]。
 *
 * [注意] 后端 `suggestion` 是**给人看的建议文案**（如「『综上所述』是路标式连接词，删掉它…」），
 * 不是可直接替换的成文文本 —— 因此这里**不提供「一键采纳并替换」**：
 * 拿建议文案去替换正文会把建议本身写进书稿。改不改、怎么改由作者决定，
 * 页面只负责把位置指给他（跳章 + 高亮）。
 */
export function AiFlavorHitCard({ hit, onLocate }: AiFlavorHitCardProps) {
  return (
    <li className={styles.hitCard}>
      <div className={styles.hitHead}>
        <span title={aiFlavorTypeHint(hit.type)}>
          <Badge variant="neutral" icon="tag">
            {aiFlavorTypeLabel(hit.type)}
          </Badge>
        </span>
      </div>

      <div>
        <div className={styles.fieldLabel}>原文</div>
        <p className={styles.hitQuote}>{hit.text}</p>
      </div>

      <div className={styles.suggestionBlock}>
        <div className={styles.fieldLabel}>改写建议（仅供参考）</div>
        <p className={styles.suggestionText}>{hit.suggestion}</p>
      </div>

      <div className={styles.hitActions}>
        <Button size="sm" variant="secondary" icon="jump" onClick={onLocate}>
          去改这一处
        </Button>
      </div>
    </li>
  );
}
