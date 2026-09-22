import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ConsistencyConflict,
  ConsistencyProgress,
  ConsistencySummary,
} from '@/types/api';
import { api } from '@/api/client';
import { useCapabilities } from '@/hooks/useCapabilities';
import { AiUnavailableNotice } from '@/components/common/AiUnavailableNotice';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import styles from './audit.module.css';

export interface ConsistencySectionProps {
  slug: string;
}

const SEVERITY_LABEL: Record<ConsistencyConflict['severity'], string> = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};

const SEVERITY_VARIANT: Record<ConsistencyConflict['severity'], 'danger' | 'accent' | 'neutral'> = {
  high: 'danger',
  medium: 'accent',
  low: 'neutral',
};

/**
 * 一致性审校区块（R8，SSE 流式）。
 *
 * ## 它解决什么问题
 * 这是「防吃书」这个卖点**最直接的工具**：通读全书，把前后对不上的地方列出来
 * （已死角色又出场、能力等级倒退、道具凭空出现、时间线冲突）。
 * 在此之前它一直是契约里唯一没实现的端点，界面只放了句「即将上线」。
 *
 * ## 交互要点
 * - 边审边出：SSE 每发现一条矛盾就推一条，用户不用等全书审完（长书可能要几分钟）。
 * - 可中断：审校要跑多次模型调用，给一个「停止」按钮 —— 长任务不能只有开始没有结束。
 * - 产物是**清单**，不是自动改稿：用户自己判断要不要改（红线 2 精神）。
 */
export function ConsistencySection({ slug }: ConsistencySectionProps) {
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const noModel = capabilities.data?.llm_configured === false;

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ConsistencyProgress | null>(null);
  const [conflicts, setConflicts] = useState<ConsistencyConflict[]>([]);
  const [summary, setSummary] = useState<ConsistencySummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [started, setStarted] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  };

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setStarted(true);
    setError(null);
    setSummary(null);
    setConflicts([]);
    setProgress({ percent: 0, note: '正在准备…' });

    try {
      await api.auditConsistencyStream(
        slug,
        {
          onProgress: setProgress,
          // 追加式渲染：同一条矛盾后端已去重，这里不再二次判断
          onConflict: (c) => setConflicts((prev) => [...prev, c]),
          onDone: setSummary,
        },
        { signal: controller.signal },
      );
    } catch (e) {
      // 用户主动停止不算错误
      if (!controller.signal.aborted) setError(e);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  };

  const counts = summary ?? {
    total: conflicts.length,
    high: conflicts.filter((c) => c.severity === 'high').length,
    medium: conflicts.filter((c) => c.severity === 'medium').length,
    low: conflicts.filter((c) => c.severity === 'low').length,
    reviewed: 0,
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitleWrap}>
          <span className={styles.sectionTitle}>
            <Icon name="target" size={20} /> 一致性审校
          </span>
          <span className={styles.sectionHint}>
            通读全书，找出前后对不上的地方——比如已死的角色又出场、能力等级倒退、时间线打架。
          </span>
        </div>
      </div>

      <div className={styles.sectionBody}>
        {noModel ? (
          <AiUnavailableNotice
            onOpenConfig={() => navigate(`/book/${encodeURIComponent(slug)}/config`)}
            configLabel="去配置模型"
          >
            这项能力要读全书内容并比对，必须有模型。配置后就能用了 —— 下面的「去 AI 味」和「敏感词自查」是纯本地的，不受影响。
          </AiUnavailableNotice>
        ) : (
          <>
            <div className={styles.toolbar}>
              <Button
                variant="primary"
                icon="target"
                loading={running}
                onClick={() => void start()}
              >
                {started ? '重新审校全书' : '开始审校全书'}
              </Button>
              {running ? (
                <Button variant="ghost" icon="close" onClick={stop}>
                  停止
                </Button>
              ) : null}
              <span className={styles.spacer} />
              {started && !running ? (
                <span className={styles.fieldLabel}>
                  共 {counts.total} 条 · 严重 {counts.high} / 中等 {counts.medium} / 轻微 {counts.low}
                </span>
              ) : null}
            </div>

            {running && progress ? (
              <p className={styles.fieldLabel}>
                {progress.percent}% · {progress.note}
              </p>
            ) : null}

            {error ? <ErrorBar error={error} onRetry={() => void start()} retryLabel="重试" /> : null}

            {started && !running && !error && conflicts.length === 0 && summary ? (
              <div className={styles.shortNote}>
                <Icon name="check" size={16} className={styles.shortNoteIcon} />
                审校了 {summary.reviewed} 章，没发现客观矛盾。
                （只查设定冲突与时间线，不评价文笔与情节好坏。）
              </div>
            ) : null}

            {conflicts.length > 0 ? (
              <div className={styles.hitList}>
                {conflicts.map((c, i) => (
                  <article className={styles.hitCard} key={`${c.subject}-${c.conflict}-${i}`}>
                    <div className={styles.hitHead}>
                      <Badge variant={SEVERITY_VARIANT[c.severity]}>
                        {SEVERITY_LABEL[c.severity]}
                      </Badge>
                      <span className={styles.fieldLabel}>
                        {c.chapters.length > 0
                          ? `涉及第 ${c.chapters.join('、')} 章`
                          : '未标注章节'}
                      </span>
                    </div>
                    {c.subject ? (
                      <div className={styles.suggestionBlock}>
                        <span className={styles.fieldLabel}>涉及</span>
                        <span className={styles.suggestionText}>{c.subject}</span>
                      </div>
                    ) : null}
                    <p className={styles.suggestionText}>{c.conflict}</p>
                    {c.evidence ? <div className={styles.hitQuote}>{c.evidence}</div> : null}
                  </article>
                ))}
              </div>
            ) : null}

            {running && conflicts.length === 0 ? (
              <p className={styles.fieldLabel}>
                正在逐段比对。长书要几分钟，可以随时点「停止」。
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
