import type { TextareaHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import styles from './form.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, id, className, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const classes = [styles.control, styles.textarea, error ? styles.invalid : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={areaId}>
          {label}
          {required ? (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        className={classes}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? <span className={styles.error}>{error}</span> : null}
      {!error && hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
});
