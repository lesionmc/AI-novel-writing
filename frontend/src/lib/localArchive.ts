/**
 * localStorage 存档基座（按作品分键 + 载荷版本号 + 静默降级）。
 *
 * 各业务的本地留存（AI 会话、大纲草稿、向导进度）在此之上只写自己的
 * 形状校验与裁剪逻辑，不再各自重复存储管线的 try/catch。
 *
 * 约定（与原 4 份实现一致）：
 * · 所有 `localStorage` 访问都包 try/catch：隐私模式、配额满、被策略禁用时
 *   **静默降级为「不持久化」**，绝不因为存档问题让页面打不开。
 * · 载荷带版本号 `v`；版本不符 / JSON 坏 → 视为无存档（返回 null）。
 * · `write(key, null)` 等于删键——空存档不留空壳。
 */

/** 拿到可用的 localStorage；不可用（SSR / 隐私模式 / 被策略禁用）返回 null */
export function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__ainovel_archive_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export interface LocalArchive<T> {
  /** 读取并校验存档。无存档 / 不可用 / 损坏 / 版本不符 → null */
  read(slug: string): T | null;
  /** 写存档；payload 传 null 表示删键。任何异常都吞掉 */
  write(slug: string, payload: unknown | null): void;
  remove(slug: string): void;
}

/**
 * 建一个按作品分键的存档通道。
 * @param prefix 键前缀（如 `ainovel.setup-chat.`），须以 `.` 结尾
 * @param version 载荷版本号，结构变更时 +1 让旧存档自然失效
 * @param parse 从已解析且版本匹配的载荷中提取业务数据；形状不对返回 null
 */
export function makeArchive<T>(
  prefix: string,
  version: number,
  parse: (payload: Record<string, unknown>) => T | null,
): LocalArchive<T> {
  const key = (slug: string) => `${prefix}${slug}`;
  return {
    read(slug) {
      const store = safeStorage();
      if (!store) return null;
      let raw: string | null = null;
      try {
        raw = store.getItem(key(slug));
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const payload = parsed as Record<string, unknown>;
        if (payload.v !== version) return null;
        return parse(payload);
      } catch {
        return null;
      }
    },
    write(slug, payload) {
      const store = safeStorage();
      if (!store) return;
      try {
        if (payload === null) {
          store.removeItem(key(slug));
        } else {
          store.setItem(key(slug), JSON.stringify(payload));
        }
      } catch {
        /* 配额满 / 被禁用：忽略 —— 存不上只是丢了「退出再进来还在」 */
      }
    },
    remove(slug) {
      this.write(slug, null);
    },
  };
}
