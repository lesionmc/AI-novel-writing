import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DraftCard } from './DraftCard';
import type { HubDraft } from './hubModel';

const charactersDraft: HubDraft = {
  kind: 'characters',
  characters: [{ name: '雷七', role: 'antagonist', surface_identity: '镖局镖头' }],
};

function renderCard(props: Partial<Parameters<typeof DraftCard>[0]> = {}) {
  const base = {
    slug: '测试书',
    draft: charactersDraft,
    busy: false,
    onConfirm: vi.fn(),
    onDiscard: vi.fn(),
    ...props,
  };
  render(
    <MemoryRouter>
      <DraftCard {...base} />
    </MemoryRouter>,
  );
  return base;
}

describe('DraftCard（草稿必须人工确认的红线）', () => {
  it('未处理时展示「确认写入 / 丢弃」，回调原样透出', () => {
    const p = renderCard();
    expect(screen.getByText('雷七')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /确认写入/ }));
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /丢弃/ }));
    expect(p.onDiscard).toHaveBeenCalledTimes(1);
  });

  it('已确认（applied）后按钮消失，只留结果说明 —— 不给二次写入的机会', () => {
    renderCard({ state: 'applied' });
    expect(screen.queryByRole('button', { name: /确认写入/ })).toBeNull();
    expect(screen.getByText('已写进作品。')).toBeTruthy();
  });

  it('已丢弃（discarded）如实说明没有写进作品', () => {
    renderCard({ state: 'discarded' });
    expect(screen.getByText('已丢弃，没有写进作品。')).toBeTruthy();
  });

  it('正文草稿按钮是「复制这段」而不是写入 —— 正文永不自动落库', () => {
    renderCard({ draft: { kind: 'prose', text: '雨夜。' } });
    expect(screen.getByRole('button', { name: /复制这段/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /确认写入/ })).toBeNull();
  });
});
