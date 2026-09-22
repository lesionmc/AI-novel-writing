/**
 * 展示格式化工具（数字 / 字数 / 时间）
 * 统一 zh-CN，避免各组件各写一套。
 */

const numberFmt = new Intl.NumberFormat('zh-CN');
const dtFmt = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 千分位整数，如 12,800 */
export function formatNumber(n: number): string {
  return numberFmt.format(Math.round(n || 0));
}

/** 字数可读化：≥1 万显示「12.8 万字」，否则「2,431 字」 */
export function formatWordCount(n: number): string {
  const v = Math.max(0, Math.round(n || 0));
  if (v >= 10000) {
    const wan = v / 10000;
    return `${wan >= 100 ? Math.round(wan) : wan.toFixed(1)} 万字`;
  }
  return `${numberFmt.format(v)} 字`;
}

/** 近似 token（用于召回开销展示）：中文约 1.5 字/token */
export function estimateTokens(chars: number): number {
  return Math.round((chars || 0) / 1.5);
}

export function formatDateTime(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? dtFmt.format(d) : '—';
}

export function formatTime(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? timeFmt.format(d) : '—';
}

export function formatDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? dateFmt.format(d) : '—';
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / 具体日期 */
export function formatRelative(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return formatDate(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨天';
  if (day < 30) return `${day} 天前`;
  return formatDate(iso);
}

/** 目标进度百分比（0–100，封顶） */
export function progressPercent(current: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}
