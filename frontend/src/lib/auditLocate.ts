/**
 * 质检命中定位锚点（纯函数）
 * -----------------------------------------------------------------------------
 * 「去改这一处」= 跳到命中所在章 + 让编辑器高亮该位置。
 * 编辑器的 `findPrefixMatch` 为了让前缀可靠，会跳过长度 <4 的锚点
 * （见 `chunkLocate.PREFIX_STEPS` 与 `n < 4` 守卫）—— 而质检命中的多是
 * 「愤怒」「非常」这类 2 字词，直接用命中词当锚点会定位失败。
 *
 * 因此这里围绕命中词从章节正文的**规范化纯文本**里切一段更长的上下文窗口作为锚点：
 *   · 正文与编辑器索引都走 `normalizeForMatch` 同一套折叠规则（块级边界→单空格），可比
 *   · 命中词多次出现时，取离后端给的 `position`（纯文本偏移）最近的那一处
 *   · 找不到命中词 → 退回命中词本身（调用方表现为「跳到该章但未能精确定位」，优雅降级）
 *
 * 纯函数、无副作用、不改动正文（锚点只用于视图层高亮）。
 */

import { normalizeForMatch, stripHtmlTags } from './chunkLocate';

/** 上下文窗口总长度（字）；命中词居中，两侧各取一半 */
const DEFAULT_WINDOW = 22;

/** 在规范化纯文本里找离 `position` 最近的一次出现（找不到返回 -1） */
function nearestOccurrence(plain: string, phrase: string, position: number): number {
  if (!Number.isFinite(position) || position < 0) {
    return plain.indexOf(phrase);
  }
  const step = Math.max(1, phrase.length);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let from = 0; from < plain.length; ) {
    const idx = plain.indexOf(phrase, from);
    if (idx < 0) break;
    const distance = Math.abs(idx - position);
    if (distance < bestDistance) {
      best = idx;
      bestDistance = distance;
    }
    from = idx + step;
  }
  return best;
}

/**
 * 由章节正文 HTML + 命中项构造一个「足以被定位」的高亮锚点文本。
 * HTML 为空 / 命中词为空 → 返回空串（调用方不发起高亮）。
 */
export function buildLocateAnchor(
  html: string,
  hit: { text: string; position: number },
  window = DEFAULT_WINDOW,
): string {
  const phrase = (hit.text ?? '').trim();
  if (!phrase) return '';

  const plain = normalizeForMatch(stripHtmlTags(html));
  if (!plain) return phrase;

  const idx = nearestOccurrence(plain, phrase, hit.position);
  if (idx < 0) return phrase;

  const half = Math.max(0, Math.floor((window - phrase.length) / 2));
  const start = Math.max(0, idx - half);
  const end = Math.min(plain.length, idx + phrase.length + half);
  const anchor = plain.slice(start, end).trim();
  return anchor || phrase;
}
