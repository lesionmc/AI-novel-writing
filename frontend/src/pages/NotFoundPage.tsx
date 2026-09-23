import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { AppShell } from '@/components/layout/AppShell';

/**
 * 兜底页：地址对不上任何路由。
 * 出口用 EmptyState 的 action（和书库 / 设定库 / 大纲的空态同一个按钮），
 * 不再单独摆一个居中文字链接 —— 那会让「页面不存在」这条最重要的出口
 * 反而比旁边的按钮更弱、更难点。
 */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <AppShell>
      <main className="pageContent">
        <EmptyState
          icon="error"
          title="这个地址没有对应的页面"
          description="链接可能已经失效，或者作品已被移入回收目录。回到书库看看当前有哪些作品。"
          actionLabel="返回书库"
          actionIcon="book"
          onAction={() => navigate('/')}
        />
      </main>
    </AppShell>
  );
}
