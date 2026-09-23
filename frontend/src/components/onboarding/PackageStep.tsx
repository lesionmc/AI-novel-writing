import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BookBrief } from '@/types/api';
import { useUpdateBook } from '@/hooks/mutations/books';
import { bookPath } from '@/lib/slug';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Textarea } from '@/components/common/Textarea';
import { RenameBookDialog } from '@/components/library/BookDialogs';
import { toast } from '@/stores/toastStore';
import type { GuideFacts } from './onboardingModel';
import styles from './onboarding.module.css';

export interface PackageStepProps {
  slug: string;
  title: string;
  facts: GuideFacts;
}

/**
 * 第 3 步：起个名字，写一句简介（指南 PHASE 3 包装）。
 *
 * 说明：书名在本项目里是**建书时就要填**的（`slug` 由书名生成，是一书一库的目录名），
 * 所以这里做的不是"第一次起名"，而是**把内部代号正式改成读者看到的名字**，
 * 并补上「一句话简介」——后者才是首页点击率的另一半。
 * 目录不在这里重做：它就是大纲，直接把人送过去。
 */
export function PackageStep({ slug, title, facts }: PackageStepProps) {
  const navigate = useNavigate();
  const update = useUpdateBook(slug);
  const [renaming, setRenaming] = useState(false);
  const [premise, setPremise] = useState(facts.premise ?? '');

  // RenameBookDialog 只读 slug / title 两个字段，其余按契约补齐（不参与渲染）
  const brief: BookBrief = {
    slug,
    title,
    genre: facts.genre,
    total_words: 0,
    chapter_count: facts.chapters,
    updated_at: '',
  };

  return (
    <>
      <div className={styles.actions}>
        <Button variant="secondary" icon="edit" onClick={() => setRenaming(true)}>
          改书名
        </Button>
        <Button
          variant="secondary"
          icon="outline"
          onClick={() => navigate(bookPath(slug, '/outline'))}
        >
          去安排目录
        </Button>
      </div>

      <div className={styles.summary}>
        <span className={styles.summaryLabel}>现在的书名</span>
        <span className={styles.summaryValue}>{title}</span>
      </div>

      {update.isError ? <ErrorBar error={update.error} /> : null}

      <Textarea
        label="一句话简介"
        rows={3}
        value={premise}
        placeholder="一句话讲清：他是谁、卡在哪、最想看的是什么"
        hint="读者在书架上只看到这一句 —— 「重启末世前三个月，我用一间旧仓库换来了全城补给」"
        onChange={(e) => setPremise(e.target.value)}
      />
      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => update.mutate({ premise: premise.trim() || null })}
          loading={update.isPending}
        >
          保存简介
        </Button>
      </div>

      {renaming ? (
        <RenameBookDialog
          book={brief}
          onClose={() => setRenaming(false)}
          onSuccess={(next) => toast.success(`书名已改为《${next}》`)}
        />
      ) : null}
    </>
  );
}
