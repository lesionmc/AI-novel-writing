import { useWordlistStatus } from '@/hooks/queries';
import { Badge } from '@/components/common/Badge';
import { ErrorBar } from '@/components/common/ErrorBar';
import { SkeletonBlock } from '@/components/common/Skeleton';
import styles from './sensitive.module.css';

/**
 * 敏感词词库状态（设置页，`11-敏感词库说明.md` §5.3）。
 * 只读展示「未配置 / 已配置 N 条」+ 词表该放哪。词库是可选功能，未配置不是错误态。
 */
export function WordlistStatusCard() {
  const query = useWordlistStatus();

  if (query.isPending) {
    return <SkeletonBlock height={20} width="42%" />;
  }
  if (query.isError) {
    return <ErrorBar error={query.error} onRetry={() => void query.refetch()} />;
  }

  const status = query.data;
  if (!status) return null;

  return (
    <div>
      <div className={styles.wordlistRow}>
        {status.configured ? (
          <Badge variant="success" icon="check">
            已配置 {status.count} 条
          </Badge>
        ) : (
          <Badge variant="neutral" icon="info">
            未配置
          </Badge>
        )}
        <span className={styles.wordlistPath}>{status.path}</span>
      </div>
      <p className={styles.wordlistHint}>
        {status.configured
          ? '词库已就位，可以在质检页做敏感词自查。词库只在本机匹配，不上传、不联网。'
          : '这是可选功能：需要你自己准备一份词表放到上面这个文件里，再回质检页扫描。格式说明见质检页。'}
      </p>
    </div>
  );
}
