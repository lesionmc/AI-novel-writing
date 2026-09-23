import { Link, useNavigate } from 'react-router-dom';
import type { BookBrief } from '@/types/api';
import { formatNumber, formatRelative } from '@/lib/format';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { Menu } from '@/components/common/Menu';
import styles from './BookCard.module.css';
import { bookPath } from '@/lib/slug';

export interface BookCardProps {
  /** 列表用契约 `BookBrief`（6 字段，无 target_words/premise/writing_mode） */
  book: BookBrief;
  onRename: (book: BookBrief) => void;
  onDelete: (book: BookBrief) => void;
}

/**
 * 题材标签在卡片里只占一行 —— 截断显示，完整值放 `title`。
 * [QA L1] 选题向导预填的「细分方向」可以很长（如「规则怪谈·修仙世家急诊副本」），
 * 不截断会撑破卡片、跟右侧「新建 / 连载中」叠在一起。
 */
const GENRE_MAX = 12;

function shortGenre(genre: string): string {
  return genre.length > GENRE_MAX ? `${genre.slice(0, GENRE_MAX)}…` : genre;
}

/** 书库作品卡：书名 / 题材 / 字数 / 章节 / 更新时间 / 继续写（04 §5.1） */
export function BookCard({ book, onRename, onDelete }: BookCardProps) {
  // 这里存**原始** slug；编码统一交给 bookPath()（避免双重编码，见 lib/slug.ts）
  const slug = book.slug;
  const navigate = useNavigate();

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <Link className={styles.title} to={bookPath(slug, '/desk')} title={book.title}>
            {book.title}
          </Link>
          <div className={styles.meta}>
            {book.genre ? (
              <span className={styles.genreWrap} title={book.genre}>
                <Badge variant="neutral" className={styles.genreBadge}>
                  {shortGenre(book.genre)}
                </Badge>
              </span>
            ) : null}
            <span className={styles.stateTag}>{book.chapter_count > 0 ? '连载中' : '新建'}</span>
          </div>
        </div>
        <Menu
          triggerIconOnly
          triggerIcon="more"
          triggerAriaLabel={`${book.title} 的更多操作`}
          items={[
            { key: 'rename', label: '重命名', icon: 'edit', onSelect: () => onRename(book) },
            {
              key: 'delete',
              label: '删除作品',
              icon: 'trash',
              danger: true,
              separatorBefore: true,
              onSelect: () => onDelete(book),
            },
          ]}
        />
      </div>

      <div className={styles.stats}>
        <span className={styles.words}>{formatNumber(book.total_words)}</span>
        <span className={styles.wordsUnit}>字</span>
        <span className={styles.chapters}>{book.chapter_count} 章</span>
      </div>

      <div className={styles.footer}>
        <span className={styles.updated}>更新于 {formatRelative(book.updated_at)}</span>
        <span className={styles.spacer} />
        <Button
          variant="primary"
          size="sm"
          icon="edit"
          onClick={() => navigate(bookPath(slug, '/desk'))}
        >
          {book.chapter_count > 0 ? '继续写' : '开始写'}
        </Button>
      </div>
      <span className="srOnly">
        共 {book.chapter_count} 章，{formatNumber(book.total_words)} 字
      </span>
    </article>
  );
}

/** 卡片网格末位的「新建作品」占位卡 */
export function NewBookCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.createCard} onClick={onClick}>
      <Icon name="plus" size={24} />
      新建作品
    </button>
  );
}
