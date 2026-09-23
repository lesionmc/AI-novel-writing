import type { Provider, ProviderTestResponse } from '@/types/api';
import { providerLabel, TASK_ROLE_LABELS } from '@/lib/labels';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { ConnectionTestBadge } from './ConnectionTestBadge';
import { rolesOf } from './providers';
import styles from './config.module.css';

export interface ProviderCardProps {
  provider: Provider;
  /** 最近一次连通测试结果（契约 `LLMProvider` 不含 connected/latency_ms，由父级暂存） */
  test: ProviderTestResponse | null;
  testing: boolean;
  busy: boolean;
  onTest: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onSetDefault: (provider: Provider) => void;
  onToggleEnabled: (provider: Provider, enabled: boolean) => void;
}

/** 单个模型卡片：服务商 / 模型 / 连通 / 密钥引用 / 任务角色 / 行操作 */
export function ProviderCard({
  provider,
  test,
  testing,
  busy,
  onTest,
  onEdit,
  onDelete,
  onSetDefault,
  onToggleEnabled,
}: ProviderCardProps) {
  // 契约 `is_default` / `enabled` 为 integer(0/1)，显示前显式转 boolean
  const isDefault = Boolean(provider.is_default);
  const enabled = Boolean(provider.enabled);
  return (
    <div className={[styles.providerCard, enabled ? '' : styles.providerCardDisabled].filter(Boolean).join(' ')}>
      <div className={styles.providerHead}>
        <div className={styles.providerNameWrap}>
          <Icon name="plug" size={20} className={styles.providerIcon} />
          <span className={styles.providerName}>{providerLabel(provider.provider)}</span>
          <span className={styles.providerModel}>{provider.model}</span>
          {isDefault ? <Badge variant="accent">默认</Badge> : null}
          {/* 角色以 `task_roles`（可多个）为准；一个模型干几件事就挂几个徽标 */}
          {rolesOf(provider).map((role) => (
            <Badge key={role} variant="primary" icon="target">
              {TASK_ROLE_LABELS[role]}
            </Badge>
          ))}
          {!enabled ? <Badge variant="neutral">已停用</Badge> : null}
        </div>
        <ConnectionTestBadge
          connected={test ? test.ok : null}
          latencyMs={test?.latency_ms ?? null}
          testing={testing}
        />
      </div>

      <div className={styles.providerMeta}>
        <span className={styles.providerMetaItem}>
          <Icon name="link" size={16} />
          {provider.base_url || '使用默认地址'}
        </span>
        <span className={styles.providerMetaItem}>
          <Icon name="key" size={16} />
          {/* 这里显示的是**密钥环里的引用名**，不是密钥本身。
              原先写成「密钥：ai-novel-1477cbf6…」，那串十六进制长得就像密钥，
              新手会以为自己填的 Key 就是这个（真实浏览器快照里能直接看到这个误解风险）。
              改成明确说"已保存 + 内部标识"，既不误导又能留一点排查线索。 */}
          {provider.key_ref ? `密钥已保存（内部标识 ${provider.key_ref}）` : '未设置密钥'}
        </span>
      </div>

      <div className={styles.providerActions}>
        <Button size="sm" variant="secondary" icon="plug" loading={testing} disabled={busy} onClick={() => onTest(provider)}>
          测试连通
        </Button>
        <Button size="sm" variant="ghost" icon="edit" disabled={busy} onClick={() => onEdit(provider)}>
          编辑
        </Button>
        {!isDefault ? (
          <Button size="sm" variant="ghost" icon="check" disabled={busy} onClick={() => onSetDefault(provider)}>
            设为默认
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          icon={enabled ? 'close' : 'check'}
          disabled={busy}
          onClick={() => onToggleEnabled(provider, !enabled)}
        >
          {enabled ? '停用' : '启用'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="trash"
          disabled={busy}
          aria-label={`删除 ${providerLabel(provider.provider)}`}
          title="删除"
          onClick={() => onDelete(provider)}
        />
      </div>
    </div>
  );
}
