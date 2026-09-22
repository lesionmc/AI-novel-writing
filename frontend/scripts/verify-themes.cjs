/**
 * verify-themes.cjs —— 主题系统的真实浏览器端到端验证
 * ---------------------------------------------------------------------------
 * 这是「机械校验」（scripts/check-theme-tokens.mjs）之外的**视觉与行为验证**：
 *   校验脚本只能证明「色值齐全、对比度达标」，证明不了
 *   「切了主题页面真的变了」「刷新之后还记得」「首屏不白闪」。
 *
 * 四项检查：
 *   ① 五个主题逐个生效：<html data-theme> 与预期一致，且关键 CSS 变量确实换了值
 *   ② 选择器状态正确：选中项 aria-checked=true，且与生效主题对得上
 *   ③ 点一下真的切：点「松林」→ 生效 + 写进 localStorage
 *   ④ 防白闪有效：**屏蔽掉所有 JS 资源**后仍能正确应用主题
 *      —— 这证明主题是 <head> 内联脚本定的，而不是等 React 起来才定的
 *
 * 用法（在 frontend/ 下执行，先 `npm run build`，再让后端托管 dist）：
 *   node scripts/verify-themes.cjs <baseUrl> [输出目录]
 *
 * 依赖 playwright —— 它**不是**本项目的依赖，需要本机已能解析到（例如 npx 缓存里）。
 * 若报 Cannot find module 'playwright'，用 NODE_PATH 指过去：
 *   NODE_PATH=<npx 缓存>/node_modules node scripts/verify-themes.cjs ...
 * 默认用系统已安装的 Chrome（channel: 'chrome'），不需要再下载浏览器。
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8756';
// 默认输出到 ai-novel/docs/theme-shots（与既有的 docs/qa-shots 同级，属交付证据）
const OUT = process.argv[3] || path.resolve(__dirname, '../../docs/theme-shots');
const STORAGE_KEY = 'ainovel.theme';

const THEME_TS = path.resolve(__dirname, '../src/lib/theme.ts');

/**
 * 从 theme.ts 里读出每个主题的**色卡预览值**。
 *
 * 为什么不把期望色值写死在这个脚本里：
 *   那样就变成了「我手写一份期望值 + 代码里另有一份真实值」，两者必然漂移
 *   （第一次跑就是这么错的——我把底色按另一套调色板猜成 #f6f7fb，
 *   而项目真实值是 #f5f6f8）。改成从源码里读，这个检查就变成了
 *   **跨源对撞**：theme.ts 的色卡 ←→ design-tokens.css 的实际计算值，
 *   任何一边改了而另一边没跟上，都会当场暴露。
 */
function readSwatches() {
  const src = fs.readFileSync(THEME_TS, 'utf8');
  const out = {};
  const re =
    /id:\s*'([a-z]+)',[\s\S]*?swatch:\s*\{\s*bg:\s*'(#[0-9a-fA-F]{3,8})',\s*surface:\s*'(#[0-9a-fA-F]{3,8})',\s*primary:\s*'(#[0-9a-fA-F]{3,8})',\s*text:\s*'(#[0-9a-fA-F]{3,8})'\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = { bg: m[2], surface: m[3], primary: m[4], text: m[5] };
  }
  return out;
}

const SWATCHES = readSwatches();
const THEME_IDS = ['light', 'night', 'black', 'sepia', 'pine'];

/** design-tokens.css 里每个主题对应的 data-theme 属性值（light = 不写属性） */
const ATTR = { light: null, night: 'night', black: 'black', sepia: 'sepia', pine: 'pine' };

const results = [];
let failures = 0;
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) failures += 1;
  console.log(`   ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 用系统已安装的 Chrome（channel: 'chrome'），不依赖 playwright 自带的浏览器下载，
  // 避免「playwright 版本与本地浏览器包版本不匹配」这类环境问题打断验证。
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  console.log('主题系统端到端验证');
  console.log(`目标：${BASE}`);
  console.log('');

  // ---------------------------------------------------------------- ① 逐主题生效
  console.log('① 逐主题生效：data-theme + 【计算值 ←→ theme.ts 色卡】跨源对撞 + 截图');
  for (const id of THEME_IDS) {
    const swatch = SWATCHES[id];
    if (!swatch) {
      check(`${id.padEnd(6)} 从 theme.ts 读到色卡`, false, '解析失败');
      continue;
    }

    await page.goto(`${BASE}/config`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, id]);
    await page.reload({ waitUntil: 'networkidle' });

    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      return {
        attr: root.getAttribute('data-theme'),
        colorScheme: root.style.colorScheme,
        bg: cs.getPropertyValue('--color-bg').trim().toLowerCase(),
        surface: cs.getPropertyValue('--color-surface').trim().toLowerCase(),
        primary: cs.getPropertyValue('--color-primary').trim().toLowerCase(),
        textPrimary: cs.getPropertyValue('--color-text-primary').trim().toLowerCase(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        stored: window.localStorage.getItem('ainovel.theme'),
      };
    });

    check(
      `${id.padEnd(6)} data-theme 正确`,
      (state.attr || null) === ATTR[id],
      `实际=${state.attr ?? '(无)'}`,
    );

    // 跨源对撞：CSS 的实际计算值 必须等于 theme.ts 里写的色卡预览值
    const pairs = [
      ['bg', state.bg, swatch.bg],
      ['surface', state.surface, swatch.surface],
      ['primary', state.primary, swatch.primary],
      ['text', state.textPrimary, swatch.text],
    ];
    const bad = pairs.filter(([, actual, expected]) => actual !== expected.toLowerCase());
    check(
      `${id.padEnd(6)} 计算值 ↔ theme.ts 色卡一致`,
      bad.length === 0,
      bad.length
        ? bad.map(([n, a, e]) => `${n}=实际${a}/色卡${e}`).join('; ')
        : '4/4 项吻合',
    );

    // 底色要真的落到 body 上 —— 防「变量换了但没人用」
    check(
      `${id.padEnd(6)} body 底色已随主题变化`,
      rgbMatch(state.bodyBg, state.bg),
      `body=${state.bodyBg} 期望=${state.bg}`,
    );

    check(`${id.padEnd(6)} 偏好已持久化`, state.stored === id, `stored=${state.stored}`);

    const schemeOk =
      id === 'night' || id === 'black'
        ? state.colorScheme === 'dark'
        : state.colorScheme === 'light';
    check(`${id.padEnd(6)} color-scheme 正确`, schemeOk, state.colorScheme);

    await page.screenshot({ path: path.join(OUT, `${id}.png`) });
    await page.screenshot({ path: path.join(OUT, `${id}-full.png`), fullPage: true });
  }

  // ---------------------------------------------------------------- ② 选择器状态
  console.log('');
  console.log('② 选择器选中态与生效主题一致');
  await page.goto(`${BASE}/config`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, 'sepia']);
  await page.reload({ waitUntil: 'networkidle' });
  const sel = await page.evaluate(() => {
    const grp = document.querySelector('[role="radiogroup"][aria-label="外观主题"]');
    const on = document.querySelector('[role="radio"][aria-checked="true"]');
    return {
      groupFound: Boolean(grp),
      radios: document.querySelectorAll('[role="radio"]').length,
      selected: on ? on.textContent.replace(/\s+/g, ' ').slice(0, 30) : null,
      hasFollowSystem: Boolean(document.querySelector('[aria-pressed]')),
    };
  });
  check('选择器渲染出 5 个主题', sel.radios === 5, `实际 ${sel.radios} 个`);
  check('选中态指向「米黄纸」', Boolean(sel.selected && sel.selected.includes('米黄纸')), sel.selected ?? '无');
  check('「跟随系统」入口存在', sel.hasFollowSystem, '');

  // ---------------------------------------------------------------- ③ 点击真的切
  console.log('');
  console.log('③ 点击色卡真的切换并记住');
  await page.getByRole('radio', { name: /松林/ }).click();
  await page.waitForTimeout(500); // 等过渡窗口结束
  const afterClick = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    stored: window.localStorage.getItem('ainovel.theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));
  check('点击后 data-theme=pine', afterClick.attr === 'pine', `实际=${afterClick.attr}`);
  check('点击后已持久化 pine', afterClick.stored === 'pine', `stored=${afterClick.stored}`);

  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('刷新后仍是 pine（记住了）', afterReload === 'pine', `实际=${afterReload}`);

  // ---------------------------------------------------------------- ④ 防白闪
  console.log('');
  console.log('④ 防首屏白闪：屏蔽全部 JS 资源后主题仍生效');
  const page2 = await ctx.newPage();
  await page2.goto(`${BASE}/config`, { waitUntil: 'domcontentloaded' });
  await page2.evaluate(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, 'night']);
  // 拦截所有 JS（含 React bundle）—— 此时页面不会有任何组件，只剩 index.html
  await page2.route('**/*.js', (route) => route.abort());
  await page2.route('**/assets/**', (route) => route.abort());
  await page2.reload({ waitUntil: 'domcontentloaded' });
  const fouc = await page2.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    scheme: document.documentElement.style.colorScheme,
    reactRootEmpty: (document.getElementById('root') || {}).childElementCount === 0,
  }));
  check('无 JS 时 data-theme 仍为 night', fouc.attr === 'night', `实际=${fouc.attr}`);
  check('无 JS 时 color-scheme=dark', fouc.scheme === 'dark', fouc.scheme);
  check('确认 React 未参与（root 为空）', fouc.reactRootEmpty, '');

  await browser.close();

  console.log('');
  const total = results.length;
  console.log(`结论：${total - failures}/${total} 通过${failures ? `，${failures} 项失败` : ''}`);
  console.log(`截图输出：${OUT}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('脚本异常：', err);
  process.exit(2);
});

/** 把 #rrggbb 与 rgb(r,g,b) 做等价比较 */
function rgbMatch(rgbStr, hex) {
  const m = rgbStr.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return false;
  const n = parseInt(hex.slice(1), 16);
  return (
    Number(m[1]) === ((n >> 16) & 255) &&
    Number(m[2]) === ((n >> 8) & 255) &&
    Number(m[3]) === (n & 255)
  );
}
