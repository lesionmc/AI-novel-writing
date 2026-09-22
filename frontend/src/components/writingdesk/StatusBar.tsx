import type { SystemCapabilities } from '@/types/api';
import type { AutosaveStatus } from '@/hooks/useAutosave';
import { formatNumber, formatTime } from '@/lib/format';
import { Button } from '@/components/common/Button';
import { StatusBarCapabilityChips } from './StatusBarCapabilityChips';
import styles from './StatusBar.module.css';

export interface StatusBarProps {
  saveStatus: AutosaveStatus;
  savedAt: string | null;
  recallChars: number;
  recallTokens: number;
  online: boolean;
  focusMode: boolean;
  onToggleFocus: () => void;
  /** 系统能力自检（Spec §12）；undefined（加载中/失败）→ 不渲染 chip */
  capabilities?: SystemCapabilities;
  onOpenConfig: () => void;
  onRefetchCapabilities: () => void;
}

const DOT_CLASS: Record<AutosaveStatus, string> = {
  idle: '',
  pending: styles.dotPending,
  saving: styles.dotSaving,
  saved: styles.dotSaved,
  error: styles.dotError,
};

function saveText(status: AutosaveStatus, savedAt: string | null): string {
  switch (status) {
    case 'idle':
      return '尚未改动';
    case 'pending':
      return '待保存…';
    case 'saving':
      return '保存中…';
    case 'saved':
      return savedAt ? `已自动保存 ${formatTime(savedAt)}` : '已自动保存';
    case 'error':
      return '保存失败，正在等待重试';
    default:
      return '—';
  }
}

/** 写作台状态栏（28px）：保存状态 + 召回注入开销 + 系统能力 chip + 专注模式开关 */
export function StatusBar({
  saveStatus,
  savedAt,
  recallChars,
  recallTokens,
  online,
  focusMode,
  onToggleFocus,
  capabilities,
  onOpenConfig,
  onRefetchCapabilities,
}: StatusBarProps) {
  return (
    <footer className={styles.bar}>
      <span className={styles.item}>
        {saveStatus !== 'idle' ? (
          <span
            className={[styles.dot, DOT_CLASS[saveStatus]].filter(Boolean).join(' ')}
            aria-hidden="true"
          />
        ) : null}
        <span className={saveStatus === 'error' ? styles.failed : undefined}>
          {saveText(saveStatus, savedAt)}
        </span>
      </span>

      {/* 展示层口语化，术语保留在 tooltip（QA M1/L7：「召回注入 / 约 0 token」小白看不懂） */}
      <span
        className={styles.item}
        title={`写作台会先把前文里跟这一章有关的片段读给你看（召回注入约 ${formatNumber(recallTokens)} token）。这里显示的是它读了多少字。`}
      >
        已帮你记住前文 <span className={styles.num}>{formatNumber(recallChars)}</span> 字
      </span>

      {!online ? <span className={styles.failed}>离线：本地功能可用</span> : null}

      <span className={styles.spacer} />

      <StatusBarCapabilityChips
        capabilities={capabilities}
        onOpenConfig={onOpenConfig}
        onRefetch={onRefetchCapabilities}
      />

      <Button
        variant="ghost"
        size="sm"
        icon="focus"
        onClick={onToggleFocus}
        title="专注模式（Ctrl+Shift+F）"
      >
        {focusMode ? '退出专注模式' : '专注模式'}
      </Button>
    </footer>
  );
}
