import type { ChapterBrief } from '@/types/api';
import styles from './hub.module.css';

export interface ChatHeadProps {
  chapterId: number | null;
  onChapterChange: (id: number | null) => void;
  chapters: ChapterBrief[];
}

/**
 * 对话区顶栏：标题 + 「在哪一章说话」。
 *
 * 为什么要选章节：AI 的"记忆"里，本章大纲 / 人物现状 / 上一章摘要 / 最近正文
 * 都是**按章**取的。不选章节就等于只带设定库和大纲全貌 —— 对"接着往下写"这类活不够。
 * 默认落在最新一章（用户说"接着写"时最自然的落点）。
 */
export function ChatHead({ chapterId, onChapterChange, chapters }: ChatHeadProps) {
  return (
    <div className={styles.chatHead}>
      <span className={styles.chatHeadTitle}>AI 助手</span>
      <span className={styles.chatHeadSpacer} />
      <label className={styles.chapterPick}>
        在哪一章说话
        <select
          className={styles.select}
          value={chapterId ?? ''}
          aria-label="在哪一章说话"
          onChange={(e) => onChapterChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">先不指定</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              第 {c.seq} 章 {c.title ?? ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
