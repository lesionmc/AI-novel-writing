import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** 仅普通对象（`{}` / `Object.create(null)`）参与值比较；数组 / Date / 类实例走引用比较 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * 基线等价判断：`reset(baseline)` 的语义是「**值**等于基线就不算 dirty」，
 * 而不是「引用与基线相同」。故：
 *   - 优先引用相等（覆盖原始值 / 同一实例 / NaN）
 *   - 对扁平普通对象做**浅值比较**（如 Editor 的 `{ html, title }`：
 *     载入正文时 `setDoc` 与 `reset` 传入内容相同但**实例不同**的对象）
 *   - 其余类型（数组 / Date / 类实例）退回引用比较，行为与改动前一致
 * 这样正确性不再依赖「调用方必须复用同一对象引用」这一隐含契约（TC 缺陷根因）。
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

export interface AutosaveResult {
  status: AutosaveStatus;
  savedAt: string | null;
  error: unknown;
  /** Ctrl+S：立即保存（跳过 2s 等待） */
  saveNow: () => Promise<void>;
  /**
   * 重置状态。切换章节时调用，并传入「刚载入的内容」作为基线，
   * 使这次内容替换不触发保存（只有用户真正改字才算 dirty）。
   * 基线按**值**比较（见 `valuesEqual`），无需调用方复用同一对象实例。
   */
  reset: (baseline?: unknown) => void;
}

/**
 * 自动保存：停止输入 2s 后触发（04 §2.3 / TC-11）。
 *  - 首次渲染 / 切换章节载入内容不触发（按**值**识别，与实例身份无关）
 *  - 保存失败保留 dirty 状态，可就地重试（不弹 alert）
 *  - Ctrl+S 走 saveNow 立即保存
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  options?: { enabled?: boolean; delay?: number },
): AutosaveResult {
  const { enabled = true, delay = 2000 } = options ?? {};

  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  const dirty = useRef(false);
  const primed = useRef(false);
  /** 需要跳过保存的基线值（章节载入 / 显式 reset）——按值比较，非引用比较 */
  const skip = useRef<{ v: T } | null>({ v: value });
  const saveRef = useRef(save);
  saveRef.current = save;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const runSave = useCallback(async () => {
    clearTimer();
    if (!dirty.current) return;
    dirty.current = false;
    setStatus('saving');
    try {
      await saveRef.current(latest.current);
      setSavedAt(new Date().toISOString());
      setStatus('saved');
      setError(null);
    } catch (e) {
      dirty.current = true;
      setError(e);
      setStatus('error');
    }
  }, [clearTimer]);

  useEffect(() => {
    latest.current = value;
    if (!enabled) return;
    if (skip.current !== null && valuesEqual(skip.current.v, value)) {
      skip.current = null;
      primed.current = true;
      return;
    }
    if (!primed.current) {
      primed.current = true;
      return;
    }
    dirty.current = true;
    setStatus('pending');
    clearTimer();
    timer.current = window.setTimeout(() => {
      void runSave();
    }, delay);
    return clearTimer;
  }, [value, enabled, delay, runSave, clearTimer]);

  const reset = useCallback(
    (baseline?: unknown) => {
      clearTimer();
      dirty.current = false;
      setStatus('idle');
      setSavedAt(null);
      setError(null);
      if (baseline !== undefined) skip.current = { v: baseline as T };
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { status, savedAt, error, saveNow: runSave, reset };
}
