/**
 * MSW 种子数据（仅开发用，`VITE_USE_MOCK=true` 时启用）。
 * 用于后端就绪前验证界面与交互；形状**严格对齐 `06-API定义-openapi.yaml`**。
 */

import type {
  Book,
  Chapter,
  Character,
  Foreshadow,
  OutlineNode,
  PlotArc,
  Provider,
  RecallResponse,
  WorldEntry,
} from '@/types/api';

const NOW = '2026-01-15T10:00:00.000Z';

/** 契约 `Book`（10 字段；total_words / chapter_count 只在 BookBrief，列表时由处理器合成） */
export const seedBooks: Book[] = [
  {
    id: 1,
    slug: 'demo',
    title: '断剑（示例）',
    genre: '玄幻',
    target_words: 200000,
    premise: '一个旧货摊主捡到半块断剑，追查师父死因，牵出一桩二十年前的旧案。',
    summary: '沈砚在旧货摊捡到半块断剑，决意追查师父的死因。',
    writing_mode: 'assist',
    created_at: NOW,
    updated_at: NOW,
  },
];

export const seedChapters: Chapter[] = [
  {
    id: 101,
    seq: 1,
    title: '旧货摊',
    word_count: 2140,
    status: 'done',
    content: '<p>天还没亮透，沈砚就把摊子支了起来。断剑躺在最上面，像一段被遗忘的旧事。</p>',
    chapter_summary: '沈砚在旧货摊捡到半块断剑，认出是师父旧物。',
    hook: '断剑上的刻纹，与二十年前的旧案有关。',
    finalized_at: NOW,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 102,
    seq: 2,
    title: '柳氏来客',
    word_count: 1980,
    status: 'done',
    content: '<p>柳氏坐在对面，茶凉了也没喝完。她说，这剑不该再出现。</p>',
    chapter_summary: '柳氏来访，警告沈砚不要追查断剑来历。',
    hook: '柳氏为何知道断剑的来历？',
    finalized_at: NOW,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 103,
    seq: 3,
    title: '玄阴宗的影子',
    word_count: 2090,
    status: 'draft',
    content: '<p>黑水城的夜里，玄阴宗的旗子无声地挂着。</p>',
    chapter_summary: null,
    hook: null,
    finalized_at: null,
    created_at: NOW,
    updated_at: NOW,
  },
];

export const seedCharacters: Character[] = [
  {
    id: 201,
    name: '沈砚',
    alias: '断剑客',
    role: 'protagonist',
    surface_identity: '旧货摊主',
    secret_desire: '查明师父的死因',
    fatal_weakness: '不信任任何人',
    contradiction: '嘴上说不管，每次都出手',
    appearance: '身形偏瘦，右手虎口有一道旧疤。',
    background: '被师父收养，师父死于二十年前的一场大火。',
    first_chapter_seq: 1,
    status: 'alive',
    tags: ['旧识'],
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 202,
    name: '柳氏',
    alias: null,
    role: 'supporting',
    surface_identity: '茶楼老板娘',
    secret_desire: '守住二十年前的秘密',
    fatal_weakness: '对沈砚的愧疚',
    contradiction: '明知危险仍来警告他',
    appearance: '鬓角已有白丝，眼神很稳。',
    background: '曾是师父的旧识。',
    first_chapter_seq: 2,
    status: 'alive',
    tags: [],
    created_at: NOW,
    updated_at: NOW,
  },
];

export const seedWorldEntries: WorldEntry[] = [
  {
    id: 301,
    category: 'place',
    name: '南疆',
    content: '故事发生的地域，多山多雨。',
    parent_id: null,
    tags: [],
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 302,
    category: 'place',
    name: '黑水城',
    content: '南疆边城，玄阴宗的据点。',
    parent_id: 301,
    tags: [],
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 303,
    category: 'force',
    name: '玄阴宗',
    content: '行事隐秘的宗门，与旧案有关。',
    parent_id: null,
    tags: [],
    created_at: NOW,
    updated_at: NOW,
  },
];

export const seedForeshadows: Foreshadow[] = [
  {
    id: 401,
    title: '师父留下的半块玉佩',
    planted_chapter_seq: 1,
    planned_payoff_seq: 12,
    actual_payoff_seq: null,
    status: 'open',
    importance: 'high',
    note: '回收时要交代玉佩与玄阴宗的关系。',
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 402,
    title: '柳氏茶楼后的那口井',
    planted_chapter_seq: 2,
    planned_payoff_seq: 8,
    actual_payoff_seq: 8,
    status: 'closed',
    importance: 'medium',
    note: null,
    created_at: NOW,
    updated_at: NOW,
  },
];

/** 契约：大纲是**扁平数组**（含 parent_id），**无 children**；建树由前端完成 */
export const seedOutlines: OutlineNode[] = [
  {
    id: 501,
    level: 'total',
    parent_id: null,
    seq: 1,
    title: '断剑·总纲',
    content: '沈砚追查师父死因，最终发现真凶是自己最信任的人。',
    chapter_id: null,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 502,
    level: 'volume',
    parent_id: 501,
    seq: 1,
    title: '第一卷·断剑之始',
    content: '沈砚捡到断剑，被卷入旧案，初遇玄阴宗。',
    chapter_id: null,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 503,
    level: 'chapter',
    parent_id: 502,
    seq: 1,
    title: '旧货摊',
    content: '捡到断剑，认出是师父旧物。',
    chapter_id: 101,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 504,
    level: 'chapter',
    parent_id: 502,
    seq: 2,
    title: '柳氏来客',
    content: '柳氏警告，埋下旧案伏笔。',
    chapter_id: 102,
    created_at: NOW,
    updated_at: NOW,
  },
];

/** 契约 `LLMProvider`：is_default / enabled 为 integer(0/1) */
export const seedProviders: Provider[] = [
  {
    id: 601,
    provider: 'deepseek',
    model: 'deepseek-chat',
    base_url: 'https://api.deepseek.com',
    key_ref: 'keyring:deepseek:default',
    task_role: 'content',
    is_default: 1,
    enabled: 1,
  },
];

/** 契约 `PlotArc`：{ id, name, type, content, last_chapter_seq } */
export const seedPlotArcs: PlotArc[] = [
  {
    id: 701,
    name: '师父之死',
    type: 'main',
    content: '二十年前的大火，真相尚未揭开。',
    last_chapter_seq: 3,
  },
];

/** 契约 `RecallResult`：无 degraded / degraded_reason；budget 含 truncated / semantic_available */
export const seedRecall: RecallResponse = {
  chapter_seq: 3,
  characters: [
    {
      character_id: 201,
      name: '沈砚',
      role: 'protagonist',
      current_state: '决意追查真相',
      last_seen_seq: 2,
      relation_notes: '主角',
    },
    {
      character_id: 202,
      name: '柳氏',
      role: 'supporting',
      current_state: '试图阻止沈砚',
      last_seen_seq: 2,
      relation_notes: '旧识',
    },
  ],
  open_foreshadows: [
    { id: 401, title: '师父留下的半块玉佩', planted_seq: 1, importance: 'high', age: 2 },
  ],
  recalled_chunks: [
    { chunk_id: 9001, chapter_seq: 1, text: '断剑上的刻纹，与二十年前的旧案有关。', score: 0.83 },
  ],
  plot_arcs: [
    { id: 701, name: '师父之死', type: 'main', content: '二十年前的大火，真相尚未揭开。', last_chapter_seq: 3 },
  ],
  budget: {
    injected_chars: 812,
    injected_tokens_est: 541,
    truncated: false,
    semantic_available: true,
  },
};
