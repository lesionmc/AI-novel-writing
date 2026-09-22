import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './styles/design-tokens.css';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 本地单机服务：失败多为瞬时问题，重试一次即可
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * MSW 仅在显式开启时启用（VITE_USE_MOCK=true）；默认走真实后端。
 * 后端开发中就绪前，可用 `VITE_USE_MOCK=true npm run dev` 验证界面。
 */
async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_USE_MOCK !== 'true') return;
  const { startMockWorker } = await import('./mocks/browser');
  await startMockWorker();
}

const container = document.getElementById('root');
if (!container) throw new Error('未找到 #root 挂载点');

void enableMocking().then(() => {
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
