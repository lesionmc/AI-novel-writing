import { useMemo } from 'react';
import type { ChapterBrief, OutlineNode, VolumeGroup } from '@/types/api';

/**
 * 章节树数据：把章节列表按所属卷分组。
 * 数据源：`GET /api/books/{book}/chapters`（**不含正文**，200 章 <500ms，TC-13）
 *         + `GET /api/books/{book}/outlines`（扁平大纲，用于推导"章节 → 卷"归属）。
 *
 * [契约] `ChapterBrief` **没有** `volume_title` 字段；卷名只能由大纲的
 *        卷纲节点（level=volume）与章节卡（level=chapter，`chapter_id` 关联正文、
 *        `parent_id` 指向卷纲）在前端合成。无匹配者归入「未分卷」。
 */
export function useChapterTree(
  briefs: ChapterBrief[] | undefined,
  outlines?: OutlineNode[],
): VolumeGroup[] {
  return useMemo(() => {
    if (!briefs || briefs.length === 0) return [];
    const ordered = [...briefs].sort((a, b) => a.seq - b.seq);

    // 卷纲 id → 卷名
    const volumeTitleById = new Map<number, string>();
    for (const o of outlines ?? []) {
      if (o.level === 'volume') {
        volumeTitleById.set(o.id, o.title?.trim() || `第 ${o.seq} 卷`);
      }
    }
    // 章节 id → 卷名（章节卡挂在卷纲下）
    const volumeOfChapter = new Map<number, string>();
    for (const o of outlines ?? []) {
      if (o.level === 'chapter' && o.chapter_id != null && o.parent_id != null) {
        const vt = volumeTitleById.get(o.parent_id);
        if (vt) volumeOfChapter.set(o.chapter_id, vt);
      }
    }

    const groups: VolumeGroup[] = [];
    const index = new Map<string, number>();
    for (const ch of ordered) {
      const title = volumeOfChapter.get(ch.id) ?? '未分卷';
      let g = index.get(title);
      if (g === undefined) {
        g = groups.length;
        index.set(title, g);
        groups.push({ volumeId: null, title, chapters: [] });
      }
      groups[g].chapters.push(ch);
    }
    return groups;
  }, [briefs, outlines]);
}
