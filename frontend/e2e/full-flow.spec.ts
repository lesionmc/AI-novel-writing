import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * 全流程 E2E（模拟真人操作）。前置：
 *   1) 后端已启动（start.bat 或 python -m app，端口 8756，且已构建前端 dist）
 *   2) mock LLM 已启动：python ../docs/tools/mock_llm_server.py  （端口 8899）
 *
 * 为什么是「一个长旅程」而不是多个平铺 test：
 *   这条链路本身要求状态连续（建的书、配的模型、写的章后面都要用到）。
 *   拆成多个 test 时一旦 worker 重启，模块级书名会重算，后面的 test 面对一本
 *   不存在的书，报错全是假故障。连续旅程失败即失败点，配合 trace 更好定位。
 *
 * 覆盖：建书 → 配模型 → AI 流式对话 → 草稿确认入库 → 设定库验证 → 写作台
 *      （自动保存/完成本章/归档回写）→ 大纲（总纲/AI 展开候选/填入/加卷/汇总门控）
 *      → 质检（去 AI 味）→ 关系图谱 → 导出/整本备份下载 → 主题切换 → 删书进回收站。
 */

const BOOK = `自动化测试之书${Date.now().toString(36)}`;
const SLUG_PATH = `/book/${encodeURIComponent(BOOK)}`;
const MOCK_BASE = 'http://127.0.0.1:8899/v1';

interface ProviderRow {
  id: number;
  model?: string;
  base_url?: string;
}

/** 删除历次/本次运行注入的 mock 模型配置（字段是 model/base_url，没有 name） */
async function purgeMockProviders(request: APIRequestContext) {
  const res = await request.get('/api/providers');
  if (!res.ok()) return;
  for (const p of (await res.json()) as ProviderRow[]) {
    if ((p.base_url ?? '') === MOCK_BASE || (p.model ?? '').includes('mock')) {
      await request.delete(`/api/providers/${p.id}`);
    }
  }
}

async function createBook(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新建作品' }).first().click();
  await page.getByLabel('书名').fill(BOOK);
  await page.getByRole('button', { name: '创建' }).click();
  await expect(page).toHaveURL(new RegExp(`${SLUG_PATH.replace('/', '\\/')}/start`));
}

async function addMockModel(page: Page) {
  await page.goto(`${SLUG_PATH}/config`);
  await page.getByRole('button', { name: '添加模型' }).first().click();
  const dialog = page.getByRole('dialog', { name: '添加模型' });
  await dialog.getByLabel('服务商').selectOption('custom');
  await dialog.getByLabel('接入地址').fill(MOCK_BASE);
  await dialog.getByLabel(/密钥|API Key/).first().fill('mock-key');
  await dialog.getByLabel('模型名称').fill('mock-gpt');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(/已添加模型|模型配置已保存/)).toBeVisible({ timeout: 15_000 });
}

test.afterAll(async ({ request }) => {
  // 本次运行注入的 mock 模型必须带走 —— 否则用户打开真实界面会以为「AI 只会说模板话」
  await purgeMockProviders(request);
});

test('全流程：建书 → AI 对话 → 写作 → 大纲 → 质检 → 导出 → 删书', async ({ page, request }) => {
  test.setTimeout(420_000);

  // 清场：删掉历次运行残留的自动化测试书与 mock 模型（尽力而为，不影响主流程）
  const books = await request.get('/api/books');
  if (books.ok()) {
    for (const b of (await books.json()) as { slug: string; title: string }[]) {
      if (b.title.startsWith('自动化测试之书')) {
        await request.delete(`/api/books/${encodeURIComponent(b.slug)}`);
      }
    }
  }
  await purgeMockProviders(request);

  await test.step('建书 + 配模型', async () => {
    await createBook(page);
    await addMockModel(page);
  });

  await test.step('AI 流式对话 + 草稿确认入库', async () => {
    await page.goto(`${SLUG_PATH}/chat`);
    // 核心回归（用户报障点）：输入框任何状态都能打字，只有发送被门控
    const input = page.getByLabel('输入你想说的话');
    await expect(input).toBeEnabled();
    await input.fill('你好');
    await page.getByRole('button', { name: /发送/ }).click();
    await expect(page.getByText('（mock 回复）')).toBeVisible({ timeout: 30_000 });

    // 建人物意图 → 草稿卡 → 确认写入（人工确认红线）
    await page.getByRole('button', { name: '建人物' }).click();
    await input.fill('帮我建一个反派人物卡：白衣人');
    await page.getByRole('button', { name: /发送/ }).click();
    await expect(page.getByText('人物卡 · 1 个人物')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '确认写入' }).click();
    await expect(page.getByText(/已把 1 条人物卡写进作品/)).toBeVisible();

    // 入库验证：设定库能看到这个人
    await page.goto(`${SLUG_PATH}/settings`);
    await expect(page.getByText('（mock）白衣人')).toBeVisible();
  });

  await test.step('写作台：写章 → 自动保存 → 完成本章归档', async () => {
    await page.goto(`${SLUG_PATH}/desk`);
    await page.getByRole('button', { name: '新建第一章' }).click();
    await page.getByLabel('章节标题').fill('自动化第一章');
    await page.getByLabel('章节正文').click();
    await page.keyboard.type(
      '这是一段由自动化测试写入的正文，用来验证自动保存与归档链路。他喃喃道：真的太棒了，简直不可思议。',
    );
    await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: '完成本章' }).click();
    const dialog = page.getByRole('dialog', { name: '完成本章' });
    await dialog.getByLabel('本章摘要').fill('自动化测试摘要：主角出发。');
    await dialog.getByRole('button', { name: '确认并保存' }).click();
    await expect(page.getByText(/本章已归档/)).toBeVisible({ timeout: 30_000 });
  });

  await test.step('大纲：总纲 → AI 展开候选 → 填入 → 加卷 → 汇总门控', async () => {
    await page.goto(`${SLUG_PATH}/outline`);
    await page.getByRole('button', { name: '添加总纲' }).first().click();
    await expect(page.getByText('已添加总纲')).toBeVisible();

    // 总纲节点的正文框标签是「全书走向…」，与卷/章的「要点」不同
    const contentBox = page.getByLabel(/全书走向/);
    await contentBox.fill('一个关于自动化测试的寓言。');

    await page.getByRole('button', { name: 'AI 展开候选' }).click();
    await expect(page.getByText(/AI 给出 \d+ 条候选/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '填入内容' }).click();
    await expect(contentBox).toHaveValue(/（mock）第一章候选/);

    // 详情区的保存按钮（不以「^保存」匹配会误点到左树里名字含「未保存」的节点按钮）
    await page.getByRole('button', { name: /^保存/ }).click();
    await expect(page.getByText('大纲已保存')).toBeVisible();

    await page.getByRole('button', { name: '添加卷' }).click();
    await expect(page.getByText('已添加一卷')).toBeVisible();

    // 新加的卷下面没挂着写完的章节 —— 汇总必须给如实提示（后端 400 原文要透传到界面）
    await page.getByRole('button', { name: '汇总本卷' }).click();
    await expect(page.getByText(/还没有挂着写完的章节/)).toBeVisible({ timeout: 30_000 });
  });

  await test.step('质检：去 AI 味检测出分', async () => {
    await page.goto(`${SLUG_PATH}/audit`);
    await page.getByRole('button', { name: '开始检测' }).click();
    await expect(page.getByText(/AI 味：/)).toBeVisible({ timeout: 30_000 });
  });

  await test.step('设定库：关系图谱如实提示', async () => {
    await page.goto(`${SLUG_PATH}/settings`);
    await page.getByRole('button', { name: '关系图谱' }).click();
    const dialog = page.getByRole('dialog', { name: '人物关系图谱' });
    await expect(dialog).toBeVisible();
    // 书里目前只有一个人物（白衣人）——不足两人时给如实提示而不是坏页面
    await expect(dialog.getByText(/至少两个人物/)).toBeVisible();
    await dialog.getByRole('button', { name: '关闭' }).last().click();
  });

  await test.step('导出与整本备份可下载', async () => {
    await page.goto(`${SLUG_PATH}/config`);
    const txtDl = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出', exact: true }).click();
    expect((await txtDl).suggestedFilename()).toMatch(/\.txt$/);

    const zipDl = page.waitForEvent('download');
    await page.getByRole('button', { name: '整本备份（.zip）' }).click();
    expect((await zipDl).suggestedFilename()).toMatch(/备份.*\.zip$/);
  });

  await test.step('主题切换生效', async () => {
    await page.getByText('夜航灯').first().click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? ''))
      .toBe('night');
  });

  await test.step('删书进回收站（不物理删除）', async () => {
    await page.goto('/');
    await page.getByRole('button', { name: `${BOOK} 的更多操作` }).click();
    await page.getByRole('menuitem', { name: '删除作品' }).click();
    const dialog = page.getByRole('dialog', { name: '删除这个作品？' });
    await dialog.getByRole('button', { name: '移入回收目录' }).click();
    await expect(page.getByText('已移入回收目录')).toBeVisible();
    await expect(page.getByText(BOOK)).toHaveCount(0);
  });
});
