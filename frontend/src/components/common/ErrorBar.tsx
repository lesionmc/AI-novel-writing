import { isApiError, userMessageOf } from '@/api/client';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './feedback.module.css';

export interface ErrorBarProps {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * 就地错误条 + 重试（04 §6.1：不弹 alert、不到顶部）。
 * 文案来自 `error.code → 中文` 映射，**绝不把技术错误原文丢给用户**。
 */
export function ErrorBar({ error, onRetry, retryLabel = '重试', className }: ErrorBarProps) {
  const message = userMessageOf(error);
  // 原始 code 仅用于排查，不放给用户
  const code = isApiError(error) ? error.code : undefined;

  return (
    <div className={[styles.errorBar, className ?? ''].filter(Boolean).join(' ')} role="alert">
      <Icon name="error" size={16} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {message}
        {code ? <span className="srOnly">（错误代码 {code}）</span> : null}
      </span>
      {onRetry ? (
        <Button
          size="sm"
          variant="ghost"
          icon="retry"
          onClick={onRetry}
          className={styles.errorBarRetry}
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
