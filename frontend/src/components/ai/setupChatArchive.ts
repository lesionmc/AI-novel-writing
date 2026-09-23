import type { SetupChatMessage } from '@/types/api';
import { makeArchive } from '@/lib/localArchive';
import type { DraftState } from './aiModel';

/**
 * 「跟 AI 聊聊建设定」的会话留存（按作品分键，纯前端本地）。
 *
 * 对话状态原本只活在组件的 `useState` 里，而父级每次打开都会强制重挂载——
 * 关掉弹窗 / 切页 / 刷新全都会清空。这里落一层 localStorage 用于「手滑救回」。
 *
 * 取舍：只做前端本地留存（不新增表、不加后端端点）。
 * 代价：换电脑 / 清浏览器缓存会丢；真需要跨设备同步时再升级成后端会话表。
 */

/** 载荷版本：结构变更时 +1，旧存档自动失效 */
const PAYLOAD_VERSION = 1;
const PREFIX = 'ainovel.setup-chat.';

/** 最多保留的消息条数 —— 防止长聊把 localStorage 撑爆（5MB 量级，单条几百字） */
const MAX_KEPT_MESSAGES = 80;

/** 单次会话最多保留的草稿行数 —— 草稿是模型产出，条数有限，这里只是兜底 */
const MAX_KEPT_DRAFT_ROWS = 60;

export interface SetupChatArchive {
  messages: SetupChatMessage[];
  draft: DraftState | null;
}

function isMessage(v: unknown): v is SetupChatMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Partial<SetupChatMessage>;
  return (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
}

/** 校验草稿结构：只认形状对的；任何一处不对就整块丢弃（不半信半疑地恢复） */
function parseDraft(v: unknown): DraftState | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Partial<DraftState>;
  if (typeof d.premise !== 'string') return null;
  if (!Array.isArray(d.characters) || !Array.isArray(d.worldEntries)) return null;
  const okRow = (r: unknown): boolean =>
    !!r &&
    typeof r === 'object' &&
    typeof (r as { key?: unknown }).key === 'string' &&
    typeof (r as { checked?: unknown }).checked === 'boolean' &&
    !!(r as { value?: unknown }).value &&
    typeof (r as { value?: unknown }).value === 'object';
  if (!d.characters.every(okRow) || !d.worldEntries.every(okRow)) return null;
  return {
    premise: d.premise,
    characters: d.characters.slice(0, MAX_KEPT_DRAFT_ROWS),
    worldEntries: d.worldEntries.slice(0, MAX_KEPT_DRAFT_ROWS),
  };
}

const archive = makeArchive<SetupChatArchive>(PREFIX, PAYLOAD_VERSION, (payload) => {
  const messages = Array.isArray(payload.messages)
    ? payload.messages.filter(isMessage).slice(-MAX_KEPT_MESSAGES)
    : [];
  // 返回 null 与「返回只有开场白的一条」是两件事，调用方需要能区分，所以不自己补开场白
  if (messages.length === 0) return null;
  return { messages, draft: parseDraft(payload.draft) };
});

/** 读存档。无存档 / 不可用 / 存档损坏 → 返回 null（调用方回落到开场白）。 */
export function loadSetupChat(slug: string): SetupChatArchive | null {
  return archive.read(slug);
}

/** 写存档。任何异常都吞掉 —— 存不上只是丢了「手滑救回」能力，不该影响正常使用。 */
export function saveSetupChat(slug: string, data: SetupChatArchive): void {
  archive.write(slug, {
    v: PAYLOAD_VERSION,
    messages: data.messages.slice(-MAX_KEPT_MESSAGES),
    draft: data.draft,
  });
}

/**
 * 清存档。**在「确认并写入设定库」成功之后调用** ——
 * 那批内容已经落库，再把旧对话恢复出来只会让人以为还没写。
 */
export function clearSetupChat(slug: string): void {
  archive.remove(slug);
}
