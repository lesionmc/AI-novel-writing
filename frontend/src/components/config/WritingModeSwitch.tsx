import type { WritingMode } from '@/types/api';
import type { IconName } from '@/types/ui';
import { WRITING_MODE_HINTS, WRITING_MODE_LABELS } from '@/lib/labels';
import { useUpdateBook } from '@/hooks/mutations/books';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/stores/toastStore';
import styles from './config.module.css';

const MODES: WritingMode[] = ['manual', 'assist', 'semi'];
const MODE_ICON: Record<WritingMode, IconName> = {
  manual: 'edit',
  assist: 'target',
  semi: 'activity',
};

export interface WritingModeSwitchProps {
  slug: string;
  current: WritingMode;
}

/**
 * 写作模式三档开关（约束 5）。
 * 切换走 `PATCH /api/books/{book}`（writing_mode）；切换后写作台顶栏 AI 按钮随之显隐。
 */
export function WritingModeSwitch({ slug, current }: WritingModeSwitchProps) {
  const update = useUpdateBook(slug);

  const pick = (mode: WritingMode) => {
    if (mode === current || update.isPending) return;
    update.mutate(
      { writing_mode: mode },
      { onSuccess: () => toast.success(`已切换到「${WRITING_MODE_LABELS[mode]}」模式`) },
    );
  };

  return (
    <>
      {/* 如实告知：「辅助」与「半自动」在当前实现里**行为完全相同**
          （全项目只有 `writingMode === 'manual'` 有分支），差别只在顶栏 AI 菜单的
          显示与标色。不写这句，用户按文案选档会发现"没区别"，进而怀疑设置没生效。 */}
      <p className={styles.sectionHint} style={{ marginBottom: 'var(--space-3)' }}>
        现在「辅助」和「半自动」的行为完全相同，只影响顶栏 AI 菜单的显示与标色 ——
        选哪个都不影响一致性审校等防矛盾功能。
      </p>
      <div className={styles.modeGrid} role="radiogroup" aria-label="写作模式">
        {MODES.map((mode) => {
          const active = mode === current;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              className={[styles.modeOption, active ? styles.modeOptionActive : ''].filter(Boolean).join(' ')}
              onClick={() => pick(mode)}
              disabled={update.isPending}
            >
              <span className={styles.modeOptionTitle}>
                <Icon name={MODE_ICON[mode]} size={16} />
                {WRITING_MODE_LABELS[mode]}
                {active ? <Icon name="check" size={16} /> : null}
              </span>
              <span className={styles.modeOptionHint}>{WRITING_MODE_HINTS[mode]}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
