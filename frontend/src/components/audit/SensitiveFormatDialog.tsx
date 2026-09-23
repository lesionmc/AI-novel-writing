import { Modal } from '@/components/common/Modal';
import {
  SENSITIVE_CATEGORY_INPUT_ALIASES,
  SENSITIVE_CATEGORY_LABELS,
  SENSITIVE_CATEGORY_ORDER,
} from './auditLabels';
import styles from './sensitive.module.css';

export interface SensitiveFormatDialogProps {
  open: boolean;
  onClose: () => void;
  /** 词表应放的位置（来自词库状态；取不到时用默认相对路径） */
  path: string;
}

/**
 * 「查看格式说明」弹窗（词库缺失引导的落地页，`11-敏感词库说明.md` §3）。
 * 只讲格式与来源建议，不提供词库内容。
 */
export function SensitiveFormatDialog({ open, onClose, path }: SensitiveFormatDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="敏感词库格式说明" size="lg">
      <div className={styles.formatDoc}>
        <p>
          词表是一个纯文本文件，放在程序目录下的{' '}
          <span className={styles.wordlistPath}>{path}</span>。
        </p>
        <p>每行一个词条，格式是「词条,分类」，分类可以省略，省略时归入「其他」。</p>
        <p>也可用中文写分类，写「违法」和写 illegal 是一样的。</p>
        <pre className={styles.formatCode}>{`# 以 # 开头的行是注释，会被忽略
词条A,违法
词条B,低俗
词条C`}</pre>
        <div className={styles.formatList}>
          <span>可用的分类：</span>
          {SENSITIVE_CATEGORY_ORDER.map((c) => (
            <span key={c}>
              · {SENSITIVE_CATEGORY_LABELS[c]}（{c} / {SENSITIVE_CATEGORY_INPUT_ALIASES[c]}）
            </span>
          ))}
        </div>
        <p>
          词表由你自己准备，来源建议用目标平台的作者规范、自己被驳回的原因，或正规出版机构的编校规范。
          不建议用来路不明的「敏感词大全」。
        </p>
      </div>
    </Modal>
  );
}
