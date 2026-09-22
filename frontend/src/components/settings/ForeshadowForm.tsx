import type { ForeshadowStatus, ForeshadowWriteRequest, Importance } from '@/types/api';
import { FORESHADOW_STATUS_LABELS, IMPORTANCE_LABELS } from '@/lib/labels';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Textarea } from '@/components/common/Textarea';
import styles from './settings.module.css';

const STATUS_OPTIONS = (Object.keys(FORESHADOW_STATUS_LABELS) as ForeshadowStatus[]).map((v) => ({
  value: v,
  label: FORESHADOW_STATUS_LABELS[v],
}));

const IMPORTANCE_OPTIONS = (Object.keys(IMPORTANCE_LABELS) as Importance[]).map((v) => ({
  value: v,
  label: IMPORTANCE_LABELS[v],
}));

export interface ForeshadowFormProps {
  formId: string;
  value: ForeshadowWriteRequest;
  onChange: (patch: Partial<ForeshadowWriteRequest>) => void;
  titleError?: string;
}

/** 伏笔新建 / 编辑表单：标题、状态、重要度、埋设与回收章、备注 */
export function ForeshadowForm({ formId, value, onChange, titleError }: ForeshadowFormProps) {
  return (
    <form
      id={formId}
      className={styles.formStack}
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      <Input
        label="线索标题"
        required
        value={value.title}
        error={titleError}
        placeholder="例如：师父留下的半块玉佩"
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <div className={styles.formGrid}>
        <Select
          label="状态"
          options={STATUS_OPTIONS}
          value={value.status ?? 'open'}
          onChange={(e) => onChange({ status: e.target.value as ForeshadowStatus })}
        />
        <Select
          label="重要度"
          options={IMPORTANCE_OPTIONS}
          value={value.importance ?? 'medium'}
          onChange={(e) => onChange({ importance: e.target.value as Importance })}
        />
      </div>
      <div className={styles.formGrid}>
        <Input
          label="埋设章"
          type="number"
          min={1}
          value={value.planted_chapter_seq ?? ''}
          placeholder="例如：3"
          onChange={(e) =>
            onChange({ planted_chapter_seq: e.target.value ? Number(e.target.value) : null })
          }
        />
        <Input
          label="计划回收章"
          type="number"
          min={1}
          value={value.planned_payoff_seq ?? ''}
          placeholder="打算第几章揭晓"
          onChange={(e) =>
            onChange({ planned_payoff_seq: e.target.value ? Number(e.target.value) : null })
          }
        />
      </div>
      <Textarea
        label="备注"
        rows={3}
        value={value.note ?? ''}
        placeholder="写下这条线索的意图，以及之后要兑现的细节"
        onChange={(e) => onChange({ note: e.target.value })}
      />
    </form>
  );
}
