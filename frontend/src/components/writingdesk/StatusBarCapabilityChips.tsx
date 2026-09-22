import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SystemCapabilities } from '@/types/api';
import { CapabilityChip } from './CapabilityChip';
import { CapabilityPopover } from './CapabilityPopover';
import { degradedCapabilities } from './capabilityModel';
import styles from './StatusBarCapabilityChips.module.css';

export interface StatusBarCapabilityChipsProps {
  /** 为 undefined（加载中 / 请求失败）→ 一个 chip 都不渲染（失败静默，Spec §12.6） */
  capabilities: SystemCapabilities | undefined;
  onOpenConfig: () => void;
  onRefetch: () => void;
}

const MAX_INLINE = 2;
const OVERFLOW_KEY = '__overflow__';

/**
 * 状态栏系统能力降级常驻 chip（Spec §12）。
 * 只告知、不阻断：不弹窗、不禁用任何写作操作、不遮挡编辑区。
 */
export function StatusBarCapabilityChips({
  capabilities,
  onOpenConfig,
  onRefetch,
}: StatusBarCapabilityChipsProps) {
  const degraded = useMemo(() => degradedCapabilities(capabilities), [capabilities]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const restoreFocus = useCallback((key: string) => {
    window.requestAnimationFrame(() => {
      wrapRef.current?.querySelector<HTMLButtonElement>(`[data-cap-key="${key}"]`)?.focus();
    });
  }, []);

  // Esc / 点击外部关闭，焦点回到触发 chip（Spec §12.3）
  useEffect(() => {
    if (!openKey) return;
    const close = (restore: boolean) => {
      setOpenKey(null);
      if (restore) restoreFocus(openKey);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [openKey, restoreFocus]);

  // 能力恢复 → 整段消失（三项全 true 时保持安静、不占位，Spec §12.1）
  useEffect(() => {
    if (degraded.length === 0) setOpenKey(null);
  }, [degraded.length]);

  if (degraded.length === 0) return null;

  const inline = degraded.slice(0, MAX_INLINE);
  const overflowCount = degraded.length - MAX_INLINE;
  const overflowOpen = openKey === OVERFLOW_KEY;
  const openDef = degraded.find((d) => d.key === openKey) ?? null;
  const summary = degraded.map((d) => d.label).join('；');

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {`系统能力提示：${summary}`}
      </span>

      {inline.map((def) => (
        <CapabilityChip
          key={def.key}
          def={def}
          capKey={def.key}
          open={openKey === def.key}
          ariaLabel={`${def.label}，按下查看详情与操作`}
          onClick={() => setOpenKey(openKey === def.key ? null : def.key)}
        />
      ))}

      {overflowCount > 0 ? (
        <CapabilityChip
          def={degraded[MAX_INLINE]}
          capKey={OVERFLOW_KEY}
          open={overflowOpen}
          label={`+${overflowCount}`}
          ariaLabel={`还有 ${overflowCount} 项系统能力提示，按下查看全部`}
          onClick={() => setOpenKey(overflowOpen ? null : OVERFLOW_KEY)}
        />
      ) : null}

      {overflowOpen ? (
        <CapabilityPopover
          defs={degraded}
          grouped
          onClose={() => {
            setOpenKey(null);
            restoreFocus(OVERFLOW_KEY);
          }}
          onOpenConfig={onOpenConfig}
          onRefetch={onRefetch}
        />
      ) : openDef ? (
        <CapabilityPopover
          defs={[openDef]}
          onClose={() => {
            setOpenKey(null);
            restoreFocus(openDef.key);
          }}
          onOpenConfig={onOpenConfig}
          onRefetch={onRefetch}
        />
      ) : null}
    </div>
  );
}
