import { useState } from 'react';
import type { TopicRecommendation } from '@/types/api';
import { userMessageOf } from '@/api/client';
import { useTopicGenres } from '@/hooks/queries';
import { useTopicAdvice } from '@/hooks/mutations/topics';
import { AiUnavailableNotice } from '@/components/common/AiUnavailableNotice';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { Modal } from '@/components/common/Modal';
import { TopicResults } from './TopicResults';
import { TopicSurvey } from './TopicSurvey';
import { EMPTY_ANSWERS, toAdviceRequest, type TopicAnswers } from './topicsModel';
import styles from './topics.module.css';

export interface TopicWizardProps {
  onClose: () => void;
  /** 全局未配置模型（来自 capabilities.llm_configured） */
  noModel: boolean;
  /** 引导用户去配置模型（书库页没有 book 上下文，交给外层决定去哪） */
  onOpenConfig: () => void;
  /** 「就用这个方向建书」 */
  onUse: (rec: TopicRecommendation) => void;
}

/**
 * 选题向导（PHASE 1，04 §6.4 新手引导）—— 模态三步：问卷 → 加载 → 结果。
 * 外层每次打开用 `key` 重挂载本组件，故此处无需在 effect 里手动 reset state。
 */
export function TopicWizard({ onClose, noModel, onOpenConfig, onUse }: TopicWizardProps) {
  const [answers, setAnswers] = useState<TopicAnswers>(EMPTY_ANSWERS);
  const [genreError, setGenreError] = useState<string | undefined>(undefined);
  const genres = useTopicGenres(!noModel);
  const advice = useTopicAdvice();

  const patch = (p: Partial<TopicAnswers>) => {
    setAnswers((a) => ({ ...a, ...p }));
    if (p.favoriteGenres && genreError) setGenreError(undefined);
  };

  const submit = () => {
    if (answers.favoriteGenres.length === 0) {
      setGenreError('至少选一个你爱看的类型');
      return;
    }
    advice.mutate(toAdviceRequest(answers));
  };

  const isResult = Boolean(advice.data);
  const loading = advice.isPending;

  const footer = loading ? (
    <>
      <Button variant="ghost" disabled>
        取消
      </Button>
      <Button variant="primary" loading>
        正在分析
      </Button>
    </>
  ) : isResult ? (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          advice.reset();
        }}
      >
        重新回答
      </Button>
      <Button variant="secondary" onClick={onClose}>
        完成
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>
        取消
      </Button>
      <Button variant="primary" icon="sparkles" onClick={submit} disabled={noModel}>
        开始推荐
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      showClose={!loading}
      closeOnOverlay={!loading}
      title="让 AI 帮你选题"
      subtitle="回答四个问题，我给你几个「有人看、写得少」的方向。"
      footer={footer}
    >
      <div className={styles.stack}>
        {noModel ? (
          <AiUnavailableNotice onOpenConfig={onOpenConfig} configLabel="去配置模型">
            选题推荐要用模型分析题材库。先建一个作品，再到「设置 → 已配置的模型」里加一个，就能用了。
          </AiUnavailableNotice>
        ) : loading ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <Icon name="loader" size={24} className={styles.loadingIcon} />
            <div className={styles.loadingTitle}>正在翻题材库</div>
            <p className={styles.loadingDesc}>
              我在比对每个赛道的热度与竞争度，再挑出写得少的方向。可能要十几秒，先别关。
            </p>
          </div>
        ) : advice.isError ? (
          <div className={styles.stateWrap}>
            <ErrorBar
              error={advice.error}
              onRetry={submit}
            />
            <p className={styles.stepHint}>{userMessageOf(advice.error)}</p>
          </div>
        ) : advice.data ? (
          <TopicResults data={advice.data} onUse={onUse} />
        ) : (
          <TopicSurvey
            genres={genres.data?.genres ?? []}
            genresNote={genres.data?.note ?? null}
            genresLoading={genres.isPending}
            genresError={genres.error}
            onRetryGenres={() => void genres.refetch()}
            answers={answers}
            onChange={patch}
            genreError={genreError}
          />
        )}
      </div>
    </Modal>
  );
}
