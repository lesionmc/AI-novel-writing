import { describe, expect, it } from 'vitest';
import { countModel } from './writebackModel';
import type { WritebackModel } from './writebackModel';

const base: WritebackModel = {
  summary: '',
  characters: [],
  plotProgress: [],
  newForeshadows: [],
  closedForeshadows: [],
} as unknown as WritebackModel;

describe('countModel（归档计数不说谎）', () => {
  it('非空摘要计入 1 条 —— 修「填了摘要仍显示将写入 0/0」', () => {
    expect(countModel(base).total).toBe(0);
    expect(countModel({ ...base, summary: '   ' }).total).toBe(0);
    expect(countModel({ ...base, summary: '陈默进了老楼' })).toMatchObject({ total: 1, accepted: 1 });
  });

  it('摘要与条目并存时合并计数、按 accepted 汇总', () => {
    const m = {
      ...base,
      summary: '有摘要',
      characters: [
        { accepted: true } as never,
        { accepted: false } as never,
      ],
    };
    expect(countModel(m)).toMatchObject({ total: 3, accepted: 2, hasItems: true });
  });
});
