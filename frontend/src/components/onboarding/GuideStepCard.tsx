import type { ReactNode } from 'react';
import { Icon } from '@/components/common/Icon';
import styles from './onboarding.module.css';

export interface GuideStepCardProps {
  /** 步骤序号（1 起） */
  no: number;
  title: string;
  blurb: string;
  /** 已完成的步骤改用「已完成」徽标 */
  done: boolean;
  /** 主体：各步自己的按钮行 + 表单 / 子卡片（纵向堆叠） */
  children?: ReactNode;
  /** 传了才渲染「先跳过，之后再说」—— 每一步都能跳过是硬要求 */
  onSkip?: () => void;
}

/**
 * 「当前该做的一步」大卡片。
 * 只做展示与动作承接，**不自己发请求** —— 数据与跳转由各步组件决定。
 */
export function GuideStepCard({ no, title, blurb, done, children, onSkip }: GuideStepCardProps) {
  return (
    <section className={styles.card} aria-label={`第 ${no} 步：${title}`}>
      <div className={styles.cardHead}>
        <span className={[styles.badge, done ? styles.badgeDone : ''].filter(Boolean).join(' ')}>
          {done ? '已完成' : `第 ${no} 步`}
        </span>
        <h2 className={styles.title}>{title}</h2>
      </div>
      <p className={styles.blurb}>{blurb}</p>

      {children ? <div className={styles.stepBody}>{children}</div> : null}

      {onSkip ? (
        <div className={styles.skipRow}>
          <button type="button" className={styles.doneRow} onClick={onSkip}>
            <span className={styles.doneRowMain}>
              <span className={styles.doneRowMeta}>
                现在不想弄也没关系 —— 先跳过，之后回来再补
              </span>
            </span>
            <Icon name="chevronRight" size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

export interface GuideDoneRowProps {
  no: number;
  title: string;
  /** 一行摘要，例如「人物 3 · 世界观 2」或「已跳过」 */
  meta: string;
  /** 点回去继续补 */
  onOpen: () => void;
}

/** 已完成 / 已跳过步骤的紧凑行 —— 点一下回到那一步继续补 */
export function GuideDoneRow({ no, title, meta, onOpen }: GuideDoneRowProps) {
  return (
    <button type="button" className={styles.doneRow} onClick={onOpen}>
      <Icon name="check" size={16} aria-hidden="true" />
      <span className={styles.doneRowMain}>
        <span className={styles.doneRowTitle}>
          第 {no} 步 · {title}
        </span>
        <span className={styles.doneRowMeta}>{meta}</span>
      </span>
      <span className={styles.doneRowTag}>继续补</span>
    </button>
  );
}
