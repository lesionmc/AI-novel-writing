import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BookBrief, CreateBookRequest, TopicRecommendation } from '@/types/api';
import { useBooks } from '@/hooks/queries';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useCreateBook, useDeleteBook } from '@/hooks/mutations/books';
import { AiUnavailableNotice } from '@/components/common/AiUnavailableNotice';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Modal } from '@/components/common/Modal';
import { SkeletonCard } from '@/components/common/Skeleton';
import { BookCard, NewBookCard } from '@/components/library/BookCard';
import { NewBookForm } from '@/components/library/NewBookForm';
import { DeleteBookDialog, RenameBookDialog } from '@/components/library/BookDialogs';
import { TopicWizard } from '@/components/topics/TopicWizard';
import type { TopicAnswers } from '@/components/topics/topicsModel';
import { toast } from '@/stores/toastStore';
import { bookPath } from '@/lib/slug';
import styles from './LibraryPage.module.css';

const FORM_ID = 'new-book-form';

/** 书库（首页）—— 作品卡片列表 + 新建 / 重命名 / 删除（04 §5.1） */
export function LibraryPage() {
  const navigate = useNavigate();
  const query = useBooks();
  const capabilities = useCapabilities();
  const createBook = useCreateBook();
  const deleteBook = useDeleteBook();

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const [renaming, setRenaming] = useState<BookBrief | null>(null);
  const [deleting, setDeleting] = useState<BookBrief | null>(null);
  /** 选题向导：每次打开换 key → 重挂载，自动清空上次的作答 */
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicKey, setTopicKey] = useState(0);
  /** 从选题向导带进新建表单的预填（题材 + 卖点） */
  const [prefill, setPrefill] = useState<Partial<CreateBookRequest> | null>(null);

  const books = query.data ?? [];
  const totalWords = books.reduce((sum, b) => sum + b.total_words, 0);
  const noModel = capabilities.data?.llm_configured === false;

  const handleCreate = (values: CreateBookRequest) => {
    setCreateError(null);
    createBook.mutate(values, {
      onSuccess: (book) => {
        setCreating(false);
        setPrefill(null);
        // 按实战指南的六阶段顺序（立项 → 骨架 → 包装 → 写稿），建完书先落「开书清单」，
        // 而不是直接丢进空白编辑器 —— 那样等于让用户跳过前三步、从空白页开始"吃书"。
        // 清单里每一步都能跳过，右上角另有「直接开始写」，所以不构成任何门禁。
        toast.success(`《${book.title}》已建好，先花两分钟把架子搭起来`);
        navigate(bookPath(book.slug, '/start'));
      },
      onError: (e) => setCreateError(e),
    });
  };

  const openTopic = () => {
    setTopicKey((k) => k + 1);
    setTopicOpen(true);
    // 模型是「按书」配置的：书库页没有 book 上下文，先取最新一本的设置页；一本都没有就先去建书
    void capabilities.refetch();
  };

  const openCreate = () => {
    setPrefill(null);
    setCreating(true);
  };

  /** 选题向导的降级引导：模型按书配置，先跳到有书的地方再配 */
  const openTopicConfig = () => {
    setTopicOpen(false);
    const target = books[0];
    if (target) {
      navigate(bookPath(target.slug, '/config'));
    } else {
      setCreating(true);
      toast.info('先建一个作品，再到「设置 → 已配置的模型」里加一个模型');
    }
  };

  /** 「就用这个方向建书」→ 关掉向导，打开新建作品并预填题材/卖点/读者定位/目标长度 */
  const useTopic = (rec: TopicRecommendation, answers: TopicAnswers) => {
    setTopicOpen(false);
    setPrefill({
      genre: rec.niche,
      premise: rec.sample_premise ?? undefined,
      readers: answers.readers.trim() || undefined,
      target_words: answers.targetLength ?? undefined,
    });
    setCreating(true);
  };

  return (
    <main className="pageContent">
      {/*
        创作入口（首页即向导）：零基础用户的第一动作不该是"建表"，
        而是和 AI 把「写什么、写给谁」聊明白 —— 主 CTA 进无书对话，
        问卷与手动建书是两条次级路径。还没配模型时本地功能照常（红线 3）。
      */}
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <h1 className={styles.heroTitle}>开始写一本书</h1>
          <p className={styles.heroText}>
            不确定写什么？先和 AI 聊十分钟 —— 像跟编辑对谈，一问一答把方向、读者和卖点定下来，
            聊完一键建书，直接开写。
          </p>
          <div className={styles.heroActions}>
            <Button variant="primary" icon="chat" onClick={() => navigate('/chat')}>
              和 AI 聊出方向
            </Button>
            <Button variant="secondary" icon="plus" onClick={openCreate}>
              直接新建作品
            </Button>
            <button type="button" className={styles.heroLink} onClick={openTopic}>
              用选题问卷找方向
            </button>
          </div>
        </div>
        {books.length > 0 ? (
          <dl className={styles.heroStats}>
            <div className={styles.heroStat}>
              <dt>作品</dt>
              <dd className="tabular">{books.length}</dd>
            </div>
            <div className={styles.heroStat}>
              <dt>累计字数</dt>
              <dd className="tabular">{totalWords.toLocaleString('zh-CN')}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {/*
        还没配模型时，首页给一条**配置引导**（TC-03 / 红线 3）。
        先说「能用」（本地功能不被阻断），再说「去哪配」；有模型时不渲染、不占位。
      */}
      {noModel ? (
        <div className={styles.noticeWrap}>
          <AiUnavailableNotice onOpenConfig={() => navigate('/config')}>
            {'不影响你现在就开始写 —— 新建作品、建设定、写章节、导出书稿都照常能用。想让 AI 帮你选题、陪你建设定、在章末帮你归档，再去加一个模型就好了。'}
          </AiUnavailableNotice>
        </div>
      ) : null}

      {query.isPending ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} height={168} />
          ))}
        </div>
      ) : query.isError ? (
        <div className={styles.stateWrap}>
          <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : books.length > 0 ? (
        <section aria-label="我的作品">
          <h2 className={styles.sectionTitle}>我的作品</h2>
          <div className={styles.grid}>
            {books.map((b) => (
              <BookCard key={b.slug} book={b} onRename={setRenaming} onDelete={setDeleting} />
            ))}
            <NewBookCard onClick={openCreate} />
          </div>
        </section>
      ) : null}

      <Modal
        open={creating}
        onClose={() => {
          setCreating(false);
          setPrefill(null);
        }}
        title="新建作品"
        subtitle={
          prefill?.genre
            ? '已按 AI 推荐的方向预填了题材与卖点，随时可以改。'
            : '先把方向定下来就能建书 —— 名字可以留到「开书清单 · 包装」再打磨，这里留空也行。'
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setPrefill(null);
              }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={FORM_ID}
              loading={createBook.isPending}
            >
              创建
            </Button>
          </>
        }
      >
        {createError ? (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <ErrorBar error={createError} />
          </div>
        ) : null}
        <NewBookForm
          key={prefill ? `prefill-${topicKey}` : 'blank'}
          formId={FORM_ID}
          initial={prefill ?? undefined}
          onSubmit={handleCreate}
        />
      </Modal>

      {topicOpen ? (
        <TopicWizard
          key={topicKey}
          onClose={() => setTopicOpen(false)}
          noModel={noModel}
          onOpenConfig={openTopicConfig}
          onUse={useTopic}
        />
      ) : null}

      {renaming ? (
        <RenameBookDialog
          key={renaming.slug}
          book={renaming}
          onClose={() => setRenaming(null)}
          onSuccess={(title) => toast.success(`已重命名为《${title}》`)}
        />
      ) : null}

      {deleting ? (
        <DeleteBookDialog
          book={deleting}
          loading={deleteBook.isPending}
          error={deleteBook.error}
          onCancel={() => {
            deleteBook.reset();
            setDeleting(null);
          }}
          onConfirm={() => {
            deleteBook.mutate(deleting.slug, {
              onSuccess: () => {
                toast.success(`《${deleting.title}》已移入回收目录`);
                setDeleting(null);
                deleteBook.reset();
              },
            });
          }}
        />
      ) : null}
    </main>
  );
}
