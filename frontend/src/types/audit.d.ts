/**
 * 质检（audit）类型契约 —— 前端镜像
 * -----------------------------------------------------------------------------
 * 依据：
 *   · `04-界面设计说明.md` §5.4（质检页三区块）
 *   · `11-敏感词库说明.md` §3.2（分类标识）/ §4.3（结果结构）/ §5（词库缺失行为）
 *
 * [事实] audit 端点后端尚在并行实现中；`06-API定义-openapi.yaml` 里
 *        `auditConsistencyStream`(M2) / `auditAiFlavor`(M2) / `auditSensitive`(M3)
 *        目前标 `x-m1-scope: deferred`，且契约里**没有** `wordlist-status` 端点。
 *        本文件按 team-lead 锁定的并行契约编写，后端就绪后以此为准对账。
 *
 * 设计取舍：枚举类字段（类别 / 命中类型）在契约上是自由字符串，
 * 后端未来可能新增取值。故类型给出已知取值的**联合类型**，但展示层一律经
 * `auditLabels.ts` 的 `*Label()` 函数取中文，未知取值有兜底文案，绝不把英文枚举
 * 直接摆给用户、也不因未知取值崩溃。
 */

/** 去 AI 味的命中类别（英文枚举，界面必须翻成人话） */
export type AiFlavorHitType = 'cliche' | 'emotion_label' | 'adjective_density';

export interface AiFlavorHit {
  /** 命中类别 */
  type: AiFlavorHitType;
  /** 命中原文片段 */
  text: string;
  /** 在章节正文中的字符偏移（用于在 HTML 里就近定位） */
  position: number;
  /** 改写建议文案 */
  suggestion: string;
}

/** `POST /api/chapters/{id}/audit/ai-flavor` 响应 */
export interface AiFlavorResult {
  /** AI 味评分 0-100，越高越重 */
  score: number;
  hits: AiFlavorHit[];
}

/** 敏感词分类标识（`11-敏感词库说明.md` §3.2） */
export type SensitiveCategory =
  | 'politics'
  | 'violence'
  | 'porn'
  | 'illegal'
  | 'superstition'
  | 'other';

export interface SensitiveHit {
  word: string;
  category: SensitiveCategory;
  /** 所在章节序号 */
  chapter_seq: number;
  /** 出现次数 */
  count: number;
}

/** `POST /api/books/{book}/audit/sensitive` 响应（整本书） */
export interface SensitiveAuditResult {
  total_hits: number;
  hits: SensitiveHit[];
}

/**
 * `GET /api/audit/wordlist-status` 响应（设置页展示词库状态，§5.3）。
 * `path` 为词库文件的相对路径，用于告诉用户「该把词表放到哪」。
 */
export interface WordlistStatus {
  configured: boolean;
  count: number;
  path: string;
}
