import type { SelectHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import { Icon } from './Icon';
import styles from './form.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  options: SelectOption[];
  /** 无选中值时的占位项 */
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, id, className, options, placeholder, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const classes = [styles.control, styles.select, error ? styles.invalid : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={selectId}>
          {label}
          {required ? (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <div className={styles.selectWrap}>
        <select
          ref={ref}
          id={selectId}
          className={classes}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} className={styles.selectIcon} />
      </div>
      {error ? <span className={styles.error}>{error}</span> : null}
      {!error && hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
});
