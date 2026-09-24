import { useParams } from 'react-router-dom';
import { AiHubWorkspace } from '@/components/aihub/AiHubWorkspace';

/**
 * AI 助手 `/chat`（无作品也能进）与 `/book/:slug/chat`（带作品）。
 *
 * 用 `key={slug}` 把工作区**按作品分段**：换作品时整块重挂载，
 * 会话 state 与它的 localStorage 存档因此天然按作品隔离
 * （不会把上一本的对话带到下一本，也不会拿新 slug 的键覆盖旧内容）。
 *
 * 没选作品时不拦路 —— 无作品模式直接开聊（服务端走空记忆包），要写进书里再关联作品。
 */
export function AiHubPage() {
  const { slug } = useParams();
  return <AiHubWorkspace key={slug ?? ''} slug={slug ?? ''} />;
}
