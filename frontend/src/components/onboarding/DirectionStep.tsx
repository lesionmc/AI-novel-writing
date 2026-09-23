import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TopicRecommendation } from '@/types/api';
import { useUpdateBook } from '@/hooks/mutations/books';
import { useCapabilities } from '@/hooks/useCapabilities';
import { bookPath } from '@/lib/slug';
import { GENRE_OPTIONS } from '@/lib/characterOptions';
import { Button } from '@/components/common/Button';
import { Combobox } from '@/components/common/Combobox';
import { ErrorBar } from '@/components/common/ErrorBar';
import { TopicWizard } from '@/components/topics/TopicWizard';
import type { GuideFacts } from './onboardingModel';
import styles from './onboarding.module.css';

export interface DirectionStepProps {
  slug: string;
  facts: GuideFacts;
}

/**
 * 第 1 步：先想清楚写什么（指南 PHASE 1 立项）。
 * 两条路：**让 AI 出方向**（复用已上线的选题向导），或自己从常见赛道里挑一个。
 * 采纳 AI 方向时把「方向名 + 卖点示例」写进这部作品 —— 走已有的
 * `PATCH /api/books/{book}`，不新增接口。
 */
export function DirectionStep({ slug, facts }: DirectionStepProps) {
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const update = useUpdateBook(slug);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [genre, setGenre] = useState(facts.genre ?? '');

  const noModel = capabilities.data?.llm_configured === false;
  const hasDirection = Boolean(facts.genre || facts.premise);

  const openWizard = () => {
    setWizardKey((k) => k + 1);
    setWizardOpen(true);
    void capabilities.refetch();
  };

  const useTopic = (rec: TopicRecommendation) => {
    setWizardOpen(false);
    setGenre(rec.niche);
    update.mutate({ genre: rec.niche, premise: rec.sample_premise ?? undefined });
  };

  return (
    <>
      <div className={styles.actions}>
        <Button variant="primary" icon="sparkles" onClick={openWizard}>
          让 AI 帮我选个方向
        </Button>
        <Button variant="secondary" onClick={() => setManualOpen((v) => !v)}>
          {manualOpen ? '收起' : '我自己挑题材'}
        </Button>
      </div>

      {hasDirection ? (
        <div className={styles.summary}>
          <span className={styles.summaryLabel}>目前定下来的方向</span>
          {facts.genre ? (
            <span className={styles.summaryValue}>题材：{facts.genre}</span>
          ) : null}
          {facts.premise ? (
            <span className={styles.summaryValue}>一句话卖点：{facts.premise}</span>
          ) : null}
        </div>
      ) : null}

      {update.isError ? <ErrorBar error={update.error} /> : null}

      {manualOpen ? (
        <>
          <Combobox
            label="题材"
            hint="点箭头从常见赛道里挑一个，每个都配了一句说明；也可以自己输"
            options={GENRE_OPTIONS}
            value={genre}
            placeholder="点箭头选择，或直接输入"
            onChange={setGenre}
          />
          <div className={styles.actions}>
            <Button
              variant="primary"
              onClick={() => update.mutate({ genre: genre.trim() || null })}
              loading={update.isPending}
              disabled={!genre.trim()}
            >
              保存
            </Button>
          </div>
        </>
      ) : null}

      {wizardOpen ? (
        <TopicWizard
          key={wizardKey}
          onClose={() => setWizardOpen(false)}
          noModel={noModel}
          onOpenConfig={() => {
            setWizardOpen(false);
            navigate(bookPath(slug, '/config'));
          }}
          onUse={useTopic}
        />
      ) : null}
    </>
  );
}
