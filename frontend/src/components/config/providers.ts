import type { Provider, ProviderName, ProviderTestResponse, TaskRole } from '@/types/api';

/** 该模型承担的角色集合：**新字段 `task_roles` 为准**，缺省时回落到旧单值 `task_role`。 */
export function rolesOf(p: Pick<Provider, 'task_roles' | 'task_role'>): TaskRole[] {
  if (p.task_roles) return p.task_roles;
  return p.task_role ? [p.task_role] : [];
}

/**
 * 模型配置表单的可编辑值（**前端本地模型**）。
 * 契约里 `is_default` / `enabled` 是 integer(0/1)，表单里用 boolean，提交时再转换；
 * `api_key` 为明文输入（提交后写密钥环、不回显）。
 */
export interface ProviderFormValue {
  provider: ProviderName;
  model: string;
  base_url: string;
  api_key: string;
  /** 旧单值字段（提交时不再使用，仅保留读取以兼容旧数据/旧缓存） */
  task_role: TaskRole | null;
  /** 该模型承担的角色集合（可空 = 不分配，仅作默认回退候选） */
  task_roles: TaskRole[];
  is_default: boolean;
  enabled: boolean;
}

/**
 * 「拉取模型 / 测试连接」的对外状态。
 * 由 `useModelDiscovery` 产出、`ProviderForm` 消费，**不落库**。
 */
export interface ModelActionsState {
  /** 拉取平台可用模型 */
  onDiscover: () => void;
  discovering: boolean;
  /** 已拉取到的模型名（空数组 = 退化为纯手打输入） */
  options: string[];
  /** 后端 note，如「该平台不支持列出模型」——有值时优先用 hint 展示 */
  note: string | null;
  /** 本次拉取到的数量；null = 还没拉过 */
  discoveredCount: number | null;
  /** 保存前连通测试 */
  onTest: () => void;
  testing: boolean;
  result: ProviderTestResponse | null;
}

/** 各服务商的默认接入地址（仅作预填提示，可改） */
/**
 * 各服务商的内置默认接入地址。**不是白名单** —— 未列出的平台，
 * 用户在表单里自己填 base_url 即可（契约里 provider 是自由字符串）。
 */
export const DEFAULT_BASE_URL: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi: 'https://api.moonshot.cn/v1',
  claude: 'https://api.anthropic.com',
  ollama: 'http://localhost:11434',
  openrouter: 'https://openrouter.ai/api/v1',
  stepfun: 'https://api.stepfun.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  modelscope: 'https://api-inference.modelscope.cn/v1',
  custom: '',
};
