import { create } from 'zustand';
import {
  type ThemeId,
  type ThemePreference,
  applyTheme,
  getThemeDef,
  persistPreference,
  readStoredPreference,
  resolveTheme,
  systemPrefersDark,
} from '@/lib/theme';

interface ThemeState {
  /** 用户的原始选择（可能是 'system'） */
  preference: ThemePreference;
  /** 实际生效的主题（'system' 已解析成具体 id） */
  resolved: ThemeId;
  setPreference: (pref: ThemePreference) => void;
  /** 写作台快捷切换：在当前浅色 / 夜间之间来回 */
  toggleNight: () => void;
}

/** 浅色侧统一回落到默认主题；深色侧回落到「夜航灯」 */
const LIGHT_FALLBACK: ThemeId = 'light';
const DARK_FALLBACK: ThemeId = 'night';

/** 主题切换过渡时长，需与 global.css 的 `html.themeSwitching` 规则一致 */
const SWITCH_TRANSITION_MS = 260;

let switchTimer: number | null = null;

/**
 * 给 <html> 挂一段临时的「平滑过渡」窗口。
 *
 * 为什么是临时的而不是常驻：常驻意味着每次 hover、每次状态变化都要走一遍
 * 颜色过渡声明，属于纯浪费；而且会让本该瞬时的交互（按下、勾选）变得黏。
 * 只在换主题这一下开窗，换完就关，是性价比最高的做法。
 */
function withThemeTransition(mutate: () => void): void {
  const root = document.documentElement;
  if (switchTimer !== null) window.clearTimeout(switchTimer);
  root.classList.add('themeSwitching');
  mutate();
  switchTimer = window.setTimeout(() => {
    root.classList.remove('themeSwitching');
    switchTimer = null;
  }, SWITCH_TRANSITION_MS);
}

const initialPreference = readStoredPreference();
const initialResolved = resolveTheme(initialPreference);
// 模块加载即应用一次。index.html 里的内联脚本已经在首屏前做过同样的事（防白闪），
// 这里再同步一次是为了保证「DOM 状态 === store 状态」，避免两者在热更新等场景下漂移。
// 注意这里**不开**过渡窗口：首屏不需要动画，开了反而像「加载中变色」。
applyTheme(initialResolved);

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolved: initialResolved,

  setPreference: (pref) => {
    // 同一个选择重复点（例如连点两次「跟随系统」）直接忽略，避免白闪一下过渡窗口
    if (pref === get().preference) return;
    const resolved = resolveTheme(pref);
    persistPreference(pref);
    withThemeTransition(() => applyTheme(resolved));
    set({ preference: pref, resolved });
  },

  toggleNight: () => {
    const { resolved } = get();
    // 已经在深色系里就切回浅色，否则切到夜间。
    // 注意：只在这两组之间跳，不会把用户特意选的「米黄纸」弄丢在循环里 ——
    // 从米黄纸点一下就进夜间，再点一下回到默认浅色，符合直觉。
    const isDarkNow = getThemeDef(resolved).scheme === 'dark';
    get().setPreference(isDarkNow ? LIGHT_FALLBACK : DARK_FALLBACK);
  },
}));

/**
 * 「跟随系统」的实时响应：系统在白天/夜间之间自动切换时，页面要跟着变。
 *
 * 这里**不能**走 setPreference('system') —— 偏好值没变（还是 'system'），
 * 会被上面的「同值早退」挡掉，导致系统切了但界面不动。
 * 所以这里直接重新解析并应用，只更新 resolved。
 */
if (typeof window.matchMedia === 'function') {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    if (useThemeStore.getState().preference !== 'system') return;
    const resolved = resolveTheme('system');
    withThemeTransition(() => applyTheme(resolved));
    useThemeStore.setState({ resolved });
  });
}

/** 给非组件代码用的命令式入口（例如快捷键、启动时兜底） */
export const theme = {
  set: (pref: ThemePreference) => useThemeStore.getState().setPreference(pref),
  toggleNight: () => useThemeStore.getState().toggleNight(),
  current: () => useThemeStore.getState().resolved,
  systemPrefersDark,
};
