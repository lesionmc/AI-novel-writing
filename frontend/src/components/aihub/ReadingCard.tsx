import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { sensitiveCategoryLabel } from '@/components/audit/auditLabels';
import { conflictSeverityLabel, conflictSeverityVariant, proofreadTypeLabel } from '@/lib/labels';
import { isUnfinishedReading, readingTitle } from './hubReading';
import type { HubReading } from './hubReading';
import styles from './hub.module.css';

export interface ReadingCardProps {
  reading: HubReading;
  /** 还在流式累积（一致性审校），此时给出「停止」 */
  streaming: boolean;
  onStop?: () => void;
}

const ICON: Record<HubReading['kind'], 'check' | 'target' | 'warning'> = {
  proofread: 'check',
  consistency: 'target',
  sensitive: 'warning',
};

/**
 * 只读能力的报告卡片（校对 / 一致性审校 / 敏感词）。
 *
 * 与 `DraftCard` 的关键区别：**这里没有「确认写入」，也没有「丢弃」** ——
 * 这三项不产出任何可写的东西，只是一份体检报告，改不改由作者自己定。
 * 所以卡片上明写一句「只读」，避免用户以为 AI 会替他改稿。
 */
export function ReadingCard({ reading, streaming, onStop }: ReadingCardProps) {
  return (
    <div className={styles.readingCard}>
      <div className={styles.readingHead}>
        <Icon name={ICON[reading.kind]} size={16} />
        <span>{readingTitle(reading)}</span>
        <span className={styles.readingSpacer} />
        {streaming ? (
          <Button variant="ghost" size="sm" icon="close" onClick={onStop}>
            停止
          </Button>
        ) : null}
      </div>

      <p className={styles.draftNote}>
        这份报告只读 —— 它不会改你的稿子，改不改由你定。
      </p>

      {reading.kind === 'proofread' ? <ProofreadBody reading={reading} /> : null}
      {reading.kind === 'consistency' ? <ConsistencyBody reading={reading} /> : null}
      {reading.kind === 'sensitive' ? <SensitiveBody reading={reading} /> : null}
    </div>
  );
}

function ProofreadBody({ reading }: { reading: Extract<HubReading, { kind: 'proofread' }> }) {
  if (reading.issues.length === 0) {
    return (
      <div className={styles.readingOk}>
        <Icon name="check" size={16} />
        这一章没发现错别字、病句和前后不一致的地方。
      </div>
    );
  }
  return (
    <div className={styles.draftList}>
      {reading.issues.map((issue, i) => (
        <article className={styles.draftItem} key={`${issue.excerpt}-${i}`}>
          <span className={styles.draftItemName}>
            <Badge variant="neutral">{proofreadTypeLabel(issue.type)}</Badge>
          </span>
          {issue.excerpt ? <div className={styles.readingQuote}>{issue.excerpt}</div> : null}
          {issue.problem ? <span className={styles.draftItemMeta}>{issue.problem}</span> : null}
          {issue.suggestion ? (
            <span className={styles.draftItemMeta}>建议：{issue.suggestion}</span>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ConsistencyBody({ reading }: { reading: Extract<HubReading, { kind: 'consistency' }> }) {
  if (isUnfinishedReading(reading)) {
    return (
      <div className={styles.draftNote}>
        上次审校没跑完，没有留下结果。重新点一次「审校」就行。
      </div>
    );
  }
  return (
    <>
      {reading.summary ? (
        <span className={styles.draftNote}>
          审了 {reading.summary.reviewed} 章 · 严重 {reading.summary.high} / 中等{' '}
          {reading.summary.medium} / 轻微 {reading.summary.low}
        </span>
      ) : null}
      {reading.conflicts.length === 0 ? (
        <div className={styles.readingOk}>
          <Icon name="check" size={16} />
          通读完了，没发现前后对不上的地方。
        </div>
      ) : (
        <div className={styles.draftList}>
          {reading.conflicts.map((c, i) => (
            <article className={styles.draftItem} key={`${c.subject}-${c.conflict}-${i}`}>
              <span className={styles.draftItemName}>
                <Badge variant={conflictSeverityVariant(c.severity)}>
                  {conflictSeverityLabel(c.severity)}
                </Badge>{' '}
                {c.subject || '未标注对象'}
              </span>
              <span className={styles.draftItemMeta}>
                {c.chapters.length > 0 ? `涉及第 ${c.chapters.join('、')} 章` : '未标注章节'}
              </span>
              {c.conflict ? <div className={styles.readingQuote}>{c.conflict}</div> : null}
              {c.evidence ? <span className={styles.draftItemMeta}>依据：{c.evidence}</span> : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function SensitiveBody({ reading }: { reading: Extract<HubReading, { kind: 'sensitive' }> }) {
  if (!reading.wordlistAvailable) {
    // 假安全感是明令禁止的：词库没配就必须说清"没检查任何内容"
    return (
      <div className={styles.readingWarn}>
        <Icon name="warning" size={16} />
        <span>
          词库还没配，所以这次<strong>没有检查任何内容</strong>。命中 0 处不代表稿子没问题 ——
          先去设置里放一份词表，再扫一次。
        </span>
      </div>
    );
  }
  if (reading.hits.length === 0) {
    return (
      <div className={styles.readingOk}>
        <Icon name="check" size={16} />
        按当前词库扫完全书，没有命中。
      </div>
    );
  }
  return (
    <div className={styles.draftList}>
      {reading.hits.map((h, i) => (
        <article className={styles.draftItem} key={`${h.word}-${h.chapter_seq}-${i}`}>
          <span className={styles.draftItemName}>
            <Badge variant="danger">{sensitiveCategoryLabel(h.category)}</Badge> {h.word}
          </span>
          <span className={styles.draftItemMeta}>
            第 {h.chapter_seq} 章 · 出现 {h.count} 次
          </span>
        </article>
      ))}
    </div>
  );
}
