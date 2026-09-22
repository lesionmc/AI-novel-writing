import styles from './WritebackDialog.module.css';

export interface SummaryEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/** 本章摘要：可编辑 textarea（AI 出稿，人来定稿） */
export function SummaryEditor({ value, onChange }: SummaryEditorProps) {
  return (
    <textarea
      className={styles.summaryArea}
      value={value}
      rows={4}
      aria-label="本章摘要"
      placeholder="用 150–200 字客观陈述本章发生了什么，之后会作为上下文注入。"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
