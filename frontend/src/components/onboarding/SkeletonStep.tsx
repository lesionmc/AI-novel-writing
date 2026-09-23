import { useNavigate } from 'react-router-dom';
import { bookPath } from '@/lib/slug';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { SKELETON_ITEMS, type GuideFacts } from './onboardingModel';
import styles from './onboarding.module.css';

export interface SkeletonStepProps {
  slug: string;
  facts: GuideFacts;
}

/**
 * 第 2 步：先把架子搭起来（指南 PHASE 2 骨架）。
 *
 * 向导在这里**只派活，不干活** —— 三张子卡片点了都跳到**已有页面**去录入
 * （设定库 / 大纲），避免在向导里再造一套录入界面、两边行为漂移。
 * 每张卡片显示「已有多少条」，让用户一眼看出还缺哪块。
 */
export function SkeletonStep({ slug, facts }: SkeletonStepProps) {
  const navigate = useNavigate();

  return (
    <>
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon="sparkles"
          onClick={() => navigate(bookPath(slug, '/settings', 'ai=1'))}
        >
          跟 AI 聊着把设定建起来
        </Button>
      </div>

      <div className={styles.skelGrid}>
        {SKELETON_ITEMS.map((item) => {
          const count = item.count(facts);
          const done = count > 0;
          return (
            <button
              key={item.key}
              type="button"
              className={[styles.skelItem, done ? styles.skelItemDone : ''].filter(Boolean).join(' ')}
              onClick={() => navigate(bookPath(slug, item.sub, item.search))}
            >
              <span className={styles.skelHead}>
                <span className={styles.skelLabel}>
                  <Icon name={done ? 'check' : 'plus'} size={16} aria-hidden="true" />
                  {item.label}
                </span>
                <span className={styles.skelCount}>{done ? `已有 ${count} 条` : '还没有'}</span>
              </span>
              <span className={styles.skelHint}>{item.hint}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
