import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** 组件测试用配置（纯函数测试同样跑这里；jsdom 提供 DOM 环境） */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // globals 让 RTL 的自动 cleanup 生效（每个用例后卸载 DOM，防互相污染）
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
