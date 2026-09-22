import { Icon } from '@/components/common/Icon';
import type { CapabilityDef } from './capabilityModel';
import styles from './StatusBarCapabilityChips.module.css';

export interface CapabilityChipProps {
  /** 视觉基准（tone / 图标）；「+N」聚合形态复用首个缺失项 */
  def: CapabilityDef;
  /** 焦点回归定位用（对应 data-cap-key） */
  capKey: string;
  open: boolean;
  /** 覆盖展示文案：聚合形态传「+N」，单条形态省略 */
  label?: string;
  ariaLabel: string;
  onClick: () => void;
}

/** 状态栏能力 chip：图标 + 文字的可点击按钮（颜色非唯一手段，Spec §12.5） */
export function CapabilityChip({
  def,
  capKey,
  open,
  label,
  ariaLabel,
  onClick,
}: CapabilityChipProps) {
  const cls = [
    styles.chip,
    def.tone === 'warn' ? styles.warn : styles.neutral,
    open ? styles.chipOpen : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      data-cap-key={capKey}
      className={cls}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <Icon name={def.icon} size={16} />
      <span>{label ?? def.label}</span>
    </button>
  );
}
