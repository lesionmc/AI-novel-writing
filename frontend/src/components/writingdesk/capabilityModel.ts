/**
 * 系统能力降级 chip 的展示模型（Spec §12）。
 * 文案准则：**结论式、非技术**；技术细节收进 popover 的次要行，
 * 绝不把 sqlite-vec / vec0.dll / load_extension 之类原文丢给用户（《04》§6.2）。
 *
 * 展示层口语化（QA M1：术语墙），术语只在 `detail` 这类次要行里保留：
 * 语义召回 → 「像人一样联想」，全文检索 → 「关键词搜索」。
 */

import type { SystemCapabilities } from '@/types/api';
import type { IconName } from '@/types/ui';

export type CapabilityKey = keyof SystemCapabilities;
export type CapabilityTone = 'warn' | 'neutral';

export interface CapabilityDef {
  key: CapabilityKey;
  /** 结论式 chip 文案，亦作 popover 标题 */
  label: string;
  /** 视觉等级：能力缺失=amber，预期状态=中性灰（状态栏 chip 不是错误，禁用红色） */
  tone: CapabilityTone;
  /** 16px 图标语义名（经 Icon 唯一入口） */
  icon: IconName;
  /** popover 正文：结论与影响范围 */
  body: string;
  /** popover 次要行：技术细节 */
  detail: string;
  /** popover 里展开的「查看说明」（安装 / 启用指引，静态帮助） */
  help: string;
  /** 是否固定附一行「若已安装，请重启应用生效」（vector / fts 为 true；llm 为 false） */
  restartHint: boolean;
}

/** 顺序固定：向量 → 全文检索 → 模型（决定内联顺序与「+N」口径） */
export const CAPABILITY_DEFS: CapabilityDef[] = [
  {
    key: 'vector_available',
    label: '「帮你联想」未启用',
    tone: 'warn',
    icon: 'warning',
    body: '本章人物状态与待回收的线索仍会正常显示；只是「相关历史片段」的联想搜索暂时用不了。',
    detail: '本机未加载向量检索扩展，语义召回已自动降级为结构化召回。',
    help: '安装并启用本地向量检索扩展后重启应用，即可恢复「相关历史片段」的语义检索。',
    restartHint: true,
  },
  {
    key: 'fts_available',
    label: '关键词搜索未启用',
    tone: 'warn',
    icon: 'warning',
    body: '全书与设定里的关键词搜索暂时用不了；写作与「帮你记住前文」不受影响。',
    detail: '本机 SQLite 未启用 FTS5 全文索引。',
    help: '使用支持 FTS5 的 SQLite 运行环境后重启应用，即可恢复关键词检索。',
    restartHint: true,
  },
  {
    key: 'llm_configured',
    label: '未配置模型',
    tone: 'neutral',
    icon: 'info',
    body: '配置模型后可用 AI 帮你写、帮你在章末归档本章；不配置也能完整写作。',
    detail: '尚未配置任何可用的 AI 模型服务。',
    help: '在「设置 · 已配置的模型」中添加任一服务商的接入地址与密钥即可启用 AI 能力。',
    restartHint: false,
  },
];

/**
 * 返回需要提示的能力项（值为 `false` 者）。
 * `capabilities` 为 undefined（加载中 / 请求失败）→ 返回空数组，一个 chip 都不渲染。
 */
export function degradedCapabilities(capabilities: SystemCapabilities | undefined): CapabilityDef[] {
  if (!capabilities) return [];
  return CAPABILITY_DEFS.filter((def) => capabilities[def.key] === false);
}
