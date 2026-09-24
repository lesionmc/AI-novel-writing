/**
 * 开书向导的纯逻辑层（无 React）：步骤文案 + **完成度推断**。
 *
 * ---------------------------------------------------------------------------
 * 完成度为什么不存储、只推断
 * ---------------------------------------------------------------------------
 * 「这一步做完了没」在数据上已经有确定答案 —— 人物卡有几张、大纲有没有、
 * 卖点填了没。这些都能从**已有端点**读到（`hooks/queries.ts` 里现成的
 * `useBook` / `useCharacters` / `useWorldEntries` / `useOutlines`），
 * 所以不需要新接口、不需要新表、不需要状态机。
 *
 * 副作用是**老作品天然兼容**：4 部已存在的作品会被按真实数据算出
 * 「已经在写稿阶段」，而不是被当成「请从第 1 步开始」。
 */

import type { GuideStepId } from './onboardingProgress';

/** 推断完成度所需的全部事实 —— 由 `useBookProgress` 从已有查询组装 */
export interface GuideFacts {
  genre: string | null;
  premise: string | null;
  readers: string | null;
  summary: string | null;
  characters: number;
  worldEntries: number;
  foreshadows: number;
  outlines: number;
  chapters: number;
}

export const EMPTY_FACTS: GuideFacts = {
  genre: null,
  premise: null,
  readers: null,
  summary: null,
  characters: 0,
  worldEntries: 0,
  foreshadows: 0,
  outlines: 0,
  chapters: 0,
};

/** 某一步是否已完成 */
export type StepDoneMap = Record<GuideStepId, boolean>;

/**
 * 三步的完成判据：
 *   · 第 1 步「立项」—— 题材、写给谁、卖点**三样齐**才算定下来（这正是"决定写什么、写给谁"）
 *   · 第 2 步「骨架」—— 人物 / 世界观 / 线索 / 大纲**任一**有内容
 *   · 第 3 步「包装」—— 书架简介（summary）有值 —— 与第 1 步的卖点（premise）**分家**，
 *     否则 AI 选题一次填满 premise 会让两步"同时完成"，第 3 步形同虚设（2026-09-24 修正）。
 * 刻意**不要求"全部填满"**：指南说「答不上就别开」，但产品不能因此把用户卡住。
 */
export function stepDone(facts: GuideFacts): StepDoneMap {
  const hasText = (v: string | null) => Boolean(v && v.trim());
  return {
    direction: hasText(facts.genre) && hasText(facts.readers) && hasText(facts.premise),
    skeleton:
      facts.characters > 0 || facts.worldEntries > 0 || facts.foreshadows > 0 || facts.outlines > 0,
    package: hasText(facts.summary),
  };
}

/** 已完成步数（用于顶部进度条；不用百分比数字，避免小白纠结） */
export function doneCount(done: StepDoneMap): number {
  return [done.direction, done.skeleton, done.package].filter(Boolean).length;
}

/* ========================================================================== */
/* 步骤文案 —— 面向"不懂技术的写作者"，界面绝不出现「立项/骨架/包装/伏笔」等术语 */
/* ========================================================================== */

export interface StepCopy {
  id: GuideStepId;
  /** 只用于「第 N 步 / 共 3 步」，不写进标题 */
  no: number;
  title: string;
  blurb: string;
}

export const STEP_COPY: StepCopy[] = [
  {
    id: 'direction',
    no: 1,
    title: '先想清楚写什么、写给谁',
    blurb: '选一个你写得动、又有人看的方向，再定下发哪个平台、给谁看。定了之后随时能改。',
  },
  {
    id: 'skeleton',
    no: 2,
    title: '先把架子搭起来',
    blurb: '先立几个人、写点这个世界的样子、把主线分成几段。搭完之后写起来不容易前后打架。',
  },
  {
    id: 'package',
    no: 3,
    title: '打磨书名，写一句书架简介',
    blurb: '读者是先看到名字和这一句话，才决定点不点开的。简介和卖点分开写：卖点是给你自己的，简介是给读者的。',
  },
];

/** 第 2 步下面的三张子卡片（点进去都是**已有页面**，向导只负责派活） */
export interface SkeletonItem {
  key: string;
  label: string;
  hint: string;
  /** 拼 URL 用：交给 `@/lib/slug` 的 `bookPath()` */
  sub: string;
  search: string;
  count: (f: GuideFacts) => number;
}

export const SKELETON_ITEMS: SkeletonItem[] = [
  {
    key: 'characters',
    label: '立几个人物',
    hint: '主角想要什么、卡在哪、有什么毛病。进去后可以让 AI 陪你聊，也可以自己一条条填',
    sub: '/settings',
    search: '',
    count: (f) => f.characters,
  },
  {
    key: 'world',
    label: '写点世界观',
    hint: '这个世界的规矩、地点、势力。够用就行，别写说明书',
    sub: '/settings',
    search: 'tab=world',
    count: (f) => f.worldEntries,
  },
  {
    key: 'outlines',
    label: '把主线分成几段',
    hint: '先写一句「这本书大概讲什么」，再慢慢拆成一段一段',
    sub: '/settings',
    search: 'tab=outline',
    count: (f) => f.outlines,
  },
];
