import { useEffect, useMemo, useState } from 'react';
import { userMessageOf } from '@/api/client';
import { useCharacterRelations } from '@/hooks/queries';
import { useCreateCharacterRelation, useDeleteCharacterRelation } from '@/hooks/mutations/settings';
import { Button } from '@/components/common/Button';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { Select } from '@/components/common/Select';
import { toast } from '@/stores/toastStore';
import type { Character, CharacterRelation } from '@/types/api';
import styles from './settings.module.css';

export interface CharacterGraphModalProps {
  open: boolean;
  slug: string;
  characters: Character[];
  onClose: () => void;
}

const R = 150; // 环形半径（SVG 用户单位）
const CX = 190;
const CY = 190;

function nodePos(index: number, total: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
  return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
}

/** 人物关系图谱：环形布局 SVG + 边列表 + 增删。数据全在本机。 */
export function CharacterGraphModal({ open, slug, characters, onClose }: CharacterGraphModalProps) {
  const relations = useCharacterRelations(open ? slug : null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [type, setType] = useState('');

  const create = useCreateCharacterRelation(slug);
  const del = useDeleteCharacterRelation(slug);

  // 打开时给两个下拉框真实默认值：原生 select 显示第一项但 state 仍是空串，
  // 不回填的话用户以为选了、实际被"没填全"的守卫拦下（冒烟测试抓到的坑）
  useEffect(() => {
    if (!open) return;
    if (!fromId && characters[0]) setFromId(String(characters[0].id));
    if (!toId && characters[1]) setToId(String(characters[1].id));
  }, [open, characters, fromId, toId]);

  const edges = relations.data ?? [];
  const nameOf = useMemo(() => new Map(characters.map((c) => [c.id, c.name])), [characters]);
  const posOf = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    characters.forEach((c, i) => map.set(c.id, nodePos(i, characters.length)));
    return map;
  }, [characters]);

  const add = () => {
    const from = Number(fromId);
    const to = Number(toId);
    if (!from || !to || !type.trim()) {
      toast.info('把两个人物和关系类型都填上');
      return;
    }
    create.mutate(
      { from_char_id: from, to_char_id: to, relation_type: type.trim() },
      {
        onSuccess: () => {
          setType('');
          toast.success('关系已记下');
        },
        onError: (e) => toast.error(userMessageOf(e)),
      },
    );
  };

  const remove = (id: number) => {
    del.mutate(id, {
      onError: (e) => toast.error(userMessageOf(e)),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="人物关系图谱"
      subtitle="谁和谁是什么关系，一眼看全。关系只影响你看图，不改任何人物卡"
      footer={
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      }
    >
      {characters.length < 2 ? (
        <div className={styles.graphEmpty}>至少两个人物才能画关系 —— 先去人物卡里添人。</div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${CX * 2} ${CY * 2}`}
            className={styles.graphSvg}
            role="img"
            aria-label="人物关系图"
          >
            {edges.map((e: CharacterRelation) => {
              const a = posOf.get(e.from_char_id);
              const b = posOf.get(e.to_char_id);
              if (!a || !b) return null;
              return (
                <g key={e.id}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.graphEdge} />
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className={styles.graphEdgeLabel}>
                    {e.relation_type}
                  </text>
                </g>
              );
            })}
            {characters.map((c) => {
              const p = posOf.get(c.id);
              if (!p) return null;
              return (
                <g key={c.id}>
                  <circle cx={p.x} cy={p.y} r={26} className={styles.graphNode} />
                  <text x={p.x} y={p.y + 4} className={styles.graphNodeLabel}>
                    {c.name.length > 5 ? `${c.name.slice(0, 5)}…` : c.name}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className={styles.graphEdgeList}>
            {edges.length === 0 ? <div className={styles.graphEmpty}>还没有关系，先加一条。</div> : null}
            {edges.map((e: CharacterRelation) => (
              <div key={e.id} className={styles.graphEdgeRow}>
                <span>
                  {nameOf.get(e.from_char_id) ?? '?'} —<strong>{e.relation_type}</strong>→{' '}
                  {nameOf.get(e.to_char_id) ?? '?'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  loading={del.isPending && del.variables === e.id}
                  onClick={() => remove(e.id)}
                  aria-label="删除这条关系"
                />
              </div>
            ))}
          </div>

          <div className={styles.graphAddRow}>
            <Select
              label="从谁"
              value={fromId}
              onChange={(ev) => setFromId(ev.target.value)}
              options={characters.map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <Select
              label="到谁"
              value={toId}
              onChange={(ev) => setToId(ev.target.value)}
              options={characters.map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <Input
              label="关系类型"
              value={type}
              placeholder="师徒 / 宿敌 / 血亲…"
              onChange={(ev) => setType(ev.target.value)}
            />
            <Button variant="primary" icon="plus" loading={create.isPending} onClick={add}>
              添加
            </Button>
          </div>
          {create.isError ? (
            <ErrorBar error={create.error} onRetry={add} />
          ) : null}
          <p className={styles.graphHint}>
            <Icon name="info" size={16} /> 关系是给「本章提醒」和审校看的路标之一；写得越准，AI 越不容易把人物关系搞反。
          </p>
        </>
      )}
    </Modal>
  );
}
