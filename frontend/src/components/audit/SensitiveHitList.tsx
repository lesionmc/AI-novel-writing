import type { BadgeVariant } from '@/types/ui';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { sensitiveCategoryLabel } from './auditLabels';
import styles from './sensitive.module.css';

/** 按章节聚合的命中分组（父组件算好，这里只渲染） */
export interface ChapterGroup {
  seq: number;
  list: { word: string; category: string; count: number }[];
}

/** 分类 → 徽标变体（政治/违法/色情/暴力取警示，其余中性） */
const CATEGORY_VARIANT: Record<string, BadgeVariant> = {
  politics: 'danger',
  illegal: 'danger',
  porn: 'danger',
  violence: 'warning',
  superstition: 'neutral',
  other: 'neutral',
};

export interface SensitiveHitListProps {
  groups: ChapterGroup[];
  /** 当前分类筛选（'' = 全部）；仅用于空态文案 */
  category: string;
  /** 词库是否可用；false 时「没有命中」并不代表稿子没问题 */
  wordlistAvailable: boolean | null;
  /** 跳到某章并高亮词条 */
  onJump: (seq: number, word: string) => void;
}

/**
 * 敏感词命中列表（从 `SensitiveSection.tsx` 拆出，守住单文件 ≤ 300 行）。
 * 空态分两种：**词库为空**（本次没真正扫描）与**词库有词但没命中**，文案不得混淆。
 */
export function SensitiveHitList({
  groups,
  category,
  wordlistAvailable,
  onJump,
}: SensitiveHitListProps) {
  if (groups.length === 0) {
    return wordlistAvailable === false ? (
      <EmptyState
        icon="info"
        title="本次没有实际扫描"
        description="词库为空，没有任何词条可供比对。请先在设置里配置词库，再重新扫描。"
      />
    ) : (
      <EmptyState
        icon="check"
        title={category ? '这个分类下没有命中' : '没有命中敏感词'}
        description="词库里的词一个都没出现。结果仅供参考，不构成合规审查结论。"
      />
    );
  }

  return (
    <div className={styles.groupList}>
      {groups.map((g) => (
        <div className={styles.group} key={g.seq}>
          <div className={styles.groupHead}>
            <span className={styles.groupTitle}>第 {g.seq} 章</span>
            <span className={styles.wordCount}>
              {g.list.reduce((s, h) => s + h.count, 0)} 次
            </span>
          </div>
          <div className={styles.groupBody}>
            {g.list.map((h) => (
              <div className={styles.wordRow} key={`${g.seq}-${h.word}`}>
                <span className={styles.wordText}>{h.word}</span>
                <span className={styles.wordGrow}>
                  <Badge variant={CATEGORY_VARIANT[h.category] ?? 'neutral'}>
                    {sensitiveCategoryLabel(h.category)}
                  </Badge>
                </span>
                <span className={styles.wordCount}>{h.count} 次</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="jump"
                  onClick={() => onJump(g.seq, h.word)}
                >
                  跳到本章
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
