import { useNavigate, useParams } from 'react-router-dom';
import { useBook, useStats } from '@/hooks/queries';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { SkeletonBlock } from '@/components/common/Skeleton';
import { StatCards } from '@/components/stats/StatCards';
import { DailyChart } from '@/components/stats/DailyChart';
import { ChapterProgressBar } from '@/components/stats/ChapterProgressBar';
import { bookPath } from '@/lib/slug';
import styles from '@/components/stats/stats.module.css';

/**
 * 统计 `/book/:slug/stats`（R17）——只读页，无写操作。
 * 数据源 `GET /api/books/{book}/stats`（后端增量维护，不实时全表扫描）。
 */
export function StatsPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const query = useStats(slug);
  // 目标字数不在 stats 契约里，取自作品详情
  const bookQuery = useBook(slug);
  const targetWords = bookQuery.data?.target_words ?? 0;

  return (
    <main className="pageContent">
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">统计</h1>
          <p className="pageSubtitle">看看这本书写了多少、写了多久。数字只做参考，写得顺就好。</p>
        </div>
      </header>

      {query.isPending ? (
        <div className={styles.cards} aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className={styles.card} key={i}>
              <SkeletonBlock height={12} width="40%" />
              <SkeletonBlock height={28} width="60%" />
              <SkeletonBlock height={12} width="70%" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data &&
        query.data.total_words === 0 &&
        query.data.chapter_count === 0 &&
        query.data.daily.length === 0 ? (
        <EmptyState
          icon="stats"
          title="还没有可统计的内容"
          description="去写作台写下第一章，这里就会出现字数、章节与日更曲线。"
          actionLabel="去写作台写第一章"
          actionIcon="edit"
          onAction={() => navigate(bookPath(slug, '/desk'))}
        />
      ) : query.data ? (
        <>
          <StatCards stats={query.data} targetWords={targetWords} />
          <DailyChart daily={query.data.daily} />
          <ChapterProgressBar stats={query.data} targetWords={targetWords} />
        </>
      ) : null}
    </main>
  );
}
