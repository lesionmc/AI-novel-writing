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
  /**
   * 预填值（选题向导「就用这个方向建书」会带 题材/卖点/读者/目标长度 进来）。
   * 仅作初始值 —— 组件由外层用 `key` 重挂载来切换预填内容。
   */
  initial?: Partial<CreateBookRequest>;
}

/**
 * 新建作品表单（04 §5.1），字段顺序对齐六阶段实战路线图：
 * **第一步只定方向（立项）** —— 题材 / 写给谁 / 卖点 / 体量；
 * **起名挪到最后且可跳过** —— 路线图里书名属于 PHASE 3「包装」，
 * 是打磨出来的，不该在用户还没想清写什么之前强迫拍板。
 * 留空建书会得到一个「无名作品 N」的临时名，随时能在「开书清单 · 包装」改。
 */
export function NewBookForm({ formId, onSubmit, initial }: NewBookFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [genre, setGenre] = useState(initial?.genre ?? '');
  const [targetWords, setTargetWords] = useState(
    initial?.target_words ? String(initial.target_words) : '',
  );
  const [premise, setPremise] = useState(initial?.premise ?? '');
  const [readers, setReaders] = useState(initial?.readers ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const words = Number.parseInt(targetWords, 10);
    onSubmit({
      title: title.trim() || null,
      genre: genre.trim() || null,
      target_words: Number.isFinite(words) && words > 0 ? words : 0,
      premise: premise.trim() || null,
      readers: readers.trim() || null,
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
        <Input
          label="写给谁看"
          value={readers}
          placeholder="例如：番茄男频，爱看扮猪吃虎的下班读者"
          onChange={(e) => setReaders(e.target.value)}
          hint="平台和读者群决定节奏与写法。拿不准就留空，之后在「开书清单」里补"
        />
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
        <div className={styles.groupTitle}>第二步：起名字（可以先不起）</div>
        <p className={styles.groupHint}>
          名字是「包装」阶段要打磨的东西，不是动笔的前提。这里留空也行 ——
          会先记作「无名作品」，等你想清楚了到「开书清单 · 包装」一步正式命名。
        </p>
        <Input
          label="书名"
          value={title}
          placeholder="想好了再填，例如：断剑"
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
    </form>
  );
}
