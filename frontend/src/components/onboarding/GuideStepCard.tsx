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
  /** 展开态：三步全部在场，做完的收起成一行摘要（看得到全局，也不显得逼着做） */
  open: boolean;
  onToggle: () => void;
  /** 收起时显示的一行摘要（如「题材：玄幻 · 卖点已写」） */
  meta: string;
  /** 主体：各步自己的按钮行 + 表单 / 子卡片（纵向堆叠） */
  children?: ReactNode;
  /** 传了才渲染「先跳过，之后再说」—— 每一步都能跳过是硬要求 */
  onSkip?: () => void;
}

/**
 * 开书清单的一步卡片（可收合）。
 * 只做展示与动作承接，**不自己发请求** —— 数据与跳转由各步组件决定。
 */
export function GuideStepCard({
  no,
  title,
  blurb,
  done,
  open,
  onToggle,
  meta,
  children,
  onSkip,
}: GuideStepCardProps) {
  const head = (
    <>
      <span className={[styles.badge, done ? styles.badgeDone : ''].filter(Boolean).join(' ')}>
        {done ? '已完成' : `第 ${no} 步`}
      </span>
      <h2 className={styles.title}>{title}</h2>
      {open ? null : <span className={styles.doneRowMeta}>{meta}</span>}
      <Icon
        name={open ? 'chevronDown' : 'chevronRight'}
        size={16}
        aria-hidden="true"
        className={styles.cardChevron}
      />
    </>
  );

  return (
    <section className={styles.card} aria-label={`第 ${no} 步：${title}`}>
      <button type="button" className={styles.cardHeadBtn} onClick={onToggle} aria-expanded={open}>
        {head}
      </button>

      {open ? (
        <>
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
        </>
      ) : null}
    </section>
  );
}
