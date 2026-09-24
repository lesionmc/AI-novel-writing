import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ToastViewport } from '@/components/common/Toast';
import { LibraryPage } from '@/pages/LibraryPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * 路由级代码分割（2026-09-23）：除书库落地页外全部懒加载 ——
 * TipTap（写作台）、AiHub、质检等各自成 chunk，按需下载，首包显著变小。
 */
const AiHubPage = lazy(() => import('@/pages/AiHubPage').then((m) => ({ default: m.AiHubPage })));
const WritingDeskPage = lazy(() =>
  import('@/pages/WritingDeskPage').then((m) => ({ default: m.WritingDeskPage })),
);
const StartWizardPage = lazy(() =>
  import('@/pages/StartWizardPage').then((m) => ({ default: m.StartWizardPage })),
);
const SettingsLibraryPage = lazy(() =>
  import('@/pages/SettingsLibraryPage').then((m) => ({ default: m.SettingsLibraryPage })),
);
const AuditPage = lazy(() => import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })));
const ConfigPage = lazy(() => import('@/pages/ConfigPage').then((m) => ({ default: m.ConfigPage })));

/** 大纲已并入设定库 Tab（2026-09-24 导航精简）；旧地址 / 外部深链一律重定向过去 */
function OutlineRedirect() {
  const { slug = '' } = useParams();
  return <Navigate to={`/book/${encodeURIComponent(slug)}/settings?tab=outline`} replace />;
}

const PageFallback = <p className="pageSubtitle">加载中…</p>;

/**
 * 路由表（导航精简 2026-09-24：9 项 → 7 项，统计页删除，大纲并入设定库 Tab）：
 *   /                       书库
 *   /chat                   AI 助手（**无作品也能进**：先选作品才开聊）
 *   /book/:slug/start       开书向导（新建作品后的默认落点）
 *   /book/:slug/chat        AI 助手（带作品）
 *   /book/:slug/desk        写作台（核心页，自有三栏骨架）
 *   /book/:slug/settings    设定库（人物 / 世界 / 伏笔 / 大纲 四个 Tab）
 *   /book/:slug/outline     旧地址 → 重定向到设定库大纲 Tab
 *   /book/:slug/audit       质检
 *   /book/:slug/config      设置
 *   /config                 设置（**无作品也可进**：模型配置是全局的）
 */
export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={PageFallback}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/chat" element={<AiHubPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/book/:slug/start" element={<StartWizardPage />} />
            <Route path="/book/:slug/chat" element={<AiHubPage />} />
            <Route path="/book/:slug/settings" element={<SettingsLibraryPage />} />
            <Route path="/book/:slug/outline" element={<OutlineRedirect />} />
            <Route path="/book/:slug/audit" element={<AuditPage />} />
            <Route path="/book/:slug/config" element={<ConfigPage />} />
            <Route path="/book/:slug" element={<Navigate to="desk" replace />} />
          </Route>
          <Route path="/book/:slug/desk" element={<WritingDeskPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <ToastViewport />
    </BrowserRouter>
  );
}
