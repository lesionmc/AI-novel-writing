import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChapterBriefs, useOutlines } from '@/hooks/queries';
import { useChapterTree } from '@/hooks/useChapterTree';
import { bookPath } from '@/lib/slug';
import { ErrorBar } from '@/components/common/ErrorBar';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonRows } from '@/components/common/Skeleton';
import { Icon } from '@/components/common/Icon';
import { ChapterRow } from './ChapterRow';
import { TreeHeader } from './TreeHeader';
import styles from './ChapterTree.module.css';

export interface ChapterTreeProps {
  slug: string;
  activeChapterId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  creating: boolean;
}

/**
 * 左栏章节树（220px）：按卷分组、显示当前章、新建章节。
 * 数据源 `GET /api/books/{book}/chapters` —— 不含正文，200 章 <500ms（TC-13）。
 * 状态：loading 骨架行 / empty 引导新建 / error 就地错误条 + 重试。
 * 离线时本地数据照常展示（写操作由上层禁用）。
 */
export function ChapterTree({
  slug,
  activeChapterId,
  onSelect,
  onCreate,
  creating,
}: ChapterTreeProps) {
  const query = useChapterBriefs(slug);
  const outlines = useOutlines(slug);
  const groups = useChapterTree(query.data, outlines.data);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  return (
    <div className={styles.tree}>
      <TreeHeader count={query.data?.length ?? 0} onCreate={onCreate} creating={creating} />

      <div className={styles.scroll}>
        {query.isPending ? (
          <div className={styles.stateBox} aria-busy="true">
            <SkeletonRows count={6} />
          </div>
        ) : query.isError ? (
          <div className={styles.stateBox}>
            <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : groups.length === 0 ? (
          /* 开书引导（E5）：原来是「新建第一章，就可以开始写了」——
             直接把人推进空白编辑器，于是"吃书"从第一章就开始埋。
             现在统一指向 `/book/<slug>/start`「开书清单」，由那一页按
             实战指南的六阶段（立项 → 骨架 → 包装 → 写稿）逐步指路 ——
             指路文案只维护一份，避免这里和向导各说一套。
             **不阻断**：头部 + 按钮与中间面板的「新建第一章」始终可用。 */
          <EmptyState
            icon="chapter"
            title="这部作品还没有章节"
            description="建议先搭骨架再动笔 —— 打开「开书清单」，按顺序立人物、写世界观、把主线分段。清单里每一步都能跳过，想直接开写也随时可以。"
            actionLabel="打开开书清单"
            onAction={() => navigate(bookPath(slug, '/start'))}
          />
        ) : (
          groups.map((group) => {
            const key = group.title;
            const isCollapsed = collapsed[key] ?? false;
            return (
              <div className={styles.volume} key={key}>
                <button
                  type="button"
                  className={styles.volumeHeader}
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed((s) => ({ ...s, [key]: !isCollapsed }))}
                >
                  <Icon
                    name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                    size={16}
                    aria-hidden="true"
                  />
                  {group.title}
                  <span className={styles.volumeCount}>{group.chapters.length}</span>
                </button>
                {!isCollapsed
                  ? group.chapters.map((ch) => (
                      <ChapterRow
                        key={ch.id}
                        chapter={ch}
                        active={ch.id === activeChapterId}
                        onSelect={onSelect}
                      />
                    ))
                  : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
