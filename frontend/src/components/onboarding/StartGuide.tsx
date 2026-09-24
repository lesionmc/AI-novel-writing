import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookPath } from '@/lib/slug';
import { Button } from '@/components/common/Button';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { SkeletonRows } from '@/components/common/Skeleton';
import {
  GUIDE_STEP_IDS,
  loadOnboardingProgress,
  markStepSkipped,
  type GuideStepId,
} from './onboardingProgress';
import { STEP_COPY, doneCount, type GuideFacts } from './onboardingModel';
import { useBookProgress } from './useBookProgress';
import { GuideStepCard } from './GuideStepCard';
import { DirectionStep } from './DirectionStep';
import { SkeletonStep } from './SkeletonStep';
import { PackageStep } from './PackageStep';
import styles from './onboarding.module.css';

/** 收起卡片上的一行摘要 */
function metaOf(step: GuideStepId, facts: GuideFacts, skipped: boolean): string {
  if (skipped) return '已跳过，随时可以回来补';
  if (step === 'direction') {
    const parts: string[] = [];
    if (facts.genre) parts.push(`题材：${facts.genre}`);
    if (facts.readers) parts.push(`写给：${facts.readers}`);
    if (facts.premise) parts.push('卖点已写');
    return parts.join(' · ') || '还没定';
  }
  if (step === 'skeleton') {
    const parts: string[] = [];
    if (facts.characters) parts.push(`人物 ${facts.characters}`);
    if (facts.worldEntries) parts.push(`世界观 ${facts.worldEntries}`);
    if (facts.outlines) parts.push(`大纲 ${facts.outlines}`);
    return parts.join(' · ') || '还没开始';
  }
  return facts.summary ? '简介已写好' : '还没写';
}

/**
 * 开书清单（`/book/:slug/start`）—— 把指南的六阶段里**开书前的一次性三步**
 * （立项 → 骨架 → 包装）摆到用户眼前，出口交棒给写稿。
 *
 * 布局（2026-09-24 重做）：**三张卡片全部在场**、各自可收合 ——
 * 做完的收起成一行摘要，没做的展开着等用户；比原先「一次只见一步、其余缩成灰条」
 * 更好建立全局感，也去掉了 pinned/inferred 两套状态互相打架的老问题。
 *
 * 硬约束不变：完成度**从已有数据推断**（不新增接口）；每一步都能跳过、
 * 跳过不构成门禁；老作品按真实数据算阶段，不会显示成「请从第 1 步开始」。
 */
export function StartGuide({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const { book, facts, done, loading, error, refetch } = useBookProgress(slug);
  const [skipped, setSkipped] = useState<GuideStepId[]>(() => loadOnboardingProgress(slug).skipped);
  /** 用户手动开合过的步骤；没动过的按「做完即收起」推断 */
  const [overrides, setOverrides] = useState<Partial<Record<GuideStepId, boolean>>>({});

  const allDone = doneCount(done) === GUIDE_STEP_IDS.length;
  const isOpen = (id: GuideStepId) => overrides[id] ?? !done[id];
  const toggle = (id: GuideStepId) =>
    setOverrides((o) => ({ ...o, [id]: !(o[id] ?? !done[id]) }));

  const skip = (step: GuideStepId) => {
    markStepSkipped(slug, step);
    setSkipped((prev) => (prev.includes(step) ? prev : [...prev, step]));
    setOverrides((o) => ({ ...o, [step]: false }));
  };

  if (error) {
    return (
      <main className="pageContent">
        <div className={styles.stateBox}>
          <ErrorBar error={error} onRetry={refetch} />
          <div className={styles.stepBody}>
            <div className={styles.actions}>
              <Button variant="primary" onClick={() => navigate('/')}>
                返回书库
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pageContent">
      <PageHeader
        title="开书清单"
        subtitle={
          <>
            {book ? `《${book.title}》` : '这部作品'}
            正式动笔前先把下面三件事做了，后面写起来不容易前后打架。做完哪一步算哪一步，都能跳过。
          </>
        }
        actions={
          <div className={styles.heroActions}>
            <Button variant="ghost" icon="chevronLeft" onClick={() => navigate('/')}>
              返回书库
            </Button>
            <Button variant="accent" icon="chapter" onClick={() => navigate(bookPath(slug, '/desk'))}>
              直接开始写
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className={styles.stateBox} aria-busy="true">
          <SkeletonRows count={4} />
        </div>
      ) : (
        <div className={styles.wrap}>
          <div className={styles.progress} aria-hidden="true">
            {STEP_COPY.map((s) => (
              <span
                key={s.id}
                className={[
                  styles.progressStep,
                  done[s.id] ? styles.progressStepDone : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span
                  className={[styles.progressDot, done[s.id] ? styles.progressDotDone : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {done[s.id] ? <Icon name="check" size={16} aria-hidden="true" /> : s.no}
                </span>
                {s.title}
              </span>
            ))}
          </div>

          {STEP_COPY.map((s) => (
            <GuideStepCard
              key={s.id}
              no={s.no}
              title={s.title}
              blurb={s.blurb}
              done={done[s.id]}
              open={isOpen(s.id)}
              onToggle={() => toggle(s.id)}
              meta={metaOf(s.id, facts, skipped.includes(s.id))}
              onSkip={done[s.id] || skipped.includes(s.id) ? undefined : () => skip(s.id)}
            >
              {s.id === 'direction' ? <DirectionStep slug={slug} facts={facts} /> : null}
              {s.id === 'skeleton' ? <SkeletonStep slug={slug} facts={facts} /> : null}
              {s.id === 'package' ? (
                <PackageStep slug={slug} title={book?.title ?? ''} facts={facts} />
              ) : null}
            </GuideStepCard>
          ))}

          <div className={styles.exitBar}>
            <p className={styles.exitText}>
              {allDone
                ? '三件事都齐了。第一章开头 300 字内就出事，别写景、别铺垫 —— 读者三句话看不到眼前的事就会划走。'
                : '上面的事先放一放也行。想先写第一章，随时点右上角「直接开始写」。'}
            </p>
            <Button variant="primary" icon="arrowRight" onClick={() => navigate(bookPath(slug, '/desk'))}>
              去写第一章
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
