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
 * 第 3 步：打磨书名，写一句书架简介（指南 PHASE 3 包装）。
 *
 * 简介写进 `summary`（书架上给读者看的那句），与第 1 步的 `premise`（给自己的卖点）分家 ——
 * 否则 AI 选题一次填满 premise，第 1、3 步会同时"完成"。
 * 说明：书名在本项目里是**建书时就要填**的（`slug` 由书名生成），
 * 这里做的是**把内部代号正式改成读者看到的名字**。目录就在设定库「大纲」Tab。
 */
export function PackageStep({ slug, title, facts }: PackageStepProps) {
  const navigate = useNavigate();
  const update = useUpdateBook(slug);
  const [renaming, setRenaming] = useState(false);
  const [summary, setSummary] = useState(facts.summary ?? '');

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
          onClick={() => navigate(bookPath(slug, '/settings', 'tab=outline'))}
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
        label="书架简介（给读者看的一句）"
        rows={3}
        value={summary}
        placeholder="一句话讲清：他是谁、卡在哪、最想看的是什么"
        hint="读者在书架上只看到这一句 —— 「重启末世前三个月，我用一间旧仓库换来了全城补给」"
        onChange={(e) => setSummary(e.target.value)}
      />
      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => update.mutate({ summary: summary.trim() || null })}
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
