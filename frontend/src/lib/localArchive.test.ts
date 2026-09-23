import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeArchive } from './localArchive';

/** 内存版 localStorage + window 桩（node 环境没有真浏览器） */
function installStorage(overrides: Partial<Storage> = {}): Map<string, string> {
  const map = new Map<string, string>();
  const store: Storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    ...overrides,
  };
  (globalThis as Record<string, unknown>).window = { localStorage: store };
  return map;
}


const archive = makeArchive<{ items: string[] }>('test.prefix.', 3, (payload) => {
  if (!Array.isArray(payload.items)) return null;
  return { items: payload.items.filter((x): x is string => typeof x === 'string') };
});

describe('makeArchive', () => {
  beforeEach(() => installStorage());
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('写后读回，键按作品分、载荷带版本', () => {
    const map = installStorage();
    archive.write('书A', { v: 3, items: ['x'] });
    expect(archive.read('书A')).toEqual({ items: ['x'] });
    expect(archive.read('书B')).toBeNull();
    expect(map.get('test.prefix.书A')).toContain('"v":3');
  });

  it('版本不符视为无存档（旧存档自然失效，不崩）', () => {
    installStorage().set('test.prefix.书A', JSON.stringify({ v: 2, items: ['旧'] }));
    expect(archive.read('书A')).toBeNull();
  });

  it('坏 JSON / 形状不对一律降级为 null，不抛错', () => {
    const map = installStorage();
    map.set('test.prefix.书A', '{坏掉的');
    expect(archive.read('书A')).toBeNull();
    map.set('test.prefix.书A', JSON.stringify({ v: 3, items: '不是数组' }));
    expect(archive.read('书A')).toBeNull();
  });

  it('write(null) 等于删键；存储抛异常时静默不炸', () => {
    const map = installStorage();
    archive.write('书A', { v: 3, items: ['x'] });
    archive.write('书A', null);
    expect(map.has('test.prefix.书A')).toBe(false);

    installStorage({
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    });
    expect(() => archive.write('书A', { v: 3, items: ['x'] })).not.toThrow();
  });
});

describe('makeArchive 读写解耦（审查修复项）', () => {
  it('存储写满（setItem 抛错）时，读仍能拿回已有数据', () => {
    const map = new Map<string, string>([
      ['test.prefix.书A', JSON.stringify({ v: 3, items: ['已存的会话'] })],
    ]);
    const store = {
      get length() {
        return map.size;
      },
      key: () => null,
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    } as unknown as Storage;
    (globalThis as Record<string, unknown>).window = { localStorage: store };

    // 探针写不进去 → write 返回 false，但 read 不受影响（数据没丢、认知不能丢）
    expect(archive.read('书A')).toEqual({ items: ['已存的会话'] });
    expect(archive.write('书A', { v: 3, items: ['新'] })).toBe(false);
    delete (globalThis as Record<string, unknown>).window;
  });
});
