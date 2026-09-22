import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/common/Button';
import styles from './Editor.module.css';

export interface FindBarProps {
  /** 本章纯文本，用于统计命中数 */
  text: string;
  onClose: () => void;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 本章内查找（Ctrl+F）。
 * 命中数由本章纯文本统计；「上一个 / 下一个」调用浏览器内建查找定位并高亮。
 */
export function FindBar({ text, onClose }: FindBarProps) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const count = useMemo(() => {
    if (!q) return 0;
    try {
      return text.match(new RegExp(escapeRegExp(q), 'gi'))?.length ?? 0;
    } catch {
      return 0;
    }
  }, [q, text]);

  const jump = (backwards: boolean) => {
    if (!q) return;
    const w = window as unknown as {
      find?: (s: string, caseSensitive?: boolean, backwards?: boolean, wrapAround?: boolean) => boolean;
    };
    w.find?.(q, false, backwards, true);
  };

  return (
    <div className={styles.findBar} role="search">
      <input
        ref={inputRef}
        className={styles.findInput}
        value={q}
        placeholder="在本章正文中查找"
        aria-label="本章内查找"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') jump(e.shiftKey);
          if (e.key === 'Escape') onClose();
        }}
      />
      <span className={styles.findCount}>{q ? `${count} 处` : '输入关键词'}</span>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="chevronUp"
        aria-label="上一个匹配"
        disabled={!q}
        onClick={() => jump(true)}
      />
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="chevronDown"
        aria-label="下一个匹配"
        disabled={!q}
        onClick={() => jump(false)}
      />
      <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="关闭查找" onClick={onClose} />
    </div>
  );
}
