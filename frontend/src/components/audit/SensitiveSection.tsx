import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChapterBriefs, useWordlistStatus } from '@/hooks/queries';
import { useSensitiveAudit } from '@/hooks/mutations/audit';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { SkeletonRows } from '@/components/common/Skeleton';
import {
  SENSITIVE_CATEGORY_LABELS,
  SENSITIVE_CATEGORY_ORDER,
} from './auditLabels';
import { SensitiveFormatDialog } from './SensitiveFormatDialog';
import { SensitiveHitList } from './SensitiveHitList';
import type { ChapterGroup } from './SensitiveHitList';
import { WordlistBanner } from './WordlistBanner';
import shell from './audit.module.css';
import styles from './sensitive.module.css';
import { slugSegment } from '@/lib/slug';

export interface SensitiveSectionProps {
  slug: string;
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
  // 词库不可用时，「0 命中」是假象：本次根本没比对任何词条。必须显式提示（禁止假安全感）。
  const wordlistAvailable = sensitive.data?.wordlist_available ?? null;

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
    navigate(`/book/${slugSegment(slug)}/desk`);
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
            {/* 词库为空：结果里的「0 命中」不代表稿子没问题 —— 必须把话说透（醒目但非错误色） */}
            {wordlistAvailable === false ? (
              <div
                className={[styles.wordlistBanner, styles.wordlistBannerAlert].join(' ')}
                role="status"
              >
                <Icon name="info" size={16} className={styles.bannerIcon} />
                <span className={styles.bannerText}>
                  <strong>词库为空，本次扫描没有实际检查任何内容</strong>
                  {' '}—— 请先在设置里配置词库，否则这里的「0 命中」不代表稿子没问题。
                </span>
              </div>
            ) : null}

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

            <SensitiveHitList
              groups={groups}
              category={category}
              wordlistAvailable={wordlistAvailable}
              onJump={jumpTo}
            />
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
