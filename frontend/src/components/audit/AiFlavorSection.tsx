import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChapter, useChapterBriefs } from '@/hooks/queries';
import { useAiFlavorAudit } from '@/hooks/mutations/audit';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';
import { buildLocateAnchor } from '@/lib/auditLocate';
import { normalizeForMatch, stripHtmlTags } from '@/lib/chunkLocate';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { Select } from '@/components/common/Select';
import { SkeletonRows } from '@/components/common/Skeleton';
import { AiFlavorHitCard } from './AiFlavorHitCard';
import { ScoreRing, type ScoreRingTone } from './ScoreRing';
import { scoreBand } from './auditLabels';
import styles from './audit.module.css';
import { slugSegment } from '@/lib/slug';

export interface AiFlavorSectionProps {
  slug: string;
}

const TONE: Record<string, ScoreRingTone> = {
  success: 'success',
  neutral: 'neutral',
  warning: 'warning',
  danger: 'danger',
};

/**
 * 短文本阈值（字）。后端评分按「千字密度」归一化，短文本分母太小 → 分数虚高，
 * 28 字的正常段落都可能拿 98 分（QA 实测）。这里加一句轻提示做双保险：
 * 即便后端修好评分，短文本本身也该降权解读。
 */
const SHORT_TEXT_THRESHOLD = 300;

/**
 * 「去 AI 味」区块（04 §5.4 第二块）。
 * 单章检测：选一章 → 开始检测 → 评分环形 + 命中列表；每条可「去改这一处」（跳章 + 高亮）。
 * 红线 3：这是**纯本地规则**功能，不配模型也能用 —— 故入口不因「未配模型」禁用。
 * 本区块**只读**，不写回正文（原因见 `AiFlavorHitCard` 注释）。
 */
export function AiFlavorSection({ slug }: AiFlavorSectionProps) {
  const navigate = useNavigate();
  const briefsQuery = useChapterBriefs(slug);
  const briefs = useMemo(() => briefsQuery.data ?? [], [briefsQuery.data]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const flavor = useAiFlavorAudit();
  const chapterQuery = useChapter(selectedId);

  const setActiveChapter = useDeskStore((s) => s.setActiveChapter);
  const requestChunkHighlight = useDeskStore((s) => s.requestChunkHighlight);

  // 默认选当前章（若写作台正开着某章）或第 1 章
  useEffect(() => {
    if (selectedId !== null) return;
    const active = useDeskStore.getState().activeChapterId;
    const initial = briefs.find((c) => c.id === active) ?? briefs[0];
    if (initial) setSelectedId(initial.id);
  }, [briefs, selectedId]);

  const selectedSeq = useMemo(
    () => briefs.find((c) => c.id === selectedId)?.seq ?? null,
    [briefs, selectedId],
  );

  const options = briefs.map((c) => ({
    value: String(c.id),
    label: `第 ${c.seq} 章 ${c.title || '未命名'}`,
  }));

  const runDetect = () => {
    if (selectedId === null) return;
    flavor.mutate(selectedId);
  };

  /** 跳到命中位置：切到该章 + 用上下文锚点让编辑器高亮 */
  const locate = (hit: { text: string; position: number }) => {
    if (selectedSeq === null) return;
    const target = briefs.find((c) => c.seq === selectedSeq);
    if (!target) {
      toast.info('找不到这一章，可能已被删除');
      return;
    }
    const anchor = buildLocateAnchor(chapterQuery.data?.content ?? '', hit);
    setActiveChapter(target.id);
    if (anchor) requestChunkHighlight(selectedSeq, anchor);
    navigate(`/book/${slugSegment(slug)}/desk`);
  };

  const band = flavor.data ? scoreBand(flavor.data.score) : null;
  const canDetect = selectedId !== null && !flavor.isPending;
  // 所选章节正文字数（口径与后端评分一致：去 HTML 标签 + 折叠空白），用于短文本提示
  const charCount = useMemo(
    () => normalizeForMatch(stripHtmlTags(chapterQuery.data?.content ?? '')).length,
    [chapterQuery.data?.content],
  );
  const isShortText = charCount > 0 && charCount <= SHORT_TEXT_THRESHOLD;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitleWrap}>
          <span className={styles.sectionTitle}>
            <Icon name="sparkles" size={20} /> 去 AI 味
          </span>
          <span className={styles.sectionHint}>
            检查这一章读起来像不像机器写的：套话、直接说情绪、程度词堆砌都会被标出来并给出改写建议。
            这一项不需要配置 AI 模型也能用。这里只做检查、不改你的正文，点「去改这一处」会跳到对应位置方便你改。
          </span>
        </div>
      </div>

      <div className={styles.sectionBody}>
        <div className={styles.toolbar}>
          <div className={styles.chapterSelect}>
            <Select
              label="选择章节"
              options={options}
              placeholder={briefs.length === 0 ? '还没有章节' : '选择要检测的章节'}
              value={selectedId !== null ? String(selectedId) : ''}
              disabled={briefs.length === 0}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className={styles.spacer} />
          <Button
            variant="primary"
            icon="search"
            disabled={!canDetect}
            loading={flavor.isPending}
            onClick={runDetect}
          >
            {flavor.data ? '重新检测' : '开始检测'}
          </Button>
        </div>

        {briefsQuery.isPending ? (
          <div className={styles.stateWrap}>
            <SkeletonRows count={2} />
          </div>
        ) : briefsQuery.isError ? (
          <ErrorBar error={briefsQuery.error} onRetry={() => void briefsQuery.refetch()} />
        ) : briefs.length === 0 ? (
          <EmptyState
            icon="chapter"
            title="还没有可以检测的章节"
            description="先去写作台写一章，再回来做去 AI 味检测。"
            actionLabel="去写作台写第一章"
            actionIcon="edit"
            onAction={() => navigate(`/book/${slugSegment(slug)}/desk`)}
          />
        ) : flavor.isPending ? (
          <div className={styles.stateWrap}>
            <SkeletonRows count={3} />
          </div>
        ) : flavor.isError ? (
          <ErrorBar error={flavor.error} onRetry={runDetect} />
        ) : flavor.data && band ? (
          <>
            <div className={styles.scorePanel}>
              <ScoreRing score={flavor.data.score} tone={TONE[band.variant] ?? 'neutral'} />
              <div className={styles.scoreSummary}>
                <div className={styles.scoreSummaryTitle}>
                  <Badge variant={band.variant}>AI 味：{band.label}</Badge>
                </div>
                <p className={styles.scoreSummaryText}>
                  {band.hint}。分数越高表示越像 AI 写的，满分 100。
                </p>
                {isShortText ? (
                  <p className={styles.shortNote}>
                    <Icon name="info" size={16} className={styles.shortNoteIcon} />
                    本章较短（约 {charCount} 字），评分容易偏高，仅供参考。
                  </p>
                ) : null}
              </div>
            </div>

            {flavor.data.hits.length === 0 ? (
              <EmptyState
                icon="check"
                title="没有发现明显的 AI 味"
                description="这一段读起来挺自然的，接着写吧。"
              />
            ) : (
              <ul className={styles.hitList}>
                {flavor.data.hits.map((hit, index) => (
                  <AiFlavorHitCard
                    key={`${hit.type}-${hit.position}-${index}`}
                    hit={hit}
                    onLocate={() => locate(hit)}
                  />
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className={styles.sectionHint}>
            选好章节后点「开始检测」，这里会出现评分和需要改的地方。
          </p>
        )}
      </div>
    </section>
  );
}
