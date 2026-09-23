import type {
  ConfirmWritebackRequest,
  ConfirmWritebackResponse,
  Importance,
  WritebackSuggestion,
} from '@/types/api';

/**
 * 归档成功后的 toast 文案。
 * [QA M5] 把写入条数直接报出来 —— 原先只有一句「已保存」，配上面板没刷新，
 * 用户会以为根本没存上（右栏刷新见 useConfirmWriteback 的 invalidate）。
 */
export function writebackDoneText(res: ConfirmWritebackResponse): string {
  return (
    `本章已归档：人物 ${res.character_states_written} / ` +
    `新线索 ${res.foreshadows_created} / 回收线索 ${res.foreshadows_closed}`
  );
}

/**
 * 回写弹窗的可编辑模型。
 * 默认全部勾选（accepted=true），每条可编辑、可删除；**不做二次确认**（04 §4.2）。
 */

export interface EditableCharacter {
  key: string;
  name: string;
  state: string;
  reason: string | null;
  accepted: boolean;
  /** 手工新增的条目允许改名字（AI 建议的名字不可改，避免张冠李戴） */
  nameEditable?: boolean;
}

export interface EditablePlot {
  key: string;
  arc: string;
  progress: string;
  accepted: boolean;
  /** 手工新增的条目允许改剧情线名称 */
  arcEditable?: boolean;
}

export interface EditableNewForeshadow {
  key: string;
  title: string;
  importance: Importance;
  accepted: boolean;
}

export interface EditableClosedForeshadow {
  key: string;
  id: number;
  title: string;
  accepted: boolean;
}

export interface WritebackModel {
  summary: string;
  hook: string | null;
  /** 原始 AI 输出（契约 `WritebackSuggestion.raw_ai_output`，confirm 时原样回传） */
  rawAiOutput: string | null;
  characters: EditableCharacter[];
  plotProgress: EditablePlot[];
  newForeshadows: EditableNewForeshadow[];
  closedForeshadows: EditableClosedForeshadow[];
}

let seq = 0;
const nextKey = (prefix: string) => `${prefix}-${++seq}`;

/** 手工录入降级时的空建议骨架（不触发 AI，字段与契约 `WritebackSuggestion` 一致） */
export const EMPTY_WRITEBACK_SUGGESTION: WritebackSuggestion = {
  chapter_summary: '',
  character_updates: [],
  plot_progress: [],
  new_foreshadows: [],
  closed_foreshadow_ids: [],
  hook: null,
  raw_ai_output: null,
};

/**
 * 由后端建议构造初始模型。
 *
 * **勾选状态以接口返回的 `accepted` 为准，不是一律 true。**
 * 后端按重要度给出权威默认值 —— 新增伏笔 `high`/`medium` 默认保留、**`low` 默认不保留**，
 * 目的是防止线索台账被"每条都收"灌爆（M2 实跑 20 章曾累积 60 条未回收伏笔，
 * 写前召回因此被稀释到等于没提示）。低重要度的条目，用户要留就自己勾上。
 *
 * 用 `?? true` 而不是直接用返回值，是为了**向后兼容**：老版本后端不返回该字段时，
 * 行为退回与改动前一致（默认勾选），不会突然变成全不勾。
 *
 * 另有一条前端自订规则：**人物状态行 `state` 为空或纯空白时默认不勾选** ——
 * 这类行通常是 AI 只给了名字、没给状态，默认勾着直接点确认就会写进一条空记录。
 * 有内容的行不受影响。
 *
 * 契约 `WritebackSuggestion.closed_foreshadow_ids` 只有 id（`number[]`，无 accepted 字段），
 * 标题由 `titleOf` 解析（调用方传入当前未回收伏笔的 id→标题映射），解析不到时回落 `伏笔 #id`。
 */
export function fromSuggestions(
  s: WritebackSuggestion,
  titleOf?: (id: number) => string | undefined,
): WritebackModel {
  return {
    summary: s.chapter_summary ?? '',
    hook: s.hook ?? null,
    rawAiOutput: s.raw_ai_output ?? null,
    characters: (s.character_updates ?? []).map((c) => {
      // 归一化成字符串：AI 输出偶尔缺 `state`，直接透传会在下游 `.trim()` 处抛错
      const state = c.state ?? '';
      return {
        key: nextKey('ch'),
        name: c.name,
        state,
        reason: c.reason ?? null,
        // 内容为空的行默认**不勾选**：原来勾着直接点确认，会往设定库写一条空状态。
        // 界面会在该行标注「内容为空，已默认不勾选」。有内容的行不受影响，
        // 仍沿用后端按重要度给出的权威默认值。
        accepted: state.trim() ? (c.accepted ?? true) : false,
      };
    }),
    plotProgress: (s.plot_progress ?? []).map((p) => ({
      key: nextKey('pl'),
      arc: p.arc,
      progress: p.progress,
      accepted: p.accepted ?? true,
    })),
    newForeshadows: (s.new_foreshadows ?? []).map((f) => ({
      key: nextKey('nf'),
      title: f.title,
      importance: f.importance,
      accepted: f.accepted ?? true,
    })),
    closedForeshadows: (s.closed_foreshadow_ids ?? []).map((id) => ({
      key: nextKey('cf'),
      id,
      title: titleOf?.(id) ?? `伏笔 #${id}`,
      accepted: true,
    })),
  };
}

/** 只把**被勾选**的条目送进 confirm —— 未确认条目绝不落库（红线 2 / TC-24） */
export function toPayload(input: WritebackModel): ConfirmWritebackRequest {
  const m = pruneBlank(input);
  return {
    chapter_summary: m.summary,
    character_updates: m.characters
      .filter((c) => c.accepted)
      .map((c) => ({ name: c.name, state: c.state, reason: c.reason, accepted: true })),
    plot_progress: m.plotProgress
      .filter((p) => p.accepted)
      .map((p) => ({ arc: p.arc, progress: p.progress, accepted: true })),
    new_foreshadows: m.newForeshadows
      .filter((f) => f.accepted)
      .map((f) => ({ title: f.title, importance: f.importance, accepted: true })),
    closed_foreshadow_ids: m.closedForeshadows.filter((f) => f.accepted).map((f) => f.id),
    hook: m.hook,
    raw_ai_output: m.rawAiOutput,
  };
}

export interface ModelCounts {
  total: number;
  accepted: number;
  /** 是否还有任何可勾选条目 */
  hasItems: boolean;
}

export function countModel(m: WritebackModel): ModelCounts {
  const all = [...m.characters, ...m.plotProgress, ...m.newForeshadows, ...m.closedForeshadows];
  // 摘要随确认请求无条件写入（见 toPayload），必须计入 —— 否则填了摘要还显示「将写入 0/0 条」
  const summaryItem = m.summary.trim() ? 1 : 0;
  const total = all.length + summaryItem;
  return {
    total,
    accepted: all.filter((x) => x.accepted).length + summaryItem,
    hasItems: total > 0,
  };
}

/** 全选 / 全不选 */
export function setAllAccepted(m: WritebackModel, accepted: boolean): WritebackModel {
  return {
    ...m,
    characters: m.characters.map((c) => ({ ...c, accepted })),
    plotProgress: m.plotProgress.map((p) => ({ ...p, accepted })),
    newForeshadows: m.newForeshadows.map((f) => ({ ...f, accepted })),
    closedForeshadows: m.closedForeshadows.map((f) => ({ ...f, accepted })),
  };
}

/* ---------------------------------------------------------------------------
   手工录入降级路径（红线 3：未配模型时 R3 仍可用）
   用户可自行添加状态变更 / 伏笔 / 剧情线推进，不依赖任何模型
   ------------------------------------------------------------------------- */

export function addCharacter(m: WritebackModel): WritebackModel {
  return {
    ...m,
    characters: [
      ...m.characters,
      { key: nextKey('ch'), name: '', state: '', reason: null, accepted: true, nameEditable: true },
    ],
  };
}

export function addNewForeshadow(m: WritebackModel): WritebackModel {
  return {
    ...m,
    newForeshadows: [
      ...m.newForeshadows,
      { key: nextKey('nf'), title: '', importance: 'medium', accepted: true },
    ],
  };
}

export function addPlotProgress(m: WritebackModel): WritebackModel {
  return {
    ...m,
    plotProgress: [
      ...m.plotProgress,
      { key: nextKey('pl'), arc: '', progress: '', accepted: true, arcEditable: true },
    ],
  };
}

/** 提交前的有效性过滤：把用户没有填完的空白条目剔除，避免写入空记录 */
export function pruneBlank(m: WritebackModel): WritebackModel {
  return {
    ...m,
    characters: m.characters.filter((c) => c.name.trim() && c.state.trim()),
    newForeshadows: m.newForeshadows.filter((f) => f.title.trim()),
    plotProgress: m.plotProgress.filter((p) => p.arc.trim() && p.progress.trim()),
  };
}
