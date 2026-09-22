import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftTextResponse, PlotDirectionsResponse, ProofreadResponse } from '@/types/api';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { Modal } from '@/components/common/Modal';
import { Textarea } from '@/components/common/Textarea';
import { AiUnavailableNotice } from '@/components/common/AiUnavailableNotice';
import {
  useContinueWriting,
  useExpandWriting,
  usePlotDirections,
  useProofread,
} from '@/hooks/mutations/writing';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useDeskStore } from '@/stores/deskStore';
import { toast } from '@/stores/toastStore';
import styles from './writingAi.module.css';

export type WritingAiMode = 'directions' | 'proofread' | 'continue' | 'expand';

export interface WritingAiDialogProps {
  chapterId: number;
  /** 当前章号：草稿插入请求要带它对齐，防止插错章 */
  seq: number;
  mode: WritingAiMode;
  /** 扩写必填：捕捉到的选中文本 */
  selectedText?: string;
  onOpenConfig: () => void;
  onClose: () => void;
}

/** 结果按模式判别，避免用一个 `any` 装三种形状 */
type Result =
  | { mode: 'directions'; data: PlotDirectionsResponse }
  | { mode: 'proofread'; data: ProofreadResponse }
  | { mode: 'draft'; data: DraftTextResponse };

const TITLES: Record<WritingAiMode, string> = {
  directions: '接下来往哪走',
  proofread: '校对这一章',
  continue: '帮我续写一段',
  expand: '把这段写具体',
};

const SUBTITLES: Record<WritingAiMode, string> = {
  directions: '只给你几个方向，正文还是你来写。',
  proofread: '只挑问题、给建议，不会替你改字。',
  continue: '会接着本章末尾往下写一段草稿，落到编辑器里，你自己删改。',
  expand: '会重写你选中的那段，落到编辑器里，你自己删改。',
};

/** 校对类别的中文名（界面只说人话，不暴露英文枚举） */
const ISSUE_LABELS: Record<string, string> = {
  typo: '错别字',
  punctuation: '标点',
  grammar: '病句',
  name: '称呼不一致',
  setting: '与设定冲突',
  repeat: '重复表达',
};

const DRAFT_MODES: WritingAiMode[] = ['continue', 'expand'];

/**
 * 正文辅助 AI 弹窗（剧情走向 / 校对 / 续写 / 扩写共用一个壳）。
 *
 * ## 与定位的关系
 * · 剧情走向 / 校对 —— 结果**只展示**，带「复制」，不碰正文；
 * · 续写 / 扩写 —— 结果是一段**草稿**，「插入到正文」只是把它放进编辑器，
 *   **仍然不保存**（正文走既有自动保存链路），作者可以立刻改掉或撤销。
 *   所以这里不会出现"AI 已帮你写好并保存"这种行为。
 */
export function WritingAiDialog({
  chapterId,
  seq,
  mode,
  selectedText,
  onOpenConfig,
  onClose,
}: WritingAiDialogProps) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);

  // 是否配了模型：直接问全局能力自检，省掉从页面一路透传 prop
  const capabilities = useCapabilities();
  const noModel = capabilities.data?.llm_configured === false;

  const runDirections = usePlotDirections();
  const runProofread = useProofread();
  const runContinue = useContinueWriting();
  const runExpand = useExpandWriting();
  const requestDraftInsert = useDeskStore((s) => s.requestDraftInsert);

  // 依赖用 ref 固定：mode/hint 变化不应该触发重跑，只有显式调 run() 才跑
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'directions') {
        const data = await runDirections.mutateAsync({ chapterId });
        setResult({ mode: 'directions', data });
      } else if (mode === 'proofread') {
        const data = await runProofread.mutateAsync({ chapterId });
        setResult({ mode: 'proofread', data });
      } else if (mode === 'continue') {
        const data = await runContinue.mutateAsync({ chapterId, payload: { hint } });
        setResult({ mode: 'draft', data });
      } else {
        const data = await runExpand.mutateAsync({
          chapterId,
          payload: { text: selectedText ?? '', hint },
        });
        setResult({ mode: 'draft', data });
      }
    } catch (e) {
      setError(e);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [mode, chapterId, hint, selectedText, runDirections, runProofread, runContinue, runExpand]);

  // 打开即跑一次（严格模式会双调用，用 ref 挡住第二次）
  useEffect(() => {
    if (startedRef.current || noModel) return;
    startedRef.current = true;
    void run();
  }, [run, noModel]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已复制');
    } catch {
      toast.error('复制失败，请手动选中复制');
    }
  };

  const insertDraft = (text: string) => {
    requestDraftInsert(seq, text, mode === 'expand' ? 'replace' : 'append');
    onClose();
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose}>
        关闭
      </Button>
      {noModel ? null : (
        <Button variant="secondary" icon="retry" loading={busy} onClick={() => void run()}>
          {result ? '再来一版' : '重试'}
        </Button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      closeOnOverlay={!busy}
      disableEsc={busy}
      size="lg"
      title={TITLES[mode]}
      subtitle={SUBTITLES[mode]}
      footer={footer}
    >
      {noModel ? (
        <AiUnavailableNotice onOpenConfig={onOpenConfig} configLabel="去配置模型">
          这项能力要用模型。配好一个模型后就能用了 —— 设定库、编辑器和自动保存都不受影响。
        </AiUnavailableNotice>
      ) : (
        <div className={styles.wrap}>
          {DRAFT_MODES.includes(mode) ? (
            <Textarea
              rows={2}
              value={hint}
              placeholder="有什么特别要求？比如「让陈默先开口」「别写打斗」（可留空）"
              onChange={(e) => setHint(e.target.value)}
              disabled={busy}
            />
          ) : null}

          {busy && !result ? (
            <div className={styles.stateBox}>
              <Icon name="loader" size={20} className={styles.spin} />
              <span>正在读你写过的东西，稍等…</span>
            </div>
          ) : null}

          {error ? <ErrorBar error={error} onRetry={() => void run()} retryLabel="重试" /> : null}

          {result?.mode === 'directions' ? (
            <div className={styles.list}>
              {result.data.directions.map((d, i) => (
                <article className={styles.item} key={`${d.title}-${i}`}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemTitle}>{d.title}</span>
                    <Button size="sm" variant="ghost" icon="copy" onClick={() => void copy(d.title)}>
                      复制
                    </Button>
                  </div>
                  {d.summary ? <p className={styles.itemMeta}>{d.summary}</p> : null}
                  {d.payoff ? (
                    <div className={styles.fieldRow}>
                      <span className={styles.fieldLabel}>兑现</span>
                      <span className={styles.fieldValue}>{d.payoff}</span>
                    </div>
                  ) : null}
                  {d.risk ? (
                    <div className={styles.fieldRow}>
                      <span className={styles.fieldLabel}>代价</span>
                      <span className={styles.fieldValue}>{d.risk}</span>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {result?.mode === 'proofread' ? (
            result.data.issues.length === 0 ? (
              <div className={styles.emptyBox}>这一章没挑出问题。也可能是章节还是空的。</div>
            ) : (
              <div className={styles.list}>
                {result.data.issues.map((issue, i) => (
                  <article className={styles.item} key={`${issue.excerpt}-${i}`}>
                    <div className={styles.itemHead}>
                      <span className={styles.itemTitle}>
                        {ISSUE_LABELS[issue.type] ?? '问题'}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="copy"
                        onClick={() => void copy(`${issue.excerpt}\n→ ${issue.suggestion}`)}
                      >
                        复制
                      </Button>
                    </div>
                    <div className={styles.excerpt}>{issue.excerpt}</div>
                    {issue.problem ? <p className={styles.itemMeta}>{issue.problem}</p> : null}
                    {issue.suggestion ? (
                      <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>建议</span>
                        <span className={styles.fieldValue}>{issue.suggestion}</span>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )
          ) : null}

          {result?.mode === 'draft' ? (
            <>
              <div className={styles.notice}>
                这是草稿，还没有写进你的稿子。点下面按钮才会放进编辑器，放进去之后照样可以改或撤销。
              </div>
              <pre className={styles.draft}>{result.data.text}</pre>
              <div className={styles.draftActions}>
                <Button
                  variant="ghost"
                  icon="copy"
                  onClick={() => void copy(result.data.text)}
                >
                  复制
                </Button>
                <Button
                  variant="accent"
                  icon="check"
                  onClick={() => insertDraft(result.data.text)}
                >
                  {draftInsertLabel(mode)}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

/** 续写 / 扩写的「插入到正文」按钮文案（仅本文件内部使用，不导出 —— 避免破坏热更新） */
function draftInsertLabel(mode: WritingAiMode): string {
  return mode === 'expand' ? '用这段替换选中内容' : '把这段接到正文末尾';
}
