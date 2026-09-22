/**
 * AI 对话式建设定 —— 纯数据/映射层（无 React）。
 * 把「AI 草稿」翻译成「设定库写入载荷」，并维护确认页的可编辑行。
 *
 * 红线：草稿**只在本地 state 流转**，直到用户点「确认并写入」才调 create 端点。
 */

import type {
  CharacterWriteRequest,
  SetupDraft,
  SetupDraftCharacter,
  SetupDraftWorldEntry,
  WorldEntryWriteRequest,
} from '@/types/api';

/** AI 的开场白（前端本地预置，不发请求） */
export const SETUP_CHAT_OPENING =
  '先聊聊你要写的故事吧。想写什么、主角是谁、世界什么样——想到哪说到哪，剩下的我来补。';

/** 快捷回复：把「对着输入框发呆」变成「点一下」（新手友好）。**每一轮都显示** ——
 *  QA L5：原先只有第一轮有胶囊，之后每轮都要自己打字，懒人体验差。 */
export const QUICK_REPLIES = ['你帮我定就行', '主角是个侦探', '想写都市背景', '先定世界观框架'];

/**
 * 「可以了，帮我整理」—— 明确的收敛按钮（QA L6）。
 * AI 容易反复追问、不主动出草稿，新手不耐烦就走了；与其等它自己判断，
 * 不如给一个明说的出口。这句话会被当成一条普通用户消息发出去，由 AI 出草稿。
 */
export const FINISH_PHRASE = '信息够了，你帮我整理成草稿吧';

/** 确认页的一条人物草稿（带勾选与稳定 key） */
export interface DraftCharacterRow {
  key: string;
  checked: boolean;
  value: SetupDraftCharacter;
}

/** 确认页的一条世界词条草稿 */
export interface DraftWorldRow {
  key: string;
  checked: boolean;
  value: SetupDraftWorldEntry;
}

export interface DraftState {
  premise: string;
  characters: DraftCharacterRow[];
  worldEntries: DraftWorldRow[];
}

/** 把后端草稿转成确认页可编辑状态（**默认全勾**） */
export function toDraftState(draft: SetupDraft): DraftState {
  return {
    premise: draft.premise ?? '',
    characters: (draft.characters ?? []).map((c, i) => ({
      key: `c-${i}`,
      checked: true,
      value: { ...c },
    })),
    worldEntries: (draft.world_entries ?? []).map((w, i) => ({
      key: `w-${i}`,
      checked: true,
      value: { ...w },
    })),
  };
}

/** 草稿人物 → 契约 `CharacterInput` 写入载荷（缺项留空，role/status 兜底） */
export function toCharacterWrite(c: SetupDraftCharacter): CharacterWriteRequest {
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    name: c.name.trim(),
    role: c.role ?? 'supporting',
    status: c.status ?? 'alive',
    alias: clean(c.alias),
    surface_identity: clean(c.surface_identity),
    secret_desire: clean(c.secret_desire),
    fatal_weakness: clean(c.fatal_weakness),
    contradiction: clean(c.contradiction),
    appearance: clean(c.appearance),
    background: clean(c.background),
    tags: (c.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}

/** 草稿世界词条 → 契约 `WorldEntryInput` 写入载荷（category 兜底 other） */
export function toWorldWrite(w: SetupDraftWorldEntry): WorldEntryWriteRequest {
  return {
    category: w.category ?? 'other',
    name: w.name.trim(),
    content: w.content && w.content.trim() ? w.content.trim() : null,
    tags: (w.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}
