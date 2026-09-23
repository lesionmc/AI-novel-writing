import type { ReactNode } from 'react';
import type { CharacterRole, CharacterStatus, CharacterWriteRequest } from '@/types/api';
import { CHARACTER_STATUS_LABELS, ROLE_LABELS } from '@/lib/labels';
import {
  CONTRADICTION_OPTIONS,
  FATAL_WEAKNESS_OPTIONS,
  SECRET_DESIRE_OPTIONS,
  SURFACE_IDENTITY_OPTIONS,
} from '@/lib/characterOptions';
import { Combobox } from '@/components/common/Combobox';
import { FieldWithHint } from '@/components/common/FieldWithHint';
import { Icon } from '@/components/common/Icon';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Textarea } from '@/components/common/Textarea';
import type { IconName } from '@/types/ui';
import styles from './settings.module.css';

export interface CharacterFormProps {
  formId: string;
  value: CharacterWriteRequest;
  onChange: (patch: Partial<CharacterWriteRequest>) => void;
  nameError?: string;
}

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as CharacterRole[]).map((v) => ({
  value: v,
  label: ROLE_LABELS[v],
}));

const STATUS_OPTIONS = (Object.keys(CHARACTER_STATUS_LABELS) as CharacterStatus[]).map((v) => ({
  value: v,
  label: CHARACTER_STATUS_LABELS[v],
}));

/** 分组容器（对应「立体人物公式」的四个段落） */
function CharacterFormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <section className={styles.formSection}>
      <h3 className={styles.formSectionTitle}>
        <Icon name={icon} size={16} />
        {title}
      </h3>
      <div className={styles.formSectionBody}>{children}</div>
    </section>
  );
}

/**
 * 人物卡编辑表单 —— 按「立体人物公式」四要素分组。
 * 四要素字段**必须带灰色说明文字**（04 §5.2），不让用户面对光秃字段。
 */
export function CharacterForm({ formId, value, onChange, nameError }: CharacterFormProps) {
  const tagsText = (value.tags ?? []).join('、');

  return (
    <form
      id={formId}
      className={styles.formStack}
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      <CharacterFormSection title="基本信息" icon="user">
        <div className={styles.formGrid}>
          <Input
            label="姓名"
            required
            value={value.name}
            error={nameError}
            placeholder="例如：张三"
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <Input
            label="别名 / 称号"
            value={value.alias ?? ''}
            placeholder="例如：断剑客"
            onChange={(e) => onChange({ alias: e.target.value })}
          />
          <Select
            label="定位"
            options={ROLE_OPTIONS}
            value={value.role ?? 'supporting'}
            onChange={(e) => onChange({ role: e.target.value as CharacterRole })}
          />
          <Select
            label="存活状态"
            options={STATUS_OPTIONS}
            value={value.status ?? 'alive'}
            onChange={(e) => onChange({ status: e.target.value as CharacterStatus })}
          />
        </div>
      </CharacterFormSection>

      <CharacterFormSection title="人物内核 · 立体人物公式" icon="target">
        <FieldWithHint
          label="表面身份"
          hint="别人眼中的他：职业、身份、公开立场。点右侧箭头可从常用身份里挑一个，再改成自己的。"
        >
          <Combobox
            options={SURFACE_IDENTITY_OPTIONS}
            value={value.surface_identity ?? ''}
            placeholder="点箭头选一个，或直接输入"
            onChange={(v) => onChange({ surface_identity: v })}
          />
        </FieldWithHint>
        <FieldWithHint
          label="秘密欲望"
          hint="他嘴上要什么，心里其实要什么。驱动他做出选择的东西。拿不准就先挑一个套路。"
        >
          <Combobox
            options={SECRET_DESIRE_OPTIONS}
            value={value.secret_desire ?? ''}
            placeholder="点箭头选一个，或直接输入"
            onChange={(v) => onChange({ secret_desire: v })}
          />
        </FieldWithHint>
        <FieldWithHint
          label="致命弱点"
          hint="一击即溃的地方：恐惧、执念、软肋。反派靠它翻盘，主角靠它成长。"
        >
          <Combobox
            options={FATAL_WEAKNESS_OPTIONS}
            value={value.fatal_weakness ?? ''}
            placeholder="点箭头选一个，或直接输入"
            onChange={(v) => onChange({ fatal_weakness: v })}
          />
        </FieldWithHint>
        <FieldWithHint
          label="矛盾行为"
          hint="嘴上说的和实际做的不一致之处——这是人物活起来的关键。"
        >
          <Combobox
            options={CONTRADICTION_OPTIONS}
            value={value.contradiction ?? ''}
            placeholder="点箭头选一个，或直接输入"
            aria-label="矛盾行为"
            onChange={(v) => onChange({ contradiction: v })}
          />
        </FieldWithHint>
      </CharacterFormSection>

      <CharacterFormSection title="外观与背景" icon="quote">
        <Textarea
          label="外貌"
          rows={2}
          value={value.appearance ?? ''}
          onChange={(e) => onChange({ appearance: e.target.value })}
          hint="只需写会反复用到的特征，不必面面俱到"
        />
        <Textarea
          label="背景故事"
          rows={3}
          value={value.background ?? ''}
          onChange={(e) => onChange({ background: e.target.value })}
          hint="影响他当前行为的那部分过去即可"
        />
      </CharacterFormSection>

      <CharacterFormSection title="创作信息" icon="bookmark">
        <div className={styles.formGrid}>
          <Input
            label="首次出场章"
            type="number"
            min={1}
            value={value.first_chapter_seq ?? ''}
            placeholder="例如：3"
            onChange={(e) =>
              onChange({
                first_chapter_seq: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <Input
            label="标签"
            value={tagsText}
            placeholder="用中文顿号或逗号分隔，例如：旧识、南疆"
            onChange={(e) =>
              onChange({
                tags: e.target.value
                  .split(/[、,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      </CharacterFormSection>
    </form>
  );
}
