import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { AppShell } from '@/components/layout/AppShell';

export function NotFoundPage() {
  return (
    <AppShell>
      <main className="pageContent">
        <EmptyState
          icon="error"
          title="这个地址没有对应的页面"
          description="链接可能已经失效，或者作品已被移入回收目录。回到书库看看当前有哪些作品。"
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Link to="/" style={{ fontWeight: 'var(--font-weight-medium)' }}>
            返回书库
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
