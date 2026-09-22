import { useId, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import form from '@/components/common/form.module.css';
import styles from './config.module.css';

export interface KeyInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  /** 已保存的密钥引用名（编辑态显示，明文永不回显） */
  existingRef?: string | null;
}

/**
 * 密钥输入：`type="password"`，可临时切换可见。
 * **提交后永不回显明文**，库中只留 key_ref；编辑时留空表示不修改。
 */
export function KeyInput({
  label = 'API Key',
  value,
  onChange,
  placeholder,
  hint,
  existingRef,
}: KeyInputProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className={form.field}>
      <label className={form.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.keyWrap}>
        <input
          id={id}
          className={form.control}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={styles.keyToggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? '隐藏密钥' : '显示密钥'}
          aria-pressed={visible}
          title={visible ? '隐藏密钥' : '显示密钥'}
        >
          <Icon name="eye" size={16} />
        </button>
      </div>
      {hint ? <span className={form.hintText}>{hint}</span> : null}
      {existingRef ? <span className={styles.keyRef}>当前密钥：{existingRef}（留空表示不修改）</span> : null}
    </div>
  );
}
