/**
 * check-theme-tokens.mjs —— 主题完整性 + 对比度校验
 * ---------------------------------------------------------------------------
 * 为什么需要这个脚本：
 *   主题是「只覆盖语义色层」实现的。这种做法的风险是**漏改**——比如某主题忘了
 *   覆盖 `--color-warning-text`，它就会继续用浅色主题的值，在深底上糊成一片。
 *   这类问题不报错、不崩溃，只在特定主题下看着别扭，人工很难逐项查，
 *   所以必须机器对账。
 *
 * 两项检查：
 *   ① 覆盖完整性：每个主题必须把 `:root` 里的 `--color-*` 语义层全部覆盖一遍
 *      （派生型 token 由其上游自动跟随，见文件末尾 EXEMPT 白名单与说明）
 *   ② 对比度：正文与关键状态色对底色的 WCAG 对比度必须达标
 *      · 正文 / 次要文字 ≥ 4.5:1（AA 正文标准）
 *      · 小号彩色文字（强提示类）≥ 4.5:1
 *
 * 用法：node scripts/check-theme-tokens.mjs        （非零退出码 = 有不合格项）
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = resolve(here, '../src/styles/design-tokens.css');

/**
 * 允许某主题不覆盖的 token，分两类：
 *   1. 派生 token（值形如 `var(--color-xxx)`）—— 上游被覆盖即自动跟随，
 *      重复写一遍只会增加漂移面。
 *   2. `--color-scrollbar-track` —— 固定为 transparent，与主题无关。
 */
const DERIVED_PREFIXES = ['--color-info', '--color-importance-', '--color-status-'];
const DERIVED_EXACT = new Set(['--color-scrollbar-track']);

/** 亮/暗两套主题都要检查的对比度组合：[前景 token, 背景 token, 最低要求, 说明] */
const CONTRAST_PAIRS = [
  ['--color-text-primary', '--color-bg', 4.5, '正文 / 应用底色'],
  ['--color-text-primary', '--color-surface', 4.5, '正文 / 卡片'],
  ['--color-text-primary', '--color-surface-hover', 4.5, '正文 / 行悬停'],
  ['--color-text-secondary', '--color-surface', 4.5, '次要文字 / 卡片'],
  ['--color-text-tertiary', '--color-surface', 4.5, '元数据 / 卡片'],
  ['--color-editor-text', '--color-editor-bg', 4.5, '编辑器正文 / 画布'],
  ['--color-text-on-primary', '--color-primary', 4.5, '主按钮文字 / 主色底'],
  ['--color-text-on-accent', '--color-accent', 4.5, '强调按钮文字 / 强调底'],
  ['--color-text-on-danger', '--color-danger', 4.5, '危险按钮文字 / 危险底'],
  ['--color-warning-text', '--color-warning-soft', 4.5, '警告小字 / 警告浅底'],
  ['--color-accent-strong', '--color-accent-soft', 4.5, '强调小字 / 强调浅底'],
  ['--color-foreshadow-aging-strong', '--color-foreshadow-aging-soft', 4.5, '伏笔老化小字 / 浅底'],
  ['--color-primary', '--color-surface', 3.0, '主色文字 / 卡片（大字/图标 3:1）'],
];

// ---------------------------------------------------------------- 解析 CSS

const css = readFileSync(TOKENS_PATH, 'utf8');

/** 去掉注释，避免注释里的示例值被当成真实声明 */
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 抓出所有 `选择器 { … }` 块（本文件只有单层嵌套，够用） */
function blocksOf(text) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ selectors: m[1].trim(), body: m[2] });
  return out;
}

/** 把一个块体解析成 { '--token': 'value' } */
function declarations(body) {
  const map = {};
  for (const raw of body.split(';')) {
    const i = raw.indexOf(':');
    if (i < 0) continue;
    const name = raw.slice(0, i).trim();
    if (!name.startsWith('--')) continue;
    map[name] = raw.slice(i + 1).trim();
  }
  return map;
}

const blocks = blocksOf(stripped);

const rootVars = {};
for (const b of blocks) {
  if (/(^|,)\s*:root\s*($|,)/.test(b.selectors)) Object.assign(rootVars, declarations(b.body));
}

/** data-theme 主题块：选择器形如 :root[data-theme='night'] */
const themes = {};
for (const b of blocks) {
  const m = b.selectors.match(/\[data-theme=['"]([^'"]+)['"]\]/);
  if (m) themes[m[1]] = { ...themes[m[1]], ...declarations(b.body) };
}

// ------------------------------------------------- 变量求值（含 var() 递归）

function resolveVar(name, themeVars, depth = 0) {
  if (depth > 12) return undefined;
  const raw = themeVars[name] ?? rootVars[name];
  if (raw === undefined) return undefined;
  const m = raw.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?)\s*)?\)$/);
  if (m) {
    const inner = resolveVar(m[1], themeVars, depth + 1);
    if (inner !== undefined) return inner;
    return m[2];
  }
  return raw;
}

/** 解析 #rgb / #rrggbb / rgb() / rgba() → {r,g,b,a} */
function parseColor(value) {
  if (!value) return null;
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3) return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  return null;
}

/** WCAG 相对亮度 */
function luminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- 开始检查

const ICON = { ok: 'PASS', bad: 'FAIL' };
let failures = 0;

console.log('主题 token 校验');
console.log('源文件：src/styles/design-tokens.css');
console.log('');

// ① 覆盖完整性
/**
 * 语义层基线 = 「1. 语义色层」到「2. 字体」之间那段声明。
 *
 * 必须用**带注释的原文**来切段 —— 段落边界就写在注释里，去注释后就找不到了。
 * 为什么不简单取「所有 --color-*」：原始值层（--color-blue-50 这类调色原料）同样以
 * --color- 开头，但主题**不应该**去改原料色板（改了会让语义层失去统一基准），
 * 只需要覆盖语义层。
 */
function semanticLayerTokens(text) {
  const start = text.indexOf('1. 语义色层');
  const end = text.indexOf('2. 字体');
  if (start < 0 || end < 0 || end <= start) return null;
  const names = new Set();
  const re = /(--color-[\w-]+)\s*:/g;
  let m;
  while ((m = re.exec(text.slice(start, end))) !== null) names.add(m[1]);
  return [...names];
}

const semanticTokens = semanticLayerTokens(css);
if (!semanticTokens) {
  console.log('   FAIL 找不到「1. 语义色层」段落标记，无法建立基线（文件结构被改过？）');
  process.exit(1);
}

const required = semanticTokens.filter(
  (k) => !DERIVED_PREFIXES.some((p) => k.startsWith(p)) && !DERIVED_EXACT.has(k),
);

console.log(`① 语义层覆盖完整性（基线 :root 共 ${required.length} 个需覆盖的语义 token）`);
const themeIds = Object.keys(themes);
if (themeIds.length === 0) {
  console.log(`   ${ICON.bad} 一个 data-theme 主题块都没找到`);
  failures += 1;
}
for (const id of themeIds) {
  const vars = themes[id];
  const missing = required.filter((k) => !(k in vars));
  if (missing.length === 0) {
    console.log(`   ${ICON.ok} ${id.padEnd(6)} 覆盖 ${required.length}/${required.length}`);
  } else {
    console.log(`   ${ICON.bad} ${id.padEnd(6)} 缺 ${missing.length} 个：${missing.join(', ')}`);
    failures += 1;
  }
}
console.log('');

// ② 对比度
/**
 * 已知偏差 —— 继承自**设计契约的锁定值**，不阻断校验，但必须显式打印出来。
 *
 * 为什么要有这份清单，而不是直接把阈值放宽：
 *   校验脚本的职责是「不让新的偏差溜过去」，不是「把历史问题藏起来」。
 *   如果把阈值降到 4.3 去迁就它，那以后所有主题都可以在 4.3 混过去，
 *   门禁就废了。所以：历史遗留 → 单独列、单独打印、写清谁该来定；
 *   新增偏差 → 一律 FAIL。
 *
 * 【当前为空】原有一条「默认主题强调按钮 4.32:1」，已于 2026-09-22 把
 *   --color-accent 由 teal-600 下调到 teal-700（实测 5.32:1）修掉，
 *   故此清单清空 —— 现在任何一项不达标都会直接 FAIL。
 */
const KNOWN_DEVIATIONS = [];

console.log('② 关键文字对比度（WCAG，正文阈值 4.5:1 / 大字与图标 3:1）');
const warned = [];
for (const key of ['light', ...themeIds]) {
  const vars = key === 'light' ? {} : themes[key];
  const label = key.padEnd(6);
  const details = [];
  let bad = 0;
  let known = 0;
  for (const [fgName, bgName, min, note] of CONTRAST_PAIRS) {
    const fg = parseColor(resolveVar(fgName, vars));
    const bg = parseColor(resolveVar(bgName, vars));
    if (!fg || !bg) {
      details.push(`      ?  ${note}：取不到色值（${fgName} / ${bgName}）`);
      bad += 1;
      continue;
    }
    const ratio = contrast(fg, bg);
    if (ratio >= min) continue;
    const isKnown = KNOWN_DEVIATIONS.some((d) => d.themeKey === key && d.pair === note);
    if (isKnown) {
      known += 1;
      details.push(`      ~  ${ratio.toFixed(2)}:1  (需 ${min})  ${note}  ← 已知偏差，待设计确认`);
      warned.push({ theme: key, note, ratio, min });
    } else {
      bad += 1;
      details.push(`      !  ${ratio.toFixed(2)}:1  (需 ${min})  ${note}  ← 不达标`);
    }
  }
  const status = bad === 0 ? ICON.ok : ICON.bad;
  const suffix = known > 0 ? `，已知偏差 ${known} 项` : '';
  console.log(`   ${status} ${label} 不达标 ${bad} 项${suffix}`);
  for (const d of details) console.log(d);
  failures += bad;
}

if (warned.length > 0) {
  console.log('');
  console.log('已知偏差说明（不计入失败，但需要有人拍板）');
  for (const d of KNOWN_DEVIATIONS) {
    console.log(`   ~  ${d.pair}`);
    console.log(`      ${d.reason}`);
  }
}

// ③ design-tokens.json 的主题登记与 CSS 主题块一一对应
console.log('');
console.log('③ design-tokens.json 主题登记 ↔ CSS 主题块');
const TOKENS_JSON = resolve(here, '../../docs/design-tokens.json');
let jsonThemes = null;
let jsonErr = null;
try {
  jsonThemes = JSON.parse(readFileSync(TOKENS_JSON, 'utf8')).themes;
} catch (e) {
  jsonErr = e.message;
}

if (jsonErr) {
  console.log(`   ${ICON.bad} 读不到 design-tokens.json：${jsonErr}`);
  failures += 1;
} else if (!jsonThemes || !Array.isArray(jsonThemes.list)) {
  // 这份 JSON 是与 CSS 同源的设计产物，加了主题却不登记，等于又造了一个双真源
  console.log(`   ${ICON.bad} 缺 themes.list 段 —— 加主题后必须同步登记`);
  failures += 1;
} else {
  const jsonIds = jsonThemes.list.map((t) => t.id).sort();
  const cssIds = [...themeIds].sort();
  const onlyJson = jsonIds.filter((i) => !cssIds.includes(i));
  const onlyCss = cssIds.filter((i) => !jsonIds.includes(i));
  if (onlyJson.length === 0 && onlyCss.length === 0) {
    console.log(`   ${ICON.ok} 登记一致（${jsonIds.length} 个）：${jsonIds.join(', ')}`);
  } else {
    if (onlyJson.length) {
      console.log(`   ${ICON.bad} 只在 JSON 登记、CSS 里没有对应主题块：${onlyJson.join(', ')}`);
    }
    if (onlyCss.length) {
      console.log(`   ${ICON.bad} CSS 里有主题块、JSON 漏登记：${onlyCss.join(', ')}`);
    }
    failures += 1;
  }
  if (jsonThemes.default === 'light') {
    console.log(`   ${ICON.ok} default = light（与「不写 data-theme」的约定一致）`);
  } else {
    console.log(`   ${ICON.bad} default 应为 light，实际为 ${jsonThemes.default}`);
    failures += 1;
  }
}

console.log('');
console.log(failures === 0 ? '结论：全部通过' : `结论：${failures} 项不合格，需修正`);
process.exit(failures === 0 ? 0 : 1);
