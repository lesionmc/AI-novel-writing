import type { Provider, TaskRole } from '@/types/api';
import { providerLabel, TASK_ROLE_HINTS, TASK_ROLE_LABELS } from '@/lib/labels';
import { useUpdateProvider } from '@/hooks/mutations/providers';
import { Badge } from '@/components/common/Badge';
import { Icon } from '@/components/common/Icon';
import { Select } from '@/components/common/Select';
import type { SelectOption } from '@/components/common/Select';
import { toast } from '@/stores/toastStore';
import styles from './config.module.css';

export interface TaskRoleMappingProps {
  providers: Provider[];
}

const ROLES = Object.keys(TASK_ROLE_LABELS) as TaskRole[];

/**
 * 「当前没有任何代码消费」的角色如实标注 —— 否则用户在界面上认真选了半天，
 * 其实那个下拉选了不生效，只会让人以为软件坏了。
 *
 * 依据（2026-09-22 复核实测）：
 *   · `review`    —— 一致性审校 SSE 是契约里**唯一 deferred**，全后端搜下来
 *                    只在类型定义与测试里出现，没有任何生产代码消费它；
 *   · `embedding` —— 代码路径完备，但需要平台提供嵌入模型才能真跑；
 *                    当前所用平台只有聊天模型，故实际上长期为空。
 *
 * 这两个角色一旦功能落地，**删掉对应条目即可**（不要留成永久免责声明）。
 */
const ROLE_NOT_ACTIVE: Partial<Record<TaskRole, string>> = {
  review: '功能尚未上线，选了暂时不生效',
  embedding: '需要平台提供「嵌入」模型，多数平台没有',
};

/**
 * 任务级模型分配：架构规划 / 正文生成 / 一致性审校 / 向量嵌入各一个下拉（约束 4）。
 * 一个服务商同一时刻只承担一个任务角色；改派时自动把上一个承担者清空。
 */
export function TaskRoleMapping({ providers }: TaskRoleMappingProps) {
  const update = useUpdateProvider();
  const options: SelectOption[] = providers
    .filter((p) => p.enabled)
    .map((p) => ({ value: String(p.id), label: `${providerLabel(p.provider)} · ${p.model}` }));

  const assign = (role: TaskRole, raw: string) => {
    const previous = providers.find((p) => p.task_role === role);

    if (raw === '') {
      // [契约限制] 后端 `llm_provider.task_role` 是 `NOT NULL DEFAULT 'content'`，且
      // PATCH 传 `task_role: null` 的语义是「**不修改**」而不是「清空」——即这套契约
      // **没有「解除分配」这个能力**。旧写法发 null 会被后端 500（真后端已验），
      // 修好之后也只会静默无效。所以这里如实告知，绝不弹一个假的「已取消」。
      if (previous) {
        toast.info(
          `「${TASK_ROLE_LABELS[role]}」暂时无法解除分配：每个模型都必须挂一个定位。` +
            `可以把它指给别的模型，或在下方停用 ${providerLabel(previous.provider)}。`,
        );
      }
      return;
    }

    const nextId = Number(raw);
    // 旧模型的定位无法自动清空，如实提示，避免「界面显示已改、实际两个模型挂在同一角色上」
    const warning = previous && previous.id !== nextId ? `（${providerLabel(previous.provider)} 的旧定位需要在下方改掉或停用）` : '';
    update.mutate(
      { id: nextId, payload: { task_role: role } },
      { onSuccess: () => toast.success(`已把「${TASK_ROLE_LABELS[role]}」分配给新模型${warning}`) },
    );
  };

  return (
    <div>
      {ROLES.map((role) => {
        // 一个定位可能有**多个**模型（`llm_provider.task_role` 是单值字段但 DB 层
        // 没有唯一约束，实测全局库里 `outline` 就被两条记录同时占用）。
        // 下拉框只能显示一个值 —— 此前用 `find()` 取第一个，多余的**完全隐形**，
        // 用户会以为配置丢了、或者以为改派没生效。这里把占位情况如实摊开。
        const holders = providers.filter((p) => p.task_role === role);
        const current = holders[0];
        return (
          <div key={role}>
            <div className={styles.roleRow}>
              <div className={styles.roleInfo}>
                <div className={styles.roleLabel}>
                  <Icon name="target" size={16} /> {TASK_ROLE_LABELS[role]}
                  {ROLE_NOT_ACTIVE[role] ? <Badge>未启用</Badge> : null}
                </div>
                <div className={styles.roleHint}>
                  {TASK_ROLE_HINTS[role]}
                  {ROLE_NOT_ACTIVE[role] ? ` —— ${ROLE_NOT_ACTIVE[role]}` : ''}
                </div>
              </div>
              <div className={styles.roleSelect}>
                <Select
                  options={options}
                  placeholder={providers.length === 0 ? '尚未配置模型' : '不指定'}
                  value={current ? String(current.id) : ''}
                  disabled={providers.length === 0}
                  aria-label={`为「${TASK_ROLE_LABELS[role]}」选择模型`}
                  onChange={(e) => assign(role, e.target.value)}
                />
              </div>
            </div>
            {holders.length > 1 ? (
              <div className={styles.roleWarn} role="status">
                这个定位上其实有 {holders.length} 个模型：
                {holders
                  .map((p) => `${providerLabel(p.provider)} · ${p.model}`)
                  .join('、')}
                。下拉框只会显示第一个 —— 请在下方把多余的<b>停用</b>或<b>改派</b>，
                否则实际生效的是哪一个并不确定。
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
