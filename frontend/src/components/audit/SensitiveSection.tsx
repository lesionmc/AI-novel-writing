import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BadgeVariant } from '@/types/ui';
import { useChapterBriefs, useWordlistStatus } from '@/hooks/queries';
import { useSensitiveAudit } from '@/hooks/mutations/audit';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { SkeletonRows } from '@/components/common/Skeleton';
import {
  SENSITIVE_CATEGORY_LABELS,
  SENSITIVE_CATEGORY_ORDER,
  sensitiveCategoryLabel,
} from './auditLabels';
import { SensitiveFormatDialog } from './SensitiveFormatDialog';
import { WordlistBanner } from './WordlistBanner';
import shell from './audit.module.css';
import styles from './sensitive.module.css';

export interface SensitiveSectionProps {
  slug: string;
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

interface ChapterGroup {
  seq: number;
  list: { word: string; category: string; count: number }[];
}

/**
 * 「敏感词自查」区块（04 §5.4 第三块）。
 * 整本书扫描：免责文案常驻 → 点按钮扫描 → 按章节分组 + 按分类筛选 + 点击跳章并高亮命中词。
 * 词库缺失时**入口不隐藏**，点击后给可读引导（对齐 `11-敏感词库说明.md` §5），不报错不崩溃。
 */
export function SensitiveSection({ slug }: SensitiveSectionProps) {
  const navigate = useNavigate();
  const statusQuery = useWordlistStatus();
  const briefsQuery = useChapterBriefs(slug);
  const sensitive = useSensitiveAudit();

  const setActiveChapter = useDeskStore((s) => s.setActiveChapter);
  const requestChunkHighlight = useDeskStore((s) => s.requestChunkHighlight);

  const [category, setCategory] = useState<string>('');
  const [showMissing, setShowMissing] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);

  const briefs = briefsQuery.data ?? [];
  const wordlistPath = statusQuery.data?.path ?? 'data/sensitive_words.txt';
  // 词库是否已配置：null = 状态还没查出来（此时不摆引导，也不误报「未配置」）
  const configured = statusQuery.data ? statusQuery.data.configured : null;
  const configuredCount = statusQuery.data?.count;
  // 用 useMemo 稳定引用：`?? []` 每次渲染都是新数组，会让下面的 useMemo 依赖每帧失效
  const hits = useMemo(() => sensitive.data?.hits ?? [], [sensitive.data]);
  // 两个数别混（后端 `SensitiveHitOut` 按「词条 × 章节」聚合）：
  //   · total_hits = 全部命中「次数」之和。同一处文字可能被多个词条各命中一次
  //     （如「敏感」与「敏感词」会命中同一处），故它常大于「处数」。
  //   · wordCount  = 去重后的「词条个数」，这才是用户理解的「涉及几个词」；
  //     注意它 ≠ hits.length（同一词条在多个章节会占多条）。
  const wordCount = useMemo(() => new Set(hits.map((h) => h.word)).size, [hits]);
  const totalHits = sensitive.data?.total_hits ?? 0;

  const runScan = () => {
    // 词库缺失：不隐藏入口，点一下给引导（§5）
    if (statusQuery.data && !statusQuery.data.configured) {
      setShowMissing(true);
      return;
    }
    setShowMissing(false);
    setCategory('');
    sensitive.mutate(slug);
  };

  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hits) counts.set(h.category, (counts.get(h.category) ?? 0) + h.count);
    return SENSITIVE_CATEGORY_ORDER.filter((c) => counts.has(c)).map((c) => ({
      value: c as string,
      label: SENSITIVE_CATEGORY_LABELS[c],
      count: counts.get(c) ?? 0,
    }));
  }, [hits]);

  const groups: ChapterGroup[] = useMemo(() => {
    const filtered = category ? hits.filter((h) => h.category === category) : hits;
    const map = new Map<number, ChapterGroup['list']>();
    for (const h of filtered) {
      const item = { word: h.word, category: h.category, count: h.count };
      const arr = map.get(h.chapter_seq);
      if (arr) arr.push(item);
      else map.set(h.chapter_seq, [item]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([seq, list]) => ({
        seq,
        list: [...list].sort((x, y) => y.count - x.count || x.word.localeCompare(y.word, 'zh')),
      }));
  }, [hits, category]);

  const filteredTotal = useMemo(
    () => groups.reduce((sum, g) => sum + g.list.reduce((s, h) => s + h.count, 0), 0),
    [groups],
  );

  const jumpTo = (seq: number, word: string) => {
    const target = briefs.find((c) => c.seq === seq);
    if (!target) {
      toast.info(`第 ${seq} 章还没有正文，暂时跳不过去`);
      return;
    }
    setActiveChapter(target.id);
    requestChunkHighlight(seq, word);
    navigate(`/book/${encodeURIComponent(slug)}/desk`);
  };

  return (
    <section className={shell.section}>
      <div className={shell.sectionHead}>
        <div className={shell.sectionTitleWrap}>
          <span className={shell.sectionTitle}>
            <Icon name="search" size={20} /> 敏感词自查
          </span>
          <span className={shell.sectionHint}>
            拿你自己准备的一份词表，把整本书扫一遍，标出命中的词、在哪儿、出现了几次。纯本地匹配，不联网。
          </span>
        </div>
        <Button variant="primary" icon="search" loading={sensitive.isPending} onClick={runScan}>
          扫描整本书
        </Button>
      </div>

      <div className={shell.sectionBody}>
        {/* 前置常驻说明：点按钮之前就告知「需自备词表」（见 WordlistBanner 注释） */}
        <WordlistBanner
          configured={configured}
          count={configuredCount}
          onShowFormat={() => setFormatOpen(true)}
        />

        {/* 免责文案（11 §2：界面必须明确）—— 常驻，不随结果消失 */}
        <div className={styles.disclaimer}>
          <Icon name="info" size={16} className={styles.disclaimerIcon} />
          <span>
            本功能基于本地词库做机械匹配，仅供参考，不构成合规审查结论。请以平台规则与法律法规为准。
          </span>
        </div>

        {showMissing ? (
          <div className={styles.missingBox}>
            <div className={styles.missingHead}>
              <Icon name="info" size={20} className={shell.comingIcon} />
              <div>
                <div className={styles.missingTitle}>还没有配置敏感词库</div>
                <p className={styles.missingText}>
                  这是一个可选功能，你需要自己准备一份词表放到{' '}
                  <span className={styles.wordlistPath}>{wordlistPath}</span>。
                </p>
              </div>
            </div>
            <div className={styles.missingActions}>
              <Button
                size="sm"
                variant="secondary"
                icon="view"
                onClick={() => setFormatOpen(true)}
              >
                查看格式说明
              </Button>
            </div>
          </div>
        ) : sensitive.isError ? (
          <ErrorBar error={sensitive.error} onRetry={runScan} />
        ) : sensitive.isPending ? (
          <div className={shell.stateWrap}>
            <SkeletonRows count={3} />
          </div>
        ) : sensitive.data ? (
          <>
            <p className={styles.summaryLine}>
              词条命中 <strong>{totalHits}</strong> 次，涉及 <strong>{wordCount}</strong> 个词条
              {category ? (
                <>
                  ，当前筛选下命中 <strong>{filteredTotal}</strong> 次
                </>
              ) : null}
              。
            </p>
            {/* 消歧说明（team-lead ①）：点明「次数」与「词条个数」为何不相等 */}
            <p className={styles.summaryNote}>
              <Icon name="info" size={16} className={styles.noteIcon} />
              同一处文字可能被多个词条同时命中（例如「敏感」和「敏感词」会命中同一处），
              所以命中次数通常多于词条个数。
            </p>

            {availableCategories.length > 1 ? (
              <div className={styles.filterRow}>
                <Icon name="filter" size={16} className={styles.filterIcon} />
                <button
                  type="button"
                  className={[styles.chip, category === '' ? styles.chipActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setCategory('')}
                >
                  全部分类
                  <span className={styles.chipCount}>{sensitive.data.total_hits}</span>
                </button>
                {availableCategories.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={[styles.chip, category === c.value ? styles.chipActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setCategory(c.value)}
                  >
                    {c.label}
                    <span className={styles.chipCount}>{c.count}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {groups.length === 0 ? (
              <EmptyState
                icon="check"
                title={category ? '这个分类下没有命中' : '没有命中敏感词'}
                description="词库里的词一个都没出现。结果仅供参考，不构成合规审查结论。"
              />
            ) : (
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
                            onClick={() => jumpTo(g.seq, h.word)}
                          >
                            跳到本章
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className={shell.sectionHint}>
            点右上角「扫描整本书」，这里会按章节列出命中的词。
          </p>
        )}

        <SensitiveFormatDialog
          open={formatOpen}
          onClose={() => setFormatOpen(false)}
          path={wordlistPath}
        />
      </div>
    </section>
  );
}
