import { THEME_LIST } from '@/lib/theme';
import { useThemeStore } from '@/stores/themeStore';
import { Icon } from '@/components/common/Icon';
import styles from './ThemeSwitcher.module.css';

/**
 * ThemeSwitcher —— 外观主题选择器（设置页用）
 * ---------------------------------------------------------------------------
 * 交互设计说明（为什么是「色卡」而不是下拉框）：
 *   主题是**视觉选择**，用文字描述（「深色」「浅色」）用户根本不知道长什么样，
 *   必然要来回试。所以这里直接画四块颜色（底色 / 卡面 / 主色 / 正文色），
 *   一眼就知道结果，选中成本从「试错 3 次」降到「看一眼」。
 *
 * 无障碍：整组是一个 radiogroup，每个色卡是 radio。
 *   键盘可用方向键切换（原生 radio 语义自带），屏幕阅读器会念出
 *   「夜航灯，已选中，夜间写稿主推……」。
 */
export function ThemeSwitcher() {
  const preference = useThemeStore((s) => s.preference);
  const resolved = useThemeStore((s) => s.resolved);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <div className={styles.wrap}>
      <div className={styles.options} role="radiogroup" aria-label="外观主题">
        {THEME_LIST.map((theme) => {
          const selected = preference === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`${styles.option} ${selected ? styles.optionOn : ''}`}
              onClick={() => setPreference(theme.id)}
            >
              {/* 色卡：四块颜色就是该主题的「身份证」 */}
              <span className={styles.swatch} aria-hidden="true">
                <span className={styles.swatchBg} style={{ background: theme.swatch.bg }}>
                  <span
                    className={styles.swatchSurface}
                    style={{ background: theme.swatch.surface }}
                  >
                    <span
                      className={styles.swatchPrimary}
                      style={{ background: theme.swatch.primary }}
                    />
                    <span className={styles.swatchText} style={{ background: theme.swatch.text }} />
                  </span>
                </span>
              </span>

              <span className={styles.labelRow}>
                <Icon name={theme.icon} size={16} />
                <span className={styles.label}>{theme.label}</span>
                {selected ? (
                  <span className={styles.check}>
                    <Icon name="check" size={16} label="已选中" />
                  </span>
                ) : null}
              </span>

              <span className={styles.hint}>{theme.hint}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={`${styles.systemBtn} ${preference === 'system' ? styles.systemBtnOn : ''}`}
          aria-pressed={preference === 'system'}
          onClick={() => setPreference('system')}
        >
          <Icon name="monitor" size={16} />
          跟随系统
        </button>
        <p className={styles.footerHint}>
          {preference === 'system'
            ? `系统当前是深色，已自动用「夜航灯」。系统切换时会跟着变。`
            : `当前生效：${THEME_LIST.find((t) => t.id === resolved)?.label ?? '保险蓝'}。选择会被记住，下次打开还是它。`}
        </p>
      </div>
    </div>
  );
}
