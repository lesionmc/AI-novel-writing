/**
 * slug 编解码的唯一收敛点。
 *
 * 为什么需要它：同一个 slug 会在三种形态间流转 ——
 *   ① 原始值（来自 API 的 `book.slug`，如「重生之我是王多鱼」）
 *   ② 路由参数（`useParams()` / `location.pathname` 已解码）
 *   ③ URL 片段（必须 percent-encode）
 * 只要在某一环对**已经编码过**的值再编一次，就会变成双重编码
 * （`%E6%B5%8B` → `%25E6%25B5`），服务端按字面量找作品 → 一律 404。
 * 中文 slug 必中，纯 ASCII slug 看不出来（编不编一个样），所以这类 bug 极隐蔽。
 *
 * 约定：**任何拼 URL / 拼请求路径的地方，都先 `normalizeSlug()` 再 `slugSegment()`**，
 * 不要直接 `encodeURIComponent(someSlug)`。
 */

/**
 * 把任意形态的 slug 归一化回「原始值」。
 *
 * 最多解码两次（应对历史遗留的已编码值），并对非法转义容错 ——
 * 书名含 `%`（如「100%达成」）时 `decodeURIComponent` 会抛 URIError，
 * 此时原样返回，绝不因为一个转义问题就丢掉整个 slug。
 */
export function normalizeSlug(raw: string | undefined | null): string {
  let s = (raw ?? '').trim();
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    } catch {
      break;   // 非法百分号转义：保留当前值
    }
  }
  return s;
}

/** 原始 slug → 可安全放进 URL 路径的片段（**幂等**：重复调用结果相同） */
export function slugSegment(raw: string | undefined | null): string {
  return encodeURIComponent(normalizeSlug(raw));
}

/** 拼作品内页面路由：`/book/<slug><sub>?<search>` */
export function bookPath(raw: string | undefined | null, sub = '', search = ''): string {
  const base = `/book/${slugSegment(raw)}`;
  return `${base}${sub}${search ? `?${search}` : ''}`;
}
