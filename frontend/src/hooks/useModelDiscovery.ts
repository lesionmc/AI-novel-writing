import { useState } from 'react';
import type { ProviderTestResponse } from '@/types/api';
import { userMessageOf } from '@/api/client';
import { useDiscoverModels, useTestDraft } from '@/hooks/mutations/providers';
import { toast } from '@/stores/toastStore';
import type { ModelActionsState, ProviderFormValue } from '@/components/config/providers';

export interface ModelDiscovery {
  /** 交给 `ProviderForm` 展示与触发 */
  actions: ModelActionsState;
  /** 表单值变化时调用：换服务商/地址 → 作废模型列表；改模型名/密钥 → 作废连通结论 */
  invalidate: (patch: Partial<ProviderFormValue>) => void;
  /** 打开 / 关闭弹窗、保存成功后调用 */
  reset: () => void;
}

/**
 * 模型配置弹窗里的「拉取模型 / 测试连接」。
 * -----------------------------------------------------------------------------
 * 两个请求**都不落库**（discover-models / test-draft），因此不 invalidate 任何 query。
 * - 保存前就能测：`test-draft` 用当前表单值，不要求先建 provider 记录
 * - 编辑已有 provider 时 `api_key` 留空 → 后端自动复用密钥环里的 key
 */
export function useModelDiscovery(
  form: ProviderFormValue,
  onModelMissing: () => void,
): ModelDiscovery {
  const discover = useDiscoverModels();
  const testDraft = useTestDraft();
  const [options, setOptions] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [discoveredCount, setDiscoveredCount] = useState<number | null>(null);
  const [result, setResult] = useState<ProviderTestResponse | null>(null);

  const reset = () => {
    setOptions([]);
    setNote(null);
    setDiscoveredCount(null);
    setResult(null);
    discover.reset();
    testDraft.reset();
  };

  const invalidate = (patch: Partial<ProviderFormValue>) => {
    if (patch.provider !== undefined || patch.base_url !== undefined) {
      setOptions([]);
      setNote(null);
      setDiscoveredCount(null);
      setResult(null);
    } else if (patch.model !== undefined || patch.api_key !== undefined) {
      setResult(null);
    }
  };

  const onDiscover = () => {
    setResult(null);
    discover.mutate(
      {
        provider: form.provider,
        base_url: form.base_url.trim() || null,
        api_key: form.api_key.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          setOptions(res.models);
          setNote(res.note);
          setDiscoveredCount(res.count);
        },
        onError: (e) => toast.error(userMessageOf(e)),
      },
    );
  };

  const onTest = () => {
    if (!form.model.trim()) {
      onModelMissing();
      return;
    }
    testDraft.mutate(
      {
        provider: form.provider,
        model: form.model.trim(),
        base_url: form.base_url.trim() || null,
        api_key: form.api_key.trim() || undefined,
      },
      {
        onSuccess: (res) => setResult(res),
        onError: (e) => toast.error(userMessageOf(e)),
      },
    );
  };

  return {
    actions: {
      onDiscover,
      discovering: discover.isPending,
      options,
      note,
      discoveredCount,
      onTest,
      testing: testDraft.isPending,
      result,
    },
    invalidate,
    reset,
  };
}
