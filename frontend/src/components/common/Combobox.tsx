import type { InputHTMLAttributes } from 'react';
import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import styles from './form.module.css';

/** 一个预设选项：写入值 + 下拉里的显示文字 + 灰色说明 */
export interface ComboboxOption {
  /** 实际写入的值（选中后回填输入框） */
  value: string;
  /** 下拉里显示的文字（缺省等于 value） */
  label?: string;
  /** 灰色说明：一句话讲清「这是什么」（QA M2：光看赛道名选不出来） */
  hint?: string;
}

/** 允许直接传字符串（等价于 value = label = 该字符串） */
export type ComboboxChoice = string | ComboboxOption;

export interface ComboboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** 预设选项：点选即填入，但仍可自由输入 */
  options: ComboboxChoice[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * 可选可输输入框（Combobox）。
 *
 * 存在意义：新手写小说时最大的卡点不是「不会打字」，而是**不知道该填什么**。
 * 四要素（表面身份 / 秘密欲望 / 致命弱点 / 矛盾行为）给他一个空文本框，
 * 他就只能对着光标发呆。给一份套路选项让他「先选、再改成自己的」，门槛立刻降下来。
 *
 * 行为：点击右侧箭头展开预设；输入时按关键字过滤；选中项回填输入框；
 * 仍允许完全自由输入（预设只是脚手架，不是约束）。
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { label, hint, error, required, options, value, onChange, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const keyword = value.trim();
  // 统一成 {value,label,hint}；字符串选项等价于 value = label
  const items: ComboboxOption[] = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );
  const k = keyword.toLowerCase();
  const filtered = keyword
    ? items.filter((o) => o.value.includes(keyword) || (o.label ?? '').toLowerCase().includes(k))
    : items;

  const controlClasses = [styles.control, error ? styles.invalid : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field} ref={wrapRef}>
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

      <div className={styles.comboWrap}>
        <input
          ref={ref}
          id={inputId}
          className={controlClasses}
          value={value}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) setOpen(true);
            if (e.key === 'Enter' && open) {
              e.preventDefault();
              if (filtered.length > 0) {
                onChange(filtered[0].value);
                setOpen(false);
              }
            }
          }}
          {...rest}
        />
        <button
          type="button"
          className={styles.comboToggle}
          aria-label={open ? '收起选项' : '展开选项'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="chevronDown" size={16} />
        </button>

        {open && filtered.length > 0 ? (
          <ul className={styles.comboList} id={listId} role="listbox">
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={styles.comboOption}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className={styles.comboOptionLabel}>{o.label ?? o.value}</span>
                  {o.hint ? <span className={styles.comboOptionHint}>{o.hint}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? <span className={styles.error}>{error}</span> : null}
      {!error && hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
});
