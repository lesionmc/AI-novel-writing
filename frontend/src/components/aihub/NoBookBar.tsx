import { Icon } from '@/components/common/Icon';
import { BookPicker } from './SessionRail';
import styles from './hub.module.css';

/**
 * 无作品模式的横幅：进来就能聊（写作问题、头脑风暴、出草稿都行），
 * 但「确认写入」需要落到具体的书 —— 在这里顺手关联，不必被先选作品挡住。
 */
export function NoBookBar() {
  return (
    <div className={styles.noBookBar}>
      <Icon name="info" size={16} />
      <span>当前没有关联作品 —— 照常聊；要让人物卡、大纲真的写进书里，选一部即可继续。</span>
      <BookPicker slug="" />
    </div>
  );
}
