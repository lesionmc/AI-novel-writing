import { useNavigate, useParams } from 'react-router-dom';
import { useBook } from '@/hooks/queries';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { ConsistencySection } from '@/components/audit/ConsistencySection';
import { AiFlavorSection } from '@/components/audit/AiFlavorSection';
import { RhythmSection } from '@/components/audit/RhythmSection';
import { SensitiveSection } from '@/components/audit/SensitiveSection';

/**
 * 质检 `/book/:slug/audit`（04 §5.4）。
 * 四个独立区块：
 *   1) 一致性审校 —— 完整实现（SSE 流式，边审边出；可中断）
 *   2) 去 AI 味   —— 完整实现（单章）
 *   3) 节奏曲线   —— 完整实现（整本书，纯本地统计，标连续低洼段）
 *   4) 敏感词自查 —— 完整实现（整本书），含免责文案与词库缺失引导
 * 页面本身只做组装，细节在各区块组件里（对齐开发导览「场景 B：加一个页面」）。
 */
export function AuditPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  // 依赖「当前作品指针」这一隐含前提：useBook(slug) 会 GET /api/books/{slug}，
  // 后端 get_book() 顺手 workspace.set_active(slug)，把「当前作品」指针落到本作品。
  // 下方各区块的按 id 请求（章节 id / 作品 slug 解析）依赖这个指针才能落到同一部书上。
  // 所以本查询必须保持挂载 —— 不能因为「看起来只在 isError 时用到」就裁掉它。
  const bookQuery = useBook(slug);

  if (bookQuery.isError) {
    return (
      <main className="pageContent">
        <EmptyState
          icon="error"
          title="打不开这部作品"
          description="它可能已被移入回收目录。回到书库看看当前有哪些作品。"
          actionLabel="返回书库"
          actionIcon="book"
          onAction={() => navigate('/')}
        />
      </main>
    );
  }

  return (
    <main className="pageContent">
      <PageHeader
        title="质检"
        subtitle="写完之后逐层把关：① 通读全书找前后矛盾 ② 检查这一章读起来像不像机器写的 ③ 看逐章节奏有没有连续掉速 ④ 用你自己的词表扫一遍敏感词。结果都只作参考，改不改由你定。"
      />

      <ConsistencySection slug={slug} />
      <AiFlavorSection slug={slug} />
      <RhythmSection slug={slug} />
      <SensitiveSection slug={slug} />
    </main>
  );
}
