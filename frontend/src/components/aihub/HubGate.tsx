import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { BookPicker } from './SessionRail';
import styles from './hub.module.css';

/** 一部作品都没有时的落地页：说清楚为什么要先选作品，并给出口。 */
export function HubGate() {
  return (
    <div className={styles.gate}>
      <div className={styles.gateCard}>
        <span className={styles.avatar} aria-hidden="true">
          <Icon name="chat" size={20} />
        </span>
        <h1 className={styles.gateTitle}>AI 助手</h1>
        <p className={styles.gateText}>
          这里可以跟 AI 聊着把整本书的活干完：加人物、排后面的情节、接着写正文。
          它记得你这本书的设定、人物、伏笔和大纲，退出再进来还能接着上次继续。
        </p>
        <p className={styles.gateText}>
          <strong>先选一部作品</strong>，AI 才能记住你的设定。
        </p>
        <div className={styles.gateRow}>
          <BookPicker slug="" />
          <Link to="/">
            <Button variant="secondary" icon="book">
              先去书库
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
