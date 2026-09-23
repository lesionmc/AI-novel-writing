-- ============================================================================
-- AI 小说创作工具 — 数据库建表脚本（修正版 · 唯一真相源）
-- ============================================================================
-- 适用范围：每部作品一个独立的 SQLite 库文件
--           路径：books/<book-slug>/novel.db
-- 版本    ：schema v1（2026-09-20）｜ 基于 `05-数据库schema.sql` 修正
--
-- 【本文件相对 05-数据库schema.sql 的修正点清单】（项目总监 2026-09-20 定稿）
--   1. `chunk_meta` 增列 `embedding BLOB` 与 `embedding_dim INTEGER DEFAULT 1024` …… 落实 D-18
--      （原设计向量只存 vec_chunk，扩展不可用/损坏时无法重建；增列后向量有可重建源）
--   2. 补两条索引 `idx_version_chapter(chapter_version)` / `idx_char_role(character)` …… 落实 D-10
--      （03 §2.4 关键索引清单遗漏，按 05/06 补齐）
--   3. `character.role` 英文枚举 + `NOT NULL DEFAULT 'supporting'` …… 落实 D-11（与 05 一致，此处仅确认）
--   4. `recall_log` 含 `structured_hits` / `semantic_hits` …… 落实 D-08（与 05 一致，此处仅确认）
--   5. `chunk_meta` 的 `UNIQUE(source_type, source_id, chapter_seq)` 对 `chapter_seq IS NULL`
--      不生效（SQLite 视 NULL 互不相等）→ 唯一性改由**写入侧（应用层）**保证 …… 落实 D-15
--   6. `vec_chunk` **条件化创建**（sqlite-vec 扩展可用才建）…… 落实 D-17
--   7. `chapter_fts` / `setting_fts` **条件化创建**（FTS5 可用才建）…… 第 11 章坑 3
--
-- 【块标记约定 —— 与 `app/db/schema_loader.py` 严格对齐，勿改】
--   本文件是**全部库**的建表 DDL 唯一真相源（书库 + 全局库同源解析，避免双真源漂移）。
--   无条件语句（PRAGMA + 14 张书库普通表 + 8 个索引 + user_version 标记）**直接罗列**，
--   由 `scope="book"` 建书库时始终执行。
--   分块语句用**成对标记**包住，由 `schema_loader.load_statements(scope=...)` 择取：
--     · 行首恰为 `@@OPTIONAL fts` 的行开启一段，到行首恰为 `@@END` 的行结束；
--       仅当 `caps.fts5_available` 为真才执行该段（chapter_fts / setting_fts），且仅入书库。
--     · 行首恰为 `@@OPTIONAL vec` 的行开启一段，到行首恰为 `@@END` 的行结束；
--       仅当 `caps.vec_available` 为真才执行该段（vec_chunk），且仅入书库。
--     · 行首恰为 `@@GLOBAL <table>` 的行开启一段，到行首恰为 `@@END` 的行结束；
--       该段属**全局库**（`data/app.db`）对象，`scope="book"` 时**跳过**、`scope="global"` 时**只取该段**；
--       书库不再持有该对象。当前承载 `llm_provider`（模型配置全局共享，换书不必重配）、
--       `meta`（全局键值元信息，如一次性迁移标记）与 `provider_role`
--       （模型 ↔ 任务角色的多对多关联，使一个模型可同时承担多个角色）。
--   ⚠ 红线 3：三张虚拟表若不加标记、随主段一起执行，缺扩展 / 缺 FTS5 的环境会**整体建库失败**，
--     在“建书库”第一步就崩。必须条件化。
--   ⚠ 除下方真正的标记行外，**任何注释都不得以 `@@OPTIONAL` / `@@GLOBAL` / `@@END` 作为行首**，
--     否则会被 loader 误判为标记、吞掉后续语句。
--
-- 使用方式：
--   1. 建库时由 `app/db/registry.py` → `schema_loader.apply_schema(conn, caps)` 执行本文件
--      （先按能力过滤条件段，再逐句执行；执行后 user_version = 1）
--   2. 已存在的库通过 `PRAGMA user_version` 判断是否需要迁移
--
-- 注意事项：
--   · 连接建立后必须执行 `PRAGMA foreign_keys = ON`（SQLite 默认关闭外键；否则 CASCADE 不生效）
--     —— 由 `app/db/connection.connect()` 统一设置，本文件内的 PRAGMA 仅兜底
--   · `updated_at` / `created_at` 由应用层维护，不使用触发器（便于测试与调试）
--   · FTS **由应用层在章节保存 / 设定变更时同步维护**（不上触发器；触发器隐式副作用难追踪，
--     与“手写 SQL、便于审计”冲突）。项目总监 2026-09-20 定稿。
--   · VEC 段为 sqlite-vec 虚拟表，需先加载扩展；扩展不可用则跳过该段，
--     向量召回降级为纯结构化召回（功能仍可用，见 `GET /api/system/capabilities`）。
-- ============================================================================


-- ============================================================================
-- 一、无条件段（PRAGMA + 15 张普通表 + 8 个索引 + 版本标记）
-- ============================================================================

PRAGMA journal_mode = WAL;      -- 允许读写并发，避免保存时阻塞读取
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 1. book — 书籍元信息
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS book (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    genre           TEXT,
    target_words    INTEGER NOT NULL DEFAULT 0,
    premise         TEXT,                                   -- 一句话卖点
    summary         TEXT,                                   -- 全书摘要（滚动更新）
    writing_mode    TEXT    NOT NULL DEFAULT 'assist'
                    CHECK (writing_mode IN ('manual','assist','semi')),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2. character — 人物卡（字段对应「立体人物公式」四要素）
--    [修正点3 / D-11] role 存储英文枚举；界面中文文案由前端映射
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL,
    alias             TEXT,                                 -- 别名 / 称号
    role              TEXT    NOT NULL DEFAULT 'supporting'
                      CHECK (role IN ('protagonist','supporting','antagonist','minor')),
    surface_identity  TEXT,                                 -- 表面身份
    secret_desire     TEXT,                                 -- 秘密欲望
    fatal_weakness    TEXT,                                 -- 致命弱点
    contradiction     TEXT,                                 -- 矛盾行为
    appearance        TEXT,
    background        TEXT,
    first_chapter_seq INTEGER,
    status            TEXT    NOT NULL DEFAULT 'alive'
                      CHECK (status IN ('alive','dead','missing','unknown')),
    tags              TEXT,                                 -- JSON 数组字符串
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3. character_relation — 人物关系（P2 关系图谱用）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_relation (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    from_char_id  INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    to_char_id    INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    relation_type TEXT    NOT NULL,      -- 师徒 / 宿敌 / 血亲 / 上下级 ...
    note          TEXT,
    created_at    TEXT    NOT NULL,
    UNIQUE(from_char_id, to_char_id, relation_type)
);

-- ---------------------------------------------------------------------------
-- 4. world_entry — 世界词条（势力 / 地点 / 规则 / 物品）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_entry (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    category   TEXT    NOT NULL DEFAULT 'other'
               CHECK (category IN ('force','place','rule','item','other')),
    name       TEXT    NOT NULL,
    content    TEXT,
    parent_id  INTEGER REFERENCES world_entry(id) ON DELETE SET NULL,
    tags       TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- 5. foreshadow — 伏笔台账
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS foreshadow (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    title                TEXT    NOT NULL,
    planted_chapter_seq  INTEGER,
    planned_payoff_seq   INTEGER,
    actual_payoff_seq    INTEGER,
    status               TEXT    NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','closed','abandoned')),
    importance           TEXT    NOT NULL DEFAULT 'medium'
                         CHECK (importance IN ('high','medium','low')),
    note                 TEXT,
    created_at           TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- 6. outline — 三级大纲（自关联）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outline (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    level      TEXT    NOT NULL CHECK (level IN ('total','volume','chapter')),
    parent_id  INTEGER REFERENCES outline(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL DEFAULT 0,
    title      TEXT,
    content    TEXT,
    chapter_id INTEGER,                    -- level='chapter' 且已开写时关联实际章节
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- 7. chapter — 章节
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chapter (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    seq              INTEGER NOT NULL,
    title            TEXT,
    content          TEXT    NOT NULL DEFAULT '',
    word_count       INTEGER NOT NULL DEFAULT 0,
    status           TEXT    NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','done')),
    chapter_summary  TEXT,                 -- 回写产物：本章摘要
    hook             TEXT,                 -- 回写产物：章末钩子
    finalized_at     TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chapter_seq ON chapter(seq);

-- ---------------------------------------------------------------------------
-- 8. chapter_version — 章节历史版本（R11）
--    仅在「完成本章」「手动存版本」「回滚前」三个时机快照
--    [修正点2 / D-10] idx_version_chapter 为 03 §2.4 漏列的索引
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chapter_version (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
    content    TEXT    NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    note       TEXT,
    created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_version_chapter ON chapter_version(chapter_id, id DESC);

-- ---------------------------------------------------------------------------
-- 9. character_state — 角色状态（增量式，只记变化点）
--    读取某角色在第 N 章的状态 = 取 chapter_seq <= N 的最后一条
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_state (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    chapter_seq  INTEGER NOT NULL,
    state        TEXT    NOT NULL,
    source       TEXT    NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','manual')),
    created_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_char_state_lookup
    ON character_state(character_id, chapter_seq DESC);

-- ---------------------------------------------------------------------------
-- 10. plot_arc — 剧情线
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plot_arc (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    type             TEXT    NOT NULL DEFAULT 'sub'
                     CHECK (type IN ('main','sub','romance','growth')),
    content          TEXT,
    last_chapter_seq INTEGER,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- 11. recall_log — 召回记录（调优召回效果的唯一依据）
--     [修正点4 / D-08] 含 structured_hits / semantic_hits（TC-32 要求）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recall_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_seq         INTEGER NOT NULL,
    query_text          TEXT,
    hit_chunk_ids       TEXT,      -- JSON 数组
    hit_scores          TEXT,      -- JSON 数组
    structured_hits     INTEGER NOT NULL DEFAULT 0,   -- 结构化召回命中条数
    semantic_hits       INTEGER NOT NULL DEFAULT 0,   -- 语义召回命中条数
    injected_chars      INTEGER NOT NULL DEFAULT 0,
    injected_tokens_est INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recall_chapter ON recall_log(chapter_seq);

-- ---------------------------------------------------------------------------
-- 12. chunk_meta — 文本分块元数据（向量索引的元信息侧）
--     [修正点1 / D-18] 增列 embedding / embedding_dim：每块存一份向量本体，
--       供 sqlite-vec 扩展不可用/损坏时重建。vec_chunk 仍是唯一检索入口，
--       chunk_meta.embedding 仅作重建源（1024×4B ≈ 4KB/块，体积可控）。
--     [修正点5 / D-15 + 修正点8] 唯一性：**一章正文切出的每一块各占一行**，键含
--       `chunk_index`（章内块序号）。按 `settings.chunk_size = 800` 字/块估算，
--       百万字约 1000000/800 ≈ 1250 块 —— 「1250 块」正是由此而来，也印证了
--       chapter 类分块**本来就不是每章一行**（此前旧键把它当每章一行，是缺陷）。
--       唯一性说明见本表下方注释。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunk_meta (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type     TEXT    NOT NULL
                    CHECK (source_type IN ('chapter','setting','summary','material')),
    source_id       INTEGER NOT NULL,
    chapter_seq     INTEGER,
    chunk_index     INTEGER NOT NULL DEFAULT 0,      -- 章内块序号（0 起）；setting/summary 类恒为 0
    text            TEXT    NOT NULL,
    char_count      INTEGER NOT NULL,
    embedding_model TEXT,                 -- 换 embedding 模型需重建全部向量
    embedding       BLOB,                 -- 向量本体（FLOAT[1024]，小端 float32，4096 字节），扩展不可用时为重建源
    embedding_dim   INTEGER NOT NULL DEFAULT 1024,   -- 向量维度，与 vec_chunk FLOAT[1024] 对齐
    created_at      TEXT    NOT NULL,
    UNIQUE(source_type, source_id, chapter_seq, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_chunk_source ON chunk_meta(source_type, source_id);
-- [修正点5 / D-15 + 修正点8] 唯一性说明：
--   ① chapter 类（chapter_seq 非空）：一章正文由 `utils/chunk.split_text` 切成 N 块，
--      每块以 (source_type, source_id, chapter_seq, **chunk_index**) 唯一 —— **N 块落 N 行**。
--      ⚠ 历史缺陷（2026-09-22 修）：旧键不含 chunk_index，同章逐块 upsert 时块块命中
--      同一冲突键并覆盖前一块，整章只剩最后一块（实测 89 块 → 库里 20 行）；
--      写入侧的 `ON CONFLICT` 目标必须与上面的四列**逐字一致**，否则覆盖会重现。
--   ② setting / summary 类（chapter_seq 为 NULL）：SQLite 视 NULL 互不相等，唯一键
--      对其不生效 —— 唯一性由写入侧「先删后插」保证（`chunk_repo.upsert_chunk` 的
--      chapter_seq IS NULL 分支），该分支行为与本次修正前**完全一致**。

-- ---------------------------------------------------------------------------
-- 13. llm_provider — 模型配置（密钥本体存系统密钥环，此处只存引用名）
--     [全局化 2026-09-22] 模型配置**全局共享**，改由全局库 `data/app.db` 承载，
--     书库不再持有本表（`@@GLOBAL` 标记块，见文件头「块标记约定」）。
--     DDL 仅此一份，书库/全局库同源解析，不复制，故无漂移。
-- ---------------------------------------------------------------------------
-- @@GLOBAL llm_provider
CREATE TABLE IF NOT EXISTS llm_provider (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    provider   TEXT    NOT NULL,        -- 自由字符串，**不做白名单枚举**
    --   历史教训（2026-09-22 修订）：本行原注释写作「deepseek / qwen / kimi / claude / ollama」，
    --   曾被后人当成"允许值清单"写进契约的 enum，结果智谱 / OpenRouter / 阶跃 / metaapi
    --   这类 OpenAI 兼容端点全配不上。契约里 `LLMProvider.provider` 是 `type: string`，
    --   后端实现也一直按自由字符串处理（见 `services/llm/registry.py`），此处仅是示例、非约束。
    --   内置的 deepseek/qwen/kimi/... 只是前端 `lib/labels.ts` 的**便利显示名**，未命中会原样回显。
    model      TEXT    NOT NULL,
    base_url   TEXT,
    key_ref    TEXT,                    -- 密钥环条目标识，禁止存明文密钥
    task_role  TEXT    NOT NULL DEFAULT 'content'
               CHECK (task_role IN ('outline','content','review','embedding')),
    --   ⚠ 已知边界（2026-09-22 复核确认）：本列是**单值**，一个模型只能承担一个任务角色，
    --   而老大要的是「一个模型做多个功能」。CHECK 只约束取值集合，**不保证角色唯一**
    --   —— 当前全局库里 `outline` 就被两条记录同时占用（flash 与 kimi），
    --   属于脏数据，只能靠应用层约束 + 界面提示，DB 层拦不住。
    --   彻底解决需拆出「角色 → 模型」关联表（见 docs/decisions/OPEN-DECISIONS.md 的 OD-02）。
    is_default INTEGER NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL
);
-- @@END

-- ---------------------------------------------------------------------------
-- 15. meta — 全局库键值元信息（`@@GLOBAL` 块，同属全局库 data/app.db）
--     当前用于一次性迁移标记：`providers_migrated_v1`。
--     为什么放这里而不是"全局库有没有 provider 行"：模型配置是**可删的**，
--     「全局库为空」既可能是"从未迁移"，也可能是"用户主动删光了"——
--     用行数当判据会让用户删掉的模型在每次重启后复活。改成一次性标记后，
--     迁移只发生一次，清空后重启仍为空（文件被删则连带标记丢失，会重迁一次，属数据恢复）。
-- ---------------------------------------------------------------------------
-- @@GLOBAL meta
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- @@END

-- ---------------------------------------------------------------------------
-- 16. provider_role — 「模型 ↔ 任务角色」多对多关联（`@@GLOBAL` 块，同属全局库）
--     为什么要有它：`llm_provider.task_role` 是**单值**列，一个模型只能挂一个角色，
--     于是「一个模型全包（写大纲 + 写正文 + 审校）」根本无法表达 —— 界面上把同一个
--     模型指给第二个角色时，只能把上一个角色的分配抢走（用户原话：
--     「为什么不能选择多个一样的模型」「能不能一个 ai 做完全部」）。
--     拆出本表后：**一个模型可挂多个角色**，**一个角色仍可有多个候选模型**
--     （`find_for_role` 按 `is_default DESC, id ASC` 取第一个，与原口径一致）。
--
--     · 主键 `(provider_id, task_role)` 天然去重 → 回填/重放用 `INSERT OR IGNORE` 即幂等。
--     · **不**动 `llm_provider.task_role`：它继续存在（历史数据 + 向后兼容 + 老库回填来源），
--       但**不再参与路由**；路由一律以本表为准（见 `provider_repo.find_for_role`）。
--     · 不建外键：全局库里删除 provider 时由应用层同事务清理（`provider_repo.delete`），
--       与既有「不使用触发器、副作用显式可见」的约定一致。
--     一次性回填由 `services/provider_role_migration.py` 负责（判据 = meta 表标记
--     `provider_roles_migrated_v1`，不是"表里有没有行"）。
-- ---------------------------------------------------------------------------
-- @@GLOBAL provider_role
CREATE TABLE IF NOT EXISTS provider_role (
    provider_id INTEGER NOT NULL,
    task_role   TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    PRIMARY KEY (provider_id, task_role)
);
CREATE INDEX IF NOT EXISTS idx_provider_role_role ON provider_role(task_role);
-- @@END

-- ---------------------------------------------------------------------------
-- 14. writing_log — 日更记录（R17）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS writing_log (
    date               TEXT    PRIMARY KEY,   -- YYYY-MM-DD
    words_added        INTEGER NOT NULL DEFAULT 0,
    chapters_finalized INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- 15. material — 素材库（P2，R13）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS material (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    category   TEXT    NOT NULL DEFAULT 'bridge'
               CHECK (category IN ('bridge','quote','character','setting')),
    title      TEXT,
    content    TEXT    NOT NULL,
    source     TEXT,
    tags       TEXT,
    created_at TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- 复合索引补充（连同上方 5 个，无条件段共 8 个索引）
--   [修正点2 / D-10] idx_char_role 为 03 §2.4 漏列的索引
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_foreshadow_open
    ON foreshadow(status, importance);
CREATE INDEX IF NOT EXISTS idx_outline_hierarchy
    ON outline(level, parent_id, seq);
CREATE INDEX IF NOT EXISTS idx_char_role
    ON character(role, status);

-- ---------------------------------------------------------------------------
-- 版本标记（无条件；即便跳过条件段，schema 版本仍为 1）
-- ---------------------------------------------------------------------------
PRAGMA user_version = 1;


-- ============================================================================
-- 二、条件段 · FTS（仅当 caps.fts5_available 为真时执行）
-- ----------------------------------------------------------------------------
-- 同步约定：FTS 由应用层维护，不使用触发器。
--   · 章节保存（POST/PATCH /api/chapters/{id}）→ 同事务 upsert chapter_fts 行
--   · 删除章节（DELETE /api/chapters/{id}）→ 同事务删除对应 chapter_fts 行（坑 13）
--   · 设定新增/变更/删除（character / world_entry）→ 同步维护 setting_fts
-- FTS5 不可用时本段整体跳过，全文检索标为不可用（由 /api/system/capabilities 暴露）。
--
-- 【分词器：trigram，2026-09-22 从 unicode61 改过来】
--   为什么改：`unicode61` 把**连续中文当成一个超长 token**，于是「七号仓库」这类
--   中文子串的 `MATCH` 恒为 0 条 —— 检索只能静默降级成全表 LIKE 扫描。
--   `trigram` 按三字滑动窗口建索引，中文子串能直接命中（实测 SQLite 3.49.1 通过）。
--
--   ⚠️ **trigram 的已知边界（必须与 LIKE 兜底共存，别删那个兜底）**：
--      查询词**短于 3 个字符时 trigram 一律不命中**。中文里「陈默」「仓库」这种
--      两字查询极其常见，所以 `search_setting_repo` 在 FTS 无结果时**必须**继续走
--      LIKE 子串兜底 —— 那条兜底不是"老代码残留"，是 trigram 的必要补充。
--
--   ⚠️ **存量书库需要迁移**：`CREATE VIRTUAL TABLE IF NOT EXISTS` 不会改动已存在的表，
--      所以老库仍是 unicode61。启动时由 `services/fts_migration.py` 幂等重建
--      （判据 = 表定义里有没有 `trigram`，不依赖额外标记）。
-- ============================================================================
-- @@OPTIONAL fts
CREATE VIRTUAL TABLE IF NOT EXISTS chapter_fts USING fts5(
    chapter_id UNINDEXED,
    title,
    content,
    tokenize = 'trigram'
);

CREATE VIRTUAL TABLE IF NOT EXISTS setting_fts USING fts5(
    source_type UNINDEXED,   -- character / world_entry
    source_id   UNINDEXED,
    name,
    body,
    tokenize = 'trigram'
);
-- @@END


-- ============================================================================
-- 三、条件段 · VEC（仅当 caps.vec_available 为真时执行）
-- ----------------------------------------------------------------------------
-- 创建前须 `SELECT vec_version()` 自检通过（见 connection._probe_vec）；失败则跳过本段。
-- 维度固定 FLOAT[1024]（bge-m3，见 ADR-005）；换 embedding 模型须整库重建（坑 17）。
-- 本段跳过时语义召回降级为纯结构化召回，召回面板不得整体空白（红线 1/3）。
-- ============================================================================
-- @@OPTIONAL vec
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunk USING vec0(
    chunk_id  INTEGER PRIMARY KEY,
    embedding FLOAT[1024]
);
-- @@END


-- ============================================================================
-- 迁移约定（后续版本在此追加，不要修改上面的历史语句）
-- ----------------------------------------------------------------------------
-- v1 → v2（示例格式，尚未使用）：
--   ALTER TABLE xxx ADD COLUMN yyy TEXT;
--   回滚：SQLite 不支持 DROP COLUMN（3.35 以前），需重建表；
--         迁移脚本必须写明回滚方式
-- ============================================================================
