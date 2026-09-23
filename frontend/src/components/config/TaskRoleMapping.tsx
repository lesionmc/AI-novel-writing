import type { Provider, TaskRole } from '@/types/api';
import { providerLabel, TASK_ROLE_HINTS, TASK_ROLE_LABELS } from '@/lib/labels';
import { useUpdateProvider } from '@/hooks/mutations/providers';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { Select } from '@/components/common/Select';
import type { SelectOption } from '@/components/common/Select';
import { toast } from '@/stores/toastStore';
import { rolesOf } from './providers';
import styles from './config.module.css';

export interface TaskRoleMappingProps {
  providers: Provider[];
}

const ROLES = Object.keys(TASK_ROLE_LABELS) as TaskRole[];

/**
 * 「当前没有可用模型」的角色如实标注 —— 否则用户在界面上认真选了半天，
 * 其实那个下拉选了也跑不起来，只会让人以为软件坏了。
 *
 * 依据（2026-09-22 复核实测）：
 *   · `embedding` —— 代码路径完备，但需要平台提供嵌入模型才能真跑；
 *                    当前所用平台只有聊天模型，故实际上长期为空。
 *
 * **`review`（一致性审校）不在此列**：它已被质检页消费 ——
 * `pages/AuditPage.tsx` 渲染 `ConsistencySection`，该组件调
 * `api.auditConsistencyStream`，后端 `services/consistency_service.py`
 * 里 `require_client("review")`。这是产品最核心的防吃书能力，
 * 界面**绝不能**再标注它「暂不可用 / 选了不生效」。
 */
const ROLE_NOT_ACTIVE: Partial<Record<TaskRole, { badge: string; note: string }>> = {
  embedding: { badge: '需要嵌入模型', note: '需要平台提供「嵌入」模型，多数平台没有' },
};

/**
 * 任务级模型分配：写大纲 / 写正文 / 检查前后一致 / 记住全文各一个下拉。
 *
 * **一个模型可以同时承担多个角色**（2026-09-22 起）—— 分配时是把该角色
 * **加到**目标模型身上，不再把别的角色上的分配抢走。想一个模型全包，
 * 点顶部的「一个模型全包」一键指完，或逐项选同一个模型。
 * 一个角色也可以有多个候选模型（如实提示，实际生效的是其中默认/靠前的那个）。
 */
export function TaskRoleMapping({ providers }: TaskRoleMappingProps) {
  const update = useUpdateProvider();
  const enabled = providers.filter((p) => p.enabled);
  const options: SelectOption[] = enabled.map((p) => ({
    value: String(p.id),
    label: `${providerLabel(p.provider)} · ${p.model}`,
  }));
  /** 一键「全包」的目标模型：优先默认模型，其次第一条已启用模型 */
  const fallbackModel = enabled.find((p) => p.is_default === 1) ?? enabled[0];
  const coversAll =
    fallbackModel !== undefined && ROLES.every((r) => rolesOf(fallbackModel).includes(r));

  const assign = (role: TaskRole, raw: string) => {
    // 只看**已启用**的行：停用的模型不参与路由，把它当成"占着位置"会误导用户
    const holders = enabled.filter((p) => rolesOf(p).includes(role));
    const current = holders[0];

    if (raw === '') {
      // 现在真的能「解除分配」了：把该角色从当前承担者身上摘掉（原先没有这个能力）。
      if (!current) return;
      const next = rolesOf(current).filter((r) => r !== role);
      update.mutate(
        { id: current.id, payload: { task_roles: next } },
        {
          onSuccess: () => {
            const rest = holders.slice(1).map((p) => `${providerLabel(p.provider)} · ${p.model}`);
            toast.success(
              rest.length > 0
                ? `已解除「${TASK_ROLE_LABELS[role]}」在这条上的分配；但它同时还挂在 ${rest.join('、')} 上。`
                : `已解除「${TASK_ROLE_LABELS[role]}」的分配`,
            );
          },
        },
      );
      return;
    }

    const nextId = Number(raw);
    const target = providers.find((p) => p.id === nextId);
    if (!target) return;
    const before = rolesOf(target);
    if (before.includes(role)) return; // 已经是它了，不必发请求
    const next = [...before, role];
    update.mutate(
      { id: nextId, payload: { task_roles: next } },
      {
        onSuccess: () =>
          toast.success(
            next.length > 1
              ? `已让 ${providerLabel(target.provider)} · ${target.model} 同时承担 ${next.length} 个角色`
              : `已把「${TASK_ROLE_LABELS[role]}」分配给 ${providerLabel(target.provider)} · ${target.model}`,
          ),
      },
    );
  };

  const coverAll = () => {
    if (!fallbackModel) return;
    const assigned = enabled.flatMap((p) => rolesOf(p)).filter(Boolean);
    const elsewhere = new Set(assigned.filter((r) => !rolesOf(fallbackModel).includes(r)));
    update.mutate(
      { id: fallbackModel.id, payload: { task_roles: ROLES } },
      {
        onSuccess: () =>
          toast.success(
            elsewhere.size > 0
              ? `已让 ${providerLabel(fallbackModel.provider)} 全包；其它模型上的旧分配仍在，可在下面逐项取消。`
              : `已让 ${providerLabel(fallbackModel.provider)} · ${fallbackModel.model} 一个模型全包`,
          ),
      },
    );
  };

  return (
    <div>
      {enabled.length > 0 ? (
        <div className={styles.roleToolbar}>
          <Button
            size="sm"
            variant="secondary"
            icon="sparkles"
            disabled={update.isPending || coversAll}
            onClick={coverAll}
          >
            一个模型全包
          </Button>
          <span className={styles.roleToolbarHint}>
            {fallbackModel
              ? `把这四件事都交给 ${providerLabel(fallbackModel.provider)} · ${fallbackModel.model}（${
                  fallbackModel.is_default === 1 ? '当前默认模型' : '第一条已启用模型'
                }）；也可以逐项选同一个模型。`
              : '先把模型启用起来。'}
          </span>
        </div>
      ) : null}

      {ROLES.map((role) => {
        // 一个角色可能有**多个**候选模型；下拉框只能显示一个值，多余的必须如实摊开，
        // 否则用户会以为配置丢了、或者以为改派没生效。（只算已启用的行 —— 与路由口径一致）
        const holders = enabled.filter((p) => rolesOf(p).includes(role));
        const current = holders[0];
        const inactive = ROLE_NOT_ACTIVE[role];
        return (
          <div key={role}>
            <div className={styles.roleRow}>
              <div className={styles.roleInfo}>
                <div className={styles.roleLabel}>
                  <Icon name="target" size={16} /> {TASK_ROLE_LABELS[role]}
                  {inactive ? <Badge>{inactive.badge}</Badge> : null}
                </div>
                <div className={styles.roleHint}>
                  {TASK_ROLE_HINTS[role]}
                  {inactive ? ` —— ${inactive.note}` : ''}
                </div>
              </div>
              <div className={styles.roleSelect}>
                <Select
                  options={options}
                  placeholder={
                    providers.length === 0
                      ? '尚未配置模型'
                      : enabled.length === 0
                        ? '没有已启用的模型'
                        : '不指定（用默认模型）'
                  }
                  value={current ? String(current.id) : ''}
                  disabled={enabled.length === 0}
                  aria-label={`为「${TASK_ROLE_LABELS[role]}」选择模型`}
                  onChange={(e) => assign(role, e.target.value)}
                />
              </div>
            </div>
            {!current ? (
              <div className={styles.roleHint}>
                还没指定：写作时会回落到默认模型（一个模型都不指定也能用）。
              </div>
            ) : null}
            {holders.length > 1 ? (
              <div className={styles.roleWarn} role="status">
                这个定位上其实有 {holders.length} 个模型：
                {holders
                  .map((p) => `${providerLabel(p.provider)} · ${p.model}`)
                  .join('、')}
                。下拉框只显示第一个，实际生效的是其中「默认/靠前」的那一个 ——
                想只留一个，请把多余的<b>解除分配</b>或在下方<b>停用</b>。
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
