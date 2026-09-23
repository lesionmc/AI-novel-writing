import { describe, expect, it } from 'vitest';
import { parseAiChatDraft, parseWebSources } from './hubModel';

describe('parseAiChatDraft（草稿唯一校验器）', () => {
  it('合法人物草稿通过并保留字段', () => {
    const draft = parseAiChatDraft({
      kind: 'characters',
      payload: { characters: [{ name: '陈默', role: 'protagonist', surface_identity: '保安' }] },
    });
    expect(draft?.kind).toBe('characters');
    if (draft?.kind === 'characters') {
      expect(draft.characters[0]).toMatchObject({ name: '陈默', role: 'protagonist' });
    }
  });

  it('非法 role 归一为 supporting，而不是整卡丢弃', () => {
    const draft = parseAiChatDraft({
      kind: 'characters',
      payload: { characters: [{ name: '甲', role: '大反派' }] },
    });
    if (draft?.kind !== 'characters') throw new Error('应通过');
    expect(draft.characters[0].role).toBe('supporting');
  });

  it('无名人物 / 空壳 / 未知 kind / 缺 payload 一律返回 null（不摆半张卡）', () => {
    expect(parseAiChatDraft({ kind: 'characters', payload: { characters: [{ name: '  ' }] } })).toBeNull();
    expect(parseAiChatDraft({ kind: 'characters', payload: { characters: [] } })).toBeNull();
    expect(parseAiChatDraft({ kind: 'spell_book', payload: {} })).toBeNull();
    expect(parseAiChatDraft({ kind: 'prose' })).toBeNull();
    expect(parseAiChatDraft(null)).toBeNull();
  });

  it('prose 空文本返回 null；正常文本原样保留', () => {
    expect(parseAiChatDraft({ kind: 'prose', payload: { text: '  ' } })).toBeNull();
    const d = parseAiChatDraft({ kind: 'prose', payload: { text: '雨夜。' } });
    expect(d).toEqual({ kind: 'prose', text: '雨夜。' });
  });
});

describe('parseWebSources（外部链接白名单）', () => {
  it('只收 http(s)，javascript: 等一律丢弃', () => {
    const out = parseWebSources([
      { title: 'ok', url: 'https://example.com/a', snippet: 'x' },
      { title: 'evil', url: 'javascript:alert(1)', snippet: '' },
      { title: 'no-url' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://example.com/a');
  });

  it('缺标题回落 URL；超过 5 条截断', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ url: `https://e.com/${i}` }));
    const out = parseWebSources(many);
    expect(out).toHaveLength(5);
    expect(out[0].title).toBe('https://e.com/0');
  });

  it('非数组入参返回空表而不是抛错', () => {
    expect(parseWebSources(undefined)).toEqual([]);
    expect(parseWebSources('字符串')).toEqual([]);
  });
});
