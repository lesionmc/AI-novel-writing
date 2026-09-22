import { useState } from 'react';
import type { Provider, ProviderTestResponse, ProviderUpdateRequest, ProviderWriteRequest } from '@/types/api';
import { useModelDiscovery } from '@/hooks/useModelDiscovery';
import { useProviders } from '@/hooks/queries';
import {
  useCreateProvider,
  useDeleteProvider,
  useTestProvider,
  useUpdateProvider,
} from '@/hooks/mutations/providers';
import { providerLabel } from '@/lib/labels';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Modal } from '@/components/common/Modal';
import { SkeletonRows } from '@/components/common/Skeleton';
import { toast } from '@/stores/toastStore';
import { ProviderCard } from './ProviderCard';
import { ProviderForm } from './ProviderForm';
import { DEFAULT_BASE_URL, type ProviderFormValue } from './providers';
import styles from './config.module.css';

const FORM_ID = 'provider-form';

const BLANK: ProviderFormValue = {
  provider: 'deepseek',
  model: '',
  base_url: DEFAULT_BASE_URL.deepseek,
  api_key: '',
  task_role: null,
  is_default: false,
  enabled: true,
};

function toFormValue(p: Provider): ProviderFormValue {
  return {
    provider: p.provider,
    model: p.model,
    base_url: p.base_url ?? '',
    api_key: '', // 明文永不回显；留空表示不修改
    task_role: p.task_role,
    is_default: Boolean(p.is_default),
    enabled: Boolean(p.enabled),
  };
}

/** 已配置模型列表 + 增删改 + 连通测试（R5） */
export function ProviderList() {
  const query = useProviders();
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const remove = useDeleteProvider();
  const test = useTestProvider();

  const [editing, setEditing] = useState<Provider | 'new' | null>(null);
  const [value, setValue] = useState<ProviderFormValue>(BLANK);
  const [modelError, setModelError] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  /** 连通测试结果按 id 暂存（契约 `LLMProvider` 不含 connected/latency_ms） */
  const [testResults, setTestResults] = useState<Record<number, ProviderTestResponse>>({});

  /** 「拉取模型 / 测试连接」（均不落库）：状态与行为收在 hook 里 */
  const discovery = useModelDiscovery(value, () => setModelError('模型名称不能为空'));

  const providers = query.data ?? [];
  const saving = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;

  const openNew = () => {
    setEditing('new');
    setValue(BLANK);
    setModelError(undefined);
    discovery.reset();
  };

  const openEdit = (p: Provider) => {
    setEditing(p);
    setValue(toFormValue(p));
    setModelError(undefined);
    discovery.reset();
  };

  const close = () => {
    setEditing(null);
    create.reset();
    update.reset();
    discovery.reset();
  };

  const patch = (p: Partial<ProviderFormValue>) => {
    setValue((v) => ({ ...v, ...p }));
    if (p.model !== undefined && modelError) setModelError(undefined);
    discovery.invalidate(p);
  };

  const submit = () => {
    if (!value.model.trim()) {
      setModelError('模型名称不能为空');
      return;
    }
    const key = value.api_key.trim();

    if (editing === 'new') {
      // 契约 `required: [provider, model, api_key]` —— api_key 必带（本地 ollama 可传空串）
      // `task_role` 选「不指定」时**整字段省略**：后端 `ProviderCreate.task_role` 是
      // 非空 Literal（默认 content），传 null 会被校验拒成 400（真后端已验）。
      const payload: ProviderWriteRequest = {
        provider: value.provider,
        model: value.model.trim(),
        api_key: key,
        base_url: value.base_url.trim() || null,
        ...(value.task_role ? { task_role: value.task_role } : {}),
      };
      create.mutate(payload, {
        onSuccess: () => {
          toast.success('已添加模型');
          close();
        },
      });
    } else if (editing) {
      // 契约 `is_default` / `enabled` 为 integer(0/1)；api_key 仅在更换时传
      // `task_role` 同理省略：后端新语义下 null = 不修改，省略才是「别动它」的
      // 清晰表达（旧版传 null 会 500）。
      const payload: ProviderUpdateRequest = {
        model: value.model.trim(),
        base_url: value.base_url.trim() || null,
        is_default: value.is_default ? 1 : 0,
        enabled: value.enabled ? 1 : 0,
        ...(value.task_role ? { task_role: value.task_role } : {}),
      };
      if (key) payload.api_key = key;
      update.mutate(
        { id: editing.id, payload },
        {
          onSuccess: () => {
            toast.success('模型配置已保存');
            close();
          },
        },
      );
    }
  };

  const runTest = (p: Provider) => {
    setTestingId(p.id);
    test.mutate(p.id, {
      onSuccess: (res) => {
        setTestResults((m) => ({ ...m, [p.id]: res }));
        if (res.ok) toast.success(`${providerLabel(p.provider)} 连通正常`);
        else toast.error(res.error ?? `${providerLabel(p.provider)} 连通失败`);
      },
      onSettled: () => setTestingId(null),
    });
  };

  const setDefault = (p: Provider) => {
    setBusyId(p.id);
    update.mutate(
      { id: p.id, payload: { is_default: 1 } },
      {
        onSuccess: () => toast.success('已设为默认模型'),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const toggleEnabled = (p: Provider, enabled: boolean) => {
    setBusyId(p.id);
    update.mutate(
      { id: p.id, payload: { enabled: enabled ? 1 : 0 } },
      {
        onSuccess: () => toast.success(enabled ? '已启用' : '已停用'),
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <>
      <div className={styles.providerActions} style={{ marginBottom: 'var(--space-4)' }}>
        <Button variant="primary" icon="plus" onClick={openNew}>
          添加模型
        </Button>
      </div>

      {query.isPending ? (
        <div className={styles.stateWrap}>
          <SkeletonRows count={2} />
        </div>
      ) : query.isError ? (
        <div className={styles.stateWrap}>
          <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : providers.length === 0 ? (
        <EmptyState
          icon="model"
          title="还没有配置模型"
          description="配好一个模型后，大纲展开、回写建议和设定对话才会亮起来。不影响本地写作。"
          actionLabel="添加第一个模型"
          onAction={openNew}
        />
      ) : (
        <div className={styles.providerList}>
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              test={testResults[p.id] ?? null}
              testing={testingId === p.id}
              busy={busyId === p.id}
              onTest={runTest}
              onEdit={openEdit}
              onDelete={setDeleting}
              onSetDefault={setDefault}
              onToggleEnabled={toggleEnabled}
            />
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        size="lg"
        title={editing === 'new' ? '添加模型' : '编辑模型'}
        subtitle="密钥只写进系统密钥环，数据库里只留一个引用名。"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={saving}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={submit}>
              保存
            </Button>
          </>
        }
      >
        {saveError ? (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <ErrorBar error={saveError} />
          </div>
        ) : null}
        <ProviderForm
          formId={FORM_ID}
          value={value}
          onChange={patch}
          modelError={modelError}
          existingKeyRef={editing === 'new' ? null : editing?.key_ref ?? null}
          modelActions={discovery.actions}
        />
      </Modal>

      {deleting ? (
        <ConfirmDialog
          open
          title="删除这个模型配置？"
          confirmLabel="删除"
          cancelLabel="取消"
          loading={remove.isPending}
          onCancel={() => {
            remove.reset();
            setDeleting(null);
          }}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success('模型配置已删除');
                setDeleting(null);
              },
            })
          }
        >
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            将删除「{providerLabel(deleting.provider)} · {deleting.model}」的配置。已写好的正文与设定不受影响。
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
