import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** 启动 MSW（仅 `VITE_USE_MOCK=true` 时被 main.tsx 动态导入） */
export async function startMockWorker(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: false,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
}
