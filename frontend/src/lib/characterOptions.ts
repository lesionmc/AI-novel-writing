/**
 * 新手辅助选项库。
 *
 * 设计意图：把「面对空文本框发呆」变成「从套路里挑一个再改」。
 * 这些选项全部是可自由编辑的**建议**，不是枚举约束 —— 用户随时能改成自己的写法。
 *
 * 内容取舍：走「网文常见度 × 新手友好度」，不追求穷尽。
 * 挑不出想要的，直接手写即可（输入框永远可编辑）。
 */

/** 表面身份：别人眼中的他 —— 职业 / 身份 / 公开立场 */
export const SURFACE_IDENTITY_OPTIONS: string[] = [
  '旧货摊主',
  '书店店主',
  '客栈伙计',
  '药铺掌柜',
  '镖师',
  '捕快',
  '书生',
  '游方郎中',
  '猎户',
  '船夫',
  '铁匠',
  '教书先生',
  '修表匠',
  '酒馆老板',
  '茶馆老板娘',
  '学生',
  '教师',
  '医生',
  '警察',
  '侦探',
  '记者',
  '律师',
  '程序员',
  '出租车司机',
  '外卖骑手',
  '退役运动员',
  '公司职员',
  '自由摄影师',
  '小饭馆厨师',
  '社区保安',
];

/** 秘密欲望：嘴上要什么 vs 心里其实要什么 —— 驱动他做选择的东西 */
export const SECRET_DESIRE_OPTIONS: string[] = [
  '查明亲人真正的死因',
  '为家族复仇',
  '夺回被抢走的东西',
  '证明自己不是废物',
  '保护唯一剩下的亲人',
  '找到失踪多年的挚友',
  '得到师父的一句认可',
  '摆脱被人操控的命运',
  '赎清过去犯下的错',
  '只是想让家人活下去',
  '变强，不再被人踩在脚下',
  '找到故乡的真相',
  '拆穿一个维持了很久的谎言',
  '把当年的真相公之于众',
  '重新获得失去的名誉',
  '让仇人付出代价',
];

/** 致命弱点：一击即溃的地方 —— 反派靠它翻盘，主角靠它成长 */
export const FATAL_WEAKNESS_OPTIONS: string[] = [
  '不信任任何人',
  '心软，见不得弱者受苦',
  '冲动易怒，受不得激',
  '过度自负，听不进劝',
  '优柔寡断，关键时下不了手',
  '贪财，见钱眼开',
  '酗酒，一喝就误事',
  '害怕失去，所以先推开别人',
  '执念太深，为了目标不择手段',
  '身上有旧伤，动武撑不过三招',
  '亲人是软肋，被拿捏就范',
  '不屑说谎，所以藏不住事',
  '太重承诺，答应的事死也要做到',
  '怕黑 / 怕水 / 怕高（具体恐惧）',
];

/** 矛盾行为：说的和做的不一致 —— 人物活起来的关键 */
export const CONTRADICTION_OPTIONS: string[] = [
  '嘴上说不管，每次都出手',
  '嘴上贪财，却总把钱散给别人',
  '说着最狠的话，做最软的事',
  '厌恶说谎，却习惯了隐瞒自己',
  '怕死，却总冲在最前面',
  '装作冷漠，其实记得每个人的小事',
  '劝别人放下，自己从不放下',
  '声称不信任何人，却留了一把备用钥匙',
  '嘴上嫌麻烦，接到求助立刻就走',
  '说不欠人情，暗地里把债都还了',
];

/**
 * 题材：取自 10-题材知识库-genres.json（M1 不调 /api/topics/genres，本地内置一份）。
 *
 * `hint` 是一句话解释。**为什么必须有**：QA 小白走查 M2 —— 下拉里 22 个赛道名
 * （反爽文 / 赛博修仙 / 规则怪谈 / 中式克苏鲁 / 无 CP 事业流）**没有一句解释**，
 * 新手"不知道该挑哪个，只能凭名字瞎选"。补上一句话，选择题就从「猜名字」变成「读一句话」。
 * 真源是后端 `data/genres.json`（`GET /api/topics/genres` 的 `core_experience`）；
 * 建书表单要能在题材库文件缺失时独立可用，故本地留一份短的。
 */
export const GENRE_OPTIONS: { value: string; hint: string }[] = [
  { value: '传统玄幻', hint: '升级打怪、以力破局，最经典的爽文底盘' },
  { value: '家族修仙', hint: '一族人的兴衰：资源分配与代际传承' },
  { value: '仙侠·反爽文', hint: '故意不让你爽，讲代价与选择' },
  { value: '赛博修仙', hint: '古法与算法对撞：修仙家族公司化' },
  { value: '系统流·反套路', hint: '有系统，但系统本身是个坑' },
  { value: '都市脑洞', hint: '日常世界被撕开一个口子' },
  { value: '都市高武', hint: '现代都市里拼武力与门派' },
  { value: '职业异能', hint: '把一门真实职业写出超自然的分量' },
  { value: '规则怪谈', hint: '找出场景里不成文却致命的规则' },
  { value: '民俗志怪', hint: '把乡土传说当真事写，恐惧从土地里长出来' },
  { value: '无限流', hint: '一个个副本推进，靠积累与脑子活下来' },
  { value: '中式克苏鲁', hint: '东方的诡秘与不可名状' },
  { value: '历史权谋', hint: '朝堂博弈、人心算计' },
  { value: '历史·实业种田', hint: '用一个现代人的手艺撬动一整个时代' },
  { value: '末世求生', hint: '秩序崩塌之后，人还剩多少' },
  { value: '游戏现实主义', hint: '游戏规则真实地作用于现实' },
  { value: '豪门总裁', hint: '商战与情感的都市角力' },
  { value: '年代文', hint: '回到特定年代，过日子、抓机会' },
  { value: '恶毒女配', hint: '穿进书里，从配角视角翻盘' },
  { value: '女性悬疑', hint: '从被忽视的视角，把日常写成暗流' },
  { value: '无 CP 事业流', hint: '不谈感情，只讲把事业做大' },
  { value: '甜宠日常', hint: '轻松撒糖，读起来没压力' },
];

/** 目标字数：给新手一个可选的量级感，避免面对空数字框发懵 */
export const TARGET_WORDS_OPTIONS: { value: string; label: string }[] = [
  { value: '100000', label: '10 万字左右（短篇/试水）' },
  { value: '200000', label: '20 万字左右' },
  { value: '300000', label: '30 万字左右（常见网文体量）' },
  { value: '500000', label: '50 万字左右（长线连载）' },
  { value: '1000000', label: '100 万字以上（大长篇）' },
];

export interface ProviderOption {
  value: string;
  label: string;
  /** 内置默认端点（选中后若留空 base_url，后端会用这个） */
  defaultBaseUrl?: string;
  /** 是否免密钥（本地模型） */
  keyless?: boolean;
  hint: string;
}

/** 模型平台：把「provider 名」从一道填空题变成一道选择题 */
export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'deepseek',
    label: 'DeepSeek（深度求索）',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    hint: '中文写作能力强，价格低，国内可直连',
  },
  {
    value: 'qwen',
    label: '通义千问（阿里云百炼）',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    hint: '国内直连稳定，有免费额度模型',
  },
  {
    value: 'kimi',
    label: 'Kimi（月之暗面）',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    hint: '长上下文见长，适合长篇设定理解',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter（聚合平台）',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    hint: '一个 Key 用多家模型，有 :free 免费模型（每日限额，高峰期易限流）',
  },
  {
    value: 'stepfun',
    label: '阶跃星辰 StepFun',
    defaultBaseUrl: 'https://api.stepfun.com/v1',
    hint: '国产模型，新账号通常有赠送额度',
  },
  {
    value: 'claude',
    label: 'Claude（Anthropic）',
    hint: '长文一致性最好，但国内需自备网络环境',
  },
  {
    value: 'ollama',
    label: 'Ollama（本地模型）',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    keyless: true,
    hint: '完全本地、不花钱、不联网；需要先在本机跑起 Ollama',
  },
  {
    value: 'custom',
    label: '自定义（OpenAI 兼容端点）',
    hint: '任何兼容 OpenAI 接口的服务，填自己的地址与密钥',
  },
];
