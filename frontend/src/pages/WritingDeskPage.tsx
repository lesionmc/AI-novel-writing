import { useWritingDesk } from '@/hooks/useWritingDesk';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import { ChapterTree } from '@/components/writingdesk/ChapterTree';
import { Editor } from '@/components/writingdesk/Editor';
import { RecallPanel } from '@/components/writingdesk/RecallPanel';
import { StatusBar } from '@/components/writingdesk/StatusBar';
import { TopBar } from '@/components/writingdesk/TopBar';
import { VersionsDialog } from '@/components/writingdesk/VersionsDialog';
import { WritebackDialog } from '@/components/writingdesk/WritebackDialog';
import { WritingDesk } from '@/components/writingdesk/WritingDesk';
import styles from '@/components/writingdesk/WritingDesk.module.css';

/**
 * 写作台 `/book/:slug/desk`（核心页，占 80% 使用时间）。
 * 逻辑全部收敛在 `useWritingDesk`（见该 hook 顶部红线说明）；本文件只负责骨架与 JSX。
 */
export function WritingDeskPage() {
  const d = useWritingDesk();

  if (d.bookError) {
    return (
      <div style={{ padding: 'var(--space-10)', maxWidth: '720px', margin: '0 auto' }}>
        <EmptyState
          icon="error"
          title="打不开这部作品"
          description="它可能已被移入回收目录。回到书库看看当前有哪些作品。"
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="primary" onClick={d.toLibrary}>
            返回书库
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <WritingDesk
        leftCollapsed={d.focusMode || !d.isMid || d.leftCollapsed}
        rightCollapsed={d.focusMode || !d.isWide || d.rightCollapsed}
        onExpandLeft={d.expandLeft}
        onExpandRight={d.expandRight}
        topBar={
          <>
            {!d.online ? (
              <OfflineBanner message="当前处于离线状态，本地写作与保存照常可用；AI 相关操作暂不可用。" />
            ) : null}
            <TopBar
              slug={d.slug}
              bookTitle={d.bookTitle}
              seq={d.seq}
              chapterTitle={d.chapterTitle}
              wordCount={d.wordCount}
              bookWordCount={d.bookWordCount}
              writingMode={d.writingMode}
              onFinalize={d.openWriteback}
              onPrev={d.onPrev}
              onNext={d.onNext}
              hasPrev={d.activeIndex > 0}
              hasNext={d.activeIndex >= 0 && d.activeIndex < d.briefs.length - 1}
              onOpenVersions={() => d.setVersionsOpen(true)}
              onDeleteChapter={() => d.setDeleteOpen(true)}
              onRefetchRecall={() => void d.recallQuery.refetch()}
              finalizing={d.finalizing}
            />
          </>
        }
        left={
          <ChapterTree
            slug={d.slug}
            activeChapterId={d.activeChapterId}
            onSelect={d.selectChapter}
            onCreate={d.createAndSelect}
            creating={d.creating}
          />
        }
        center={
          d.activeChapterId === null ? (
            <div className={styles.editorEmpty}>
              {d.briefsPending ? null : d.briefs.length === 0 ? (
                <EmptyState
                  icon="chapter"
                  title="还没有章节"
                  description="先建第一章。之后每写完一章，点「完成本章」把人物变化与线索存下来。"
                  actionLabel="新建第一章"
                  onAction={d.createAndSelect}
                  actionLoading={d.creating}
                />
              ) : (
                <EmptyState
                  icon="chapter"
                  title="选一章开始写"
                  description="左侧点任意章节即可开始；右侧会自动带出这一章需要记住的线索与人物状态。"
                />
              )}
            </div>
          ) : (
            <Editor
              chapterId={d.activeChapterId}
              seq={d.seq ?? 0}
              title={d.chapterTitle}
              content={d.content}
              reloadKey={d.contentReloadKey}
              contentReady={d.contentReady}
              loading={d.chapterQuery.isPending && !d.contentReady}
              loadError={d.chapterQuery.isError && !d.contentReady ? d.chapterQuery.error : null}
              onRetryLoad={() => void d.chapterQuery.refetch()}
              onSave={d.handleSave}
              onFinalize={d.openWriteback}
            />
          )
        }
        right={
          <RecallPanel
            slug={d.slug}
            chapterId={d.activeChapterId}
            recall={d.recallQuery}
            noModel={d.noModel}
            rightTab={d.rightTab}
            onTabChange={d.setRightTab}
            onOpenConfig={d.toConfig}
            onMarkClosed={d.markForeshadowClosed}
            markingId={d.markingId}
            onOpenProfile={d.toProfile}
            onJumpToChapter={d.jumpToSeq}
          />
        }
        statusBar={
          <StatusBar
            saveStatus={d.saveStatus}
            savedAt={d.savedAt}
            recallChars={d.recallChars}
            recallTokens={d.recallTokens}
            online={d.online}
            focusMode={d.focusMode}
            onToggleFocus={d.onToggleFocus}
            capabilities={d.capabilities}
            onOpenConfig={d.toConfig}
            onRefetchCapabilities={d.onRefetchCapabilities}
          />
        }
      />

      <VersionsDialog
        open={d.versionsOpen}
        slug={d.slug}
        chapterId={d.activeChapterId}
        onClose={() => d.setVersionsOpen(false)}
      />

      {d.deleteOpen && d.activeChapterId !== null ? (
        <ConfirmDialog
          open
          title="删除这一章？"
          confirmLabel="删除章节"
          cancelLabel="取消"
          loading={d.deleting}
          onCancel={() => d.setDeleteOpen(false)}
          onConfirm={d.confirmDeleteChapter}
        >
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            将删除第 {d.seq} 章《{d.chapterTitle || '未命名'}》的正文、版本历史与向量分块。该操作不可撤销。
          </p>
          {d.deleteError ? (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <EmptyState
                icon="error"
                title="删除失败，请重试"
                description="如果这一章仍被大纲章节卡引用，先在大纲里解除关联再删除。"
              />
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}

      <WritebackDialog
        open={d.writebackOpen}
        chapterSeq={d.seq ?? 0}
        chapterTitle={d.chapterTitle}
        wordCount={d.wordCount}
        loading={d.writebackLoading}
        error={d.writebackError}
        suggestions={d.writebackSuggestions}
        openForeshadows={d.recallQuery.data?.open_foreshadows ?? []}
        confirming={d.confirming}
        confirmError={d.confirmError}
        allowAdd={d.manualWriteback}
        onRetry={d.retryFinalize}
        onCancel={d.cancelWriteback}
        onConfirm={d.handleConfirmWriteback}
      />
    </>
  );
}
