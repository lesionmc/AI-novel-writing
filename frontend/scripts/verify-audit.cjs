/**
 * verify-audit.cjs —— 质检页的真实浏览器端到端验证
 * ---------------------------------------------------------------------------
 * 为什么单独写这个：`check-theme-tokens.mjs` 只能证明颜色对；前端工程师的
 * 静态门禁（tsc/eslint/build）只能证明"能编译、能打包"。**都不能证明
 * 「点那个按钮真的会出结果」。** 而质检页恰恰全是"点按钮 → 出列表"的交互，
 * 所以必须用真实浏览器把它点一遍。
 *
 * 覆盖的链路（全部走真实 HTTP + 真实 DOM）：
 *   ① 页面能打开，三个区块都在；未上线的「一致性审校」是说明态而不是死按钮
 *   ② 词库缺失时点「扫描整本书」→ 出引导文案，**不是报错**
 *   ③ 放好词库后再扫 → 命中列表渲染、分类标签是中文
 *   ④ 「去 AI 味」选章检测 → 评分环出数字、三类中文标签渲染
 *   ⑤ 敏感词命中项可点击跳章（跳转后离开质检页）
 *   ⑥ 全页文本**不含** M2/M3 这类内部里程碑代号
 *
 * 用法（在 frontend/ 下执行；需 playwright 可解析，见 verify-themes.cjs 头注释）：
 *   node scripts/verify-audit.cjs <baseUrl> <服务端 AINOVEL_PROJECT_ROOT> [输出目录]
 *
 * ⚠️ 它会往 <服务端 AINOVEL_PROJECT_ROOT>/data/ 写一个测试词库文件并删除它。
 *    所以务必把服务端跑在**隔离的临时根**上，不要对着真实 data/ 跑。
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8840';
const SEED_ROOT = process.argv[3];
const OUT = process.argv[4] || path.resolve(__dirname, '../../docs/audit-shots');

if (!SEED_ROOT) {
  console.error('缺少参数：服务端的 AINOVEL_PROJECT_ROOT（用于放/删测试词库）');
  process.exit(2);
}
const WORDS_FILE = path.join(SEED_ROOT, 'data', 'sensitive_words.txt');

/** 测试用占位词条（不是真实敏感词，仅用于验证匹配链路） */
const TEST_WORD = '测试词甲';
const WORDLIST = [
  '# 端到端验证用词库（占位词，非真实敏感词）',
  `${TEST_WORD},violence`,
  '测试词乙|测试词乙变体,illegal',
].join('\n');

/** 含三类 AI 味特征的正文 */
const FLAVOR_TEXT =
  '<p>首先，他感到无比愤怒。其次，他非常难过。因此，他彻底崩溃了。最后，他深深地叹了口气。</p>';

const results = [];
let failures = 0;
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) failures += 1;
  console.log(`   ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON（导出类接口） */
  }
  return { status: res.status, json, text };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---------------------------------------------------------------- 播种
  console.log('① 通过 API 播种测试作品（走隔离根，不碰真实 books/）');
  const title = `验收-质检E2E-${Date.now()}`;
  const created = await api('POST', '/api/books', { title });
  check('创建作品', created.status === 201 || created.status === 200, `HTTP ${created.status}`);

  const list = await api('GET', '/api/books');
  const slug = (list.json || []).find((b) => b.title === title)?.slug;
  check('拿到 slug', Boolean(slug), slug ?? '未找到');
  if (!slug) process.exit(1);

  const c1 = await api('POST', `/api/books/${encodeURIComponent(slug)}/chapters`, { title: '第1章' });
  const c2 = await api('POST', `/api/books/${encodeURIComponent(slug)}/chapters`, { title: '第2章' });
  check('创建两章', c1.status < 300 && c2.status < 300, `${c1.status}/${c2.status}`);

  const briefs = await api('GET', `/api/books/${encodeURIComponent(slug)}/chapters`);
  const chs = briefs.json || [];
  const id1 = chs[0]?.id;
  const id2 = chs[1]?.id;
  await api('PATCH', `/api/chapters/${id1}`, { content: FLAVOR_TEXT });
  // 第 2 章刻意命中**两个不同分类**的词 —— 只有 ≥2 类，前端才会渲染分类筛选条，
  // 否则「筛选」这条链路根本跑不到（第一版就是只命中 1 类，筛选条没出现）
  await api('PATCH', `/api/chapters/${id2}`, {
    content: `<p>这段文字里含有${TEST_WORD}，也含有测试词乙，用来验证匹配与分类筛选。</p>`,
  });
  check('写入正文', Boolean(id1 && id2), `ids=${id1},${id2}`);

  // 先确保词库不存在 → 验证"缺失时的引导"
  if (fs.existsSync(WORDS_FILE)) fs.unlinkSync(WORDS_FILE);

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const url = `${BASE}/book/${encodeURIComponent(slug)}/audit`;

  // ---------------------------------------------------------------- ② 页面与区块
  console.log('');
  console.log('② 质检页打开 → 三个区块都在，未上线的区块是说明态');
  await page.goto(url, { waitUntil: 'networkidle' });
  const pageText = await page.evaluate(() => document.body.innerText);
  check('标题是「质检」', (await page.locator('h1').first().innerText()) === '质检', '');
  check('区块一：一致性审校存在', pageText.includes('一致性审校'), '');
  check('区块二：去 AI 味存在', pageText.includes('去 AI 味'), '');
  check('区块三：敏感词自查存在', pageText.includes('敏感词自查'), '');
  check(
    '未上线区块是说明态（含"即将上线/还没/暂时"之类提示，而不是纯死按钮）',
    /即将上线|还没|暂未|敬请期待|稍后/.test(pageText),
    '',
  );
  // ⑥ 内部代号不外露
  const leaked = /(?:^|[^A-Za-z0-9])(?:M1|M2|M3)(?:[^A-Za-z0-9]|$)/.test(pageText);
  check('页面不含 M1/M2/M3 内部里程碑代号', !leaked, leaked ? '发现泄漏' : '');
  await page.screenshot({ path: path.join(OUT, 'audit-01-页面总览.png'), fullPage: true });

  // ---------------------------------------------------------------- ③ 词库缺失
  console.log('');
  console.log('③ 词库缺失：点「扫描整本书」→ 引导文案，而不是报错');
  await page.getByRole('button', { name: /扫描整本书/ }).click();
  await page.waitForTimeout(1200);
  const noWordlistText = await page.evaluate(() => document.body.innerText);
  check(
    '出现「还没有配置敏感词库」引导',
    noWordlistText.includes('还没有配置') && noWordlistText.includes('sensitive_words'),
    '',
  );
  check('没有出现错误提示', !/出错了|失败|错误/.test(noWordlistText), '');
  // 前置说明：必须在**点按钮之前**就可见（QA 反馈"开箱即用时是空壳"，修正为常驻说明）
  check(
    '「需自备词表」说明前置常驻（未配置态）',
    noWordlistText.includes('这是可选功能') && noWordlistText.includes('查看格式说明'),
    '',
  );
  await page.screenshot({ path: path.join(OUT, 'audit-02-词库缺失引导.png'), fullPage: true });

  // ---------------------------------------------------------------- ④ 去 AI 味
  console.log('');
  console.log('④ 去 AI 味：选章 → 开始检测 → 评分 + 三类中文标签');
  const ring = page.locator('[role="img"][aria-label^="AI 味评分"]');
  await page.getByRole('button', { name: /开始检测|重新检测/ }).first().click();
  await page.waitForTimeout(1500);
  const ringCount = await ring.count();
  const ringLabel = ringCount > 0 ? await ring.first().getAttribute('aria-label') : null;
  check('评分环出现', ringCount > 0 && ringLabel !== null, ringLabel ?? '未找到');
  const scoreNum = ringLabel ? Number((ringLabel.match(/(\d+)/) || [])[1]) : NaN;
  check('评分是正整数（0-100）', Number.isInteger(scoreNum) && scoreNum >= 0 && scoreNum <= 100, `score=${scoreNum}`);
  const afterFlavor = await page.evaluate(() => document.body.innerText);
  const labels = ['套话连接词', '直接说情绪', '程度词过多'];
  const shown = labels.filter((l) => afterFlavor.includes(l));
  check('三类命中标签都渲染成中文', shown.length === 3, `出现 ${shown.length}/3：${shown.join('、')}`);
  await page.screenshot({ path: path.join(OUT, 'audit-03-去AI味结果.png'), fullPage: true });

  // ------------------------------------------- ④b 只读性（本轮最关键的一条）
  // 背景：前一版实现了「采纳并替换」，会把后端返回的 **建议文案**（"「综上所述」是路标式
  // 连接词，删掉它直接进事件…"）当作替换文本写进用户书稿 —— 那是**静默损坏用户稿件**。
  // 所以这里必须机械证明：从质检页出发，**任何操作都不改正文**。
  console.log('');
  console.log('④b 只读性：点「去改这一处」必须不改动正文');
  const c1Before = (await api('GET', `/api/chapters/${id1}`)).json?.content ?? '';
  const fixBtn = page.getByRole('button', { name: /去改这一处/ });
  const fixCount = await fixBtn.count();
  check('命中项带「去改这一处」按钮', fixCount > 0, `找到 ${fixCount} 个`);
  check(
    '页面已无「采纳并替换」入口',
    !(await page.evaluate(() => document.body.innerText)).includes('采纳并替换'),
    '',
  );
  if (fixCount > 0) {
    await fixBtn.first().click();
    await page.waitForTimeout(1800);
  }
  const c1After = (await api('GET', `/api/chapters/${id1}`)).json?.content ?? '';
  check(
    '点「去改这一处」后正文一字未改',
    c1After === c1Before,
    c1After === c1Before ? `byte-equal（${c1Before.length} 字）` : '❌ 正文被改动了！',
  );
  // 回到质检页继续后面的用例（上一步已跳去写作台）
  await page.goto(url, { waitUntil: 'networkidle' });

  // ---------------------------------------------------------------- ⑤ 有词库 → 命中
  console.log('');
  console.log('⑤ 放好词库后重新扫描 → 命中渲染 + 分类中文');
  fs.mkdirSync(path.dirname(WORDS_FILE), { recursive: true });
  fs.writeFileSync(WORDS_FILE, WORDLIST, 'utf8');
  const st = await api('GET', '/api/audit/wordlist-status');
  check('词库状态端点识别到新词库', st.json?.configured === true, JSON.stringify(st.json));

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /扫描整本书/ }).click();
  await page.waitForTimeout(1800);
  const scanned = await page.evaluate(() => document.body.innerText);
  check('命中词渲染出来了', scanned.includes(TEST_WORD), '');
  check('分类渲染成中文', scanned.includes('暴力血腥') || scanned.includes('违法违规'), '');
  check('命中两个不同分类（筛选条才会出现）', scanned.includes(TEST_WORD) && scanned.includes('测试词乙'), '');
  // 消歧措辞：total_hits（Σcount）与「词条个数」必须分开说，且给出可读结论
  check(
    '计数措辞已消歧（「词条命中」+「涉及」）',
    scanned.includes('词条命中') && scanned.includes('涉及'),
    '',
  );
  check('同处多词条命中的说明常驻', scanned.includes('同一处文字可能被多个词条'), '');
  await page.screenshot({ path: path.join(OUT, 'audit-04-敏感词结果.png'), fullPage: true });

  // 分类筛选：切到「暴力血腥」后，另一个分类的词应当从列表里消失
  const violenceChip = page.getByRole('button', { name: /暴力血腥/ });
  if ((await violenceChip.count()) > 0) {
    await violenceChip.first().click();
    await page.waitForTimeout(600);
    const filtered = await page.evaluate(() => document.body.innerText);
    check(
      '分类筛选生效（选中暴力血腥后，违法违规的词被过滤掉）',
      filtered.includes(TEST_WORD) && !filtered.includes('测试词乙'),
      filtered.includes('测试词乙') ? '测试词乙 未被过滤' : '',
    );
    await page.screenshot({ path: path.join(OUT, 'audit-05-分类筛选.png'), fullPage: true });
  } else {
    check('分类筛选条出现', false, '未找到「暴力血腥」筛选项');
  }

  // 点「跳到本章」→ 应当离开质检页进入写作台
  const before = page.url();
  const jumpBtn = page.getByRole('button', { name: /跳到本章/ });
  const jumpCount = await jumpBtn.count();
  check('命中项带「跳到本章」按钮', jumpCount > 0, `找到 ${jumpCount} 个`);
  if (jumpCount > 0) {
    await jumpBtn.first().click();
    await page.waitForTimeout(1500);
  }
  const after = page.url();
  check('点「跳到本章」进入写作台', after.includes('/desk'), `→ ${after.replace(BASE, '')}`);

  await browser.close();

  console.log('');
  const total = results.length;
  console.log(`结论：${total - failures}/${total} 通过${failures ? `，${failures} 项失败` : ''}`);
  console.log(`截图输出：${OUT}`);
  console.log(`提示：词库文件位于 ${WORDS_FILE}（请自行删除，勿留）`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('脚本异常：', err);
  process.exit(2);
});
