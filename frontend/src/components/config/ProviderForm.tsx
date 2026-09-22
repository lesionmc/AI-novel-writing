import type { ProviderName, ProviderTestResponse, TaskRole } from '@/types/api';
import { PROVIDER_LABELS, TASK_ROLE_HINTS, TASK_ROLE_LABELS } from '@/lib/labels';
import { Button } from '@/components/common/Button';
import { Combobox } from '@/components/common/Combobox';
import { Icon } from '@/components/common/Icon';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { KeyInput } from './KeyInput';
import { DEFAULT_BASE_URL, type ModelActionsState, type ProviderFormValue } from './providers';
import styles from './config.module.css';
import picker from './ModelActions.module.css';

const PROVIDER_OPTIONS = (Object.keys(PROVIDER_LABELS) as ProviderName[]).map((v) => ({
  value: v,
  label: PROVIDER_LABELS[v],
}));

const ROLE_OPTIONS = (Object.keys(TASK_ROLE_LABELS) as TaskRole[]).map((v) => ({
  value: v,
  label: TASK_ROLE_LABELS[v],
}));

export interface ProviderFormProps {
  formId: string;
  value: ProviderFormValue;
  onChange: (patch: Partial<ProviderFormValue>) => void;
  modelError?: string;
  existingKeyRef?: string | null;
  modelActions: ModelActionsState;
}

/** 模型名的引导文案：后端 note > 拉取结果 > 通用引导（新手不知道填什么） */
function modelHint(a: ModelActionsState): string {
  if (a.note) return a.note;
  if (a.discoveredCount === null) {
    return '不知道填什么？点「拉取模型」把平台可用的模型列出来，也可以直接手填。';
  }
  if (a.discoveredCount === 0) {
    return '没找到可用模型，请检查接入地址与密钥——也可以直接手填模型名。';
  }
  return `已找到 ${a.discoveredCount} 个模型：下拉选一个，或直接输入新的模型名。`;
}

/** 连通测试结果行：成功绿对勾 + 延迟；失败红色可读文案（绝不显示原始报错） */
function DraftTestLine({ result }: { result: ProviderTestResponse | null }) {
  if (!result) return null;
  if (result.ok) {
    const latency = result.latency_ms !== null ? ` · ${result.latency_ms}ms` : '';
    return (
      <span className={picker.ok} role="status">
        <Icon name="check" size={16} />
        连通{latency}
      </span>
    );
  }
  return (
    <span className={picker.fail} role="status">
      <Icon name="error" size={16} />
      {result.error ?? '连接失败，请检查模型名称、接入地址与密钥'}
    </span>
  );
}

/** 模型配置表单：服务商 / 模型 / 接入地址 / 密钥 / 任务角色 / 默认与启用 */
export function ProviderForm({
  formId,
  value,
  onChange,
  modelError,
  existingKeyRef,
  modelActions,
}: ProviderFormProps) {
  return (
    <form id={formId} className={styles.providerList} onSubmit={(e) => e.preventDefault()} noValidate>
      <Select
        label="服务商"
        options={PROVIDER_OPTIONS}
        value={value.provider}
        onChange={(e) => {
          const provider = e.target.value as ProviderName;
          // 切换服务商时，接入地址要跟着走 —— 否则用户选了「智谱」却还拿着
          // deepseek 的地址去请求，必然拉不到模型（这正是线上踩到的 bug）。
          //
          // 但**不能无条件覆盖**：若用户手动改过地址（自建/中转），要保留他的输入。
          // 判据：当前地址为空、或恰等于「上一个服务商的内置默认值」→ 视为未手改，跟随切换。
          const prevDefault = DEFAULT_BASE_URL[value.provider] ?? '';
          const current = value.base_url.trim();
          const untouched = !current || current === prevDefault;
          onChange({
            provider,
            base_url: untouched ? (DEFAULT_BASE_URL[provider] ?? '') : value.base_url,
          });
        }}
      />

      {/* 顺序按用户配模型的自然流程排：
          选平台 → 填地址 → 填密钥 → 拉模型 → 选模型 → 测连接
          之前的顺序把「拉取模型」放在地址/密钥之前，用户点它时后端拿不到凭证，必然失败。 */}
      <Input
        label="接入地址"
        value={value.base_url}
        placeholder={DEFAULT_BASE_URL[value.provider]}
        hint="选好服务商后会自动填官方地址；自建或中转服务再改。"
        onChange={(e) => onChange({ base_url: e.target.value })}
      />

      <KeyInput
        value={value.api_key}
        existingRef={existingKeyRef}
        placeholder={value.provider === 'ollama' ? '本地服务通常无需密钥' : '粘贴你的 API Key'}
        hint="密钥保存进系统密钥环，数据库里只留引用名，界面永不回显。"
        onChange={(v) => onChange({ api_key: v })}
      />

      <div className={picker.actions}>
        <Button
          size="sm"
          variant="secondary"
          icon="retry"
          loading={modelActions.discovering}
          onClick={modelActions.onDiscover}
        >
          拉取模型
        </Button>
        <span className={picker.note}>从平台把可用模型列出来，选一个或直接手填</span>
      </div>

      <Combobox
        label="模型名称"
        required
        options={modelActions.options}
        value={value.model}
        error={modelError}
        placeholder="先点上面的「拉取模型」，或直接输入模型名"
        hint={modelHint(modelActions)}
        onChange={(model) => onChange({ model })}
      />

      <div className={picker.actions}>
        <Button
          size="sm"
          variant="secondary"
          icon="plug"
          loading={modelActions.testing}
          disabled={!value.model.trim()}
          onClick={modelActions.onTest}
        >
          测试连接
        </Button>
        <span className={picker.note}>只有这里通过，才说明密钥真的能用</span>
      </div>

      <DraftTestLine result={modelActions.result} />

      <Select
        label="任务角色"
        options={ROLE_OPTIONS}
        placeholder="不指定（仅作备用）"
        value={value.task_role ?? ''}
        onChange={(e) => onChange({ task_role: e.target.value ? (e.target.value as TaskRole) : null })}
        hint={value.task_role ? TASK_ROLE_HINTS[value.task_role] : '可以让不同服务商分工，也可以只用一个'}
      />

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={value.is_default}
          onChange={(e) => onChange({ is_default: e.target.checked })}
        />
        <span>
          <span className={styles.checkLabel}>设为默认模型</span>
          <br />
          <span className={styles.checkHint}>未单独指定任务角色时，一律用它。</span>
        </span>
      </label>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <span>
          <span className={styles.checkLabel}>启用</span>
          <br />
          <span className={styles.checkHint}>停用后不影响本地写作，只是不再调用它。</span>
        </span>
      </label>
    </form>
  );
}
