import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookPath } from '@/lib/slug';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { SkeletonRows } from '@/components/common/Skeleton';
import {
  GUIDE_STEP_IDS,
  loadOnboardingProgress,
  markStepSkipped,
  type GuideStepId,
} from './onboardingProgress';
import { STEP_COPY, copyOf, currentStep, doneCount, type GuideFacts } from './onboardingModel';
import { useBookProgress } from './useBookProgress';
import { GuideDoneRow, GuideStepCard } from './GuideStepCard';
import { DirectionStep } from './DirectionStep';
import { SkeletonStep } from './SkeletonStep';
import { PackageStep } from './PackageStep';
import styles from './onboarding.module.css';

/** 已完成 / 已跳过步骤的一行摘要 */
function metaOf(step: GuideStepId, facts: GuideFacts, skipped: boolean): string {
  if (skipped) return '已跳过，随时可以回来补';
  if (step === 'direction') {
    const parts: string[] = [];
    if (facts.genre) parts.push(`题材：${facts.genre}`);
    if (facts.premise) parts.push('卖点已写');
    return parts.join(' · ') || '已定方向';
  }
  if (step === 'skeleton') {
    const parts: string[] = [];
    if (facts.characters) parts.push(`人物 ${facts.characters}`);
    if (facts.worldEntries) parts.push(`世界观 ${facts.worldEntries}`);
    if (facts.outlines) parts.push(`大纲 ${facts.outlines}`);
    return parts.join(' · ') || '已开始搭架子';
  }
  return '简介已写好';
}

/**
 * 开书清单（`/book/:slug/start`）—— 把指南的六阶段里**开书前的一次性三步**
 * （立项 → 骨架 → 包装）摆到用户眼前，出口交棒给写稿。
 *
 * 产品判断（写进方案第 3 步）：六阶段里 PHASE 4/5/6 是写完一本的**循环**，
 * 塞进"开书"清单只会变成一份永远做不完的待办，所以向导只覆盖前三步。
 *
 * 硬约束：
 *   · 完成度**从已有数据推断**（见 `onboardingModel.stepDone`），不新增接口、不新增状态机；
 *   · **每一步都能跳过**，且跳过不构成任何门禁（写作台的「新建第一章」永远可用）；
 *   · 老作品天然兼容 —— 按真实数据算出"已经过了这一步"，不会显示成"请从第 1 步开始"。
 */
export function StartGuide({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const { book, facts, done, loading, error, refetch } = useBookProgress(slug);
  const [skipped, setSkipped] = useState<GuideStepId[]>(() => loadOnboardingProgress(slug).skipped);
  /** 用户点过某一行的"继续补"后固定住；没点过就跟着推断结果走 */
  const [pinned, setPinned] = useState<GuideStepId | null>(null);

  const inferred = currentStep(done);
  const active = pinned ?? inferred;
  const activeCopy = copyOf(active);
  const allDone = doneCount(done) === GUIDE_STEP_IDS.length;

  const skip = (step: GuideStepId) => {
    markStepSkipped(slug, step);
    setSkipped((prev) => (prev.includes(step) ? prev : [...prev, step]));
    setPinned(null);
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
      <header className={styles.hero}>
        <div>
          <h1 className="pageTitle">开书清单</h1>
          <p className="pageSubtitle">
            {book ? `《${book.title}》` : '这部作品'}
            正式动笔前先把下面三件事做了，后面写起来不容易前后打架。做完哪一步算哪一步，都能跳过。
          </p>
        </div>
        <div className={styles.heroActions}>
          <Button variant="ghost" icon="chevronLeft" onClick={() => navigate('/')}>
            返回书库
          </Button>
          <Button variant="accent" icon="chapter" onClick={() => navigate(bookPath(slug, '/desk'))}>
            直接开始写
          </Button>
        </div>
      </header>

      {loading ? (
        <div className={styles.stateBox} aria-busy="true">
          <SkeletonRows count={4} />
        </div>
      ) : (
        <div className={styles.wrap}>
          <div className={styles.progress}>
            {STEP_COPY.map((s) => (
              <span
                key={s.id}
                className={[
                  styles.progressStep,
                  s.id === active ? styles.progressStepActive : '',
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

          <GuideStepCard
            no={activeCopy.no}
            title={activeCopy.title}
            blurb={activeCopy.blurb}
            done={done[active]}
            onSkip={() => skip(active)}
          >
            {active === 'direction' ? <DirectionStep slug={slug} facts={facts} /> : null}
            {active === 'skeleton' ? <SkeletonStep slug={slug} facts={facts} /> : null}
            {active === 'package' ? (
              <PackageStep slug={slug} title={book?.title ?? ''} facts={facts} />
            ) : null}
          </GuideStepCard>

          <div className={styles.doneList}>
            {GUIDE_STEP_IDS.filter((id) => id !== active).map((id) => (
              <GuideDoneRow
                key={id}
                no={copyOf(id).no}
                title={copyOf(id).title}
                meta={metaOf(id, facts, skipped.includes(id))}
                onOpen={() => setPinned(id)}
              />
            ))}
          </div>

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
