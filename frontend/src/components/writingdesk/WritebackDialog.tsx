import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConfirmWritebackRequest, RecallForeshadow, WritebackSuggestion } from '@/types/api';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { Modal } from '@/components/common/Modal';
import { formatNumber } from '@/lib/format';
import { CharacterUpdateItem } from './CharacterUpdateItem';
import { ClosedForeshadowItem } from './ClosedForeshadowItem';
import { DialogFooter } from './DialogFooter';
import { NewForeshadowItem } from './NewForeshadowItem';
import { PlotProgressItem } from './PlotProgressItem';
import { SummaryEditor } from './SummaryEditor';
import { WritebackItemList, WritebackSection } from './WritebackSection';
import { countModel, fromSuggestions, setAllAccepted, toPayload, addCharacter, addNewForeshadow, addPlotProgress } from './writebackModel';
import type { WritebackModel } from './writebackModel';
import styles from './WritebackDialog.module.css';

export interface WritebackDialogProps {
  open: boolean;
  chapterSeq: number;
  chapterTitle: string;
  wordCount: number;
  loading: boolean;
  error: unknown;
  suggestions: WritebackSuggestion | null;
  /** 当前未回收伏笔（用于把 closed_foreshadow_ids 解析为标题，契约只给 id） */
  openForeshadows: RecallForeshadow[];
  confirming: boolean;
  confirmError: unknown;
  /** 手工录入降级路径（纯手动模式 / 未配模型）：允许手动添加条目 */
  allowAdd?: boolean;
  onRetry: () => void;
  onCancel: () => void;
  onConfirm: (payload: ConfirmWritebackRequest) => void;
}

const EMPTY: WritebackModel = {
  summary: '',
  hook: null,
  rawAiOutput: null,
  characters: [],
  plotProgress: [],
  newForeshadows: [],
  closedForeshadows: [],
};

interface Keyed {
  key: string;
}

function updateIn<T extends Keyed>(list: T[], key: string, p: Partial<T>): T[] {
  return list.map((x) => (x.key === key ? { ...x, ...p } : x));
}
function removeFrom<T extends Keyed>(list: T[], key: string): T[] {
  return list.filter((x) => x.key !== key);
}
function ratio<T extends Keyed & { accepted: boolean }>(list: T[]): string {
  return `${list.filter((x) => x.accepted).length}/${list.length}`;
}

/**
 * 回写确认弹窗（红线 2 / 防错误累积的闸门）。
 *  - 默认全部勾选，每条可编辑、可删除，**不做二次确认**（点确认即落库并跳下一章）
 *  - 点「取消」= 什么都不做（章节仍为 draft，TC-24）
 *  - 解析警告可见并可查看原始输出（TC-27）
 */
export function WritebackDialog({
  open,
  chapterSeq,
  chapterTitle,
  wordCount,
  loading,
  error,
  suggestions,
  openForeshadows,
  confirming,
  confirmError,
  allowAdd = false,
  onRetry,
  onCancel,
  onConfirm,
}: WritebackDialogProps) {
  const [model, setModel] = useState<WritebackModel>(EMPTY);
  const [rawOpen, setRawOpen] = useState(false);

  // 用 ref 持最新伏笔表，避免伏笔刷新时 effect 重跑、把用户编辑冲掉
  const foreshadowTitlesRef = useRef(new Map<number, string>());
  foreshadowTitlesRef.current = new Map(openForeshadows.map((f) => [f.id, f.title]));

  useEffect(() => {
    if (open && suggestions) {
      setModel(fromSuggestions(suggestions, (id) => foreshadowTitlesRef.current.get(id)));
      setRawOpen(false);
    }
  }, [open, suggestions]);

  const counts = useMemo(() => countModel(model), [model]);
  const allAccepted = counts.total > 0 && counts.accepted === counts.total;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="lg"
      closeOnOverlay={false}
      showClose={false}
      title="完成本章"
      subtitle={`第 ${chapterSeq} 章 · ${chapterTitle || '未命名'} · ${formatNumber(wordCount)} 字`}
      footerSpread
      footer={
        <DialogFooter
          accepted={counts.accepted}
          total={counts.total}
          allAccepted={allAccepted}
          confirming={confirming}
          onToggleAll={() => setModel((m) => setAllAccepted(m, !allAccepted))}
          onCancel={onCancel}
          onConfirm={() => onConfirm(toPayload(model))}
        />
      }
    >
      {loading ? (
        <div className={styles.loadingBox}>
          <Icon name="loader" size={24} className={styles.spin} />
          <div>正在读本章正文，整理人物变化与线索…</div>
        </div>
      ) : error ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <ErrorBar error={error} onRetry={onRetry} retryLabel="重新生成" />
          <p className={styles.emptyBox}>
            生成建议失败不会影响章节，仍保持草稿状态，你可以继续写或稍后再试。
          </p>
        </div>
      ) : !suggestions ? (
        <div className={styles.emptyBox}>还没有可确认的内容。</div>
      ) : (
        <>
          {confirmError ? (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <ErrorBar error={confirmError} />
            </div>
          ) : null}

          {suggestions.raw_ai_output ? (
            <div className={styles.warningBar}>
              <Icon name="info" size={16} />
              <span className={styles.warningBarText}>
                这段内容是 AI 整理出来的，确认前请逐条核对。
              </span>
              <Button size="sm" variant="ghost" onClick={() => setRawOpen((v) => !v)}>
                {rawOpen ? '收起原始输出' : '查看原始输出'}
              </Button>
            </div>
          ) : null}
          {rawOpen && suggestions.raw_ai_output ? (
            <pre className={styles.rawOutput}>{suggestions.raw_ai_output}</pre>
          ) : null}

          {allowAdd ? (
            <div className={styles.manualBar} role="status">
              <Icon name="info" size={16} />
              <span>
                当前没有调用 AI 模型，请手动填写本章要记录的内容。填好后勾选并确认即可入库。
              </span>
            </div>
          ) : null}

          <WritebackSection icon="quote" title="本章摘要">
            <SummaryEditor value={model.summary} onChange={(v) => setModel((m) => ({ ...m, summary: v }))} />
          </WritebackSection>

          {counts.total === 0 && !allowAdd ? (
            <div className={styles.emptyBox}>
              本章没有检测到人物变化、新线索或故事推进。确认后只会把本章标记为已完成。
            </div>
          ) : null}

          {model.characters.length > 0 ? (
            <WritebackSection icon="user" title="人物状态变更" countLabel={ratio(model.characters)}>
              <WritebackItemList>
                {model.characters.map((c) => (
                  <CharacterUpdateItem
                    key={c.key}
                    item={c}
                    onChange={(p) =>
                      setModel((m) => ({ ...m, characters: updateIn(m.characters, c.key, p) }))
                    }
                    onRemove={() =>
                      setModel((m) => ({ ...m, characters: removeFrom(m.characters, c.key) }))
                    }
                  />
                ))}
              </WritebackItemList>
            </WritebackSection>
          ) : null}

          {model.newForeshadows.length > 0 ? (
            <WritebackSection icon="foreshadow" title="新埋的线索" countLabel={ratio(model.newForeshadows)}>
              {/* 有未勾选的条目才提示。勾选状态由后端按重要度给出（低重要度默认不保留，
                  防台账灌爆），若无说明用户会以为勾选错乱。样式复用 footerCount
                  （同为小号三级文字）——本文件 CSS 已顶到 300 行上限，不再新增类。 */}
              {model.newForeshadows.some((f) => !f.accepted) ? (
                <p className={styles.footerCount}>
                  低重要度的线索默认不保留，免得越攒越多。想留下来，自己勾上就行。
                </p>
              ) : null}
              <WritebackItemList>
                {model.newForeshadows.map((f) => (
                  <NewForeshadowItem
                    key={f.key}
                    item={f}
                    onChange={(p) =>
                      setModel((m) => ({ ...m, newForeshadows: updateIn(m.newForeshadows, f.key, p) }))
                    }
                    onRemove={() =>
                      setModel((m) => ({ ...m, newForeshadows: removeFrom(m.newForeshadows, f.key) }))
                    }
                  />
                ))}
              </WritebackItemList>
            </WritebackSection>
          ) : null}

          {model.closedForeshadows.length > 0 ? (
            <WritebackSection icon="recover" title="本章回收的线索" countLabel={ratio(model.closedForeshadows)}>
              <WritebackItemList>
                {model.closedForeshadows.map((f) => (
                  <ClosedForeshadowItem
                    key={f.key}
                    item={f}
                    onChange={(p) =>
                      setModel((m) => ({
                        ...m,
                        closedForeshadows: updateIn(m.closedForeshadows, f.key, p),
                      }))
                    }
                  />
                ))}
              </WritebackItemList>
            </WritebackSection>
          ) : null}

          {model.plotProgress.length > 0 ? (
            <WritebackSection icon="plotArc" title="剧情线推进" countLabel={ratio(model.plotProgress)}>
              <WritebackItemList>
                {model.plotProgress.map((p) => (
                  <PlotProgressItem
                    key={p.key}
                    item={p}
                    onChange={(pp) =>
                      setModel((m) => ({ ...m, plotProgress: updateIn(m.plotProgress, p.key, pp) }))
                    }
                    onRemove={() =>
                      setModel((m) => ({ ...m, plotProgress: removeFrom(m.plotProgress, p.key) }))
                    }
                  />
                ))}
              </WritebackItemList>
            </WritebackSection>
          ) : null}

          {allowAdd ? (
            <div className={styles.addRow}>
              <Button
                variant="ghost"
                size="sm"
                icon="plus"
                onClick={() => setModel(addCharacter)}
              >
                添加人物状态
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="plus"
                onClick={() => setModel(addNewForeshadow)}
              >
                添加新线索
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="plus"
                onClick={() => setModel(addPlotProgress)}
              >
                添加剧情线推进
              </Button>
            </div>
          ) : null}

          <p className={styles.footerCount}>
            只有被勾选的条目才会写入数据库；「取消」不会产生任何写入。
          </p>
        </>
      )}
    </Modal>
  );
}
