import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { bookPath } from '@/lib/slug';
import styles from './hub.module.css';

/**
 * 「还没配模型」提示条。
 *
 * 红线 3：**没配模型不许把整页禁用**。所以这里只是页内一条诚实提示 + 一个去配置的入口，
 * 会话列表、对话记录、右栏都照常可用；而且被拦的只有"要读正文给模型看"的那几项 ——
 * 敏感词自查是纯本地词库匹配，没配模型照样能跑（底栏会另说）。
 */
export function ModelWarn({ slug }: { slug: string }) {
  return (
    <div className={styles.warnBar}>
      <Icon name="warning" size={16} />
      <span>
        还没配好 AI 模型，所以现在还不能对话、校对和审校。配一个就能用了，你的对话会留在这儿。
        （「敏感词」是本地词库匹配，不用模型也能扫。）
      </span>
      <Link to={bookPath(slug, '/config')}>
        <Button variant="secondary" size="sm" icon="settings">
          去配置模型
        </Button>
      </Link>
    </div>
  );
}
