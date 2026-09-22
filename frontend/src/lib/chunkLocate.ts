/**
 * 召回片段定位（TC-33）
 * -----------------------------------------------------------------------------
 * 契约里 `RecallChunk` 只有 `{ chunk_id, chapter_seq, text, score }`，**没有锚点 offset**，
 * 因此定位只能靠「文本匹配」。片段是 800 字带 100 字重叠的分块，且可能被剥离过 HTML，
 * 所以直接整段 `indexOf` 常常失配 —— 这里用**渐进前缀匹配** + 统一的文本规范化：
 *   1) 正文与片段走同一套 `normalizeForMatch`（去标签 / NBSP→空格 / 折叠空白 / trim）
 *   2) 依次尝试前缀长度 80 → 60 → 40 → 24 → 12，取第一个命中
 * 本文件为纯函数（无 React / 无副作用），便于单测与复用。
 */

/** 渐进前缀匹配的候选前缀长度（字） */
export const PREFIX_STEPS = [80, 60, 40, 24, 12] as const;

/** 命中区间（规范化文本中的半开区间 [start, end)） */
export interface MatchRange {
  start: number;
  end: number;
}

/** 去掉 HTML 标签（片段理论上已是纯文本，这里做防御性兜底） */
export function stripHtmlTags(input: string): string {
  if (!input) return '';
  return input.includes('<') ? input.replace(/<[^>]*>/g, ' ') : input;
}

/**
 * 规范化：去标签 → NBSP 归一为普通空格 → 折叠所有空白（含换行）为单空格 → trim。
 * 正文与片段必须走同一套，才能保证两边可比。
 */
export function normalizeForMatch(input: string): string {
  if (!input) return '';
  return stripHtmlTags(input).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 渐进前缀匹配：在 `docText` 中查找 `chunkText` 的可定位锚点。
 * `docText` 需已规范化（见 `buildDocTextIndex`，其产物天然是规范化文本）。
 * 命中返回规范化坐标下的区间；全部失配返回 null（由调用方优雅降级）。
 */
export function findPrefixMatch(
  docText: string,
  chunkText: string,
  steps: readonly number[] = PREFIX_STEPS,
): MatchRange | null {
  if (!docText) return null;
  const needle = normalizeForMatch(chunkText);
  if (!needle) return null;

  const tried = new Set<number>();
  for (const step of steps) {
    const n = Math.min(step, needle.length);
    if (n < 4 || tried.has(n)) continue;
    tried.add(n);
    const idx = docText.indexOf(needle.slice(0, n));
    if (idx >= 0) return { start: idx, end: idx + n };
  }
  return null;
}
