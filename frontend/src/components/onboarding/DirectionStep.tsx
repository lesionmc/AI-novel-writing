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
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { TopicWizard } from '@/components/topics/TopicWizard';
import type { TopicAnswers } from '@/components/topics/topicsModel';
import type { GuideFacts } from './onboardingModel';
import styles from './onboarding.module.css';

export interface DirectionStepProps {
  slug: string;
  facts: GuideFacts;
}

/**
 * 第 1 步：立项 —— 写什么（题材）× 写给谁（读者/平台）× 凭什么抓人（卖点）。
 * 三样都定下来这步才算完成：它们是 AI 之后写大纲、写正文时判断口吻与节奏的依据。
 * 两条路：**让 AI 出方向**（选题向导五问，采纳时连读者定位一起落进作品），或自己填。
 * 全部走已有的 `PATCH /api/books/{book}`，不新增接口。
 */
export function DirectionStep({ slug, facts }: DirectionStepProps) {
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const update = useUpdateBook(slug);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [genre, setGenre] = useState(facts.genre ?? '');
  const [readers, setReaders] = useState(facts.readers ?? '');
  const [premise, setPremise] = useState(facts.premise ?? '');

  const noModel = capabilities.data?.llm_configured === false;

  const openWizard = () => {
    setWizardKey((k) => k + 1);
    setWizardOpen(true);
    void capabilities.refetch();
  };

  /** 采纳 AI 方向：表单跟着变，并立刻落库（含读者定位与目标长度 —— 问卷答了就不该丢） */
  const useTopic = (rec: TopicRecommendation, answers: TopicAnswers) => {
    setWizardOpen(false);
    const g = rec.niche;
    const p = (rec.sample_premise ?? '').trim();
    const rd = answers.readers.trim();
    setGenre(g);
    setPremise(p);
    if (rd) setReaders(rd);
    update.mutate({
      genre: g,
      premise: p || null,
      readers: rd || null,
      target_words: answers.targetLength ?? undefined,
    });
  };

  const save = () => {
    update.mutate({
      genre: genre.trim() || null,
      readers: readers.trim() || null,
      premise: premise.trim() || null,
    });
  };

  return (
    <>
      <div className={styles.actions}>
        <Button variant="primary" icon="sparkles" onClick={openWizard}>
          让 AI 帮我定方向
        </Button>
      </div>

      {update.isError ? <ErrorBar error={update.error} /> : null}

      <div className={styles.fieldStack}>
        <Combobox
          label="写什么 · 题材"
          hint="点箭头从常见赛道里挑一个，每个都配了一句说明；也可以自己输"
          options={GENRE_OPTIONS}
          value={genre}
          placeholder="点箭头选择，或直接输入"
          onChange={setGenre}
        />
        <Input
          label="写给谁看 · 读者与平台"
          value={readers}
          placeholder="例如：番茄男频，爱看扮猪吃虎的下班读者"
          hint="平台和读者群决定节奏与写法；没想好发哪，就先写读者是谁"
          onChange={(e) => setReaders(e.target.value)}
        />
        <Textarea
          label="凭什么抓人 · 一句话卖点"
          rows={2}
          value={premise}
          placeholder="一句话讲清：他是谁、卡在哪、最想看的是什么"
          hint="写给未来的自己看。也可以让上面的 AI 选题帮你出"
          onChange={(e) => setPremise(e.target.value)}
        />
        <div className={styles.actions}>
          <Button
            variant="primary"
            onClick={save}
            loading={update.isPending}
            disabled={!genre.trim() && !readers.trim() && !premise.trim()}
          >
            保存立项
          </Button>
        </div>
      </div>

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
