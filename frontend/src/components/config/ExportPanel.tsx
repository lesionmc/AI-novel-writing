import { useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { toast } from '@/stores/toastStore';
import styles from './config.module.css';

const FORMAT_OPTIONS = [
  { value: 'txt', label: '纯文本（.txt）' },
  { value: 'docx', label: 'Word 文档（.docx）' },
];

export interface ExportPanelProps {
  slug: string;
  /** 全书章节数，用于给「范围」一个合理提示 */
  chapterCount?: number;
}

/** 数据导出（R16）：txt / docx + 章节范围，完成后触发浏览器下载 */
export function ExportPanel({ slug, chapterCount }: ExportPanelProps) {
  const [format, setFormat] = useState<'txt' | 'docx'>('txt');
  const [range, setRange] = useState('');
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    setExporting(true);
    setError(null);
    try {
      await api.exportBook(slug, format, range.trim() || undefined);
      toast.success('导出完成，已开始下载');
    } catch (e) {
      setError(e);
    } finally {
      setExporting(false);
    }
  };

  const backup = async () => {
    setBackingUp(true);
    setError(null);
    try {
      await api.backupBook(slug);
      toast.success('备份已开始下载 —— 这是一份完整一致的整本 zip（含设定与版本）');
    } catch (e) {
      setError(e);
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div>
      {error ? (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <ErrorBar error={error} onRetry={() => void run()} />
        </div>
      ) : null}
      <div className={styles.exportRow}>
        <div className={styles.exportFormat}>
          <Select
            label="导出格式"
            options={FORMAT_OPTIONS}
            value={format}
            onChange={(e) => setFormat(e.target.value as 'txt' | 'docx')}
          />
        </div>
        <div className={styles.exportRange}>
          <Input
            label="章节范围"
            value={range}
            placeholder="例如 1-50"
            hint={chapterCount ? `留空导出全部 ${chapterCount} 章` : '留空导出全部'}
            onChange={(e) => setRange(e.target.value)}
          />
        </div>
        <Button variant="primary" icon="export" loading={exporting} onClick={() => void run()}>
          导出
        </Button>
      </div>
      <p className={styles.sectionHint}>
        导出的是「读的书稿」。要<b>备份或迁移整本书</b>（正文、设定库、版本历史、导出件），
        点下面的备份按钮。注意：模型配置与 API Key 存在系统密钥环、<b>不随备份走</b>，
        换电脑后需在新机器的「设置 → 模型配置」重新配一次。
      </p>
      <Button variant="secondary" icon="archive" loading={backingUp} onClick={() => void backup()}>
        整本备份（.zip）
      </Button>
    </div>
  );
}
