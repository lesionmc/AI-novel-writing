import type { UseQueryResult } from '@tanstack/react-query';
import type { RecallResponse } from '@/types/api';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { ErrorBar } from '@/components/common/ErrorBar';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import type { RightTab } from '@/stores/deskStore';
import { CharacterStateList } from './CharacterStateList';
import { ForeshadowList } from './ForeshadowList';
import { PlotArcList } from './PlotArcList';
import { RecalledChunkList } from './RecalledChunkList';
import { SettingsDigest } from './SettingsDigest';
import styles from './RecallPanel.module.css';

export interface RecallPanelProps {
  slug: string;
  chapterId: number | null;
  recall: UseQueryResult<RecallResponse>;
  /** 全局是否未配置模型（来自 capabilities.llm_configured，**非** recall 响应字段） */
  noModel: boolean;
  rightTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  onOpenConfig: () => void;
  onMarkClosed: (id: number) => void;
  markingId: number | null;
  onOpenProfile: (name: string) => void;
  /** 跳到片段所在章并高亮该片段（TC-33） */
  onJumpToChapter: (seq: number, text: string) => void;
}

/**
 * 右栏「本章提醒」面板（340px）—— 产品灵魂。
 * 分级展示（04 §3.1 / TC-29）：
 *   「待回收的线索」「本章人物」**默认展开**；「相关的旧段落」「故事线」**默认折叠**（只显示条数）。
 * 降级（红线 3）：未配置模型时，结构化召回照常展示，面板**绝不整体空白**（TC-19）。
 *
 * [展示层口语化] 「召回」对新手是天书（QA M1），界面上一律叫「本章提醒」；
 * 术语只保留在代码与内部文档里。
 */
export function RecallPanel({
  slug,
  chapterId,
  recall,
  noModel,
  rightTab,
  onTabChange,
  onOpenConfig,
  onMarkClosed,
  markingId,
  onOpenProfile,
  onJumpToChapter,
}: RecallPanelProps) {
  const data = recall.data;
  const loading = chapterId !== null && recall.isPending;

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="右栏内容">
        <button
          type="button"
          role="tab"
          aria-selected={rightTab === 'recall'}
          className={[styles.tab, rightTab === 'recall' ? styles.tabActive : ''].join(' ')}
          onClick={() => onTabChange('recall')}
        >
          <Icon name="target" size={16} />
          本章提醒
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rightTab === 'settings'}
          className={[styles.tab, rightTab === 'settings' ? styles.tabActive : ''].join(' ')}
          onClick={() => onTabChange('settings')}
        >
          <Icon name="user" size={16} />
          设定
        </button>
      </div>

      <div className={styles.scroll}>
        {chapterId === null ? (
          <EmptyState
            icon="chapter"
            title="还没有打开章节"
            description="在左侧选一章，这里会自动带出这一章需要记住的线索与人物状态。"
          />
        ) : rightTab === 'settings' ? (
          <SettingsDigest slug={slug} />
        ) : recall.isError ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <ErrorBar error={recall.error} onRetry={() => void recall.refetch()} />
          </div>
        ) : (
          <>
            {noModel ? (
              <div className={styles.degraded} role="status">
                <Icon name="info" size={16} />
                <div className={styles.degradedBody}>
                  <div className={styles.degradedTitle}>还没有配置 AI 模型</div>
                  <div>
                    人物状态与线索仍会正常显示（这部分不需要模型）。
                    {data && !data.budget.semantic_available
                      ? '「相关的旧段落」需要模型帮你联想，配置后才会出现。'
                      : ''}
                  </div>
                  <div className={styles.degradedAction}>
                    <Button size="sm" variant="secondary" icon="settings" onClick={onOpenConfig}>
                      去配置
                    </Button>
                  </div>
                </div>
              </div>
            ) : data && !data.budget.semantic_available ? (
              /* 已配模型、但语义路不可用 —— 此前这一段**完全没有提示**：
                 用户看到「相关的旧段落」恒为 0，却又被告知"还没配模型"（其实配了），
                 于是反复去模型配置页折腾，永远配不好。
                 真实原因有两个：没有 task_role='embedding' 的模型，或本地缺向量扩展。 */
              <div className={styles.degraded} role="status">
                <Icon name="info" size={16} />
                <div className={styles.degradedBody}>
                  <div className={styles.degradedTitle}>「相关的旧段落」暂时用不了</div>
                  <div>
                    它要两样东西：一个能干「向量嵌入」的模型（把你写过的章节变成可搜索的记忆），
                    以及本机的向量扩展。你现在的模型都只做写大纲/写正文 —— 这也正常，
                    多数平台只提供聊天模型、不提供嵌入模型。
                  </div>
                  <div>
                    人物状态和线索两栏是完整的，不受影响，照常写作即可。
                  </div>
                  <div className={styles.degradedAction}>
                    <Button size="sm" variant="secondary" icon="settings" onClick={onOpenConfig}>
                      看看模型配置
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <CollapsibleSection
              title="待回收的线索"
              icon="foreshadow"
              aging
              defaultOpen
              count={data?.open_foreshadows.length ?? 0}
            >
              <ForeshadowList
                items={data?.open_foreshadows ?? []}
                loading={loading}
                markingId={markingId}
                onMarkClosed={onMarkClosed}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="本章人物"
              icon="user"
              defaultOpen
              count={data?.characters.length ?? 0}
            >
              <CharacterStateList
                items={data?.characters ?? []}
                loading={loading}
                onOpenProfile={onOpenProfile}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="相关的旧段落"
              icon="search"
              defaultOpen={false}
              count={data?.recalled_chunks.length ?? 0}
              collapsedHint={
                data && data.recalled_chunks.length > 0
                  ? `最高相似度 ${Math.max(...data.recalled_chunks.map((c) => c.score)).toFixed(2)}`
                  : data && !data.budget.semantic_available
                    ? '暂时无法联想'
                    : undefined
              }
            >
              <RecalledChunkList
                items={data?.recalled_chunks ?? []}
                loading={loading}
                onJump={onJumpToChapter}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="剧情线"
              icon="plotArc"
              defaultOpen={false}
              count={data?.plot_arcs.length ?? 0}
            >
              <PlotArcList items={data?.plot_arcs ?? []} loading={loading} />
            </CollapsibleSection>
          </>
        )}
      </div>
    </div>
  );
}
