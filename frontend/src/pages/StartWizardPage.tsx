import { useParams } from 'react-router-dom';
import { StartGuide } from '@/components/onboarding/StartGuide';

/**
 * 开书清单 `/book/:slug/start`（导航「写作台」左侧的一页）。
 *
 * 与 `OutlinePage` 同款：用 `key={slug}` 把整块**按作品分段** ——
 * 换作品时重挂载，`StartGuide` 里那两个按作品分键的 `useState` 初值
 * （已跳过步骤）因此天然隔离，不会把上一本的"已跳过"带到下一本。
 */
export function StartWizardPage() {
  const { slug = '' } = useParams();
  return <StartGuide key={slug} slug={slug} />;
}
