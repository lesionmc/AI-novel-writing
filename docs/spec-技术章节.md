# AI 小说创作工具 — Spec 技术章节（M1 锁定）

> 版本 V1.0 ｜ 编制 2026-09-20 ｜ 架构：高见远
> 本文件是**技术侧增量锁定结论**，不重述《03-技术方案》的既有设计正文，只固化：版本锚定、核对修正后的 API 端点清单、数据库表清单、内嵌已知坑。
> 关联出处：`03-技术方案.md` / `05-数据库schema.sql` / `06-API定义-openapi.yaml` / `09-开发规范与依赖版本.md`；范围以《`spec-范围章节.md`（M1）》为准。
> 章节编号按项目总监指定：第 4 / 5 / 6 / 11 章。若与《spec-范围章节》《spec-设计与页面章节》的局部编号冲突，以总监合并时的统一编号为准。
>
> **权威顺序**：团队已拍板决策 > `12-需求变更记录` > `00-交接说明` > `01-需求文档`。本文件的“核对修正”仅作增量结论与差异登记，**不直接改动** 03/05/06/09 原文件（差异清单见 `契约差异清单.md`，裁决权在项目总监）。

---

## 第 4 章 技术架构（版本锚定）

### 4.1 运行时形态（继承 03 §1.1，不重述）

本地服务（FastAPI，127.0.0.1 + 动态端口）+ 浏览器界面（React SPA），`start.bat` / `start.sh` 一键拉起并自动开浏览器。无服务端组件、无遥测、BYOK 永久方案、单用户单机。

### 4.2 版本锚定表（**M1 实际锁定版本，非范围**）

> 原则：钉死实际版本按该版本 API 写；pre-v1 依赖**锁死等号**，禁浮动范围。本表数值取自 2026-09-20 的 PyPI / npm 官方注册表实测，来源见第 11 章末。

**后端（`backend/requirements.txt`）**

| 层 | 技术 | 实际锁定版本 | 锁定原因 |
|---|---|---|---|
| 运行时 | Python | **3.12.14**（3.12 线） | 冻结栈为 3.12；`sqlite3` 自带 FTS5 与可加载扩展；3.13 free-threaded 与 sqlite-vec 组合未验证，M1 不上 |
| 内置 | SQLite（Python 自带） | 3.45.x（Python 3.12 自带）；下限 3.35 | 3.35+ 支持 `DROP COLUMN`；FTS5 需编译期启用；以运行时自检为准 |
| Web 框架 | fastapi | **0.141.1** | 当前稳定；0.115+ 起 Pydantic v2 原生、lifespan 事件 |
| ASGI 服务器 | uvicorn[standard] | **0.53.0** | 与 FastAPI 0.141 配套；Windows 无 uvloop 自动回退 |
| 数据校验 | pydantic | **2.13.5** | v2 语法（`model_config` / `field_validator`），与 FastAPI 0.141 匹配 |
| 配置 | pydantic-settings | **2.15.0** | 配置类与 v2 对齐 |
| 密钥环 | keyring | **25.7.0** | Windows Credential Manager / macOS Keychain 后端 |
| HTTP 客户端 | httpx | **0.28.1** | 调用各家模型 API（含 SSE 流式） |
| 文档导出 | python-docx | **1.2.0** | R16 docx 导出 |
| HTML 清洗 | beautifulsoup4 | **4.15.0** | 导出 docx 前清洗 TipTap HTML |
| XML 解析 | lxml | **6.1.3** | bs4 后端；见第 11 章“09 版本范围过时” |
| 向量扩展 | sqlite-vec | **0.1.9**（等号锁死） | pre-v1，破坏性变更，禁浮动；win_amd64 wheel 内附 `vec0.dll` |
| 测试 | pytest | **9.1.1** | 主测试框架 |
| 测试 | pytest-asyncio | **1.4.0** | 异步用例；见第 11 章版本范围提示 |

> **不上 ORM**：仅用 Python 标准库 `sqlite3`（见 `ADR-003`）。04/09 未引入 SQLAlchemy，M1 保持。

**前端（`frontend/package.json`）**

| 层 | 技术 | 实际锁定版本 | 锁定原因 |
|---|---|---|---|
| 运行时 | Node.js | **22 LTS** | Vite 5 要求 Node 18+，推荐 20+ |
| UI 框架 | react / react-dom | **18.3.1** | 团队冻结 React 18；18.3.1 为 18 线终版（19.x 不采用） |
| 路由 | react-router-dom | **6.30.6** | 6 线最高；不跳 7.x（破坏性） |
| 语言 | typescript | **5.9.3** | 5 线最高补丁；上游已 7.0.2，但 M1 与 Vite 5 / plugin-react 4 组合不跳大版本 |
| 构建 | vite | **5.4.21** | 团队冻结 Vite 5（上游已 8.3.0，M1 不跳） |
| 构建插件 | @vitejs/plugin-react | **4.7.0** | 4 线最高；与 Vite 5 配套 |
| 编辑器 | @tiptap/react / starter-kit / pm | **2.27.3**（三者同版） | 冻结 TipTap 2.x；2.27.3 为 2 线当前最高（03 预置的 2.6.0 已落后，见第 11 章） |
| 服务端状态 | @tanstack/react-query | **5.103.1** | 缓存/重试/失效策略，大量 GET 场景 |
| 客户端状态 | zustand | **4.5.7** | 4 线最高；轻量 |
| 图标 | lucide-react | **1.47.0**（等号锁死） | P0 规则：描边 SVG 图标库全项目统一，禁 emoji（见 `ADR-004`） |
| 样式 | 原生 CSS 变量 + CSS Modules | 无第三方版本 | 设计契约《DESIGN.md》§9 锁定，不引入 Tailwind / UI 组件库 |

### 4.3 分层与目录（继承 03 §1.2 / §1.3，不重述）

分层纪律：`routers`（只解析请求）/ `services`（业务编排，禁 HTTP 类型）/ `repositories`（只做 SQL）/ `services/llm`（模型与密钥）。目录沿用 03 §1.2。

**目录口径修正（R0 相关，总监定稿 `D-09`）**：03 §1.2 目录含 `routers/topics.py`（R0 选题）。R0 落 M3，M1 **不建该文件**（连骨架都不留），`main.py` 不注册 topics 路由、前端不暴露入口，杜绝镀金。`06` 的 `/api/topics/*` 两条仅登记契约、M1 不实现。

---

## 第 5 章 API 端点清单（核对修正后）

统一前缀 `/api`；**版本前缀保持 `/api`，不加 `/api/v1`**（总监定稿 `D-16`：本地单用户开源工具，版本化收益为零）。请求/响应 JSON；长耗时 AI 调用走 SSE（`text/event-stream`，路径后缀 `/stream`）。
错误统一结构：`{ "error": { "code": "...", "message": "...", "detail": null } }`。

> **本清单 = 核对修正后的 `06-openapi.yaml` 全量 paths（共 36 条）。**
> 下方标 `[补]` 的两条（`outlines/{id}/expand`、`providers/{id}/usage`）系原 `06` 漏登、**已按总监裁决补入 `06`**（见第 5.3 / 5.6 行，落地位置 `06` L408 / L844）。
> 标 `[新增]` 的一条（`system/capabilities`）系总监 2026-09-20 增补（能力自检暴露），**已补入 `06`**（见第 5.10）。
> 标 `[不实现]` 的端点组在 M1 只登记契约、不实现。

### 5.1 books（R15）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/books` | 列出所有作品（扫 `books/` 读 meta） |
| POST | `/api/books` | 新建作品（建目录 + 建库 + 写 meta） |
| GET | `/api/books/{book}` | 作品详情 |
| PATCH | `/api/books/{book}` | 更新元信息 / 写作模式 |
| DELETE | `/api/books/{book}` | 删除（移入回收目录，不物理删除） |

### 5.2 settings（R1）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/books/{book}/characters` | 人物列表（role / status 过滤） |
| POST | `/api/books/{book}/characters` | 新建人物 |
| GET | `/api/characters/{id}` | 人物详情 |
| PATCH | `/api/characters/{id}` | 更新人物（触发设定变更追踪） |
| DELETE | `/api/characters/{id}` | 删除人物 |
| GET | `/api/characters/{id}/affected-chapters` | 该人物被哪些章节引用（约束 3） |
| GET | `/api/books/{book}/world-entries` | 世界词条列表（category / parent 过滤） |
| POST | `/api/books/{book}/world-entries` | 新建词条 |
| PATCH | `/api/world-entries/{id}` | 更新词条 |
| DELETE | `/api/world-entries/{id}` | 删除词条 |
| GET | `/api/books/{book}/foreshadows` | 伏笔列表（默认只 open） |
| POST | `/api/books/{book}/foreshadows` | 新建伏笔 |
| PATCH | `/api/foreshadows/{id}` | 更新伏笔（含标记已回收） |

### 5.3 outlines（R7）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/books/{book}/outlines` | 取大纲节点列表（**扁平**，含 `parent_id`；level / parent_id 过滤；**不返回嵌套 children**，建树由前端完成） |
| POST | `/api/books/{book}/outlines` | 新建大纲节点 |
| PATCH | `/api/outlines/{id}` | 更新节点 |
| DELETE | `/api/outlines/{id}` | 删除节点（级联子节点） |
| POST | `/api/outlines/{id}/expand` | **`[补]`** AI 展开：粗纲 → 细纲 → 章节卡（AI 出候选，**不落库**，人来定稿）。原 `06` 漏登、M1 阻塞项，**已补入 `06`**（`D-05`）。同步响应，非 SSE；错误含 `LLM_NOT_CONFIGURED` / `JSON_PARSE_FAILED`。请求体 `OutlineExpandRequest`，响应 `OutlineExpandResponse` |

### 5.4 chapters（R2 / R11）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/books/{book}/chapters` | 章节列表（**不含正文**） |
| POST | `/api/books/{book}/chapters` | 新建章节 |
| GET | `/api/chapters/{id}` | 章节详情（含正文） |
| PATCH | `/api/chapters/{id}` | 保存正文（自动保存，前端节流 2s；后端重算字数并同步 FTS） |
| DELETE | `/api/chapters/{id}` | 删除章节（写作删废章刚需，总监确认保留；`03` §3.4 未列，`D-12`）。删除时须同步清理 `chapter_fts` 行与 `chunk_meta`/`vec_chunk`（见第 11 章坑 13） |
| GET | `/api/chapters/{id}/versions` | 版本列表（不含正文） |
| POST | `/api/chapters/{id}/versions` | 手动存版本 |
| POST | `/api/chapters/{id}/versions/{vid}/restore` | 回滚指定版本（回滚前自动快照） |

### 5.5 memory（R3 / R4，产品核心）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/chapters/{id}/recall` | 写前召回：两路合并结果；**该 GET 会写 `recall_log`**，前端须禁缓存/禁并发重复触发（第 11 章坑 7） |
| POST | `/api/chapters/{id}/finalize` | 完成本章 → 生成回写建议（**不落库**） |
| POST | `/api/chapters/{id}/finalize/confirm` | 确认回写（用户改后版本）→ 单事务落库（8 步） |
| GET | `/api/books/{book}/memory/summary` | 全书摘要 |
| GET | `/api/books/{book}/memory/character-states` | 角色状态（`?upto_seq=` 截至某章） |
| GET | `/api/books/{book}/memory/plot-arcs` | 剧情线 |
| GET | `/api/books/{book}/recall-logs` | 召回历史（调优用） |

### 5.6 providers（R5）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/providers` | 已配置模型列表（**绝不返回密钥明文**，只回 key_ref） |
| POST | `/api/providers` | 新增配置（密钥写密钥环，返回 key_ref） |
| PATCH | `/api/providers/{id}` | 更新配置 |
| DELETE | `/api/providers/{id}` | 删除配置（同时清密钥环条目） |
| POST | `/api/providers/{id}/test` | 有效性检测（最小请求，返回延迟） |
| GET | `/api/providers/{id}/usage` | **`[补]`** 费用预估（纯本地估算：按 `recall_log` 与调用记录折算，**不接厂商账单接口、不联网**，恒带 `estimated: true`；支持 `?from=&to=`）。原 `06` 漏登、R5 验收项，**已补入 `06`**（`D-06`）。响应 `ProviderUsage` |

### 5.7 audit（R8 / R10 / R18，M1 后置，仅登记契约）

| 方法 | 路径 | M1 |
|---|---|---|
| POST | `/api/books/{book}/audit/consistency/stream` | 不实现（R8 → M2） |
| POST | `/api/chapters/{id}/audit/ai-flavor` | 不实现（R10 → M2） |
| POST | `/api/books/{book}/audit/sensitive` | 不实现（R18 → M3） |

### 5.8 export / stats / search（R16 / R17 / R19）

| 方法 | 路径 | M1 |
|---|---|---|
| GET | `/api/books/{book}/export?format=txt\|docx&range=` | 实现（R16） |
| GET | `/api/books/{book}/stats` | 实现（R17） |
| GET | `/api/books/{book}/search?q=` | 实现（R19 折叠进 R1 设定库检索范围；全书级检索 → M3，见《spec-范围章节》） |

### 5.9 topics（R0，M1 不实现）

| 方法 | 路径 | M1 |
|---|---|---|
| GET | `/api/topics/genres` | 不实现（R0 → M3） |
| POST | `/api/topics/advice/stream` | 不实现（R0 → M3） |

### 5.10 system（能力自检）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/system/capabilities` | **`[新增]`** 本机能力自检状态：`{ vector_available, fts_available, llm_configured }`。**只读、无副作用**、不联网；值取连接层启动自检结果、进程内缓存。前端据 `vector_available` / `fts_available` 在 StatusBar 给**常驻小提示**（非弹窗、非 toast，不阻断写作）。总监 2026-09-20 增补，端点总数 35 → 36 |

> **运行时重算裁定（架构，2026-09-20；措辞已按总监复核修正）**：M1 该端点**只返回启动自检的进程内缓存值，不提供 `?refresh` 重算**。理由：① `vec_chunk` / FTS 条件表在**建库时**按自检结果决定是否创建——建库时若跳过，运行期即便重算为 `true`，**当前库仍无该表**，重算结果属**假阳性**，用户误以为已解决而召回仍不可用，比不重算更糟；② 要真正热恢复，须运行期安全加载扩展 + 补建虚拟表 + 保证既有连接状态一致，**代价与风险在 M1 阶段不成比例**。（**本取舍属 M1 决策、非永久结论**：SQLite 的 `load_extension` / `CREATE VIRTUAL TABLE` 运行期本可调用，M2 若需热恢复可再评估。）用户装好扩展后**重启应用即生效**。故 StatusBar 的「重新检测」按钮退化为“重启应用生效”提示（设计师 §12 popover 已含此文案），请求失败时静默不显示 chip（避免误报降级）。

**核对结论**：`06` 的 paths 覆盖 `03` §3 各小节；原**缺 `outlines/{id}/expand` 与 `providers/{id}/usage` 两条**（`D-05` / `D-06`，均为 M1 阻塞项），**已按总监裁决补入 `06`**；另按总监 2026-09-20 指令**新增 `system/capabilities` 一条**。补后 paths 总数 **36**（原 33 + 补 2 + 新增 1）。其余修正为“03 目录/索引/字段表滞后于 05/06”类，详见 `契约差异清单.md`。

---

## 第 6 章 数据库表清单

存储策略：**一本书一个 SQLite 库**（`books/<slug>/novel.db`），`schema.sql` 为唯一真相源。统一口径统计如下（修正 03 §2.2 的表述）。

### 6.1 普通表（15 张）

| # | 表 | 域 | 用途 | M1 |
|---|---|---|---|---|
| 1 | `book` | 基础 | 书籍元信息与全书摘要 | 用 |
| 2 | `character` | 设定 | 人物卡（四要素） | 用 |
| 3 | `character_relation` | 设定 | 人物关系（P2 图谱用） | 建、不用（R12→M3） |
| 4 | `world_entry` | 设定 | 世界词条（势力/地点/规则/物品） | 用 |
| 5 | `foreshadow` | 设定 | 伏笔台账 | 用 |
| 6 | `outline` | 大纲 | 三级大纲（自关联） | 用 |
| 7 | `chapter` | 创作 | 章节正文 | 用 |
| 8 | `chapter_version` | 创作 | 章节历史版本（R11） | 用 |
| 9 | `character_state` | 记忆 | 角色状态变更点（增量） | 用 |
| 10 | `plot_arc` | 记忆 | 剧情线进展 | 用 |
| 11 | `recall_log` | 记忆 | 召回记录（调优/成本） | 用 |
| 12 | `chunk_meta` | 向量 | 文本分块元数据；**含 `embedding BLOB` 列**（向量本体副本，供扩展不可用时重建，总监定稿 `D-18`） | 用 |
| 13 | `llm_provider` | AI | 模型配置（密钥环引用） | 用 |
| 14 | `writing_log` | 统计 | 日更记录（R17） | 用 |
| 15 | `material` | 素材 | 桥段/金句库（P2，R13→M3） | 建、不用 |

### 6.2 虚拟表（3 张）

| # | 表 | 类型 | 用途 | 依赖 |
|---|---|---|---|---|
| 16 | `vec_chunk` | sqlite-vec `vec0` 虚拟表 | 向量索引（`FLOAT[1024]`） | 需加载扩展；不可用则跳过并降级（第 11 章坑 1/4） |
| 17 | `chapter_fts` | FTS5 虚拟表 | 章节正文全文检索（R19） | 需 FTS5；不可用则降级（第 11 章坑 3） |
| 18 | `setting_fts` | FTS5 虚拟表 | 设定检索（character / world_entry） | 同上 |

> **口径统一（修正 `D-07`）**：03 §2.2 仅列 15 行（其中“`chunk_meta + vec_chunk`”合并为一行），**漏列 `chapter_fts`、`setting_fts` 两张 FTS5 虚拟表**。精确口径应表述为：**15 张普通表 + 3 张虚拟表（vec_chunk / chapter_fts / setting_fts）= 18 个库对象**。建库脚本 `05` 已全部创建，`06` 的相关端点亦引用 FTS5，故以 05/06 为准，建议 03 §2.2 补录两行 FTS 表。

### 6.3 索引（以 `05` 为准）

`idx_chapter_seq`(UNIQUE) / `idx_version_chapter` / `idx_char_state_lookup(character_id, chapter_seq DESC)` / `idx_foreshadow_open(status, importance)` / `idx_outline_hierarchy(level, parent_id, seq)` / `idx_chunk_source(source_type, source_id)` / `idx_recall_chapter(chapter_seq)` / `idx_char_role(role, status)`。

> 03 §2.4 的关键索引清单**缺 `idx_version_chapter` 与 `idx_char_role`**（差异 `D-10`），建议补齐。

### 6.4 字段差异（登记，供裁决）

- `recall_log` 有 `structured_hits` / `semantic_hits`（05 §11、06 `RecallLog`、TC-32 均要求），**03 §2.3 字段表缺**（差异 `D-08`）。
- `character.role` 存储英文枚举 `protagonist/supporting/antagonist/minor`（05 CHECK + 06 enum），03 §2.3 用中文标签且未写默认值（差异 `D-11`）。
- `chunk_meta` **增列 `embedding BLOB`**（总监定稿 `D-18`）：`05` 原设计向量只存 `vec_chunk`，扩展不可用/损坏时**无法重建**。增列后每块存一份向量本体（1024×4B ≈ 4KB；百万字约 1250 块 ≈ 5MB，体积可控），换取“扩展不可用时向量可重建”。`vec_chunk` 仍是唯一的**检索**入口，`chunk_meta.embedding` 仅作**重建源**。

### 6.5 相对 `05-数据库schema.sql` 的修正点清单（用于 `ai-novel` 实际建库）

唯一真源为 `ai-novel/backend/app/db/schema.sql`，其文件头列明以下修正点。交接包 `05-数据库schema.sql` 不再手工维护，已改为**由真源同步生成的派生副本**（一致性由 `docs/tools/sync_handover_schema.py --check` 校验，见 `ADR-006`）：

1. **`chunk_meta` 增列 `embedding BLOB`** 与 `embedding_dim INTEGER`（默认 1024）——落实 `D-18`。
2. **补两条索引**：`idx_version_chapter(chapter_version(chapter_id, id DESC))`、`idx_char_role(character(role, status))`——落实 `D-10`。
3. **`character.role` 口径**：英文枚举 `protagonist/supporting/antagonist/minor` + `NOT NULL DEFAULT 'supporting'`——落实 `D-11`（与 `05` 一致，此处仅确认）。
4. **`recall_log`** 含 `structured_hits` / `semantic_hits`——落实 `D-08`。
5. **NULL 去重处理**：`chunk_meta` 的 `UNIQUE(source_type, source_id, chapter_seq)` 对 `chapter_seq IS NULL` 不生效，改为写入侧保证唯一（`INSERT ... ON CONFLICT` 或应用层先查后写），或对 setting 类用非空哨兵 + 部分索引——落实 `D-15`。
6. **`vec_chunk` 条件化创建**：扩展可用才 `CREATE VIRTUAL TABLE ... vec0`；扩展自检失败时跳过该表，`recall_service` 降级纯结构化召回——落实 `D-17` + 第 11 章坑 6。
7. **保留 FTS5 虚拟表** `chapter_fts` / `setting_fts` 的条件化创建（FTS5 自检失败则跳过）——第 11 章坑 3。

---

## 第 11 章 内嵌已知坑（M1 硬约束）

> 每一条都写成“现象 → 规避”，供实现者事前避开，而非事后踩坑再返工。

**A. 数据引擎（最高风险）**

1. **sqlite-vec 在 Windows 上加载失败**：`conn.load_extension(...)` 报 “The specified module could not be found”。根因是 `vec0.dll` 由 MinGW 编译，依赖 `libgcc_s_seh-1.dll`（安装 VC++ Redistributable **不能**解决）。规避：① 用官方 win_amd64 wheel（内附 `vec0.dll`），启动时执行 `SELECT vec_version()` 自检；② 自检失败**立即降级为纯结构化召回**，不得抛错、不得阻断启动（红线 3）。
2. **Python 未启用可加载扩展**：官方 python.org Windows/macOS 安装包含该能力；但源码自编译 / conda / Microsoft Store / WSL 的 Python 可能 `AttributeError: enable_load_extension`。规避：启动自检 `hasattr(conn, "enable_load_extension")`，失败即降级。
3. **FTS5 可能未编入**：标准发行版默认含 `ENABLE_FTS5`，但发行版/自编译 Python 可能缺失（WSL/旧 Ubuntu 有实测缺失）。规避：启动执行 `PRAGMA compile_options;` 自检 `ENABLE_FTS5`；缺失则跳过 FTS 建表并把“全文检索”标为不可用（前端提示），不得阻断。
4. **sqlite-vec 为 pre-v1，API/行为会破坏性变更**：必须**等号锁死** `sqlite-vec==0.1.9`，禁 `>=`/`^`；升级前必读 release notes。
5. **`chunk_meta` 的 `UNIQUE(source_type, source_id, chapter_seq)` 对 `chapter_seq IS NULL` 不生效**（SQLite 视 NULL 互不相等），setting 类分块可能重复入库。规避：写入前应用层去重（`INSERT OR REPLACE`/先查后写），或对 setting 用非空哨兵值 + 部分索引。

**B. 召回与回写（红线相关）**

6. **confirm 回写事务中的“写 vec_chunk”步骤会因扩展不可用而失败**，破坏 8 步原子性（TC-26 要求全成或全滚）。规避：第 7 步**条件化**——扩展可用才写 `vec_chunk`；否则仅写 `chunk_meta`（并把向量字节落到 `chunk_meta.embedding`，见第 6 章 `D-18`），事务其余步骤照常（总监定稿 `D-17`）。
7. **`GET /api/chapters/{id}/recall` 有写副作用**（写 `recall_log`）：前端**禁对该接口做 HTTP 缓存**、禁并发重复触发（否则 `recall_log` 灌水、覆盖调优依据）。规避：前端用 `react-query` 时设 `staleTime: 0` + `enabled` 由当前章号驱动，一次进章仅触发一次。
8. **未配置模型时语义召回必须整体跳过**：`recall_query.md` 生成（需 LLM）与 embedding（需模型）均不可用；但**结构化召回（人物状态 + 未回收伏笔）必须照常返回**，召回面板**绝不允许整体空白**（红线 1 + 红线 3，TC-19）。规避：`recall_service` 先跑结构化、后按 `provider 可用性` 决定是否跑语义，语义失败静默降级为“相关片段为空”。
9. **提示词 JSON 解析失败**：做**一次重试**，重试提示中附上 JSON 解析错误信息；仍失败则返回可读错误 + 原始输出（`raw_ai_output`），**不写库、不崩溃**，章节仍可保存为 draft（TC-27）。
10. **注入预算硬上限 4000 字**：按重要性截断（高重要度伏笔全量、中低只注入标题）；`recall_service` 合并去重后按“结构化在前、语义在后”排序再截断。

**C. 章节与版本（性能相关）**

11. **章节列表禁返回正文**：`GET /api/books/{book}/chapters` 只回 `ChapterBrief`（无 `content`），保证 200 章列表 < 500ms（TC-13）。
12. **自动保存节流 2s，只 `UPDATE` 不 `snapshot`**：快照仅发生在“完成本章 / 手动存版本 / 回滚前”三时机，否则库体积失控。
13. **删除章节需同时清理 FTS 与向量**：删 `chapter` 后要删对应 `chapter_fts` 行与 `chunk_meta`/`vec_chunk`（`chapter_version`/`character_state` 由 `ON DELETE CASCADE` 处理）。

**D. 存储与安全**

14. **WAL 产生三文件**：`novel.db` + `novel.db-wal` + `novel.db-shm`；备份/迁移/恢复必须**整目录复制**（TC-36），只拷 `.db` 会丢最近事务。
15. **外键需每连接开启**：SQLite 默认关闭外键，连接建立后立即 `PRAGMA foreign_keys = ON`，否则 `ON DELETE CASCADE` 不生效（TC-35）。
16. **密钥永不落盘/落日志/回显**：DB 只存 `key_ref`；密钥读取后仅用于当次请求、用后即弃（TC-21）。日志禁记正文全文与密钥。
17. **换 embedding 模型需整库重建向量**：`vec_chunk` 维度在建库时固定（`FLOAT[1024]`），换模型（尤其换维度）必须重建；`chunk_meta.embedding_model` 留痕所用模型（见 `ADR-005`）。

**E. 版本/工程一致性**

18. **`09` 的依赖范围已过时**（总监定稿 `D-19`～`D-22`，**已接受上调**）：`lxml>=5.2,<6` 挡住了 6.1.3、`pytest>=8.2,<9` 挡住了 9.1.1、`pytest-asyncio>=0.24,<1` 挡住了 1.4.0；`sqlite-vec>=0.1.6` 应改**等号** `==0.1.9`；`@tiptap/* ^2.6.0` 应提到 **2.27.3**。
19. **中文字数统计**：前端用 `Intl.Segmenter`（需 Chrome/Edge 110+、Firefox 110+、Safari 16+），后端保存时**重算**并落 `chapter.word_count`；允许 ±2 字误差（TC-11）。
20. **一书一库的连接管理**：切换作品 = 切换 `novel.db` 路径；连接需 set `row_factory = sqlite3.Row` 且**独立**于其它书，避免 WAL 句柄与路径串书。

---

### 版本来源（2026-09-20 实测）

- PyPI 官方 JSON：`fastapi 0.141.1` / `uvicorn 0.53.0` / `pydantic 2.13.5` / `pydantic-settings 2.15.0` / `keyring 25.7.0` / `python-docx 1.2.0` / `httpx 0.28.1` / `beautifulsoup4 4.15.0` / `lxml 6.1.3` / `pytest 9.1.1` / `pytest-asyncio 1.4.0` / `sqlite-vec 0.1.9`
- npm 官方注册表：`react 18.3.1`（18 线终版）/ `react-router-dom 6.30.6` / `typescript 5.9.3`（5 线）/ `vite 5.4.21`（5 线）/ `@vitejs/plugin-react 4.7.0` / `@tiptap/react 2.27.3`（2 线）/ `@tanstack/react-query 5.103.1` / `zustand 4.5.7` / `lucide-react 1.47.0`
- SQLite 上游最新 3.53.4（2026-07-24）；Python 3.12 内置约 3.45.x。

*（第 4 / 5 / 6 / 11 章完。差异裁决见 `契约差异清单.md`；决策依据见 `docs/decisions/` 下 ADR。）*
