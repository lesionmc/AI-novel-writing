import { makeArchive } from '@/lib/localArchive';

/**
 * 开书向导的进度留存（按作品分键，纯前端本地）。
 *
 * 向导「每一步做没做完」是从已有数据推断的（见 `onboardingModel.ts`），
 * 需要落盘的只有一件：**用户主动跳过过哪几步**（仅影响界面反馈，不构成门禁）。
 * 不存后端：本地单机单用户，数据本来就在本机，跨设备一致在本场景没有价值。
 */

/** 三步对应的稳定 id（写入存档；改名会让旧存档的 skipped 自然失效） */
export type GuideStepId = 'direction' | 'skeleton' | 'package';

export const GUIDE_STEP_IDS: GuideStepId[] = ['direction', 'skeleton', 'package'];

/** 载荷版本：结构变更时 +1，旧存档自动失效 */
const PAYLOAD_VERSION = 1;
const PREFIX = 'ainovel.onboarding.';

export interface OnboardingProgress {
  /** 用户主动跳过过的步骤（只影响展示，不影响任何可用性） */
  skipped: GuideStepId[];
}

/** 空进度 —— 无存档 / 不可用 / 损坏 时的统一回落值 */
export const EMPTY_PROGRESS: OnboardingProgress = { skipped: [] };

const archive = makeArchive<OnboardingProgress>(PREFIX, PAYLOAD_VERSION, (payload) => {
  if (!Array.isArray(payload.skipped)) return null;
  // 只认「在已知步骤 id 列表里」的字符串，其余剔除（不半信半疑地恢复）
  const skipped = payload.skipped.filter(
    (s): s is GuideStepId => typeof s === 'string' && (GUIDE_STEP_IDS as string[]).includes(s),
  );
  return { skipped };
});

/**
 * 读存档。无存档 / 不可用 / 损坏 → 返回空进度（调用方无需区分这几种情况）。
 */
export function loadOnboardingProgress(slug: string): OnboardingProgress {
  return archive.read(slug) ?? EMPTY_PROGRESS;
}

/** 记下「跳过了这一步」；重复跳过幂等 */
export function markStepSkipped(slug: string, step: GuideStepId): void {
  const current = loadOnboardingProgress(slug);
  if (current.skipped.includes(step)) return;
  archive.write(slug, { v: PAYLOAD_VERSION, skipped: [...current.skipped, step] });
}
