import type { SetupChatMessage } from '@/types/api';
import type { DraftState } from './aiModel';

/**
 * 「跟 AI 聊聊」的会话留存（按作品分键，纯前端本地）。
 *
 * ---------------------------------------------------------------------------
 * 为什么要这个
 * ---------------------------------------------------------------------------
 * 对话状态原本只活在组件的 `useState` 里，而父级每次打开都会 `chatKey+1`
 * **强制重挂载** —— 于是这些情况全都会清空：
 *   · 手滑点到遮罩（弹窗关掉）
 *   · 从设置页切到写作台再切回来
 *   · 刷新页面 / 关掉标签页
 * 老大的原话：「每次 ai 对话都是新的页面，不小心点出窗口，重新回去就没了，
 * 很容易做到一半，没有保存，不小心点错了，记录和数据就没了。」
 *
 * ---------------------------------------------------------------------------
 * 取舍
 * ---------------------------------------------------------------------------
 * 只做**前端本地留存**：不新增数据表、不改库结构、不加后端端点
 * （交接文档对 C3 的建议就是「前端持久化 + 上下文注入，不新增表、收益最大」）。
 * 代价：换电脑 / 清浏览器缓存会丢。对「手滑救回」这个主诉足够了；
 * 真需要跨设备同步时再升级成后端会话表。
 *
 * 用 `localStorage` 而不是 `sessionStorage`：关掉标签页再回来也应能续上。
 *
 * ---------------------------------------------------------------------------
 * 稳健性约定
 * ---------------------------------------------------------------------------
 * · 载荷带版本号 `v`；版本不符 → 视为无存档（宁可从开场白重来，也不要渲染崩溃）。
 * · 读取时逐条校验形状，脏数据一律剔除；剩余为空则返回 null。
 * · 所有 `localStorage` 访问都包 try/catch：隐私模式、配额满、被禁用时
 *   **静默降级为「不持久化」**，绝不因为存档问题让弹窗打不开。
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

function storageKey(slug: string): string {
  return `${PREFIX}${slug}`;
}

/** 拿到可用的 localStorage；不可用（SSR / 隐私模式 / 被策略禁用）返回 null */
function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__ainovel_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
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

/**
 * 读存档。无存档 / 存档不可用 / 存档损坏 → 返回 null（调用方回落到开场白）。
 * 注意：返回 null 与「返回只有开场白的一条」是两件事，调用方需要能区分，
 * 所以这里不自己补开场白。
 */
export function loadSetupChat(slug: string): SetupChatArchive | null {
  const store = safeStorage();
  if (!store) return null;

  let raw: string | null = null;
  try {
    raw = store.getItem(storageKey(slug));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const payload = parsed as { v?: unknown; messages?: unknown; draft?: unknown };
    if (payload.v !== PAYLOAD_VERSION) return null;

    const messages = Array.isArray(payload.messages)
      ? payload.messages.filter(isMessage).slice(-MAX_KEPT_MESSAGES)
      : [];
    if (messages.length === 0) return null;

    return { messages, draft: parseDraft(payload.draft) };
  } catch {
    return null;
  }
}

/** 写存档。任何异常都吞掉 —— 存不上只是丢了「手滑救回」能力，不该影响正常使用。 */
export function saveSetupChat(slug: string, archive: SetupChatArchive): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(
      storageKey(slug),
      JSON.stringify({
        v: PAYLOAD_VERSION,
        messages: archive.messages.slice(-MAX_KEPT_MESSAGES),
        draft: archive.draft,
      }),
    );
  } catch {
    /* 配额满 / 被禁用：忽略 */
  }
}

/**
 * 清存档。**在「确认并写入设定库」成功之后调用** ——
 * 那批内容已经落库，再把旧对话恢复出来只会让人以为还没写。
 */
export function clearSetupChat(slug: string): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.removeItem(storageKey(slug));
  } catch {
    /* ignore */
  }
}
