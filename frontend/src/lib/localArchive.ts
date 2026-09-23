/**
 * localStorage 存档基座（按作品分键 + 载荷版本号 + 失败可见的静默降级）。
 *
 * 各业务的本地留存（AI 会话、大纲草稿、向导进度）在此之上只写自己的
 * 形状校验与裁剪逻辑，不再各自重复存储管线的 try/catch。
 *
 * 约定：
 * · **读不依赖写探针**：配额满时 setItem 会炸但已有数据仍读得回来 ——
 *   若读也走探针，用户看到的是"退出再进来记忆蒸发"（数据没丢、认知丢了）。
 * · 写失败（隐私模式 / 配额满 / 被策略禁用）不抛错，但**返回 false**，
 *   让调用方有机会如实提示"本次未留存"，而不是静默装死。
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
  /** 写存档；payload 传 null 表示删键。返回是否真正落盘（false = 没存上） */
  write(slug: string, payload: unknown | null): boolean;
  remove(slug: string): void;
}

/**
 * 建一个按作品分键的存档通道。
 * @param prefix 键前缀（如 `ainovel.aihub.`），须以 `.` 结尾
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
      // 刻意直接用 window.localStorage 而非 safeStorage 探针：配额满时探针写会失败，
      // 但已有数据仍要读得回来（见模块头「读不依赖写探针」）。
      try {
        const raw = window.localStorage.getItem(key(slug));
        if (!raw) return null;
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
      if (!store) return false;
      try {
        if (payload === null) {
          store.removeItem(key(slug));
        } else {
          store.setItem(key(slug), JSON.stringify(payload));
        }
        return true;
      } catch {
        /* 配额满 / 被禁用：不抛错，但如实回报，调用方负责告诉用户 */
        return false;
      }
    },
    remove(slug) {
      this.write(slug, null);
    },
  };
}
