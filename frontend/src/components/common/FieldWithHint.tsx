import type { ReactNode } from 'react';
import styles from './form.module.css';

export interface FieldWithHintProps {
  /** 字段名 */
  label: string;
  /** 灰色说明文字（立体人物公式四要素**必须**提供，04 §5.2） */
  hint: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

/**
 * 字段 + 灰色说明文字（方法论落地）。
 * 「秘密欲望 / 致命弱点 / 矛盾行为」等抽象字段必须配 hint，不让用户面对光秃字段。
 */
export function FieldWithHint({
  label,
  hint,
  htmlFor,
  required,
  error,
  children,
}: FieldWithHintProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      <span className={styles.hintText}>{hint}</span>
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
