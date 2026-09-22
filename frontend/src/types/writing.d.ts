/**
 * 正文辅助 AI（剧情走向 / 校对 / 续写 / 扩写）+ 一致性审校 的类型契约（前端）
 * -----------------------------------------------------------------------------
 * **唯一依据：`06-API定义-openapi.yaml`**（`PlotDirection` / `PlotDirectionsResponse` /
 * `ProofreadIssue` / `ProofreadResponse` / `DraftTextResponse` / `Conflict`）。
 *
 * ## 定位提示（改这里前先读）
 * 这四个能力**全部无落库副作用**：
 *   · 剧情走向 / 校对 —— 只给方向与问题清单，**不产出正文**；
 *   · 续写 / 扩写 —— 产出草稿，但**后端不写库**，草稿由本前端放进编辑器、作者删改后再生效。
 * 所以这四个响应的类型里**没有任何"已保存"语义**。
 */

/** 契约 `ConflictSeverity` */
export type ConflictSeverity = 'high' | 'medium' | 'low';

/** 契约 `ProofreadIssue.type` 的枚举 */
export type ProofreadIssueType =
  | 'typo'
  | 'punctuation'
  | 'grammar'
  | 'name'
  | 'setting'
  | 'repeat';

/* ---------------------------- 剧情走向 ---------------------------- */

/** 契约 `PlotDirection` */
export interface PlotDirection {
  title: string;
  summary: string;
  /** 这条走向兑现了什么（回收哪条伏笔 / 什么爽点） */
  payoff: string;
  /** 代价或风险 */
  risk: string;
}

export interface PlotDirectionsRequest {
  /** 要几条方向（2–5，缺省 3） */
  count?: number;
}

export interface PlotDirectionsResponse {
  directions: PlotDirection[];
}

/* ------------------------------ 校对 ------------------------------ */

/** 契约 `ProofreadIssue` */
export interface ProofreadIssue {
  type: ProofreadIssueType;
  /** **原文里逐字摘出的片段**（据此在原正文中定位，不要改写它） */
  excerpt: string;
  problem: string;
  /** 修改建议（说明性，不是替换文本） */
  suggestion: string;
}

export interface ProofreadRequest {
  /** 只校对选中片段时传它；缺省 = 校对整章 */
  text?: string;
}

export interface ProofreadResponse {
  /** 空数组是**合法结果**（通篇没有可报的问题） */
  issues: ProofreadIssue[];
}

/* --------------------------- 续写 / 扩写 --------------------------- */

export interface ContinueRequest {
  hint?: string;
  /** 目标长度（200–3000，缺省 800） */
  target_chars?: number;
}

export interface ExpandRequest {
  /** 要扩写的选中文本（必填） */
  text: string;
  hint?: string;
  /** 目标长度（100–2000，缺省 400） */
  target_chars?: number;
}

/** 契约 `DraftTextResponse`（续写 / 扩写共用；**没有落库语义**） */
export interface DraftTextResponse {
  text: string;
}

/* -------------------------- 一致性审校（SSE） -------------------------- */

/** 契约 `Conflict` */
export interface ConsistencyConflict {
  severity: ConflictSeverity;
  /** 涉及的章节号 */
  chapters: number[];
  /** 涉及的角色 / 道具 / 设定 */
  subject: string;
  conflict: string;
  /** 双方原话依据 */
  evidence: string;
}

/** SSE `done` 事件的数据体 */
export interface ConsistencySummary {
  total: number;
  /** 本次实际审校了多少章 */
  reviewed: number;
  high: number;
  medium: number;
  low: number;
}

/** SSE `progress` 事件的数据体 */
export interface ConsistencyProgress {
  percent: number;
  note: string;
}
