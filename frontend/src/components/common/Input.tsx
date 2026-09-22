import type { InputHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import styles from './form.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

/**
 * 输入框。`error` 存在时进入错误态并把错误文案就近显示（04 §6.1 字段级校验）。
 * 密钥输入请使用 KeyInput（type=password，提交后永不回显）。
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const classes = [styles.control, error ? styles.invalid : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={inputId}>
          {label}
          {required ? (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={classes}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? <span className={styles.error}>{error}</span> : null}
      {!error && hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
});
