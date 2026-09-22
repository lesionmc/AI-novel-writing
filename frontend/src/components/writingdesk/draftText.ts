/**
 * AI 草稿文本 → 编辑器安全 HTML（续写 / 扩写共用）。
 *
 * 从 `Editor.tsx` 拆出来，一是让编辑器主文件守住「单文件 ≤300 行」门禁，
 * 二是这块逻辑自带安全约束、值得单独成文并被单独复验。
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 把 AI 草稿的**纯文本**转成段落 HTML。
 *
 * 安全要点：草稿来自模型，**绝不能当 HTML 直接塞进编辑器** ——
 * 模型完全可能输出 `<script>`、半截标签或 `&` 这类实体字符，
 * 直接 `insertContent` 会污染文档结构，甚至造成 XSS 风险。
 * 所以先逐行转义，再自己包 `<p>`。
 *
 * 连续空行会被折叠（模型经常在段间多打空行）。
 * 返回空串表示草稿里没有任何可插入的内容，调用方应当**放弃插入**而不是插入空段落。
 */
export function draftTextToParagraphHtml(text: string): string {
  return (text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}
