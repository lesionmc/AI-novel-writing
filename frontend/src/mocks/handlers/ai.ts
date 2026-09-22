/** MSW 处理器：选题向导（topics）+ AI 对话式建设定（ai）。均为 M1 增项、不落库。 */

import { delay, http } from 'msw';
import type {
  SetupChatRequest,
  SetupDraft,
  TopicAdviceRequest,
  TopicGenre,
  TopicRecommendation,
} from '@/types/api';
import { ok } from '../db';

/* ============================ 题材库（示例数据） ============================ */

const GENRES: TopicGenre[] = [
  {
    name: '都市脑洞',
    category: '都市',
    heat: 92,
    competition: 78,
    blue_ocean_score: 41,
    core_experience: '把日常世界撕开一个口子，看规则被重新写一遍',
    typical_tropes: ['系统降临', '全民异能', '规则改写'],
    benchmarks: ['我师兄实在太稳健了', '夜的命名术', '这游戏也太真实了'],
  },
  {
    name: '规则怪谈',
    category: '悬疑',
    heat: 74,
    competition: 33,
    blue_ocean_score: 86,
    core_experience: '在看似普通的场景里，找出那些不成文却致命的规则',
    typical_tropes: ['怪谈副本', '身份替换', '观察者视角'],
    benchmarks: ['规则怪谈：我能看见血条', '阴阳代理人', '惊悚乐园'],
  },
  {
    name: '家族修仙',
    category: '仙侠',
    heat: 81,
    competition: 61,
    blue_ocean_score: 63,
    core_experience: '以一族之力对抗时代，看血脉与选择的重量',
    typical_tropes: ['族运兴衰', '长辈博弈', '联姻与背叛'],
    benchmarks: ['凡人修仙传', '玄鉴仙族', '长生不死'],
  },
  {
    name: '民俗志怪',
    category: '志怪',
    heat: 68,
    competition: 29,
    blue_ocean_score: 82,
    core_experience: '把乡土传说当成真事来写，恐惧从土地里长出来',
    typical_tropes: ['走阴人', '地方禁忌', '因果报应'],
    benchmarks: ['阴符经', '缥缈山', '茅山后裔'],
  },
  {
    name: '职业异能',
    category: '都市',
    heat: 70,
    competition: 44,
    blue_ocean_score: 71,
    core_experience: '把一门真实职业写出超自然的分量',
    typical_tropes: ['职业觉醒', '行业内幕', '能力代价'],
    benchmarks: ['大医凌然', '警探长', '我在精神病院学斩神'],
  },
  {
    name: '末世求生',
    category: '末世',
    heat: 79,
    competition: 58,
    blue_ocean_score: 58,
    core_experience: '秩序崩塌之后，人还剩多少',
    typical_tropes: ['囤货流', '基地建设', '人性考验'],
    benchmarks: ['末世超级商人', '全球灾变', '黑暗血时代'],
  },
  {
    name: '历史·实业种田',
    category: '历史',
    heat: 66,
    competition: 26,
    blue_ocean_score: 84,
    core_experience: '用一个现代人的手艺，撬动一整个时代',
    typical_tropes: ['技术流', '种田', '家国线'],
    benchmarks: ['材料帝国', '食货', '山河志'],
  },
  {
    name: '女性悬疑',
    category: '悬疑',
    heat: 72,
    competition: 37,
    blue_ocean_score: 76,
    core_experience: '从被忽视的视角出发，把日常写成暗流',
    typical_tropes: ['双线时间', '不可靠叙述', '家庭谜团'],
    benchmarks: ['沉默的证人', '房思琪的初恋乐园', '她的名字'],
  },
];

/* ============================ 选题向导 ============================ */

/** 组合两个赛道名；相同则不重复拼接（避免出现「规则怪谈 × 规则怪谈」） */
const pair = (a: string, b: string) => (a === b ? a : `${a} × ${b}`);

function buildRecommendations(favs: string[], background: string): TopicRecommendation[] {
  const first = favs[0] ?? '都市脑洞';
  const hasBg = background.trim().length > 0;
  const bgLine = hasBg ? `你提到「${background.trim().slice(0, 12)}」，这正好能换成独家细节。` : '';
  return [
    {
      niche: pair(first, '规则怪谈'),
      reason: `喜欢${first}的读者群还在涨，但纯粹的${first}已经挤满。把怪谈的「找规则」叠加进来，能把竞争度压到同级最低，同时留住爽感。${bgLine}`,
      benchmarks: ['规则怪谈：我能看见血条', '夜的命名术', '诡秘之主'],
      sample_premise: `一个普通人在${first}世界里，靠一本写满禁忌的旧手册活下来——每翻开一页，规则就改一次。`,
    },
    {
      niche: pair('民俗志怪', first),
      reason: '同类作品少、读者黏性高，平台缺这类「有质感」的长篇。适合稳扎稳打地写到 50 万字以上。',
      benchmarks: ['阴符经', '缥缈山', '茅山后裔'],
      sample_premise: '爷爷留下的那本黄纸册子，记着村子里每一条不能做的事。今年，规矩被破了第一条。',
    },
    {
      niche: pair('职业异能', first),
      reason: hasBg
        ? '你写下的经历就是最好的素材库：真实行业的细节是别人抄不走的护城河。'
        : '把一门真实职业写透，天然自带可信度；新手容易上手，也方便日后扩写。',
      benchmarks: ['大医凌然', '警探长', '我在精神病院学斩神'],
      sample_premise: '他只是一个普通的夜班值守员，直到他发现——值夜班的人，都不太对劲。',
    },
  ];
}

/* ============================ AI 对话式建设定 ============================ */

const DRAFT: SetupDraft = {
  premise: '一个落魄的药剂师，靠一张写错了的配方，撬动整个王朝的命脉。',
  characters: [
    {
      name: '沈青梧',
      role: 'protagonist',
      status: 'alive',
      surface_identity: '城南药铺的坐堂药师',
      secret_desire: '为家族复仇',
      fatal_weakness: '亲人是软肋，被拿捏就范',
      contradiction: '说着最狠的话，做最软的事',
      appearance: '左手小指缺了一截，常年戴一只旧皮手套',
      tags: ['旧识', '药师'],
    },
    {
      name: '裴无咎',
      role: 'antagonist',
      status: 'alive',
      surface_identity: '太医院最年轻的首席',
      secret_desire: '证明自己不是废物',
      fatal_weakness: '过度自负，听不进劝',
      contradiction: '厌恶说谎，却习惯了隐瞒自己',
      tags: ['官面'],
    },
    {
      name: '阿箬',
      role: 'supporting',
      status: 'alive',
      surface_identity: '药铺里打杂的哑女',
      secret_desire: '查明亲人真正的死因',
      fatal_weakness: '害怕失去，所以先推开别人',
      contradiction: '装作冷漠，其实记得每个人的小事',
      tags: ['药铺'],
    },
  ],
  world_entries: [
    {
      category: 'force',
      name: '太医院',
      content: '掌管天下药材与医官的机构，实则是各方势力争夺药方的棋盘。',
    },
    {
      category: 'rule',
      name: '药方三禁',
      content: '不可改分毫、不可示外人、不可用于皇室——破一禁者，革籍查办。',
    },
    {
      category: 'place',
      name: '城南药铺',
      content: '沈青梧的立足之地，也是他与人交换消息的中转站。',
    },
  ],
};

/**
 * 逐步追问（第 1 问「讲什么故事」由前端的开场白承担）。
 * 第 N 条用户消息 → 返回第 N 个追问；问完 → 出草稿。
 */
const AI_FOLLOWUPS = [
  '记住了。那主角是谁？他表面上是干什么的，心里其实想要什么？想不出来也没关系，我可以先给个方向。',
  '最后聊聊世界：故事发生在什么时代、什么环境，有没有不能违反的规则？说不清也行，我按前面的设定补。',
];

function draftReply(ctx: SetupChatRequest): SetupDraft {
  const title = ctx.book_context?.title?.trim();
  return title ? { ...DRAFT, premise: `《${title}》：${DRAFT.premise}` } : DRAFT;
}

export const aiHandlers = [
  /* ---- 题材库 ---- */
  http.get('/api/topics/genres', () => {
    // 复验开关：localStorage['mock:noGenres'] = '1' → 演示「题材库缺失」的空态 + note 引导
    const missing =
      typeof window !== 'undefined' && window.localStorage.getItem('mock:noGenres') === '1';
    if (missing) {
      return ok({
        genres: [],
        note: '还没有题材库文件（data/genres.json）。可以自己放一份进来，或者先跳过这一问。',
      });
    }
    // 契约 `GenresResponse` 正常时 note 为 null
    return ok({ genres: GENRES, note: null });
  }),

  /* ---- 选题推荐 ---- */
  http.post('/api/topics/advice', async ({ request }) => {
    // 真后端实测约 48s（要注入题材库全文再让模型推理）。mock 用 5s —— 短到不烦人，
    // 又长到能在浏览器里真实看到 loading 态（太短会一闪而过，验证不到）。
    await delay(5000);
    const b = (await request.json()) as TopicAdviceRequest;
    return ok({
      recommendations: buildRecommendations(b.favorite_genres ?? [], b.unique_background ?? ''),
      avoid: [
        {
          direction: '传统玄幻（老一套的废柴逆袭）',
          reason: '头部作品已经把这个套路写到天花板，新书很难在开篇留住读者。',
        },
        {
          direction: '多主角群像开局',
          reason: '新手很难在前三章同时立住三个人，读者容易记不住谁是谁。',
        },
        {
          direction: '无限流（无纲直写）',
          reason: '对副本设计能力要求极高，没有大纲几乎必崩，建议写到 50 万字后再碰。',
        },
      ],
    });
  }),

  /* ---- 对话式建设定 ---- */
  http.post('/api/ai/setup-chat', async ({ request }) => {
    await delay(800);
    const b = (await request.json()) as SetupChatRequest;
    const userMessages = (b.messages ?? []).filter((m) => m.role === 'user');
    const userCount = userMessages.length;

    // 快捷回复「你帮我定就行」/「可以了，帮我整理」→ 立刻出草稿（方便演示 done:true 分支）
    const wantsAuto = userMessages.some((m) => /帮我定|随便|直接|你来|你定|整理/.test(m.content));
    if (!wantsAuto && userCount <= AI_FOLLOWUPS.length) {
      return ok({ reply: AI_FOLLOWUPS[userCount - 1], done: false, draft: null });
    }

    return ok({
      reply: '差不多了，我把设定整理成一份草稿，你看看合不合口味。改一改、删掉不要的，确认后才会写进设定库。',
      done: true,
      draft: draftReply(b),
    });
  }),
];
