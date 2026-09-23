import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ToastViewport } from '@/components/common/Toast';
import { LibraryPage } from '@/pages/LibraryPage';
import { AiHubPage } from '@/pages/AiHubPage';
import { WritingDeskPage } from '@/pages/WritingDeskPage';
import { StartWizardPage } from '@/pages/StartWizardPage';
import { SettingsLibraryPage } from '@/pages/SettingsLibraryPage';
import { OutlinePage } from '@/pages/OutlinePage';
import { AuditPage } from '@/pages/AuditPage';
import { StatsPage } from '@/pages/StatsPage';
import { ConfigPage } from '@/pages/ConfigPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * 路由表（Spec §7 锁定，不得改名）：
 *   /                       书库
 *   /chat                   AI 助手（**无作品也能进**：先选作品才开聊）
 *   /book/:slug/start       开书向导（按六阶段：立项 → 骨架 → 包装，出口交棒写稿）
 *                           **新建作品后的默认落点** —— 不再直接丢进空白编辑器
 *   /book/:slug/chat        AI 助手（带作品：有记忆、有对话，退出再进来还能接着做）
 *   /book/:slug/desk        写作台（核心页，自有三栏骨架）
 *   /book/:slug/settings    设定库
 *   /book/:slug/outline     大纲
 *   /book/:slug/audit       质检（04 §5.4：一致性审校 / 去 AI 味 / 敏感词）
 *   /book/:slug/stats       统计
 *   /book/:slug/config      设置
 *   /config                 设置（**无作品也可进**：模型配置是全局的，不该被"先开一部作品"挡住）
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/chat" element={<AiHubPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/book/:slug/start" element={<StartWizardPage />} />
          <Route path="/book/:slug/chat" element={<AiHubPage />} />
          <Route path="/book/:slug/settings" element={<SettingsLibraryPage />} />
          <Route path="/book/:slug/outline" element={<OutlinePage />} />
          <Route path="/book/:slug/audit" element={<AuditPage />} />
          <Route path="/book/:slug/stats" element={<StatsPage />} />
          <Route path="/book/:slug/config" element={<ConfigPage />} />
          <Route path="/book/:slug" element={<Navigate to="desk" replace />} />
        </Route>
        <Route path="/book/:slug/desk" element={<WritingDeskPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ToastViewport />
    </BrowserRouter>
  );
}
