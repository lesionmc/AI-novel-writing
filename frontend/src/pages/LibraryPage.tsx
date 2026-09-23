import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BookBrief, CreateBookRequest, TopicRecommendation } from '@/types/api';
import { useBooks } from '@/hooks/queries';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useCreateBook, useDeleteBook } from '@/hooks/mutations/books';
import { AiUnavailableNotice } from '@/components/common/AiUnavailableNotice';
import { Button } from '@/components/common/Button';
import { EntryBanner } from '@/components/common/EntryBanner';
import { ErrorBar } from '@/components/common/ErrorBar';
import { EmptyState } from '@/components/common/EmptyState';
import { Modal } from '@/components/common/Modal';
import { SkeletonCard } from '@/components/common/Skeleton';
import { BookCard, NewBookCard } from '@/components/library/BookCard';
import { NewBookForm } from '@/components/library/NewBookForm';
import { DeleteBookDialog, RenameBookDialog } from '@/components/library/BookDialogs';
import { TopicWizard } from '@/components/topics/TopicWizard';
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
  /** 新建表单的书名是否已填（空则「创建」置灰 —— QA：点了没反应比灰着更糟） */
  const [titleReady, setTitleReady] = useState(false);

  const books = query.data ?? [];
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
    setTitleReady(false);
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

  /** 「就用这个方向建书」→ 关掉向导，打开新建作品并预填题材与卖点 */
  const useTopic = (rec: TopicRecommendation) => {
    setTopicOpen(false);
    setPrefill({ genre: rec.niche, premise: rec.sample_premise ?? undefined });
    setTitleReady(false);
    setCreating(true);
  };

  return (
    <main className="pageContent">
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">书库</h1>
          <p className="pageSubtitle">
            你写的每一部作品都单独存在本机的一个文件夹里。换电脑时，把整个文件夹复制走，就是一份完整备份。
          </p>
        </div>
        <Button variant="primary" icon="plus" onClick={openCreate}>
          新建作品
        </Button>
      </header>

      {/*
        还没配模型时，首页给一条**配置引导**（TC-03 / 红线 3）。
        与写作台的「功能降级」chip 场景不同：这里是「你还没配，但你现在就能用，想解锁 AI 再去配」。
        先说「能用」（红线 3：本地功能不被阻断），再说「去哪配」；有模型时不渲染、不占位；不弹窗、不 alert。
      */}
      {noModel ? (
        <div className={styles.noticeWrap}>
          <AiUnavailableNotice onOpenConfig={() => navigate('/config')}>
            {'不影响你现在就开始写 —— 新建作品、建设定、写章节、导出书稿都照常能用。想让 AI 帮你选题、陪你建设定、在章末帮你归档，再去加一个模型就好了。'}
          </AiUnavailableNotice>
        </div>
      ) : null}

      <div className={styles.entryWrap}>
        <EntryBanner
          icon="lightbulb"
          title="不知道写什么？让 AI 帮你选题"
          description="回答四个问题，结合题材库的真实热度与竞争度，给你几个「有人看、写得少」的方向。"
          prominent={!query.isPending && books.length === 0}
          onClick={openTopic}
        />
      </div>

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
      ) : books.length === 0 ? (
        <EmptyState
          icon="book"
          title="还没有作品"
          description="先新建一个作品。名字可以先随便取，之后随时能改；题材和目标字数也都能后补。"
          actionLabel="新建第一个作品"
          onAction={openCreate}
        />
      ) : (
        <div className={styles.grid}>
          {books.map((b) => (
            <BookCard key={b.slug} book={b} onRename={setRenaming} onDelete={setDeleting} />
          ))}
          <NewBookCard onClick={openCreate} />
        </div>
      )}

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
            : '先给作品占个位置就行 —— 名字随手起一个，方向和简介之后在「开书清单」里慢慢定。'
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
              disabled={!titleReady}
              title={titleReady ? undefined : '先填书名'}
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
          onValidityChange={setTitleReady}
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
