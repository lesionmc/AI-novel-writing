import { Icon } from '@/components/common/Icon';
import styles from './sensitive.module.css';

export interface WordlistBannerProps {
  /** 词库是否已配置；null = 状态还没查出来（此时不误报「未配置」） */
  configured: boolean | null;
  /** 已配置的词条数（状态未就绪时为 undefined） */
  count?: number;
  /** 点「查看格式说明」 */
  onShowFormat: () => void;
}

/**
 * 「敏感词自查」区块顶部的**常驻**说明（team-lead 裁决：需自备词表要前置）。
 * 让用户在点「扫描整本书」之前就知道：这是需要自己准备词表的可选功能。
 * 未配置 → 醒目样式把话说透；已配置 → 收成一行低调文案，不一直占着地方喊。
 * 两种状态都给「查看格式说明」的直达入口。
 */
export function WordlistBanner({ configured, count, onShowFormat }: WordlistBannerProps) {
  return (
    <div
      className={[styles.wordlistBanner, configured === false ? styles.wordlistBannerAlert : '']
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name="info" size={16} className={styles.bannerIcon} />
      <span className={styles.bannerText}>
        {configured === false
          ? '这是可选功能，需要你自己准备一份词表（当前还没配置）。'
          : `这是可选功能，用你自己准备的一份词表来匹配${
              count !== undefined ? `（已配置 ${count} 条）` : ''
            }。`}
      </span>
      <button type="button" className={styles.bannerLink} onClick={onShowFormat}>
        查看格式说明
      </button>
    </div>
  );
}
