import { defineConfig } from '@playwright/test';

/**
 * E2E 配置：打的是**真实运行中的本机服务**（start.bat 起的那个，默认 8756）。
 * 跑法（先起后端 + mock LLM，见 e2e/full-flow.spec.ts 头部说明）：
 *   npm run e2e
 * 需要环境变量 E2E_LLM_KEY 任意非空值即可（mock 服务不校验密钥）。
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1, // 本地单实例服务：并发跑会互相踩数据
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE ?? 'http://127.0.0.1:8756',
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
  },
});
