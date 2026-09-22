import { useState } from 'react';
import type { CreateBookRequest } from '@/types/api';
import { GENRE_OPTIONS, TARGET_WORDS_OPTIONS } from '@/lib/characterOptions';
import { Combobox } from '@/components/common/Combobox';
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { FieldWithHint } from '@/components/common/FieldWithHint';
import styles from './NewBookForm.module.css';

export interface NewBookFormProps {
  formId: string;
  onSubmit: (values: CreateBookRequest) => void;
  /** 书名是否已填 —— 外层据此把「创建」按钮一起置灰（QA：点了没反应比灰着更糟） */
  onValidityChange?: (valid: boolean) => void;
  /**
   * 预填值（选题向导「就用这个方向建书」会带 `genre` + `premise` 进来）。
   * 仅作初始值 —— 组件由外层用 `key` 重挂载来切换预填内容。
   */
  initial?: Partial<CreateBookRequest>;
}

/**
 * 新建作品表单：书名（必填）/ 题材 / 想写多长 / 一句话卖点。
 * **只有书名必填**（04 §5.1）——其余可以之后再定。
 *
 * 新手友好（QA 走查「差点放弃」的那一瞬间）：书名**失焦即校验**（不等提交），
 * 且用分组标题把「书名」与「一句话卖点」隔开 —— 原先两栏上下紧挨，把卖点内容
 * 填进书名框会静默生成一部以卖点为名的作品，全程没有任何提示。
 */
export function NewBookForm({ formId, onSubmit, onValidityChange, initial }: NewBookFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [genre, setGenre] = useState(initial?.genre ?? '');
  const [targetWords, setTargetWords] = useState(
    initial?.target_words ? String(initial.target_words) : '',
  );
  const [premise, setPremise] = useState(initial?.premise ?? '');
  const [titleError, setTitleError] = useState<string | null>(null);

  const validateTitle = (value: string) => {
    const ok = value.trim().length > 0;
    setTitleError(ok ? null : '书名不能为空 —— 先给作品起个名字，题材与卖点都可以之后补');
    onValidityChange?.(ok);
    return ok;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      validateTitle(title);
      return;
    }
    setTitleError(null);
    const words = Number.parseInt(targetWords, 10);
    onSubmit({
      title: t,
      genre: genre.trim() || null,
      target_words: Number.isFinite(words) && words > 0 ? words : 0,
      premise: premise.trim() || null,
    });
  };

  return (
    <form id={formId} className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.group}>
        <div className={styles.groupTitle}>先给它起个名字</div>
        <p className={styles.groupHint}>只有书名是必填的，其余都可以之后随时补。</p>
        <Input
          label="书名"
          required
          value={title}
          error={titleError ?? undefined}
          placeholder="例如：断剑"
          autoComplete="off"
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleError) setTitleError(null);
          }}
          onBlur={(e) => {
            // 失焦即校验：早于提交给出反馈，而不是一路填完才被拦下
            if (e.target.value.length > 0) validateTitle(e.target.value);
          }}
        />
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>接下来是可选项</div>
        <p className={styles.groupHint}>拿不准就跳过，不影响你马上开始写。</p>
        <div className={styles.row}>
          <FieldWithHint label="题材" hint="点箭头从常见赛道里挑一个，每个都配了一句说明">
            <Combobox
              options={GENRE_OPTIONS}
              value={genre}
              placeholder="点箭头选择，或直接输入"
              onChange={setGenre}
            />
          </FieldWithHint>
          <FieldWithHint label="想写多长" hint="用来算进度，不填也能写">
            <Combobox
              options={TARGET_WORDS_OPTIONS}
              value={targetWords}
              inputMode="numeric"
              placeholder="点箭头选一个，或直接输入字数"
              onChange={setTargetWords}
            />
          </FieldWithHint>
        </div>
        <Textarea
          label="一句话卖点"
          rows={2}
          value={premise}
          placeholder="用一句话说清这本书最抓人的地方"
          onChange={(e) => setPremise(e.target.value)}
          hint="写给未来的自己看：一句话讲清核心冲突"
        />
      </div>
    </form>
  );
}
