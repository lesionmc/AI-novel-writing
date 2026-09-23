import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WritingMode } from '@/types/api';
import { formatNumber, formatWordCount } from '@/lib/format';
import { WRITING_MODE_LABELS } from '@/lib/labels';
import { getThemeDef } from '@/lib/theme';
import { useDeskStore } from '@/stores/deskStore';
import { useThemeStore } from '@/stores/themeStore';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Menu } from '@/components/common/Menu';
import { toast } from '@/stores/toastStore';
import { WritingAiDialog, type WritingAiMode } from './WritingAiDialog';
import styles from './TopBar.module.css';
import { slugSegment } from '@/lib/slug';

export interface TopBarProps {
  slug: string;
  seq: number | null;
  chapterTitle: string;
  /** 本章字数（编辑器实时上报） */
  wordCount: number;
  /** 全书字数（由章节列表汇总，避免读到过期的缓存） */
  bookWordCount: number;
  writingMode: WritingMode;
  onFinalize: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onOpenVersions: () => void;
  onDeleteChapter: () => void;
  onRefetchRecall: () => void;
  finalizing: boolean;
}

/**
 * 写作台页面级顶栏（52px，位于全局导航条之下）：返回书库 / 当前章 / 字数 / AI 菜单 / 完成本章 / 设置。
 * 换书与跨页面跳转由全局导航（`GlobalNav`）承担，这里不再重复一套。
 * 写作模式（04 §2.4）：
 *   manual → **不出现任何 AI 入口**；assist → 显示 AI 菜单；semi → 自动触发召回与回写（仍保留人工确认）。
 */
export function TopBar({
  slug,
  seq,
  chapterTitle,
  wordCount,
  bookWordCount,
  writingMode,
  onFinalize,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onOpenVersions,
  onDeleteChapter,
  onRefetchRecall,
  finalizing,
}: TopBarProps) {
  const navigate = useNavigate();
  // 当前主题属于深色系还是浅色系 —— 决定快捷按钮显示「太阳」还是「月亮」
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const toggleNight = useThemeStore((s) => s.toggleNight);

  // 正文辅助 AI：章节 id 与选中文本都从 deskStore 取 —— 顶栏不是编辑器的父组件，
  // 走 store 可以完全避免 prop 穿透（编辑器已实时上报这两者）。
  const activeChapterId = useDeskStore((s) => s.activeChapterId);
  const selectionText = useDeskStore((s) => s.selectionText);
  const [aiMode, setAiMode] = useState<WritingAiMode | null>(null);

  /** 打开某个正文辅助能力；前置条件不满足时给明确提示，而不是弹一个必然失败的空窗 */
  const openWritingAi = (mode: WritingAiMode) => {
    if (activeChapterId === null) {
      toast.info('先打开一章再使用');
      return;
    }
    if (mode === 'expand' && !selectionText.trim()) {
      toast.info('先在正文里选中一段，再点扩写');
      return;
    }
    setAiMode(mode);
  };
  const isDarkTheme = getThemeDef(resolvedTheme).scheme === 'dark';
  const chapterMenuItems = [
    { key: 'prev', label: '上一章', icon: 'chevronUp' as const, onSelect: onPrev, disabled: !hasPrev },
    { key: 'next', label: '下一章', icon: 'chevronDown' as const, onSelect: onNext, disabled: !hasNext },
    { key: 'versions', label: '版本历史', icon: 'history' as const, onSelect: onOpenVersions },
    {
      key: 'delete',
      label: '删除本章',
      icon: 'trash' as const,
      danger: true,
      separatorBefore: true,
      onSelect: onDeleteChapter,
    },
  ];

  return (
    <>
    <header className={styles.bar}>
      {/* 本页顶栏位于**全局导航条之下**，所以这里不再承担"全站出口"的职责：
          书名与换书归导航条右侧的作品选择器，设定库/大纲/质检/统计归导航条的一级导航项。
          原先的「本书」下拉已删（与全局导航后 4 项完全重叠，留着就是两个入口说同一件事）。
          只保留一个「返回书库」箭头：写作时最常用的出口，一键可达。 */}
      <Button
        variant="ghost"
        size="md"
        iconOnly
        icon="chevronLeft"
        aria-label="返回书库"
        title="返回书库"
        onClick={() => navigate('/')}
      />

      <span className={styles.divider} aria-hidden="true" />

      {seq !== null ? (
        <div className={styles.chapterChip}>
          <span className={styles.chapterSeq}>第 {seq} 章</span>
          <span className={styles.chapterTitle} title={chapterTitle || '未命名'}>
            {chapterTitle || '未命名'}
          </span>
          <Menu
            triggerIconOnly
            triggerIcon="chevronDown"
            triggerSize="sm"
            triggerAriaLabel="本章操作"
            align="start"
            items={chapterMenuItems}
          />
        </div>
      ) : (
        <span className={styles.chapterChip}>未打开章节</span>
      )}

      <div className={styles.counts}>
        {/* 口径写清（QA L4：「本章 43 字 / 全书 81 字」小白不知道谁是谁） */}
        <span title="当前这一章正文的字数，边写边算">
          本章 <span className={styles.count}>{formatNumber(wordCount)}</span> 字
        </span>
        <span title="这部作品所有章节的字数合计">
          全书共 <span className={styles.count}>{formatWordCount(bookWordCount)}</span>
        </span>
      </div>

      <div className={styles.actions}>
        {writingMode === 'manual' ? null : (
          <>
            <span className={styles.modeTag}>
              <Badge variant={writingMode === 'semi' ? 'accent' : 'neutral'}>
                {WRITING_MODE_LABELS[writingMode]}
              </Badge>
            </span>
            <Menu
              triggerLabel="AI"
              triggerIcon="layers"
              triggerVariant="secondary"
              triggerSize="md"
              items={[
                // 能用的放最前 —— QA M4：原先 4 项全灰不可点，AI 按钮点了没用
                {
                  key: 'setup-chat',
                  label: '跟 AI 聊着建人物和世界观',
                  icon: 'sparkles',
                  onSelect: () =>
                    navigate(`/book/${slugSegment(slug)}/chat`),
                },
                {
                  key: 'recall',
                  label: '重新拉取本章提醒',
                  icon: 'retry',
                  onSelect: onRefetchRecall,
                },
                // 正文辅助 AI（M2 批次二）。分两组：
                //   上两个**不产出正文**（剧情走向给选项、校对只挑错）—— 与「不在写的环节代笔」一致；
                //   下两个产出**草稿**，会落到编辑器里由作者删改，**不自动保存**。
                // 两个"代笔"项在标签里就写明是草稿，避免用户以为 AI 直接定了稿。
                {
                  key: 'plot-directions',
                  label: '接下来往哪走（给方向，不写正文）',
                  icon: 'plotArc',
                  separatorBefore: true,
                  onSelect: () => openWritingAi('directions'),
                },
                {
                  key: 'proofread',
                  label: '校对这一章（只挑错，不改字）',
                  icon: 'audit',
                  onSelect: () => openWritingAi('proofread'),
                },
                {
                  key: 'continue',
                  label: '续写一段草稿',
                  icon: 'layers',
                  onSelect: () => openWritingAi('continue'),
                },
                {
                  key: 'expand',
                  label: selectionText.trim() ? '扩写选中的段落' : '扩写（先在正文里选中一段）',
                  icon: 'edit',
                  onSelect: () => openWritingAi('expand'),
                },
              ]}
            />
          </>
        )}
        <Button
          variant="accent"
          size="md"
          icon="check"
          onClick={onFinalize}
          disabled={seq === null}
          loading={finalizing}
        >
          完成本章
        </Button>
        {/* 主题快捷切换：写稿时最常发生的是「白天写到天黑」，让人不必为了换个
            舒服的颜色专门跑一趟设置页。图标随当前状态变，点了即生效、自动记住。 */}
        <Button
          variant="ghost"
          size="md"
          iconOnly
          icon={isDarkTheme ? 'sun' : 'moon'}
          aria-label={isDarkTheme ? '切回浅色主题' : '切到夜间主题'}
          title={isDarkTheme ? '切回浅色' : '切到夜间（护眼）'}
          onClick={toggleNight}
        />
        <Button
          variant="ghost"
          size="md"
          iconOnly
          icon="settings"
          aria-label="打开设置"
          title="设置"
          onClick={() => navigate(`/book/${slugSegment(slug)}/config`)}
        />
      </div>
    </header>

      {/* 正文辅助 AI 弹窗。草稿插入要带 `seq` 对齐（编辑器的消费守卫按章号过滤），
          所以章号或章节 id 任一为空都不渲染，避免"插错章"。 */}
      {aiMode && activeChapterId !== null && seq !== null ? (
        <WritingAiDialog
          chapterId={activeChapterId}
          seq={seq}
          mode={aiMode}
          selectedText={selectionText}
          onOpenConfig={() => {
            setAiMode(null);
            navigate(`/book/${slugSegment(slug)}/config`);
          }}
          onClose={() => setAiMode(null)}
        />
      ) : null}
    </>
  );
}
