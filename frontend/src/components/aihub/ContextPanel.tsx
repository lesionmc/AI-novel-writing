import type { AiChatContextUsed } from '@/types/api';
import styles from './hub.module.css';

/**
 * 右栏：「这次 AI 读了什么」。
 *
 * 为什么值得单独占一栏：用户最在意的是「**有记忆**」这件事，但它看不见 ——
 * 于是"AI 到底记不记得我的设定"只能靠感觉。把注入量如实摆出来，
 * 「有记忆」就从一句承诺变成了可核对的事实。
 *
 * 数据来自后端 `context_used`，由组装记忆包的**同一批查询**得出（见 writing_context.usage()），
 * 因此不会出现"显示 3 个人物、实际喂了 5 个"。
 */
export function ContextPanel({ used }: { used: AiChatContextUsed | null }) {
  return (
    <aside className={styles.side} aria-label="这次 AI 读了什么">
      <p className={styles.sideTitle}>这次 AI 读了什么</p>

      {used ? (
        <div className={styles.usage}>
          <div className={styles.usageRow}>
            <span>出场人物</span>
            <span className={styles.usageNum}>{used.characters} 个</span>
          </div>
          <div className={styles.usageRow}>
            <span>没回收的伏笔</span>
            <span className={styles.usageNum}>{used.foreshadows} 条</span>
          </div>
          <div className={styles.usageRow}>
            <span>本章大纲</span>
            <span className={styles.usageNum}>{used.outlines} 条</span>
          </div>
          <div className={styles.usageRow}>
            <span>上一章讲了什么</span>
            <span className={styles.usageNum}>{used.has_prev_summary ? '有' : '没有'}</span>
          </div>
          <div className={styles.usageRow}>
            <span>一共读了</span>
            <span className={styles.usageNum}>约 {used.injected_chars} 字</span>
          </div>
        </div>
      ) : (
        <p className={styles.sideHint}>
          还没开始对话。发一句话，这里会告诉你 AI 读了这本书的哪些内容。
        </p>
      )}

      <p className={styles.sideHint}>
        内容来自你自己写的作品：设定库、人物现状、伏笔、大纲、上一章摘要和最近正文。
        数字都是 0 的时候，说明这部分资料还没写 —— AI 不会替你编。
      </p>
    </aside>
  );
}
