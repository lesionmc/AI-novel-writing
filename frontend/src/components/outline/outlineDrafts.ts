import type { OutlineDraft } from './OutlineDetail';
import { makeArchive } from '@/lib/localArchive';

/**
 * 大纲「未保存草稿」的本地留存（按作品分键，纯前端）。
 *
 * 大纲是作者临时的结构思考，"想到就敲两行"，手滑刷新就白写——所以落一层
 * localStorage。⚠️ **绝不在这里发写请求**：大纲 PATCH 端点存在归属定址的
 * 历史 P0，任何"自动保存"都可能把内容写进别的作品，落盘只发生在本机。
 *
 * 已知局限：多标签页同书编辑时后写覆盖先写；换电脑/清缓存会丢。
 * 后果仅限草稿本身，库里数据不受影响（从不自动保存）。
 */

/** 载荷版本：结构变更时 +1，旧存档自动失效 */
const PAYLOAD_VERSION = 1;
const PREFIX = 'ainovel.outline-drafts.';

/** 单次最多保留的节点数 —— 只作兜底，正常情况下脏草稿只有一两条 */
const MAX_KEPT_NODES = 300;

/** 存档结构：节点 id → 该节点未保存的草稿 */
export type OutlineDraftMap = Record<number, OutlineDraft>;

/** 校验单条草稿形状：只认 title / content 都是字符串的 */
function isDraft(v: unknown): v is OutlineDraft {
  if (!v || typeof v !== 'object') return false;
  const d = v as Partial<OutlineDraft>;
  return typeof d.title === 'string' && typeof d.content === 'string';
}

const archive = makeArchive<OutlineDraftMap>(PREFIX, PAYLOAD_VERSION, (payload) => {
  if (!payload.drafts || typeof payload.drafts !== 'object') return {};
  const out: OutlineDraftMap = {};
  let kept = 0;
  for (const [key, value] of Object.entries(payload.drafts as Record<string, unknown>)) {
    if (kept >= MAX_KEPT_NODES) break;
    const id = Number(key);
    // 逐条校验：id 必须是正整数、草稿形状必须正确，脏数据一律剔除
    if (!Number.isInteger(id) || id <= 0 || !isDraft(value)) continue;
    out[id] = { title: value.title, content: value.content };
    kept += 1;
  }
  return out;
});

/**
 * 读存档。无存档 / 不可用 / 损坏 / 版本不符 → 返回**空表**（丢弃，不抛错）。
 * 调用方要的就是"没有草稿"这一件事，不需要区分"没存过"与"存坏了"。
 */
export function loadOutlineDrafts(slug: string): OutlineDraftMap {
  return archive.read(slug) ?? {};
}

/**
 * 写存档。空表 → **删掉整个键**（保存成功后该节点不再脏，存档自然收敛干净）。
 */
export function saveOutlineDrafts(slug: string, drafts: OutlineDraftMap): void {
  const entries = Object.entries(drafts).slice(0, MAX_KEPT_NODES);
  if (entries.length === 0) {
    archive.write(slug, null);
    return;
  }
  archive.write(slug, { v: PAYLOAD_VERSION, drafts: Object.fromEntries(entries) });
}
