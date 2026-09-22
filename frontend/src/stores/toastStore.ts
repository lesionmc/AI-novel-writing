import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  /** 毫秒；0 表示不自动消失 */
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (type: ToastType, message: string, duration?: number) => string;
  dismiss: (id: string) => void;
}

let seq = 0;

/** 同屏最多保留的 toast 条数（超出即丢弃最早的） */
const MAX_TOASTS = 4;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (type, message, duration = 3000) => {
    const id = `t${++seq}`;
    set((s) => {
      // 相同文案去重：新的一条顶掉旧的同文案 —— 连点「保存」不再堆一屏「已保存」。
      const kept = s.toasts.filter((t) => t.message !== message);
      return { toasts: [...kept, { id, type, message, duration }].slice(-MAX_TOASTS) };
    });
    if (duration > 0) {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** 命令式调用：toast.success('已自动保存') */
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().push('success', message, duration),
  error: (message: string, duration?: number) =>
    useToastStore.getState().push('error', message, duration ?? 5000),
  info: (message: string, duration?: number) =>
    useToastStore.getState().push('info', message, duration),
};
