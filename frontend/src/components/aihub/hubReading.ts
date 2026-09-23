/**
 * 对话工作台里的**只读能力结果**（校对 / 一致性审校 / 敏感词自查）。
 *
 * ---------------------------------------------------------------------------
 * 为什么单独一层
 * ---------------------------------------------------------------------------
 * 草稿（人物/世界观/大纲/正文）走 `HubDraft` + 「确认写入」；这三项**没有可写的东西**，
 * 只有一份"体检报告"。所以它们不进草稿通道：**不出草稿卡、没有确认按钮、没有落库路径**。
 *
 * 本层只做两件事：
 *   ① 定义三种结果的形状（`HubReading`）；
 *   ② 一个校验器 `parseHubReading` —— 同时服务"刚收到的响应/流式帧"与"localStorage 读回的存档"，
 *      脏数据（缺字段、超长列表）在这里被剔掉，渲染层不必再防御。
 *
 * 列表一律**截断到 MAX_READING_ITEMS**：这些结果要跟对话一起存进 localStorage，
 * 不设上限会把存储挤爆（一本书的敏感词命中可能有几百条）。
 *
 * 关于枚举字段：`type` / `severity` / `category` 一律收成 `string` 原样保留，
 * 中文翻译交给 `lib/labels` 与 `auditLabels` 的兜底函数（未知取值渲染成「其他问题」，
 * 而不是在这里猜一个近似的枚举值 —— 猜出来的分类会让用户按错的分类去改稿）。
 */

import type { ConsistencySummary } from '@/types/api';
import { asRecord, asText } from './hubModel';

/** 校对问题（字段与服务端契约一致，`type` 保留原值） */
export interface ReadingIssue {
  type: string;
  excerpt: string;
  problem: string;
  suggestion: string;
}

/** 一致性矛盾（`severity` 保留原值） */
export interface ReadingConflict {
  severity: string;
  chapters: number[];
  subject: string;
  conflict: string;
  evidence: string;
}

/** 敏感词命中（`category` 保留原值） */
export interface ReadingHit {
  word: string;
  category: string;
  chapter_seq: number;
  count: number;
}

export type HubReading =
  | { kind: 'proofread'; issues: ReadingIssue[] }
  | { kind: 'consistency'; conflicts: ReadingConflict[]; summary: ConsistencySummary | null }
  | { kind: 'sensitive'; hits: ReadingHit[]; wordlistAvailable: boolean };

/** 单份报告最多保留的条目数（存档体积保护） */
export const MAX_READING_ITEMS = 80;

/** 报告标题（卡片顶部用） */
export function readingTitle(reading: HubReading): string {
  switch (reading.kind) {
    case 'proofread':
      return reading.issues.length
        ? `校对结果 · ${reading.issues.length} 处`
        : '校对结果 · 没发现问题';
    case 'consistency':
      return reading.summary
        ? `一致性审校 · ${reading.summary.total} 条`
        : `一致性审校 · 已发现 ${reading.conflicts.length} 条`;
    case 'sensitive':
      return reading.wordlistAvailable
        ? `敏感词自查 · 命中 ${reading.hits.length} 处`
        : '敏感词自查 · 本次没有检查任何内容';
  }
}

/** 生成一份"空的"报告，供流式累积用（一致性审校边审边出） */
export function emptyReading(kind: 'consistency'): HubReading {
  return { kind, conflicts: [], summary: null };
}

/** 追加一条矛盾（流式帧到达时用）。超过上限就丢弃，避免存档被撑爆。 */
export function appendConflict(reading: HubReading, conflict: ReadingConflict): HubReading {
  if (reading.kind !== 'consistency') return reading;
  if (reading.conflicts.length >= MAX_READING_ITEMS) return reading;
  return { ...reading, conflicts: [...reading.conflicts, conflict] };
}

/** 一致性审校是否"没跑完"（既没有汇总也没有任何矛盾 = 上次中断，没有结果） */
export function isUnfinishedReading(reading: HubReading): boolean {
  return (
    reading.kind === 'consistency' && reading.summary === null && reading.conflicts.length === 0
  );
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** 只遍历前 MAX_READING_ITEMS 条（存档体积保护），并跳过形状不对的条目 */
function rows(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, MAX_READING_ITEMS)
    .map(asRecord)
    .filter((r): r is Record<string, unknown> => r !== null);
}

function parseIssues(v: unknown): ReadingIssue[] {
  const out: ReadingIssue[] = [];
  for (const row of rows(v)) {
    const excerpt = asText(row.excerpt);
    const problem = asText(row.problem);
    if (!excerpt && !problem) continue;
    out.push({
      type: asText(row.type) ?? '',
      excerpt: excerpt ?? '',
      problem: problem ?? '',
      suggestion: asText(row.suggestion) ?? '',
    });
  }
  return out;
}

function parseConflicts(v: unknown): ReadingConflict[] {
  const out: ReadingConflict[] = [];
  for (const row of rows(v)) {
    const conflict = asText(row.conflict);
    if (!conflict) continue;
    out.push({
      severity: asText(row.severity) ?? '',
      chapters: Array.isArray(row.chapters)
        ? row.chapters.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
        : [],
      subject: asText(row.subject) ?? '',
      conflict,
      evidence: asText(row.evidence) ?? '',
    });
  }
  return out;
}

function parseSummary(v: unknown): ConsistencySummary | null {
  const row = asRecord(v);
  if (!row) return null;
  return {
    total: asNumber(row.total),
    reviewed: asNumber(row.reviewed),
    high: asNumber(row.high),
    medium: asNumber(row.medium),
    low: asNumber(row.low),
  };
}

function parseHits(v: unknown): ReadingHit[] {
  const out: ReadingHit[] = [];
  for (const row of rows(v)) {
    const word = asText(row.word);
    if (!word) continue;
    out.push({
      word,
      category: asText(row.category) ?? '',
      chapter_seq: asNumber(row.chapter_seq),
      count: asNumber(row.count, 1),
    });
  }
  return out;
}

/**
 * 校验并归一一份只读报告。入参故意收 `unknown`（同一校验器服务响应与存档）。
 * 形状不对 / 认不出的种类 → null（就当这条消息没有报告，不会渲染出空壳卡片）。
 */
export function parseHubReading(v: unknown): HubReading | null {
  const row = asRecord(v);
  if (!row) return null;
  switch (row.kind) {
    case 'proofread':
      return { kind: 'proofread', issues: parseIssues(row.issues) };
    case 'consistency':
      return {
        kind: 'consistency',
        conflicts: parseConflicts(row.conflicts),
        summary: parseSummary(row.summary),
      };
    case 'sensitive':
      return {
        kind: 'sensitive',
        hits: parseHits(row.hits),
        wordlistAvailable: row.wordlistAvailable === true,
      };
    default:
      return null;
  }
}
