/**
 * 选题向导 —— 纯数据层（无 React）。
 * 四问里的三个可选项（日更字数 / 目标总长）在此集中，避免组件里散落魔法数字。
 */

import type { TopicAdviceRequest } from '@/types/api';

export interface NumberOption {
  value: number;
  label: string;
  hint?: string;
}

/** 第 3 问：一天能写多少字 */
export const DAILY_WORDS_OPTIONS: NumberOption[] = [
  { value: 2000, label: '2000 字左右', hint: '兼职写作，节奏稳' },
  { value: 4000, label: '4000 字左右', hint: '大多数新手作者的起点' },
  { value: 6000, label: '6000 字左右', hint: '全职或高强度兼职' },
  { value: 8000, label: '8000 字以上', hint: '全职冲刺' },
];

/** 第 4 问：想写多长 */
export const TARGET_LENGTH_OPTIONS: NumberOption[] = [
  { value: 500_000, label: '50 万字左右', hint: '一部紧凑的长篇' },
  { value: 1_000_000, label: '100 万字左右', hint: '网文常规体量' },
  { value: 2_000_000, label: '200 万字以上', hint: '长线连载' },
];

/** 五问的作答（全部可留空，不逼用户打字） */
export interface TopicAnswers {
  favoriteGenres: string[];
  uniqueBackground: string;
  dailyWords: number | null;
  targetLength: number | null;
  /** 写给谁看：平台 + 读者群，自由文本（胶囊只是快捷填入） */
  readers: string;
}

export const EMPTY_ANSWERS: TopicAnswers = {
  favoriteGenres: [],
  uniqueBackground: '',
  dailyWords: null,
  targetLength: null,
  readers: '',
};

/** 作答 → 契约请求体（空值一律不带字段，让后端走默认） */
export function toAdviceRequest(a: TopicAnswers): TopicAdviceRequest {
  const bg = a.uniqueBackground.trim();
  const rd = a.readers.trim();
  return {
    favorite_genres: a.favoriteGenres,
    ...(bg ? { unique_background: bg } : {}),
    ...(a.dailyWords !== null ? { daily_words: a.dailyWords } : {}),
    ...(a.targetLength !== null ? { target_length: a.targetLength } : {}),
    ...(rd ? { readers: rd } : {}),
  };
}

/** 第 5 问「写给谁看」的平台胶囊（点了即填，也可自己打字补充「男频/女频/学生党多」之类） */
export const READER_PLATFORM_OPTIONS = ['番茄免费', '起点', '晋江', '飞卢', '七猫'];

/** 最多能选几个题材（选太多反而说明没想好） */
export const MAX_GENRES = 3;

/**
 * 把题材库的三个分数翻译成人话（QA M7：给出「热度 90 / 竞争密度 60 / 蓝海指数 36」
 * 却没有标尺，小白不知道 36 是高还是低）。这里只给结论词，数字留在内部数据里。
 */
export function heatWords(heat: number): string {
  if (heat >= 85) return '看的人很多';
  if (heat >= 70) return '看的人不少';
  if (heat >= 55) return '看的人一般';
  return '看的人偏少';
}

export function competitionWords(competition: number): string {
  if (competition >= 80) return '竞争很挤';
  if (competition >= 60) return '竞争偏大';
  if (competition >= 40) return '竞争中等';
  return '竞争小';
}

/** 一句话结论：值得优先考虑 / 需要更独特的切入角度 */
export function blueOceanWords(score: number): string {
  if (score >= 70) return '很值得写';
  if (score >= 45) return '可以写';
  return '要很独特的切入';
}
