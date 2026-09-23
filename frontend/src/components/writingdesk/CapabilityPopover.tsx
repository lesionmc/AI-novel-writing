import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import type { CapabilityDef } from './capabilityModel';
import styles from './StatusBarCapabilityChips.module.css';

export interface CapabilityPopoverProps {
  /** 单条 chip → 1 项；「+N」聚合 → 全部缺失项 */
  defs: CapabilityDef[];
  /** 聚合形态：顶部显示列表标题 */
  grouped?: boolean;
  onClose: () => void;
  onOpenConfig: () => void;
  onRefetch: () => void;
}

type PanelKind = 'detail' | 'help';

/**
 * 能力说明 popover（非模态，状态栏在底部故向上展开，Spec §12.3）。
 * 标题 + 正文 + 次要行（可折叠）+ 动作按钮；vector / fts 固定附「重启生效」提示。
 */
export function CapabilityPopover({
  defs,
  grouped = false,
  onClose,
  onOpenConfig,
  onRefetch,
}: CapabilityPopoverProps) {
  const [panel, setPanel] = useState<{ key: string; kind: PanelKind } | null>(null);
  const [detected, setDetected] = useState(false);

  const isOpen = (key: string, kind: PanelKind) => panel?.key === key && panel.kind === kind;
  const toggle = (key: string, kind: PanelKind) =>
    setPanel((p) => (p?.key === key && p.kind === kind ? null : { key, kind }));

  return (
    <div className={styles.popover} role="dialog" aria-label={grouped ? '系统能力' : defs[0]?.label}>
      {grouped ? <p className={styles.listTitle}>系统能力</p> : null}

      {defs.map((def) => (
        <div key={def.key} className={styles.section}>
          <div className={styles.head}>
            <Icon name={def.icon} size={16} />
            <span className={styles.title}>{def.label}</span>
            {!grouped ? (
              <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            ) : null}
          </div>

          <p className={styles.body}>{def.body}</p>

          <button
            type="button"
            className={styles.toggle}
            aria-expanded={isOpen(def.key, 'detail')}
            onClick={() => toggle(def.key, 'detail')}
          >
            <Icon name={isOpen(def.key, 'detail') ? 'chevronDown' : 'chevronRight'} size={16} />
            技术细节
          </button>
          {isOpen(def.key, 'detail') ? <p className={styles.note}>{def.detail}</p> : null}

          {isOpen(def.key, 'help') ? <p className={styles.help}>{def.help}</p> : null}

          {def.restartHint ? (
            <p className={styles.hint}>若已安装，请重启应用生效</p>
          ) : null}

          <div className={styles.actions}>
            {def.key === 'llm_configured' ? (
              <Button variant="primary" size="sm" onClick={onOpenConfig}>
                去配置模型
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDetected(true);
                    onRefetch();
                  }}
                >
                  重新检测
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={isOpen(def.key, 'help')}
                  onClick={() => toggle(def.key, 'help')}
                >
                  {isOpen(def.key, 'help') ? '收起说明' : '查看说明'}
                </Button>
              </>
            )}
          </div>
        </div>
      ))}

      {detected ? <p className={styles.note}>已重新检测（以程序启动时的结果为准）。</p> : null}
    </div>
  );
}
