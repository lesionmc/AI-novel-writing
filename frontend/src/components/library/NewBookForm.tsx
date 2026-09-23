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
 * 新建作品表单（04 §5.1）。
 *
 * 字段顺序按实战指南的六阶段摆：**先「定方向」（立项的题材 / 卖点），最后才「起名字」**
 * —— 指南里「书名」属于 PHASE 3 包装，排在骨架之后；原先把书名挡在第 1 步，
 * 等于强迫用户在还没想清写什么之前先定一个名字。
 *
 * **只有书名必填**（技术上无法去掉：`slug` 由书名生成，是一书一库的目录名），
 * 所以这里把它降格为「先占个位置」：随手起一个即可，正式书名与简介留到
 * 「开书清单」的包装步再定，之后随时能改。
 *
 * 新手友好（QA 走查「差点放弃」的那一瞬间）：书名**边打边校验**，
 * 外层「创建」按钮也跟着**即时**亮起 —— 原先只在 `onBlur` 时同步有效性，
 * 用户打完书名按钮还是灰的，会以为"还有必填项没填"而反复尝试；
 * 失焦仍保留一次完整校验，用来给出错误说明。
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
    setTitleError(ok ? null : '书名不能为空 —— 随手起一个就行，书库里靠它认出这部作品');
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
        <div className={styles.groupTitle}>第一步：先定个方向</div>
        <p className={styles.groupHint}>拿不准就全部跳过，之后在「开书清单」里补也来得及。</p>
        <div className={styles.row}>
          <FieldWithHint label="题材" hint="点箭头从常见赛道里挑一个，每个都配了一句说明">
            <Combobox
              options={GENRE_OPTIONS}
              value={genre}
              placeholder="点箭头选择，或直接输入"
              aria-label="题材"
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
          hint="写给未来的自己看：一句话讲清核心冲突。也可以之后让 AI 帮你出"
        />
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>第二步：给它起个名字</div>
        <p className={styles.groupHint}>
          只有这一项是必填的 —— 先随手起一个占个位置也行，正式书名之后在「开书清单」里还能改。
        </p>
        <Input
          label="书名"
          required
          value={title}
          error={titleError ?? undefined}
          placeholder="例如：断剑"
          autoComplete="off"
          onChange={(e) => {
            const value = e.target.value;
            setTitle(value);
            if (titleError) setTitleError(null);
            // 边打边同步有效性：外层「创建」按钮据此显隐置灰，等失焦才亮会让人以为没填完。
            // 判据是 trim 后非空 —— 只敲空格仍然置灰。setTitleReady 是 state setter，
            // 值没变时 React 会跳过重渲染，所以逐键调用不会带来额外开销。
            onValidityChange?.(value.trim().length > 0);
          }}
          onBlur={(e) => {
            // 失焦再校验一次：这时才提示错误说明（打字过程中不打断）
            if (e.target.value.length > 0) validateTitle(e.target.value);
          }}
        />
      </div>
    </form>
  );
}
