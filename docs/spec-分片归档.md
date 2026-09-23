# Spec 分片归档（合并本）

> **本文件是 3 份「角色侧 Spec 分片」的合并归档**，由 2026-09-22 的文件精简操作合成，内容**未做删改**。

## 怎么用这份文件

| 你要找什么 | 看哪份 |
|---|---|
| **M1 唯一开发依据**（锁定值、验收标准、端到端步骤） | **`spec-M1规格契约.md`**（权威，13 章） |
| 某个章节的**完整表格**（本文件是那些表格的唯一出处） | 本文件对应章节 |
| 设计 Token 的机器可读定义 | `design-tokens.json` / `frontend/src/styles/design-tokens.css` |
| 架构选型理由 | `decisions/ADR-00X-*.md` |
| M0 材料之间的差异与裁决 | `契约差异清单.md` |

> **章节编号提示**：分片原按「项目总监指定的局部编号」编写（第 4/5/6/11 章、第 2/3/4 章、
> 第 7~12 章）。总纲 `spec-M1规格契约.md` 合并时做过**统一重编号**，
> 因此**同一编号在两份文件里可能指不同内容** —— 按章节标题认，不要只按编号认。

## 原分片与来源

| 原文件 | 章节 | 作者 |
|---|---|---|
| `spec-技术章节.md` | 第 4/5/6/11 章 | 架构师 高见远 |
| `spec-范围章节.md` | 第 2/3/4 章 | 产品经理 许清楚 |
| `spec-设计与页面章节.md` | 第 7/8/9/10/11/12 章 | 设计师 颜好看 |

以下为原文件正文（按上述顺序拼接，各自保留原有章节标题与编号）。

---

<!-- ===== 原 spec-技术章节.md（第 4/5/6/11 章 · 架构师高见远）开始 ===== -->

# AI 小说创作工具 — Spec 技术章节（M1 锁定）

> 版本 V1.0 ｜ 编制 2026-09-20 ｜ 架构：高见远
> 本文件是**技术侧增量锁定结论**，不重述《03-技术方案》的既有设计正文，只固化：版本锚定、核对修正后的 API 端点清单、数据库表清单、内嵌已知坑。
> 关联出处：`03-技术方案.md` / `05-数据库schema.sql` / `06-API定义-openapi.yaml` / `09-开发规范与依赖版本.md`；
> 范围以**本文件 §第 2 章 MVP 范围**为准（原引用 `spec-范围章节.md`，已并入本文件）。
> 章节编号按项目总监指定：第 4 / 5 / 6 / 11 章。若与**本文件另两份分片**（范围章节 第 2/3/4 章、
> 设计与页面章节 第 7~12 章）的局部编号冲突，以总监在 `spec-M1规格契约.md` 中合并时的统一编号为准。
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
| GET | `/api/books/{book}/search?q=` | 实现（R19 折叠进 R1 设定库检索范围；全书级检索 → M3，见**本文件 §第 2 章 MVP 范围**） |

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

<!-- ===== 原 spec-技术章节.md 结束 ===== -->

<!-- ===== 原 spec-范围章节.md（第 2/3/4 章 · 产品经理许清楚）开始 ===== -->

# AI 小说创作工具 — 范围章节（M1 锁定）

> 本文件是**增量范围锁定结论**，不重述《01-需求文档（专业版）》的既有需求描述，只固化"做什么、不做什么、各项落在哪一期"。
> 权威顺序（出现冲突时）：**团队已拍板决策（本文件记录）>《12-需求变更记录》>《00-交接说明》>《01-需求文档（专业版）》**。
> 关联出处：`01` §5 需求清单 / §8 范围边界 / §10 里程碑；`00` §3 红线 / §5 十步实施顺序；`12` §2 已作废决定 / §2.6 分期 / §4 生效决策。
>
> M1 范围公式：**《00》第 5 节 10 步实施顺序 + 大纲页(R7) + 字数统计与日更(R17)**。
> M1 冻结红线：① 写前召回自动触发；② 章末回写逐条人工确认；③ 未配模型时全部本地功能可用。

---

## 第 2 章 MVP 范围（锁定）

覆盖 M1 全部功能条目（对应 10 步实施顺序，含第 1 步基础设施，另加大纲页、字数统计）。**不超出**已确认范围；每条均可机械判定。

RICE 口径：Reach 影响面(1–10) / Impact 影响强度(0.25 / 0.5 / 1 / 2 / 3) / Confidence 置信度(50% / 80% / 100%) / Effort 投入(1–10)。总分 = (Reach × Impact × Confidence) / Effort，越高越优先。评分依据见本节末。

| 优先级 | 功能 | 对应需求编号 | 验收标准摘要（可机械判定） | RICE 评分 |
|------|------|------|------|------|
| P0 | 项目骨架 + SQLite 连接层 + 执行 schema.sql | 支撑项（R1–R17 前置，无独立编号） | 执行 `schema.sql` 能建出**15 张普通表 + 3 张虚拟表（vec_chunk / chapter_fts / setting_fts），合计 18 个库对象**及全部索引的**空库**；应用启动时自动连接 `books/<slug>/novel.db` | 10.0（R10·I3·C100%/E3） |
| P2→M1 | 作品（书籍）管理与目录扫描 | R15 | 能新建 / 切换 / 删除作品；每部作品生成独立 `books/<slug>/novel.db`；删除时目录与库同步移除；手工向 `books/` 新增文件夹后能被扫描识别 | 8.0（R8·I2·C100%/E2） |
| P0 | 设定库（人物 / 世界词条 / 伏笔 等） | R1 | 人物卡含**四要素**（表面身份 / 秘密欲望 / 致命弱点 / 矛盾行为）可增删改查；世界词条、势力、地点、伏笔均可增删改查；设定支持全文检索 | 6.8（R9·I3·C100%/E4） |
| P0 | 章节编辑器与设定自动注入 + 自动保存 | R2 | 左侧编辑正文、右侧展示本章相关设定；输入停顿 **2s** 后自动保存，刷新页面正文不丢字；正文落 `chapters` 表 | 10.0（R10·I3·C100%/E3） |
| P1→M1 | 章节版本管理（快照 / 列表 / 回滚） | R11 | 保存或手动触发即生成快照；列表可见历史版本；可回滚到任一历史版本，回滚后正文与该版本**逐字一致** | 2.4（R6·I1·C80%/E2） |
| P0 | 作品导出（txt / docx） | R16 | 支持导出 txt 与 docx；可指定章节范围（如 1-10）；导出行文沿用"章节标题 + 正文"层次 | 7.0（R7·I2·C100%/E2） |
| P0 | 一键启动脚本 start.bat / start.sh | R6 | 双击脚本后本地服务被拉起且浏览器自动打开；全程**无需命令行** | 20.0（R10·I2·C100%/E1） |
| P0 | BYOK 多模型配置 + 密钥环 + 有效性检测 | R5 | 支持不少于 **5** 家模型（DeepSeek / 通义千问 / Kimi / Claude / Ollama）；API Key 存系统密钥环，数据库仅存 `key_ref` 引用名；提供有效性检测与费用预估 | 7.2（R9·I3·C80%/E3） |
| P0 | 状态回写引擎（含人工确认） | R3 | 点"完成本章"返回状态更新建议，覆盖全书摘要 / 角色状态 / 剧情线三类；**逐条确认或修改后才写库**，未确认条目不入库 | 4.3（R9·I3·C80%/E5） |
| P0 | 本地向量索引与写前召回（两路） | R4 | 进入章节时**自动**（无按钮）展示本章出场人物状态与未回收伏笔；结构化召回（硬）+ 语义召回（软）双路合并；召回记录写入 `recall_log` 表 | 2.5（R10·I3·C50%/E6） |
| P1→M1 | 三级大纲工作台（大纲页） | R7 | 支持总纲 / 卷纲 / 章节卡三级结构的新增、编辑、排序；章节卡可关联到对应章节 | 3.2（R8·I2·C80%/E4） |
| P2→M1 | 字数统计与日更记录 | R17 | 写作台顶栏显示当前作品**总字数**；日更记录按天统计新增字数 | 7.0（R7·I1·C100%/E1） |

**优先级标注说明**：`P0` = 文档 P0；`P1→M1` / `P2→M1` = 文档标为 P1 / P2，但因落在 10 步实施顺序或老大拍板而**上提进 M1**，属锁定范围，后续不得当作"越界"裁撤。

### RICE 打分依据（择要）

- **R6 一键启动（20.0）**：Effort 极低（E1）而 Reach 拉满（决定性体验），故总分最高；对应 `00` §7 自检第一项。
- **项目骨架 / R2 编辑器（各 10.0）**：所有后续功能的前置，Reach=10、Impact=3、Effort 中等。
- **R15 作品管理（8.0）**：写作闭环的入口，Effort 低。
- **R5 / R16（7.0–7.2）**：R5 因多模型不确定性给 C80%；R16 为"写完能投稿"的刚需（`12` §5.1 列为最严重遗漏）。
- **R1 设定库（6.8）**：核心三件套之一，但 Effort 偏高（E4）。
- **R3（4.3）/ R4（2.5）**：Impact 最高（I3），但 Effort 大，R4 因中文长文本召回效果不可提前保证给 C50%——这也是 `01` §9 列为高风险项的原因。
- **R7（3.2）/ R11（2.4）**：非闭环必需，Reach / Impact 较低，但为真实写作体验所必需，故随 M1 一并锁定。

### 三条红线在 M1 的落点

| 红线 | M1 承载功能 | 判定 |
|------|------|------|
| 写前召回自动触发 | R4（进入章节自动召回，无手动按钮） | 覆盖 |
| 章末回写逐条人工确认 | R3（建议逐条确认后才入库） | 覆盖 |
| 未配模型时本地功能全可用 | R1 / R2 / R11 / R15 / R16 / R17 均不依赖 AI；R3 无模型时可手动录入状态 | 覆盖（R3 的 AI 建议可降级为手工录入） |

---

## 第 3 章 明确不做（Out-of-Scope，锁定）

"Out-of-Scope" 指**不进 M1**。"何时考虑"列区分三类：**永不**（产品层面的永久排除）/ **M2** / **M3**（延期，非排除）。本表与《12》§2「已作废决定」逐条对齐；`12` 未显式覆盖的 R0 / R8 / R10 / R18 / R19 属**延期**而非作废，已在末列标注。

| 不做的功能 | 原因 | 何时考虑 |
|------|------|------|
| 一键生成整本书 | 效果不可控（长篇必崩）；网文平台明令禁止（阅文禁止整章生成、晋江越线会锁章禁榜）；与"辅助创作"定位冲突 | 永不（`12` §2.5 明确不做） |
| 云端同步与账号体系 | 与"本地运行、数据不出本机"的核心定位冲突（`01` §2.3、§3.4） | 永不 |
| 内容社区与作品分发 | 属于另一类产品形态 | 永不 |
| 移动端应用 | 小说创作依赖大屏与键盘；投入产出比低 | 永不（视反馈，`12` §6） |
| 模型微调 | 成本高、维护难度大 | 永不 |
| 自动发布至网文平台 | 接口不稳定且存在合规风险 | 永不 |
| Word 级编辑器 | 会造成范围失控 | 永不 |
| 对外销售配套的产品化能力（支付通道 / 订阅 / 税务 / 合规 / 客服） | 定位为开源免费工具，不售卖（`12` §2.1 作废"对外销售产品"） | 永不 |
| 免费层 / 付费层切分与付费转化 | 定位纯免费、全功能开放（`12` §2.2 作废"免费 + 增值"） | 永不 |
| License 授权校验系统（激活码 / 设备绑定 / 离线宽限 / 防篡改） | 不收费即无需授权校验；本地校验天然可被破解（`12` §2.3） | 永不 |
| 内置模型额度档位 | BYOK 为永久方案，不承担模型调用成本（`12` §2.3、§4） | 永不 |
| 桌面应用打包（Tauri / Electron） | 需处理打包、代码签名、跨平台编译、杀软误报，调试效率低、投入产出比不足（`12` §2.4 作废"桌面应用"） | 永不（形态锁定"本地服务 + 浏览器界面"） |
| R0 选题建议 | 不阻塞 M1 核心闭环；老大拍板：不在 M1，亦不在 M2 规划 | M3（依赖 M1 的题材库入口与建书流程） |
| R8 一致性审校 | 审校页整体后置；M1 专注"写前召回 + 回写"闭环（老大拍板） | M2 |
| R10 去 AI 味助手 | 同上，审校页后置（老大拍板） | M2 |
| R18 敏感词自查 | 审校页后置；文档标 P2 | M3 |
| R9 拆书工具 | 与核心写作闭环弱相关；老大拍板不在 M1 / M2 | M3（待定） |
| R12 人物关系图谱可视化 | 文档标 P2；非写作闭环必需 | M3 |
| R13 素材库 | 文档标 P2 | M3 |
| R14 数据看板 | 文档标 P2；数据来源（手动录入 vs 导入平台报表）待定（`12` §6） | M3（数据来源待确认） |
| R19 全文检索 | 文档标 P2；M1 仅在 R1 设定库范围内覆盖检索 | M3（全书级检索） |

**一致性说明**：上表"永不"类与 `12` §2 已作废决定（2.1 对外销售 / 2.2 免费增值 / 2.3 License 与内置额度 / 2.4 桌面应用 / 2.5 一键生成整本书）完全一致；`12` §2.6「首版全量交付改为分期」即本 MVP 分期的依据。`12` 未显式涉及的 R0 / R8 / R9 / R10 / R12 / R13 / R14 / R18 / R19 为**延期**，非永久排除。

---

## 第 4 章 R0–R19 里程碑映射表

20 项逐一落位，注明依赖。`M1（上提）` = 文档优先级为 P1 / P2，但被 10 步实施顺序或老大决策纳入 M1。

| 编号 | 需求名称 | 文档优先级 | 落地里程碑 | 依赖 / 说明 |
|------|------|------|------|------|
| R0 | 选题建议 | P1 | M3 | 老大决策不在 M1 / M2；依赖 M1 的题材库入口与建书流程 |
| R1 | 设定库 | P0 | M1 | 核心三件套之一 |
| R2 | 章节编辑器与设定自动注入 | P0 | M1 | 核心；依赖 R15 建书 |
| R3 | 状态回写引擎 | P0 | M1 | 核心三件套之一；依赖 R1 设定库与 R2 编辑器 |
| R4 | 本地向量索引与写前召回 | P0 | M1 | 核心三件套之一；依赖 R1 / R3 |
| R5 | BYOK 多模型配置 | P0 | M1 | 依赖系统密钥环 |
| R6 | 一键启动 | P0 | M1 | 无依赖 |
| R7 | 三级大纲工作台 | P1 | **M1（上提）** | 老大拍板纳入 M1；依赖 R15 建书 |
| R8 | 一致性审校 | P1 | M2 | 审校页后置；依赖 R1 / R4 |
| R9 | 拆书工具 | P1 | M3 | 老大决策不在 M1 / M2 |
| R10 | 去 AI 味助手 | P1 | M2 | 审校页后置；依赖 R5 |
| R11 | 版本管理 | P1 | **M1（上提）** | 10 步之第 5 步；依赖 R2 编辑器 |
| R12 | 人物关系图谱可视化 | P2 | M3 | 依赖 R1 人物数据 |
| R13 | 素材库 | P2 | M3 | 半依赖 AI；依赖 R5 |
| R14 | 数据看板 | P2 | M3 | 数据来源待确认（`12` §6） |
| R15 | 多书项目管理 | P2 | **M1（上提）** | 10 步之第 2 步（书籍 CRUD + 目录扫描） |
| R16 | 作品导出 | P1 | **M1（上提）** | 10 步之第 6 步；`12` §5.1 列为最严重遗漏 |
| R17 | 字数统计与日更记录 | P2 | **M1（上提）** | 老大拍板纳入 M1；写作台顶栏依赖 |
| R18 | 敏感词自查 | P2 | M3 | 审校页后置；依赖本地敏感词库（`11`） |
| R19 | 全文检索 | P2 | M3 | M1 仅在 R1 设定库范围内覆盖检索 |

**分期统计**：M1 = 11 项（R1–R7、R11、R15–R17）；M2 = 2 项（R8、R10）；M3 = 7 项（R0、R9、R12–R14、R18、R19）。合计 20 项，无遗漏、无重复。

> 端点依赖：各需求的 API 端点覆盖矩阵及差异，见 `docs/契约差异清单.md`（D-01～D-23）。其中 R7 / R5 有 M1 端点需在《06》补齐。

### 过程中发现的不一致（以《12》与老大决策为准，已按要求标注）

1. **`01` §10 里程碑表 vs `00` §5 十步 vs 老大决策**：`01` §10 把 M1 限定为 `{R1, R2, R3, R16, R6, R5, R4}`（7 项），**未含 R11、R15**；而 `00` §5 十步的第 2 步（R15）、第 5 步（R11）明确要求 M1 实现，老大另追加 R7、R17。→ 以 `12` §2.6「M1 只做 P0 加少量必要项」+ 老大决策为准，**M1 = 11 项**；`01` §10 的 7 项清单为过期口径。
2. **R11 / R15 / R16 / R7 / R17 的优先级与里程碑错位**：R11 / R16 在 `01` §5 标 P1（应落 M2），R15 / R17 标 P2（应落 M3），但均被 10 步实施顺序或老大决策拉进 M1。已在第 2 章以 `P1→M1` / `P2→M1` 显式标注为**范围上提**，避免后续被误判为越界。
3. **R0 的落位**：`01` §5.2 标 P1（按文档口径应落 M2），老大决策为"不在 M1 且不在 M2 规划"。→ 以老大决策为准，落 **M3**（此为延期，非作废）。
4. **`12` §6 与老大决策**：`12` §6 记"开源许可证**未定**，建议 MIT，发起人需拍板"；老大已拍板 **MIT**，源码置于 `ai-novel/`。本文件按老大决策记为已定。

### 待确认事项（不影响 M1 锁定）

- **M1 端点完整性**：R7 `POST /api/outlines/{id}/expand` 与 R5 `GET /api/providers/{id}/usage` 在《03-技术方案》有定义，但《06-API定义-openapi.yaml》漏登；架构侧已在 `docs/契约差异清单.md`（D-01～D-23）登记，需在 06 补齐。属**契约补齐**，不改变 R7 / R5 的 M1 范围判定。
- R14 数据看板的数据来源（手动录入 vs 导入平台报表），`12` §6 记为待定，M3 阶段再定。
- 团队协作功能：当前排除，视反馈决定。
- 内容资产（题材库校准、敏感词库整理）需人工完成，不阻塞 M1。

---

*范围章节结束。本文件为增量锁定结论，需求全文描述以《01-需求文档（专业版）》为准。*

<!-- ===== 原 spec-范围章节.md 结束 ===== -->

<!-- ===== 原 spec-设计与页面章节.md（第 7/8/9/10/11/12 章 · 设计师颜好看）开始 ===== -->

# AI 小说创作工具 — Spec 设计与页面章节（M1）

> 版本 V1.0 ｜ 设计师 颜好看 ｜ 对应文档《04-界面设计说明.md》V1.0 + 《03-技术方案.md》V1.0
> 本文件是**设计契约的机器可读落点**：第 7 章页面清单、第 8 章锁定值、组件清单、图标库占位。
> 配套同源文件：`ai-novel/frontend/src/styles/design-tokens.css`、`ai-novel/docs/design-tokens.json`
> **本文件不改变《04》已冻结的布局与交互决策，只做落值、枚举与契约固化。**

设计刻度：`DESIGN_VARIANCE=3`（三栏应用骨架，可预测、对称）/ `MOTION_INTENSITY=3`（功能性动效，150ms 收敛）/ `VISUAL_DENSITY=4`（日常应用模式，召回面板宁少勿多）
设计寄存器：**Product（产品型）** —— 设计服务产品，克制用色，禁用装饰性动效，Displays Serif 不出现在仪表类界面

---

## 7 页面清单（M1）

**M1 共 6 个页面。质检页（R8 一致性审校 / R10 去 AI 味 / R18 敏感词）不列入 M1，后置到 M1 之后。**

导航为顶部横向一级导航（书库 / 写作台 / 设定库 / 大纲 / 统计 / 设置），当前项高亮；进入作品后左侧栏独立滚动，不影响一级导航（《04》§1）。

| # | 页面 | 路由 | 核心组件 | 对应 API | 说明 |
|---|---|---|---|---|---|
| 1 | 书库（首页） | `/` | `AppShell` · `TopNav` · `BookCard` · `NewBookForm` · `EmptyState` | `GET /api/books`；`POST /api/books`；`DELETE /api/books/{book}` | 作品卡片网格（书名 / 题材 / 字数 / 进度 / 更新时间 / 继续写按钮）。空态走引导流：新建第一个作品。新建表单字段：书名（必填）、题材、目标字数、一句话卖点；**题材非必填**（《04》§5.1） |
| 2 | 写作台（核心页） | `/book/:slug/desk` | `WritingDesk`（三栏骨架）· `ChapterTree` · `Editor` · `RecallPanel` · `WritebackDialog` · `TopBar` · `StatusBar` | `GET /api/books/{book}/chapters`；`POST /api/books/{book}/chapters`；`GET /api/chapters/{id}`；`PATCH /api/chapters/{id}`；`GET /api/chapters/{id}/recall`；`POST /api/chapters/{id}/finalize`；`POST /api/chapters/{id}/finalize/confirm`；`GET/POST /api/chapters/{id}/versions` | 占 80% 使用时间。左栏 220px 章节树 / 中栏自适应（最小 480px，正文最大宽 720px 居中）/ 右栏 340px 召回+设定；顶栏 52px、状态栏 28px。**召回请求不阻塞编辑器渲染**（《04》§2.2）。最小可用宽度 900px，不做手机端 |
| 3 | 设定库 | `/book/:slug/settings` | `Tabs` · `CharacterCardList` · `CharacterForm` · `WorldEntryTree` · `ForeshadowTable` · `AffectedChaptersDialog` | `GET/POST /api/books/{book}/characters`；`PATCH/DELETE /api/characters/{id}`；`GET /api/characters/{id}/affected-chapters`；`GET/POST /api/books/{book}/world-entries`；`PATCH/DELETE /api/world-entries/{id}`；`GET/POST /api/books/{book}/foreshadows`；`PATCH /api/foreshadows/{id}` | 三 Tab：人物卡 / 世界词条 / 伏笔台账。人物卡表单按「立体人物公式」四要素分组（表面身份 / 秘密欲望 / 致命弱点 / 矛盾行为），**四要素字段下方必须带灰色说明文字**（《04》§5.2）。保存时先查 `affected-chapters`，有引用则弹 `AffectedChaptersDialog`（约束 3） |
| 4 | 大纲 | `/book/:slug/outline` | `OutlineTree` · `OutlineDetail` · `ChapterCardList` · `AiExpandButton` | `GET/POST /api/books/{book}/outlines?level=`；`PATCH/DELETE /api/outlines/{id}`；`POST /api/outlines/{id}/expand` | 三级树（总纲 → 卷纲 → 章节卡），左树右详情。章节卡节点建议 3–5 条；AI 展开结果填入编辑框**等用户改完再保存**（《04》§5.3） |
| 5 | 统计 | `/book/:slug/stats` | `StatCards` · `DailyChart` · `ChapterProgressBar` | `GET /api/books/{book}/stats` | 总字数、章数、日更曲线、目标进度。只读页，无写操作 |
| 6 | 设置 | `/book/:slug/config` | `ProviderList` · `ProviderCard` · `ProviderForm` · `TaskRoleMapping` · `WritingModeSwitch` · `ExportPanel` · `KeyInput` · `ConnectionTestBadge` | `GET/POST /api/providers`；`PATCH/DELETE /api/providers/{id}`；`POST /api/providers/{id}/test`；`GET /api/providers/{id}/usage`；`PATCH /api/books/{book}` | 模型配置 + 任务级分配（架构规划 / 正文生成 / 一致性审校 / 向量嵌入，约束 4）+ **写作模式三档开关**（manual / assist / semi，约束 5）+ **数据导出**（txt / docx，R16）。密钥输入 `type="password"`，提交后**永不回显**只显示 `key_ref` 名，编辑留空表示不修改（《04》§5.5） |

**跨页常驻**：`AppShell`（顶部一级导航 + 内容区）在页面 1/3/4/5/6 复用；页面 2 使用 `WritingDesk` 自有三栏骨架 + 顶栏 + 状态栏。
**路由锁定对齐**：本表路由与团队主 Spec《spec-M1规格契约》§7 完全一致（`/book/:slug/...`）。其中 设定库 = `/book/:slug/settings`、设置（模型配置·写作模式·导出）= `/book/:slug/config`。注意与《03》§1.2 的文件名区分：`pages/Settings.tsx` 指「设定库」、`pages/Providers.tsx` 指「设置」页的模型配置区，**文件命名与路由命名不是一回事**。
**路由参数口径**：`:slug` = API 路径参数 `{book}` = 作品目录名（`books/<slug>/`）—— 三者是**同一取值**，只是分处前端路由与 API 两个命名空间（依据 `06-openapi.yaml`：「路径中的 `{book}` 为作品目录名（slug）」）。前端构造 `/api/books/{book}/...` 时直接透传路由 `:slug`，无需转换。（已与架构师核实，非契约冲突。）

---

## 8 设计 Token（锁定）

> 完整的 Token 定义见 `frontend/src/styles/design-tokens.css`（315 个唯一命名）与 `docs/design-tokens.json`（同源）。以下为**锁定值**，M1 期间不得擅自变更。

### 8.1 主色（继承《04》§6.3，不得改动）

| 语义 | 值 | Token | 用途 |
|---|---|---|---|
| 主色 | `#1565C0` | `--color-primary` | 一级导航选中、主按钮、链接、焦点环、树选中 |
| 强调色 | `#00897B` | `--color-accent` | 确认类动作（确认并保存 / 标记已回收）、已连通 / 已自动保存状态。**每屏可见使用 ≤2 处** |
| 警示色 | `#C62828` | `--color-danger` | 错误、破坏性操作、高重要度 |
| 伏笔老化色（橙） | `#E65100` | `--color-foreshadow-aging` | 仅用于「埋了很久的伏笔」（距今超 20 章高亮） |
| 正文色 | `#212121` | `--color-text-primary` | 正文、编辑器文字 |
| 次要色 | `#616161` | `--color-text-secondary` | 说明文字、元数据 |

派生规则：所有色皆由 A1 原始值（Material Blue/Teal/Red/Orange/Amber/Grey）派生，**组件禁止出现裸 hex**（唯一例外 `#fff` / `#000`，且本文件亦以 `--color-grey-0/1000` 形式提供）。
可访问性修正：小号文字不得直接用 `--color-accent`（白底 3.9:1），改用 `--color-accent-strong`（`#00695C`）；伏笔老化小字改用 `--color-foreshadow-aging-strong`（`#A63C00`）。

### 8.2 字体（锁定）

| 项 | 值 | Token | 来源 |
|---|---|---|---|
| UI 字体 | `Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif` | `--font-ui` | typography-pairings 第 5 套 Minimal Swiss + 第 22 套 Chinese Simplified |
| 编辑器正文 | `"Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", Georgia, serif` | `--font-editor` | 项目决策（《04》未指定编辑器字体）：中文书稿衬线体，长时阅读省力。**如需改无衬线，单点改为 `var(--font-ui)`** |
| 等宽 | `"JetBrains Mono", "Fira Code", Consolas, monospace` | `--font-mono` | 字数 / token 估算 / 版本号 |

字号：UI 13–14px（`--text-sm` / `--text-base`）；**编辑器正文 17px / 行高 1.9**（`--text-editor-body` / `--leading-editor`，继承《04》）。
字重三级：400（正文）/ 500（按钮、表头、小标题）/ 600（大标题）。
字距：标题负字距 `-0.02em`；11–13px 辅助文字 `+0.012em`；ALL CAPS 拉丁标签 `+0.08em`；正文 `0`。
**离线告知**：本产品本地运行，`Noto Sans SC` / `Noto Serif SC` / `Inter` 建议随构建自托管于 `frontend/public/fonts/`，不依赖 Google Fonts CDN；字体栈已内置系统回退，缺字体时界面不崩。

### 8.3 图标库（锁定：lucide-react）

| 项 | 锁定值 |
|---|---|
| 库 | **`lucide-react`**（严格描边 SVG，1400+ 图标，ESM 可 tree-shake，TS 类型完整，MIT） |
| 版本 | **等号锁死 `lucide-react==1.47.0`**，全项目不混用 |
| 尺寸 | `--icon-size-inline: 16px`（行内）/ `--icon-size-button: 20px`（按钮内）/ `--icon-size-standalone: 24px`（独立 / 空态） |
| 描边宽度 | `--icon-stroke-width: 1.75`（lucide 默认 2，**必须在 `Icon` 组件内覆盖为 1.75**）；取色一律 `currentColor`，随文字色 |
| 承载 | 经 `components/common/Icon` 单一入口；业务代码**禁直接 import 图标库**、**禁用 `icons[...]` 全量对象**（破坏 tree-shaking） |
| 状态 | 已由架构师锁定（依据 `docs/decisions/ADR-004-描边图标库lucide-react.md`），占位解除 |

**绝对禁止 emoji 作为功能图标。** 《04》线框图中出现的「警示三角、人物、文档、图钉、对勾、折线、齿轮」等符号仅为线框示意，落地时必须替换为图标库组件，不得进入代码 / Token / 组件清单。（此处不复述任何符号字形，以免被 emoji 正则误伤。）
图标单一入口：所有图标经 `Icon` 组件渲染（见 9.3），业务代码禁止直接 import 图标库具体文件——架构师替换图标库时只改 `Icon` 一处。

### 8.4 主题（锁定）

| 项 | 值 |
|---|---|
| 主题模式 | **仅浅色**。深色模式 M1 不做 |
| 落地方式 | 全部颜色走 CSS 变量（`design-tokens.css`）。后续加深色只需补 `:root[data-theme="dark"]` 覆盖语义色层，**组件零改动** |
| 背景 / 表面 | 应用底 `--color-bg` `#F5F6F8`；卡片与编辑画布 `--color-surface` 白；侧栏凹陷 `--color-surface-sunken` |
| 分层策略 | 浅色主题靠 **1px 边框**（`--color-border`）分层，默认**不使用阴影**（`--card-shadow: none`）；阴影仅用于浮层（下拉 / 弹窗 / Toast） |
| 圆角 | 卡片 8px（`--radius-card`）/ 按钮 6px（`--radius-button`）/ 输入框 6px / 弹窗 12px（删除线继承《04》：卡片 ≥24px 禁止） |
| 间距 | 4px 基准网格，仅 4/8/12/16/20/24/32/40/48/64 档位，禁 5/7/13/15/22/30 |
| 动效 | 收敛值 150ms（`--duration-fast`）；缓动只用 `--ease-standard/out/in-out`；**禁止弹跳/弹性 `cubic-bezier(0.68,-0.55,0.265,1.55)`**；`prefers-reduced-motion` 下全部时长归零（`design-tokens.css` 内已全局处理） |

### 8.5 对标品牌（视觉基调，不夸大）

| 对标 | 借鉴点 |
|---|---|
| **Notion** | 密集信息区的克制视觉：1px 边框分层、无阴影、无强调色污染；结构化数据（伏笔 / 人物）的清单化呈现 |
| **Linear** | 应用骨架的严谨感：固定栏宽、清晰的信息层级、150ms 功能性动效、键盘可达 |
| **Obsidian** | 本地优先、双栏写作工作流；写作画布的去干扰留白（正文最大宽 720px 居中） |

配合本产品自有识别点：**中文书稿衬线体编辑画布**（"像稿纸"）+ **深蓝结构色 + 青绿确认色**，构成"沉静、可靠、专业写作工具"的基调。

---

## 9 组件清单（M1）

> **硬约束：单文件 ≤ 300 行。** 下表「拆分建议」列出必须拆出的子组件 / hook，前端按此落地，禁止把整页塞进单文件。
> 状态列覆盖：`loading` / `empty` / `error` / `offline`（另含 `edge` 边界）。

### 9.1 写作台组件

| 组件 | 职责 | 关键 props | 需处理的状态 | 拆分建议 |
|---|---|---|---|---|
| `ChapterTree` | 左栏章节树：按卷分组、显示当前章、新建章节 | `bookId` · `activeChapterId` · `volumes` · `onSelect` · `onCreate` | loading（骨架行）/ empty（无章节→引导新建第一个）/ error（就地错误条+重试）/ offline（本地数据照常，写操作禁用） | 拆 `VolumeGroup`、`ChapterRow`、`TreeHeader`；数据用 `useChapterTree` hook。**预计 ~180 行** |
| `Editor` | TipTap 编辑器：正文编辑、加粗/斜体、自动保存、字数 | `chapterId` · `initialContent` · `onSave` · `onFinalize` · `readOnly` | loading（打开时先渲染缓存内容，不等接口）/ empty（新章占位提示）/ error（保存失败就地错误条+重试）/ edge（超长文本、无标题） | 拆 `EditorToolbar`、`EditorBubbleMenu`、`EditorCanvas`；自动保存用 `useAutosave`（节流 2s），字数用 `useWordCount`（`Intl.Segmenter`）。**主文件目标 <200 行** |
| `RecallPanel` | 右栏召回容器：四个分区 + Tab 切换（召回/设定） | `chapterId` · `recallData` · `status` | loading（**分区级骨架屏，不用全屏遮罩**）/ empty（区级空态，但「本章人物」必须有非空兜底）/ error（离线降级卡：未配置模型仍显示结构化召回）/ offline（顶部黄条） | 拆 `RecallPanelTabs`、`RecallSection`（可折叠容器）、`RecallSkeleton`；数据用 `useRecall`。**容器目标 <160 行** |
| `ForeshadowList` | 「未回收伏笔」分区：重要度降序 + 埋设章升序，距今 N 章 >20 用老化色 | `items` · `onMarkClosed` | loading（骨架）/ empty（"暂无未回收伏笔"）/ error（重试）/ edge（标题超长省略） | 拆 `ForeshadowItem`、`AgingBadge`（老化徽标）、`ImportanceBadge`。**吸附 RecallPanel 展开区** |
| `CharacterStateList` | 「本章人物」分区：当前状态、上次出场、查看档案 | `items` · `onOpenProfile` | loading（骨架）/ **empty 兜底：取最近出场前 3 位**（《04》§3.3，禁止空列表）/ error | 拆 `CharacterStateItem`、`StateDiffLine`。 |
| `RecalledChunkList` | 「相关历史片段」分区：**默认折叠**，展开显示相似度与跳转 | `items` · `collapsed` · `onJump` | loading（骨架）/ empty（"未召回相关片段"）/ error | 拆 `ChunkItem`；折叠态只显示条数与最高相似度 |
| `PlotArcList` | 「剧情线」分区：**默认折叠** | `items` | loading / empty / error | 单文件即可 |
| `WritebackDialog` | 回写确认弹窗：五个区块 + 解析警告条 + 确认/取消 | `chapterId` · `suggestions` · `onConfirm` · `onCancel` | loading（生成建议中）/ empty（无任何变更→提示"本章无状态变更"）/ error（生成失败重试）/ edge（解析警告） | **必须拆分**：`WritebackSection`（区块容器）、`SummaryEditor`、`CharacterUpdateItem`、`NewForeshadowItem`、`ClosedForeshadowItem`、`PlotProgressItem`、`ParseWarningBar`、`DialogFooter`。**主文件目标 <200 行** |
| `TopBar` | 写作台顶栏：书名、当前章、字数、AI 菜单（按写作模式显隐）、完成本章、设置 | `book` · `chapter` · `writingMode` · `wordCount` · `onFinalize` | loading（字数骨架）/ edge（纯手动模式**隐藏 AI 按钮**）/ offline（配置入口可用） | 拆 `AiMenu`（三档：manual 隐藏 / assist 菜单 / semi 自动）、`WordCountBadge`。**主文件 <160 行** |
| `StatusBar` | 状态栏 28px：保存状态、召回注入字数/token、**系统能力降级常驻 chip** | `savedAt` · `saveState` · `recallBudget` · `capabilities` | loading（"—"占位）/ error（保存失败 → 可点重试）/ offline（"离线，本地功能可用"）/ **degraded（`vector_available:false` 等 → 常驻 amber/neutral chip，见 §12）** | 拆 `StatusBarCapabilityChips`（见 §12）；主文件 <90 行 |

### 9.2 设定库组件

| 组件 | 职责 | 关键 props | 需处理的状态 | 拆分建议 |
|---|---|---|---|---|
| `Tabs` | 设定库三 Tab 容器（人物卡/世界词条/伏笔台账） | `bookId` · `activeTab` | loading / empty（Tab 级空态）/ error | Tab 状态入 URL query，便于深链 |
| `CharacterForm` | 人物卡编辑：按「立体人物公式」四要素分组 | `value` · `onChange` · `onSave` | loading（回填骨架）/ error（字段级校验 + 顶部摘要）/ edge（四要素任一为空时保留灰色说明） | **必须拆分**：`CharacterFormSection`（分组容器）、`FieldWithHint`（带说明文字字段）、`RoleSelect`、`StatusSelect`、`TagInput`。**主文件目标 <180 行** |
| `FieldWithHint` | 字段 + 灰色说明文字（方法论落地） | `label` · `hint` · `required` · `children` | error（错误就近字段下方）/ edge（超长 hint 换行） | 通用组件，放 `components/common` |
| `WorldEntryTree` | 世界词条树（势力/地点/规则/物品，支持父子） | `entries` · `onCreate` · `onEdit` | loading / empty（"还没有词条，新建第一个"）/ error | 拆 `WorldEntryNode`、`CategoryFilter` |
| `ForeshadowTable` | 伏笔台账表格：状态、重要度、埋设/回收章 | `items` · `onEdit` · `onStatusChange` | loading（表格骨架）/ empty / error / edge（状态筛选零结果） | 拆 `ForeshadowRow`、`ForeshadowStatusBadge`、`ImportanceSelect` |
| `AffectedChaptersDialog` | 设定变更追踪弹窗：列出引用旧设定的章节（约束 3） | `chapterSeqs` · `onConfirm` · `onCancel` | loading（查询中）/ empty（无影响章节→不弹）/ error | 复用 `ConfirmDialog` 骨架 + 章节列表 |

### 9.3 通用组件（`components/common`）

| 组件 | 职责 | 关键 props | 需处理的状态 | 拆分建议 |
|---|---|---|---|---|
| `EmptyState` | 空态：图标 + 一句说明 + 一个主行动按钮 | `icon` · `title` · `description` · `actionLabel` · `onAction` | — | 图标走 `Icon`，尺寸 24px |
| `ErrorBar` | 就地错误条 + 重试（**不用 alert**，不到顶部） | `error` · `onRetry` · `variant` | error（错误码→文案映射《04》§6.2）/ edge（长文案换行） | 错误码→文案映射表独立为 `errorMessages.ts`，**禁止把技术错误原文给用户** |
| `OfflineBanner` | 顶部黄条：离线 / 模型不可用 | `message` · `onDismiss` | offline（本地功能照常可用文案） | 用 `--color-warning-soft` + 琥珀文字 |
| `Skeleton` | 骨架屏：列表行 / 文本 / 卡片（**不用全屏遮罩**） | `variant` · `lines` · `width` | — | 变体：`SkeletonText` / `SkeletonRow` / `SkeletonCard`；微光扫过而非闪烁（`--skeleton-shimmer-duration`） |
| `ConfirmDialog` | 通用确认弹窗（用于设定变更追踪等） | `title` · `children` · `confirmLabel` · `onConfirm` · `onCancel` | loading（确认按钮 loading）/ error | 与 `WritebackDialog` 共用 `Modal` 基座，但**回写弹窗不做二次确认** |
| `Icon` | 图标统一入口（描边 SVG，`currentColor`） | `name` · `size`（16/20/24） | — | **图标库替换唯一改动点**，业务代码禁止直接 import 图标库 |
| `Button` | 按钮（primary/secondary/ghost/accent/danger） | `variant` · `size` · `loading` · `disabled` · `icon` | disabled / loading（含 spinner）/ focus-visible | 8 态覆盖（default/hover/focus/active/disabled/loading） |
| `Input` / `Textarea` / `Select` | 表单控件 | `value` · `onChange` · `error` · `hint` · `disabled` | default / focus / error / disabled | `KeyInput` 基于 `Input`，`type=password`，永不回显 |
| `Badge` / `Tag` | 徽标 / 标签（状态、重要度、类型） | `variant` · `children` | — | 变体对齐 `--color-status-*` / `--color-importance-*` |
| `CollapsibleSection` | 折叠区容器（召回面板四个分区共用） | `title` · `count` · `defaultOpen` · `children` | expanded / collapsed | 动效 200ms `--ease-standard`，受 reduced-motion 约束 |
| `Toast` | 轻提示（保存成功等） | `type` · `message` · `onDismiss` | — | 3s 自动消失；不放文案占位 |
| `Modal` | 弹窗基座（尺寸 640/420px） | `open` · `onClose` · `width` | — | 焦点陷阱 + `Esc` 关闭 + `aria-modal` |

### 9.4 其他页面组件（简述）

| 组件 | 职责 | 需处理的状态 |
|---|---|---|
| `BookCard` / `NewBookForm` | 书库作品卡与新建表单 | loading / empty（引导建书）/ error |
| `TopNav` / `AppShell` | 顶部一级导航 + 内容骨架 | loading / offline |
| `OutlineTree` / `OutlineDetail` / `ChapterCardList` / `AiExpandButton` | 大纲三级树与 AI 展开 | loading / empty / error / edge（AI 结果待用户确认） |
| `StatCards` / `DailyChart` / `ChapterProgressBar` | 统计只读展示 | loading / empty（无数据）/ error |
| `ProviderList` / `ProviderCard` / `ProviderForm` / `TaskRoleMapping` / `ConnectionTestBadge` / `WritingModeSwitch` / `ExportPanel` | 设置页：模型配置 + 任务级分配 + 写作模式三档 + 数据导出 | loading / empty（未配置）/ error（连通失败分类）/ offline |

**组件纪律**：单一职责；**单文件 ≤ 300 行**；业务组件不直连 `fetch`，统一走 `api/client.ts`；服务端状态用 TanStack Query，客户端 UI 状态用 Zustand（对齐《09》§2.2）。

---

## 10 图标库占位说明（交付前端须知）

| 项 | 内容 |
|---|---|
| 现状 | **已锁定**：`lucide-react==1.47.0`（架构师 ADR-004），占位解除 |
| 契约（锁定） | 严格描边 SVG；尺寸 16px（行内）/ 20px（按钮内）/ 24px（独立）；描边宽度 **1.75**（lucide 默认 2，在 `Icon` 内覆盖）；一律 `currentColor` 取色 |
| Token | `--icon-size-inline` / `--icon-size-button` / `--icon-size-standalone` / `--icon-stroke-width`；`--icon.library = "lucide-react"` |
| 单一入口 | 全部图标经 `Icon` 组件渲染。业务代码**禁直接 import 图标库**、**禁用 `icons[...]` 全量对象**（破坏 tree-shaking） |
| 待覆盖的语义图标（M1） | 新建、删除、编辑、保存、完成、设置、折叠/展开、搜索、筛选、警告、信息、人物、章节、伏笔（老化）、剧情线、回收、跳转、重试、查看、模型/连通、导出、统计、大纲、世界词条、关闭 |
| 禁止项 | **禁止 emoji 作为功能图标**（《04》线框中的警示/人物/文档/图钉/对勾/折线/齿轮等符号仅为线框示意，不得落地）；禁止混用多家图标库；禁止图标内联硬编码颜色 |

---

## 11 页面布局与交互实现说明（实现级）

> 本节内容**全部源自《04-界面设计说明》**，仅把其线框与规则转成前端可直接实现的清单，**不新增任何决策**。若本节与《04》冲突，以《04》为准。

### 11.1 书库 `/`

- **布局**：`AppShell`（顶部一级导航 + 内容区）→ 内容区头部（标题左、`+ 新建作品` 右）→ 作品卡片网格（响应式 `auto-fill, minmax(220px, 1fr)`，沟槽 `--space-4`）。
- **关键交互**：点卡片主按钮「继续写 / 打开」进入写作台；卡片「更多」菜单（重命名 / 删除，删除走 `ConfirmDialog`）；`NewBookForm` 字段：书名（必填）、题材、目标字数、一句话卖点（题材非必填）。
- **状态**：加载 → 卡片骨架；空 → `EmptyState`（引导「新建第一个作品」，主行动按钮）；错误 → `ErrorBar` + 重试；离线 → 本地数据照常读，写操作提示。
- **实现要点**：`GET /api/books` 返回来自扫描 `books/` 的 `meta.json`；删除是移入回收目录，不物理删除。

### 11.2 写作台 `/book/:slug/desk`

- **布局**：`TopBar`(52px) / 三栏 / `StatusBar`(28px)。左栏 `ChapterTree` 220px；中栏 `Editor` 自适应（最小 480px，正文 `--editor-content-max` 720px 居中留白）；右栏 `RecallPanel` 340px。
- **关键交互**：
  - 进入章节：**立即渲染编辑器（先用缓存内容，不等接口）** → 并行 `GET /api/chapters/{id}/recall` → 右栏切「召回」Tab 显示骨架 → 返回后填充。**召回不阻塞编辑**（《04》§2.2）。
  - 自动保存：停止输入 2s 触发 `PATCH /api/chapters/{id}`；顶栏显示「已自动保存 HH:mm」，状态栏常驻。
  - 快捷键：`Ctrl+S` 手动保存 / `Ctrl+Enter` 完成本章 / `Ctrl+F` 本章查找 / `Ctrl+Shift+F` 焦点模式（中栏全屏隐藏左右栏）。
  - 顶栏 AI 按钮按 `writingMode` 显隐：`manual` 隐藏、`assist` 菜单（续写/扩写/走向/校对）、`semi` 自动触发召回与回写（仍保留人工确认）。
  - 完成本章 → 打开 `WritebackDialog`。
- **状态**：召回失败（如未配置模型）→ 右栏降级卡「未配置 AI 模型 / 人物状态与伏笔仍可正常显示 / [去配置]」；保存失败 → 状态栏红点 + 就地重试；离线 → 顶部 `OfflineBanner` 黄条。
- **降级**：<1200px 右栏折叠为图标条（40px）；<900px 左栏也折叠；`min-width: 900px`，**不做手机端**。
- **系统能力降级（StatusBar 常驻提示）**：`GET /api/system/capabilities` 返回 `{ vector_available, fts_available, llm_configured }`（无副作用，取自启动自检）。任一为 false，状态栏右侧出现常驻 chip（「语义召回未启用」/「全文检索未启用」/「未配置模型」），点击展开说明与动作。**仅常驻提示，不阻断写作、不弹窗**（红线 3）。完整规范见 §12。
- **实现要点**：本章人物区**禁止空列表**，空则降级取最近出场前 3 位（《04》§3.3）。

### 11.3 设定库 `/book/:slug/settings`

- **布局**：二级页（左导航 240px + 内容区最大宽 1120px）+ `Tabs`（人物卡 / 世界词条 / 伏笔台账）。
- **关键交互**：
  - 人物卡表单按「立体人物公式」四要素分组：基本信息 / 人物内核（表面身份·秘密欲望·致命弱点·矛盾行为）/ 外观背景 / 创作信息；**四要素字段下方必须带灰色说明文字**（如「秘密欲望：他嘴上要什么，心里其实要什么」）。
  - 保存人物卡：先 `GET /api/characters/{id}/affected-chapters`，有引用章节则弹 `AffectedChaptersDialog`（取消 / 仍然保存）；无则不弹。
  - 世界词条树支持父子（势力/地点/规则/物品）；伏笔台账表格行内改状态、重要度。
- **状态**：Tab 级空态引导；列表骨架；字段级校验错误就近显示 + 顶部摘要；错误 → `ErrorBar`。
- **实现要点**：全本地 CRUD，无 AI 依赖（降级可用红线直接受益）。

### 11.4 大纲 `/book/:slug/outline`

- **布局**：左树（总纲 → 卷纲 → 章节卡，三级）+ 右侧详情（卷要点可编辑 / 章节卡列表）。
- **关键交互**：三级节点增删改与排序；章节卡节点建议 3–5 条；`AiExpandButton` 调 `POST /api/outlines/{id}/expand`，结果**填入编辑框，等用户改完再保存**。
- **状态**：AI 展开 → 按钮 loading；失败 → `ErrorBar` + 重试；空 → 引导「添加节点」。
- **实现要点**：AI 只出候选，定稿权在人。

### 11.5 统计 `/book/:slug/stats`

- **布局**：顶部总览（总字数 / 章数 / 目标进度）+ 日更曲线 + 章节进度条。
- **关键交互**：只读页，无写操作。数据源 `GET /api/books/{book}/stats`（增量维护 `writing_log`，不实时全表扫描）。
- **状态**：空（无写作记录）→ `EmptyState`；加载 → 骨架。
- **实现要点**：仅靠颜色区分数据的图表需配图例 / 文本（数据无障碍）。

### 11.6 设置 `/book/:slug/config`

- **布局**：四块——① 任务分配（架构规划 / 正文生成 / 一致性审校 / 向量嵌入，各一个下拉，约束 4）；② **写作模式三档开关**（manual / assist / semi，约束 5）；③ 已配置模型列表；④ **数据导出**（txt / docx + 章节范围，R16）。
- **关键交互**：`+ 添加模型` → `ProviderForm`；密钥 `KeyInput` 为 `type="password"`，**提交后永不回显**只显示 `key_ref` 名，编辑留空表示不修改；`POST /api/providers/{id}/test` 测连通；写作模式切换走 `PATCH /api/books/{book}`（`writing_mode`），切换后写作台顶栏 AI 按钮随之显隐；导出走 `GET /api/books/{book}/export?format=&range=`，完成后触发浏览器下载。
- **状态**：连通中 → 按钮 loading；连通失败 → 分类文案（`LLM_AUTH_FAILED` 等按《04》§6.2 映射，**绝不回显技术原文**）；空 → 引导添加第一个模型；导出中 → 按钮 loading。
- **实现要点**：未配置任何模型时，其余 5 个页面全部本地功能照常可用（降级可用红线）；纯手动模式（manual）下写作台不出现任何 AI 入口。

---

## 12 系统能力降级常驻提示规范（StatusBar）

> 数据源：`GET /api/system/capabilities` → `{ vector_available, fts_available, llm_configured }`（**无副作用**，取自连接层启动自检，进程内缓存）。
> 红线：降级提示**只告知、不阻断**（红线 3「未配模型时全部本地功能可用」）。**不得弹窗、不得 alert、不得禁用任何写作操作、不得遮挡编辑区**。

### 12.1 三个能力与 chip 文案

| 能力字段 | 为 false 时的用户含义 | chip 文案 | 视觉等级 | 图标（lucide，16px） |
|---|---|---|---|---|
| `vector_available` | 语义召回未启用，仅结构化召回（本章人物 + 未回收伏笔）仍工作 | 语义召回未启用 | 降级（amber） | `triangle-alert` |
| `fts_available` | 全文检索（FTS5）未启用 | 全文检索未启用 | 降级（amber） | `triangle-alert` |
| `llm_configured` | 尚未配置任何 AI 模型（**预期状态**，本地功能照常） | 未配置模型 | 中性（灰） | `info` |

- 为 `true` → 对应 chip **不渲染**；三项全 `true` → 状态栏右侧整段不渲染（保持安静，不占位）。
- 文案一律**结论式、非技术**：不出现「sqlite-vec / vec0.dll / load_extension」等原始信息（《04》§6.2「绝不把技术错误原文丢给用户」）；技术细节收进 popover 次要行。
- **禁止 emoji**；图标一律经 `Icon` 组件（lucide-react）。

### 12.2 布局与位置

StatusBar 分三段：**左** 保存状态 · **中** 召回开销 · **右** 能力 chip 区（贴右端）。

- chip 尺寸：高 `--statusbar-chip-height`(20px)、圆角 `--statusbar-chip-radius`、内边距 `--statusbar-chip-padding-x`、水平间距 `--statusbar-chip-gap`；图标 `--statusbar-chip-icon-size`(16px) + 文字 `--statusbar-chip-font-size`(12px)，图标与文字间距 `--statusbar-chip-gap-inner`。
- **最多内联 2 个** chip；≥3 个时内联前 2 个 + 末尾「+N」chip，点击展开（popover）列出全部。chip 区整体不超状态栏可分配宽度的 **1/3**（900px 最小宽度下亦不挤压左侧信息）。
- chip 是**可点击按钮**（非纯展示）：hover 底色变化（`instant`→`fast`），`:focus-visible` 显焦点环。

### 12.3 交互

| 触发 | 行为 |
|---|---|
| 点击 chip | 打开轻量 popover（**非模态**）；状态栏在底部，故 popover **向上**展开 |
| `Esc` / 点击外部 | 关闭 popover，焦点回到触发 chip |
| popover 结构 | 标题（= chip 文案）+ 正文（结论与影响范围）+ 次要行（技术细节，可折叠）+ 底部动作按钮 |

各 chip 的 popover 内容：

- **语义召回未启用**：正文「本章人物状态与未回收伏笔仍会正常显示；仅『相关历史片段』的语义检索暂不可用。」动作：`[重新检测]` `[查看说明]`
- **全文检索未启用**：正文「全书与设定的关键词检索暂不可用，写作与召回不受影响。」动作：`[重新检测]` `[查看说明]`
- **未配置模型**：正文「配置模型后可用 AI 续写与自动回写建议；不配置也能完整写作。」动作：`[去设置]`（跳 `/book/:slug/config`）

`[重新检测]` **重新拉取一次 capabilities（仍为启动缓存值）**；`[查看说明]` 在 popover 内**就地展开**静态帮助（安装/启用指引），**不跳转外链、不打开新窗口**（M1 无线上帮助页，且本工具离线可用不含外网依赖；亦避免打断写作）。因 M1 端点不支持运行时重算（见 §12.6），`vector_available` / `fts_available` 两个 chip 的 popover **固定附一行**「若已安装，请重启应用生效」；`llm_configured` chip 的 `[去设置]` 不受此限（改配置即时生效）。

### 12.4 与其他降级提示的边界（不重叠、可并存）

| 维度 | 承载组件 | 位置 | 触发 |
|---|---|---|---|
| 网络 / 服务离线 | `OfflineBanner`（黄条） | 顶部横向常驻 | 前端探测到后端不可达 |
| 模型未配置 | `RecallPanel` 降级卡 + StatusBar「未配置模型」chip | 右栏 + 状态栏右 | `llm_configured:false` |
| 本地能力缺失（向量 / FTS） | StatusBar chip | 状态栏右 | `vector_available` / `fts_available` 为 false |
| 单次请求失败 | `ErrorBar`（就地） | 就近内容区 | 该请求 error |

**两者可并存、互不替代**：离线时顶部黄条与状态栏 chip 会同时出现，语义不同（网络 vs 本地能力）。**状态栏 chip 不是错误，不得做成红色**；amber 仅用于能力缺失，灰仅用于预期状态。

### 12.5 无障碍

- chip 为 `<button>`，`aria-label` 含完整语义（如「语义召回未启用，按下查看详情与操作」）。
- 能力**状态发生变化时**（可用变为不可用，或反向），由 chip 区容器以 `role="status"`（`aria-live="polite"`）**播报一次**；该容器**不常驻 aria-live**，避免每 2 秒自动保存频繁播报。
- 颜色非唯一手段：每个 chip 同时具备**图标 + 文字**（满足「不仅靠颜色传达含义」）；amber 与中性灰的区别由文案内容兜底。
- chip 可键盘 `Tab` 到达，焦点环 `--focus-ring-shadow`；popover 内动作按钮可键盘操作。

### 12.6 数据与刷新策略

- 进入写作台时拉取一次；服务端状态用 TanStack Query，会话内 `staleTime: Infinity`，**不轮询**（能力是启动自检结果，非高频变化）。
- capabilities 请求失败 → **静默**（不显示任何 chip，避免误报降级）；下次进入写作台或点 `[重新检测]` 再试。
- **已定稿（架构师裁定 + 总监确认）**：`GET /api/system/capabilities` **只返回启动自检的进程内缓存值；M1 不做运行时重算、无 `?refresh` 参数**。
  - **为什么不重算**：`vec_chunk` 虚拟表是在**建库时**按自检结果决定是否创建的。若建库时已跳过，运行期即使重算返回 `vector_available: true`，**当前库依旧没有 `vec_chunk` 表**，语义召回仍然不可用 —— 这个 `true` 是**假阳性**，会让用户误以为问题已解决，**比不重算更糟**。
  - **技术表述精确性（勿写成「运行期无法补加载」）**：SQLite 的 `load_extension` 与 `CREATE VIRTUAL TABLE` **在运行期本可调用**，并非技术上不可能。真正的理由是**代价与风险**：要真正恢复，需在运行期安全加载扩展、补建 `vec_chunk` 虚拟表、并保证所有既有连接状态一致 —— 该代价在 M1 阶段不成比例。故选择「**重启生效**」：既简单又诚实。
  - 故 `[重新检测]` 的**终态行为** = 重新拉取缓存值 + 恒定展示「若已安装，请重启应用生效」；**不承诺“点完即生效”**。
  - 后端已据此在 `06-openapi.yaml` 端点 description 与 Spec §5.10 写死该口径，前端照此实现即可。
  - **注：本取舍属 M1 决策、非永久结论**——将来若要支持热恢复（运行期加载 + 补建 + 连接一致性），本条的「重启生效」表述应可被替换，不被本条挡住。

### 12.7 组件

- 新增 **`StatusBarCapabilityChips`**（`components/writingdesk/`，与 `StatusBar` 同目录）：入参 `capabilities`，渲染 0–2 个 chip（+ 可选「+N」）；内含 `CapabilityChip`（按钮 + 视觉）与 `CapabilityPopover`（说明与动作）两个子件。单一职责，**主文件 <90 行**。
- **目录归属原则**：组件**按归属页面/区域就近放置**。`StatusBar` 仅由写作台（`WritingDeskPage`）渲染，故 chip 系列与 `StatusBar` 同置于 `components/writingdesk/`，**不单开 `components/StatusBar/`**（本条目为 2026-xx 校订：原稿路径与实现不一致，以实现为准修正）。
- 依赖 Token：`--statusbar-chip-*`（见 `design-tokens.css`「状态栏能力 chip」段）。

---

*Spec 设计与页面章节结束。完整 Token 见 `design-tokens.css` / `design-tokens.json`。*

<!-- ===== 原 spec-设计与页面章节.md 结束 ===== -->
