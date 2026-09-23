import { describe, expect, it } from 'vitest';
import { diffLines, diffStats } from './textDiff';

describe('diffLines（版本对比地基）', () => {
  it('相同文本全 same', () => {
    expect(diffLines('a\nb', 'a\nb').every((l) => l.kind === 'same')).toBe(true);
  });

  it('识别中间插入与删除', () => {
    const lines = diffLines('一\n二\n三', '一\n改\n二\n三');
    expect(lines.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['改']);
    expect(diffStats(diffLines('一\n二', '一'))).toEqual({ added: 0, removed: 1 });
  });

  it('空文本不炸', () => {
    expect(diffLines('', '')).toEqual([{ kind: 'same', text: '' }]);
    expect(diffStats(diffLines('x\ny', 'x'))).toEqual({ added: 0, removed: 1 });
  });

  it('超长文本退化为整删整加（防百万格矩阵卡死）', () => {
    const big = '行\n'.repeat(2500);
    const out = diffLines(big, '别的\n');
    expect(out.some((l) => l.kind === 'del')).toBe(true);
    // 退化模式：整删整加（'别的\n' 本身就是两行）
    expect(out.filter((l) => l.kind === 'add')).toHaveLength(2);
  });
});
