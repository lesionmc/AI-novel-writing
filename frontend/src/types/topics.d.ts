/**
 * API 契约 · 选题向导（M1 增项：四问 + 三数据 → 蓝海细分方向）
 * -----------------------------------------------------------------------------
 * 端点为**同步**（team-lead 将原 `advice/stream` SSE 改判为同步 `/advice`）。
 * 两个端点均**不落库、无副作用** —— 调用方不应 invalidate 任何 query。
 * 由 `api.d.ts` 统一再导出。
 */

/**
 * `GET /api/topics/genres` 的题材条目（题材库的真实热度/竞争度数据）。
 * 对应契约 `GenreInfo`（前端类型名与契约 schema 名不同，字段逐一对齐）。
 */
export interface TopicGenre {
  name: string;
  category: string;
  /** 热度（题材库数据，非用户输入） */
  heat: number;
  /** 竞争度 */
  competition: number;
  /** 蓝海评分：越高越是「有人看、写得少」的细分 */
  blue_ocean_score: number;
  /** 该题材的核心体验（给新手判断「我到底想写什么」） */
  core_experience: string;
  /** 常见套路 */
  typical_tropes: string[];
  /** 对标作品 */
  benchmarks: string[];
}

/**
 * `GET /api/topics/genres` 响应（契约 `GenresResponse`）。
 *
 * [关键] 题材库文件缺失/损坏时**后端不报错**，返回 `{genres: []}` + `note` 可读提示
 * （对齐敏感词库 §5 风格：入口不隐藏、给引导）。前端必须把 `note` 显出来，
 * 否则用户只会看到一句通用兜底文案，拿不到「去补哪个文件」的信息。
 */
export interface TopicGenresResponse {
  genres: TopicGenre[];
  /** 为空数组时的可读提示；正常时 null */
  note: string | null;
}

/** `POST /api/topics/advice` 请求体（4 问；除题材外均可留空） */
export interface TopicAdviceRequest {
  favorite_genres: string[];
  unique_background?: string;
  /** 日更字数：2000 / 4000 / 6000 / 8000 */
  daily_words?: number;
  /** 目标总字数：500000 / 1000000 / 2000000 */
  target_length?: number;
  /** 写给谁看（平台 + 读者群），自由文本 */
  readers?: string;
}

/** 一条推荐方向 */
export interface TopicRecommendation {
  /** 蓝海细分方向名称 */
  niche: string;
  /** 为什么推荐它（结合热度 / 竞争度 / 用户背景） */
  reason: string;
  /** 3 本对标 */
  benchmarks: string[];
  /** 卖点示例（可直接作为新书的「一句话卖点」）；模型没给时为 null */
  sample_premise: string | null;
}

/** 一个「不建议写」的方向（契约 `AvoidDirection`） */
export interface TopicAvoid {
  direction: string;
  reason: string;
}

/** `POST /api/topics/advice` 响应 */
export interface TopicAdviceResponse {
  recommendations: TopicRecommendation[];
  avoid: TopicAvoid[];
}
