import type { ReactNode } from 'react';
import { Icon } from '@/components/common/Icon';
import styles from './WritingDesk.module.css';

export interface WritingDeskProps {
  topBar: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  statusBar: ReactNode;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onExpandLeft: () => void;
  onExpandRight: () => void;
}

/**
 * 写作台三栏骨架（04 §2.1）。
 * 左栏 220 ｜ 中栏自适应（最小 480）｜ 右栏 340 ｜ 顶栏 52 ｜ 状态栏 28。
 * 折叠后仅留竖条（40px）：<1200px 折右栏；<900px 折左栏；专注模式两侧全折。
 * 最小可用宽度 900px，本产品不做手机端。
 */
export function WritingDesk({
  topBar,
  left,
  center,
  right,
  statusBar,
  leftCollapsed,
  rightCollapsed,
  onExpandLeft,
  onExpandRight,
}: WritingDeskProps) {
  return (
    <div className={styles.shell}>
      {topBar}
      <div className={styles.body}>
        <div className={[styles.left, leftCollapsed ? styles.leftCollapsed : ''].join(' ')}>
          {leftCollapsed ? (
            <div className={styles.rail}>
              <button
                type="button"
                className={styles.railButton}
                onClick={onExpandLeft}
                aria-label="展开章节树"
                title="展开章节树"
              >
                <Icon name="collapseRight" size={16} />
              </button>
              <span className={styles.railLabel}>章节</span>
            </div>
          ) : (
            left
          )}
        </div>

        <main className={styles.center}>{center}</main>

        <div className={[styles.right, rightCollapsed ? styles.rightCollapsed : ''].join(' ')}>
          {rightCollapsed ? (
            <div className={[styles.rail, styles.railRight].join(' ')}>
              <button
                type="button"
                className={styles.railButton}
                onClick={onExpandRight}
                aria-label="展开本章提醒面板"
                title="展开本章提醒面板"
              >
                <Icon name="collapseLeft" size={16} />
              </button>
              <span className={styles.railLabel}>本章提醒</span>
            </div>
          ) : (
            right
          )}
        </div>
      </div>
      {statusBar}
    </div>
  );
}
