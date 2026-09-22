import type { TopicGenre } from '@/types/api';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Input } from '@/components/common/Input';
import { SkeletonRows } from '@/components/common/Skeleton';
import {
  DAILY_WORDS_OPTIONS,
  MAX_GENRES,
  TARGET_LENGTH_OPTIONS,
  competitionWords,
  heatWords,
  type NumberOption,
  type TopicAnswers,
} from './topicsModel';
import styles from './topics.module.css';
import s from './topicSurvey.module.css';

export interface TopicSurveyProps {
  genres: TopicGenre[];
  /** 题材库为空时后端给的可读提示（文件缺失/损坏）；正常为 null */
  genresNote?: string | null;
  genresLoading: boolean;
  genresError: unknown;
  onRetryGenres: () => void;
  answers: TopicAnswers;
  onChange: (patch: Partial<TopicAnswers>) => void;
  genreError?: string;
}

/** 单选胶囊组（第 3 / 4 问）；再点一次已选项可取消 → 回到「还没想好」 */
function PillGroup({
  options,
  value,
  onSelect,
}: {
  options: NumberOption[];
  value: number | null;
  onSelect: (v: number | null) => void;
}) {
  return (
    <div className={s.pillRow}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            className={[s.pill, active ? s.pillActive : ''].filter(Boolean).join(' ')}
            onClick={() => onSelect(active ? null : o.value)}
          >
            <span className={s.pillLabel}>{o.label}</span>
            {o.hint ? <span className={s.pillHint}>{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 选题问卷（四问）。
 * 全部是**可选项**：题材是多选芯片，日更 / 总长是单选胶囊，经历背景可留空
 * —— 目标是不逼新手打字。
 */
export function TopicSurvey({
  genres,
  genresNote,
  genresLoading,
  genresError,
  onRetryGenres,
  answers,
  onChange,
  genreError,
}: TopicSurveyProps) {
  const toggleGenre = (name: string) => {
    const set = new Set(answers.favoriteGenres);
    if (set.has(name)) set.delete(name);
    else if (set.size < MAX_GENRES) set.add(name);
    onChange({ favoriteGenres: [...set] });
  };

  return (
    <div className={styles.stack}>
      <p className={s.stepHint}>
        回答四个问题就行，都不用打字。我会结合题材库的真实热度与竞争度，给你几个「有人看、写得少」的方向。
      </p>

      <section className={s.q}>
        <div className={s.qTitle}>
          <span className={s.qIndex}>1</span>
          你最爱看什么类型？
          <span className={s.qHint}>最多选 {MAX_GENRES} 个</span>
        </div>
        {genresLoading ? (
          <SkeletonRows count={2} />
        ) : genresError ? (
          <ErrorBar error={genresError} onRetry={onRetryGenres} />
        ) : genres.length === 0 ? (
          <p className={s.qHint}>
            {genresNote || '暂时拿不到题材库，直接跳过也能继续。'}
          </p>
        ) : (
          <div className={s.chipGrid}>
            {genres.map((g) => {
              const active = answers.favoriteGenres.includes(g.name);
              const full = !active && answers.favoriteGenres.length >= MAX_GENRES;
              return (
                <button
                  key={g.name}
                  type="button"
                  aria-pressed={active}
                  disabled={full}
                  className={[s.chip, active ? s.chipActive : ''].filter(Boolean).join(' ')}
                  onClick={() => toggleGenre(g.name)}
                  title={g.core_experience}
                >
                  <span className={s.chipName}>{g.name}</span>
                  {/* 人话标签，不给裸数字（QA M7：36 是高还是低？） */}
                  <span className={s.chipMeta}>
                    {heatWords(g.heat)} · {competitionWords(g.competition)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {genreError ? <span className={s.qError}>{genreError}</span> : null}
      </section>

      <Input
        label="2. 有什么别人没有的经历或专业背景？"
        value={answers.uniqueBackground}
        placeholder="例如：在三甲医院急诊科待过八年；或者：开过三年货车"
        hint="可不填。写下来，推荐会更贴合你的独家视角。"
        onChange={(e) => onChange({ uniqueBackground: e.target.value })}
      />

      <section className={s.q}>
        <div className={s.qTitle}>
          <span className={s.qIndex}>3</span>
          一天能写多少字？
        </div>
        <PillGroup
          options={DAILY_WORDS_OPTIONS}
          value={answers.dailyWords}
          onSelect={(v) => onChange({ dailyWords: v })}
        />
      </section>

      <section className={s.q}>
        <div className={s.qTitle}>
          <span className={s.qIndex}>4</span>
          想写多长？
        </div>
        <PillGroup
          options={TARGET_LENGTH_OPTIONS}
          value={answers.targetLength}
          onSelect={(v) => onChange({ targetLength: v })}
        />
      </section>
    </div>
  );
}
