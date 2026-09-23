/**
 * 行级文本 diff（LCS）—— 版本「对比当前」的地基。
 *
 * 章节按段落分行，典型几十到几百行，O(n·m) 的 DP 完全够；
 * 超过 `MAX_LINES` 的极端长文直接退化为「整删整加」，
 * 保证 UI 不会被百万格矩阵卡死（对比是辅助阅读，不是编译原理课）。
 */

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

const MAX_LINES = 2000;

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = (oldText || '').split('\n');
  const b = (newText || '').split('\n');

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [...a.map((text) => ({ kind: 'del', text }) as DiffLine),
      ...b.map((text) => ({ kind: 'add', text }) as DiffLine)];
  }

  // LCS 动态规划表
  const m = a.length;
  const n = b.length;
  const dp: Uint32Array = new Uint32Array((m + 1) * (n + 1));
  const at = (i: number, j: number) => i * (n + 1) + j;
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[at(i, j)] =
        a[i] === b[j] ? dp[at(i + 1, j + 1)] + 1 : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      out.push({ kind: 'del', text: a[i] });
      i += 1;
    } else {
      out.push({ kind: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < m) out.push({ kind: 'del', text: a[i++] });
  while (j < n) out.push({ kind: 'add', text: b[j++] });
  return out;
}

/** diff 统计（给用户看的一句话结论：+x / −y 行） */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === 'add') added += 1;
    else if (l.kind === 'del') removed += 1;
  }
  return { added, removed };
}
