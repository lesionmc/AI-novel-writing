/**
 * 中文字数统计
 * -----------------------------------------------------------------------------
 * 规则（与后端 `app/utils/text.py::count_words` **同一口径**，2026-09-23 统一）：
 * 每个中日韩汉字记 1，每段连续 ASCII 字母数字记 1；标点与空白一律不计。
 *
 * 为什么弃用 `Intl.Segmenter`（原坑 19 的"±2 字误差"约定一并作废）：
 * 中文分词把「你好世界」切成 2 个词，而按字记是 4 —— 词数与字数差 30% 以上，
 * 曾造成写作台顶栏「本章 44 字」与接口/质检「66 字」同屏两套答案。
 * 作者心中的"字数"就是字数（与 Word/编辑器一致），所以两端都改成按字计。
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

/** 统计纯文本字数：汉字逐字、ASCII 按段，标点与空白不计 */
export function countPlainText(text: string): number {
  if (!text) return 0;
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  return cjk + latin;
}

/** 统计编辑器 HTML 正文字数 */
export function countWords(html: string): number {
  return countPlainText(htmlToPlainText(html));
}
