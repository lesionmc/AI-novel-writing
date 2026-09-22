import { useEffect, useMemo, useRef, useState } from 'react';
import type { Character, CharacterWriteRequest } from '@/types/api';
import { api } from '@/api/client';
import { useCharacters } from '@/hooks/queries';
import {
  useCreateCharacter,
  useDeleteCharacter,
  useUpdateCharacter,
} from '@/hooks/mutations/settings';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Modal } from '@/components/common/Modal';
import { SkeletonRows } from '@/components/common/Skeleton';
import { toast } from '@/stores/toastStore';
import { AffectedChaptersDialog } from './AffectedChaptersDialog';
import { CharacterForm } from './CharacterForm';
import { CharacterRow } from './CharacterRow';
import styles from './settings.module.css';

const FORM_ID = 'character-form';

const BLANK: CharacterWriteRequest = {
  name: '',
  alias: '',
  role: 'supporting',
  status: 'alive',
  surface_identity: '',
  secret_desire: '',
  fatal_weakness: '',
  contradiction: '',
  appearance: '',
  background: '',
  first_chapter_seq: null,
  tags: [],
};

function toFormValue(c: Character): CharacterWriteRequest {
  return {
    name: c.name,
    alias: c.alias ?? '',
    role: c.role,
    status: c.status,
    surface_identity: c.surface_identity ?? '',
    secret_desire: c.secret_desire ?? '',
    fatal_weakness: c.fatal_weakness ?? '',
    contradiction: c.contradiction ?? '',
    appearance: c.appearance ?? '',
    background: c.background ?? '',
    first_chapter_seq: c.first_chapter_seq,
    tags: c.tags ?? [],
  };
}

export interface CharactersTabProps {
  slug: string;
  /** 从写作台「查看完整档案」跳进来时高亮的角色名 */
  highlightName?: string;
  /** 消费掉 highlightName 后回调（父级据此把 URL 里的 highlight 抹掉） */
  onConsumeHighlight?: () => void;
}

/** 设定库 · 人物卡 Tab（R1 / TC-07 / TC-10） */
export function CharactersTab({ slug, highlightName, onConsumeHighlight }: CharactersTabProps) {
  const query = useCharacters(slug);
  const create = useCreateCharacter(slug);
  const update = useUpdateCharacter(slug);
  const remove = useDeleteCharacter(slug);

  const [editing, setEditing] = useState<Character | 'new' | null>(null);
  const [value, setValue] = useState<CharacterWriteRequest>(BLANK);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<Character | null>(null);
  /** 设定变更追踪：待确认的影响范围 */
  const [affected, setAffected] = useState<{ seqs: number[]; payload: CharacterWriteRequest } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);

  const characters = useMemo(() => query.data ?? [], [query.data]);

  /** 已消费的 highlight 名（防关闭弹窗后被同一 URL 参数反复重开） */
  const consumedRef = useRef<string | undefined>(undefined);

  // 从写作台跳进来自动开档案（只消费一次）。早先 deps 含 editing —— 点「取消」后
  // effect 立即重跑又弹回来（=「退不出去 / 取消不了」）；现只依赖 highlightName + ref
  // 记名，并让父级抹掉 URL（对齐 closeChat 删 ai）；参数消失即解除标记。
  useEffect(() => {
    if (!highlightName) { consumedRef.current = undefined; return; }
    if (consumedRef.current === highlightName) return;
    const target = characters.find((c) => c.name === highlightName);
    if (!target) return;
    consumedRef.current = highlightName;
    setEditing(target);
    setValue(toFormValue(target));
    onConsumeHighlight?.();
  }, [highlightName, characters, onConsumeHighlight]);

  const openNew = () => {
    setEditing('new');
    setValue(BLANK);
    setNameError(undefined);
  };

  const openEdit = (c: Character) => {
    setEditing(c);
    setValue(toFormValue(c));
    setNameError(undefined);
  };

  const closeForm = () => {
    setEditing(null);
    setNameError(undefined);
    create.reset();
    update.reset();
  };

  const patch = (p: Partial<CharacterWriteRequest>) => {
    setValue((v) => ({ ...v, ...p }));
    if (p.name !== undefined && nameError) setNameError(undefined);
  };

  const doSave = (payload: CharacterWriteRequest) => {
    const normalized: CharacterWriteRequest = {
      ...payload,
      name: payload.name.trim(),
      alias: payload.alias?.trim() || null,
      surface_identity: payload.surface_identity?.trim() || null,
      secret_desire: payload.secret_desire?.trim() || null,
      fatal_weakness: payload.fatal_weakness?.trim() || null,
      contradiction: payload.contradiction?.trim() || null,
      appearance: payload.appearance?.trim() || null,
      background: payload.background?.trim() || null,
    };

    if (editing === 'new') {
      create.mutate(normalized, {
        onSuccess: () => {
          toast.success('已新建人物卡');
          closeForm();
        },
      });
      return;
    }
    if (editing) {
      update.mutate(
        { id: editing.id, payload: normalized },
        {
          onSuccess: () => {
            toast.success('人物卡已保存');
            setAffected(null);
            closeForm();
          },
        },
      );
    }
  };

  /** 保存前先查影响范围（约束 3）：有引用则弹窗确认，无引用直接保存 */
  const handleSubmit = async () => {
    if (!value.name.trim()) {
      setNameError('姓名不能为空');
      return;
    }
    if (editing && editing !== 'new') {
      setChecking(true);
      try {
        // 契约返回**裸数组** `[{chapter_seq, chapter_title, matched_in}]`
        const res = await api.getAffectedChapters(editing.id);
        if (res.length > 0) {
          setAffected({ seqs: [...new Set(res.map((r) => r.chapter_seq))].sort((a, b) => a - b), payload: value });
          return;
        }
      } catch {
        // 追踪失败不阻断保存 —— 设定库必须始终可用（红线 3）
      } finally {
        setChecking(false);
      }
    }
    doSave(value);
  };

  if (query.isPending) {
    return (
      <div className={styles.stateWrap}>
        <SkeletonRows count={4} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className={styles.stateWrap}>
        <ErrorBar error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const saving = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;

  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.hintBlock}>
          人物卡用「表面身份 / 秘密欲望 / 致命弱点 / 矛盾行为」四个字段定住一个人，
          打开某一章时，右栏会自动带出他的当前状态。
        </span>
        <span className={styles.toolbarSpacer} />
        <Button variant="primary" icon="plus" onClick={openNew}>
          新建人物
        </Button>
      </div>

      {characters.length === 0 ? (
        <EmptyState
          icon="user"
          title="还没有人物卡"
          description="先给主角建一张卡：即使只填四要素，之后每一章右栏的提醒都会准确得多。"
          actionLabel="新建第一张人物卡"
          onAction={openNew}
        />
      ) : (
        <div className={styles.list}>
          {characters.map((c) => (
            <CharacterRow key={c.id} character={c} onEdit={openEdit} onDelete={setDeleting} />
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={closeForm}
        size="lg"
        title={editing === 'new' ? '新建人物卡' : `编辑「${editing?.name ?? ''}」`}
        subtitle="四要素填得越具体，后续章节的提醒与归档就越准"
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={saving || checking}
              onClick={() => void handleSubmit()}
            >
              保存
            </Button>
          </>
        }
      >
        {saveError ? (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <ErrorBar error={saveError} />
          </div>
        ) : null}
        <CharacterForm formId={FORM_ID} value={value} onChange={patch} nameError={nameError} />
      </Modal>

      {deleting ? (
        <ConfirmDialog
          open
          title="删除这张人物卡？"
          confirmLabel="删除"
          cancelLabel="取消"
          loading={remove.isPending}
          onCancel={() => {
            remove.reset();
            setDeleting(null);
          }}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success('人物卡已删除');
                setDeleting(null);
              },
            })
          }
        >
          <p className={styles.hintBlock}>
            删除「{deleting.name}」会同时移除他的状态变更记录（级联删除）。已写好的正文不受影响。
          </p>
        </ConfirmDialog>
      ) : null}

      <AffectedChaptersDialog
        open={affected !== null}
        characterName={value.name}
        chapterSeqs={affected?.seqs ?? []}
        loading={false}
        error={null}
        saving={saving}
        onCancel={() => setAffected(null)}
        onConfirm={() => affected && doSave(affected.payload)}
      />
    </>
  );
}
