/**
 * 中文字数统计
 * -----------------------------------------------------------------------------
 * 依据 Spec §11 坑 19 / 04 §2.3：前端用 `Intl.Segmenter` 实时计算（中文字符 + 英文单词），
 * 后端保存时重算落 `chapter.word_count`，允许 ±2 字误差（TC-11）。
 * 缺 `Intl.Segmenter` 时回退到正则计数（CJK 逐字 + 拉丁词），保证不崩。
 */

/** 把 TipTap HTML 转纯文本（不执行脚本，仅取文本内容） */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  if (!html.includes('<')) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ');
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const LATIN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

interface SegmentLike {
  isWordLike?: boolean;
}
interface SegmenterLike {
  segment(input: string): Iterable<SegmentLike>;
}
type SegmenterCtor = new (locale: string, options: { granularity: 'word' }) => SegmenterLike;

let segmenter: SegmenterLike | null = null;
let segmenterResolved = false;

function getSegmenter(): SegmenterLike | null {
  if (segmenterResolved) return segmenter;
  segmenterResolved = true;
  const ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (typeof ctor === 'function') {
    try {
      segmenter = new ctor('zh-CN', { granularity: 'word' });
    } catch {
      segmenter = null;
    }
  }
  return segmenter;
}

function fallbackCount(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  return cjk + latin;
}

/** 统计纯文本字数 */
export function countPlainText(text: string): number {
  if (!text) return 0;
  const seg = getSegmenter();
  if (!seg) return fallbackCount(text);
  let count = 0;
  for (const s of seg.segment(text)) {
    if (s.isWordLike) count += 1;
  }
  // 兜底：某些实现对纯 CJK 串不切词，此时退回正则
  if (count === 0 && text.trim().length > 0) return fallbackCount(text);
  return count;
}

/** 统计编辑器 HTML 正文字数 */
export function countWords(html: string): number {
  return countPlainText(htmlToPlainText(html));
}
