/**
 * theme.ts —— 主题注册表与应用逻辑（纯数据 + 副作用最小化）
 * ---------------------------------------------------------------------------
 * 【这个文件在整套外观系统里的位置】
 *
 *   design-tokens.css        ← 唯一的颜色真相源。默认主题写在 :root，
 *                              其余主题写在 :root[data-theme="xxx"]（只覆盖语义色层）
 *   theme.ts（本文件）        ← 列出「有哪些主题可选」+ 把选择写进 <html data-theme>，
 *                              并持久化到 localStorage
 *   stores/themeStore.ts     ← 把上面的能力包成 React 状态，供组件订阅
 *   components/common/ThemeSwitcher.tsx ← 用户看到的色卡选择器
 *
 *   一句话：CSS 负责「长什么样」，本文件负责「选哪个、记住它」。
 *
 * 【为什么不把主题色写在 JS 里？】
 *   因为颜色是设计契约（328 个 CSS 变量的四层体系）。JS 只存一个主题 id（字符串），
 *   颜色全部留在 CSS，这样：改配色不用改代码；组件零改动即可换肤；也不会有
 *   「JS 里的色值和 CSS 对不上」这类漂移。
 *
 * 【新增一个主题要改几处？】
 *   1) design-tokens.css 加一个 `:root[data-theme="新id"] { …覆盖语义色层… }`
 *   2) 本文件 THEME_LIST 里加一条
 *   3) index.html 里的防闪烁内联脚本不用改（它读的是数据，不是主题清单）
 *   没有第 4 处 —— 组件一律不用动。这就是「token 化」的收益。
 */

import type { IconName } from '@/types/ui';

/** 可选主题 id。注意：'light' 是默认主题，对应「不写 data-theme」 */
export type ThemeId = 'light' | 'night' | 'black' | 'sepia' | 'pine';

/** 用户偏好：除了具体主题，还允许「跟随系统」 */
export type ThemePreference = ThemeId | 'system';

export interface ThemeDef {
  id: ThemeId;
  /** 用户可见名称 */
  label: string;
  /** 一句话说明「它适合什么场景」——比「深色/浅色」这种技术描述有用得多 */
  hint: string;
  /** 语义图标名（必须已存在于 components/common/Icon.tsx 的 ICONS 映射里） */
  icon: IconName;
  /** 该主题属于浅色还是深色，用于写入 <meta name="color-scheme"> 让原生控件跟随 */
  scheme: 'light' | 'dark';
  /**
   * 色卡预览（选择器里画的那四块颜色）。
   * 注意：这里写的是**给人看的预览色**，不是颜色真相源；
   * 真相源永远是 design-tokens.css。若两者不一致，以 CSS 为准并回来改这里。
   */
  swatch: { bg: string; surface: string; primary: string; text: string };
}

/**
 * 主题清单。顺序 = 选择器里的展示顺序。
 *
 * 设计取舍：五个主题全部**保持相同的语义色相**（主色=蓝、强调=青绿、警示=红、
 * 警告=琥珀、成功=绿），只调整明度与底色。原因是——
 *   「红色 = 危险 / 未回收，绿色 = 已回收，橙色 = 埋很久的伏笔」是本产品的
 *   信息语义，换主题时若把红色换成别的色相，用户对状态的理解就会错乱。
 *   所以主题只换「皮肤」，不换「语言」。
 */
export const THEME_LIST: readonly ThemeDef[] = [
  {
    id: 'light',
    label: '保险蓝',
    hint: '默认。白天办公用，冷调克制、信息层级最清晰',
    icon: 'sun',
    scheme: 'light',
    swatch: { bg: '#f5f6f8', surface: '#ffffff', primary: '#1565c0', text: '#212121' },
  },
  {
    id: 'night',
    label: '夜航灯',
    hint: '夜间写稿主推。深灰蓝底、低眩光，不刺眼也不糊',
    icon: 'moon',
    scheme: 'dark',
    swatch: { bg: '#171a21', surface: '#1e222b', primary: '#6ea8fe', text: '#e7eaf1' },
  },
  {
    id: 'black',
    label: '纯黑',
    hint: 'OLED 屏省电、对比最高，暗房里最舒服',
    icon: 'moonStar',
    scheme: 'dark',
    swatch: { bg: '#000000', surface: '#0b0c0f', primary: '#82b4ff', text: '#f3f4f7' },
  },
  {
    id: 'sepia',
    label: '米黄纸',
    hint: '模仿纸质书的暖色，长时间阅读眼压最低',
    icon: 'bookOpen',
    scheme: 'light',
    swatch: { bg: '#f2e9d6', surface: '#fbf6e9', primary: '#1b5a9c', text: '#3a3125' },
  },
  {
    id: 'pine',
    label: '松林',
    hint: '低饱和绿灰，缓解屏幕发白带来的眼疲劳',
    icon: 'leaf',
    scheme: 'light',
    swatch: { bg: '#eef2ee', surface: '#f8faf8', primary: '#15665a', text: '#1d2a23' },
  },
] as const;

/** localStorage 键。改这个键会导致老用户的选择丢失，不要随意改。 */
export const THEME_STORAGE_KEY = 'ainovel.theme';

/** 「跟随系统」时，系统是深色就用哪个主题 */
const SYSTEM_DARK_THEME: ThemeId = 'night';

const THEME_IDS = new Set<string>(THEME_LIST.map((t) => t.id));

/** 运行时校验：localStorage 里的值可能是老的 / 被手改过的，必须当作不可信输入 */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.has(value);
}

/** 读取已保存的偏好。读不到或值非法 → 回落到 'light'（而不是跟随系统，
 *  避免「没选过主题」的用户被动变成深色而困惑）。 */
export function readStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'system') return 'system';
    if (isThemeId(raw)) return raw;
  } catch {
    // 隐私模式 / 存储被禁用：静默降级，不影响使用
  }
  return 'light';
}

/** 系统当前是否偏好深色 */
export function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * 把「偏好」解析成「实际生效的主题」。
 * 'system' 是一个间接层：它本身不是主题，要问系统之后才知道用哪个，
 * 所以每次系统主题变化都要重新调一次（见 themeStore 里的监听）。
 */
export function resolveTheme(pref: ThemePreference): ThemeId {
  if (pref === 'system') return systemPrefersDark() ? SYSTEM_DARK_THEME : 'light';
  return pref;
}

export function getThemeDef(id: ThemeId): ThemeDef {
  return THEME_LIST.find((t) => t.id === id) ?? THEME_LIST[0];
}

/**
 * 把主题写进 DOM。这一步是「真正生效」的地方。
 *
 * 两个动作，缺一不可：
 *  1. `data-theme`：驱动 design-tokens.css 里对应的覆盖块。
 *     'light' 特殊 —— 它等于「不写这个属性」，这样默认渲染路径和加主题之前
 *     完全一致，不存在「老代码没考虑到某个主题」的回归面。
 *  2. `color-scheme`：告诉浏览器「这个页面现在是深色」，
 *     原生滚动条、输入框、下拉框、日期选择器就会自动跟随，
 *     不需要我们自己画一套深色控件。
 */
export function applyTheme(id: ThemeId): void {
  const root = document.documentElement;
  if (id === 'light') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', id);
  }

  const scheme = getThemeDef(id).scheme;
  root.style.colorScheme = scheme;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', scheme);
}

/** 持久化偏好。写失败（隐私模式）不抛错，只是下次记不住。 */
export function persistPreference(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // 忽略：记住偏好是增强，不是功能必需
  }
}
