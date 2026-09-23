import { describe, expect, it } from 'vitest';
import { countPlainText } from './wordCount';

/**
 * 字数口径是本轮修的 P0（顶栏与接口曾 44/66 两套答案）：
 * 汉字记 1、ASCII 词记 1、**标点与空白一律不计**。后端 utils/text.count_words 同规则。
 */
describe('countPlainText（与后端同口径）', () => {
  it('纯中文逐字计数', () => {
    expect(countPlainText('你好世界')).toBe(4);
  });
  it('标点与空白不计字', () => {
    expect(countPlainText('你好，世界。')).toBe(4);
    expect(countPlainText('，。！？、；：')).toBe(0);
    expect(countPlainText('   \n  ')).toBe(0);
  });
  it('英文按词计数', () => {
    expect(countPlainText('hello world')).toBe(2);
  });
  it('空串为 0', () => {
    expect(countPlainText('')).toBe(0);
  });
});
