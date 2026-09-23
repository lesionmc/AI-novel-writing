# Spec — AI 小说创作工具 v1.0（M1 规格契约）

> **生成日期**：2026-09-20 ｜ **项目总监**：大湾区靓仔
> **基于**：`01-需求文档（专业版）` v1.0 + `02（通俗版）` + `03-技术方案` V1.0 + `04-界面设计说明` + `05-数据库schema.sql` v1 + `06-API定义-openapi.yaml` + `07-验收用例` + `09-开发规范与依赖版本`
> **状态**：待老大确认 → 确认后自动推进（设计细化 → 开发 → 测试）
>
> **权威顺序**（冲突时以此为准）：**本 Spec > 团队已拍板决策 > `12-需求变更记录` > `00-交接说明` > `01-需求文档`**

---

## 0 本 Spec 怎么用

| 你要做的 | 读哪里 |
|---|---|
| 写后端 | 第 4 / 5 / 6 章 + 第 11 章（坑） |
| 写前端 | 第 7 / 8 章 + 第 11 章（坑） |
| 自测 | 第 9 章 + `07-验收用例.md`（36 条 TC，6 条 ★ 红线） |
| 交付验收 | 第 12 章（端到端验证步骤） |

**本文件是唯一开发依据**。详细清单已在成员文档中固化，本文件以引用 + 锁定值的方式编排；**本文件与成员文档冲突时，以本文件为准**。

**配套文档**（不重复内容，只引用）：
- `docs/spec-分片归档.md` — **第 2/3/4/5/6/7/8/9/10/11/12 章的完整表格**（三份角色分片的合并本：
  PM 许清楚 / 架构师 高见远 / 设计师 颜好看）。**本文件给锁定值，它给完整表格。**
- `docs/契约差异清单.md` — D-01～D-23 全量差异与裁决记录
- `docs/design-tokens.json` + `frontend/src/styles/design-tokens.css` — 设计 Token 唯一真相源
- `docs/decisions/ADR-001～005.md` — 架构决策记录
- `docs/DESIGN.md` — 9 节设计契约

> **P0-1 emoji 门禁的扫描范围（口径限定）**：扫描对象为 `frontend/**`（`.tsx` / `.ts` / `.css` / `.html`）、`docs/**` 中的 HTML 产物与设计稿。
> **纯 Markdown 文档中的排版符号（★ / ⚠ / ● 等）不计入违规** —— 它们不承载图标语义（始终与文字并列出现），且原始交接包 `07-验收用例.md` 本身即用 ★ 标记红线用例，属本项目既有标记习惯。
> 判定要点：**是否作为 UI 功能图标**。是 → 违规；否（文档排版）→ 允许。

---

## 1 产品定义

| 项 | 内容 |
|---|---|
| **一句话描述** | 开源免费、本地运行的中文长篇小说 AI 写作助手——**它不是写作 AI，是记忆力工具** |
| **核心问题** | 大模型没有持久记忆、只有上下文。写到约 3 万字后质量断崖下跌；第 10–15 章起出现「吃书」（人设软化、已死角色被当活人引用、能力等级矛盾） |
| **技术路径** | **记忆外置**——「设定库 + 写前召回 + 状态回写」三件套，把设定与状态从模型上下文中剥离、存入外部库、按需注入 |
| **目标用户** | 主要：项目发起人自己（M2 验证者）；次要：能自配 API Key、通过 GitHub 获取工具的技术型写手 |
| **产品形态** | `start.bat` / `start.sh` 双击拉起本地服务 → 浏览器自动打开。**不是桌面应用，不做打包** |
| **数据边界** | 稿件、设定、状态全部留本机；**无服务端组件、无遥测、不采集数据**。此为核心卖点，任何功能不得突破 |
| **AI 接入** | **BYOK 永久方案**（用户自带 Key，不设内置额度、不做平台中转） |
| **价值底座** | 20 项需求中 **9 项完全不依赖 AI**。未配模型时产品依然完整可用 |

### 1.1 三条红线（违反任一条，产品即失去存在价值）

| 编号 | 红线 | M1 承载体 |
|---|---|---|
| 红线 1 | **写前召回必须自动触发**，不得做成"点按钮才查" | R4（进章即自动展示，无手动按钮） |
| 红线 2 | **章末回写必须半自动**，AI 建议逐条经人工确认或修改后才入库 | R3（未确认条目绝不落库） |
| 红线 3 | **未配置任何模型时，全部本地功能必须可用** | R1/R2/R11/R15/R16/R17 + R3 的手工录入降级路径 |

---

## 2 MVP 范围（锁定）

**范围公式**：`00-交接说明` 第 5 节的 10 步实施顺序 **+ 大纲页(R7) + 字数统计与日更(R17)**

共 **12 条功能**（11 项需求 R1–R7、R11、R15–R17 + 1 项基础设施），完整表格与 RICE 评分见 `spec-分片归档.md` 第 2 章。

| 优先级 | 功能 | 需求 | 验收标准摘要 |
|---|---|---|---|
| 基础设施 | 项目骨架 + SQLite 连接层 + 执行 schema.sql | — | 能建出 15 普通表 + 3 虚拟表的空库（共 18 对象） |
| P2→M1 | 作品管理与目录扫描 | R15 | 新建/切换/删除作品；每部独立 `books/<slug>/novel.db`；手放文件夹能被扫描识别 |
| P0 | 设定库（人物/世界词条/伏笔） | R1 | 四要素（表面身份/秘密欲望/致命弱点/矛盾行为）可增删改查 |
| P0 | 章节编辑器 + 设定自动注入 + 自动保存 | R2 | 停顿 2s 自动保存，刷新不丢字 |
| P1→M1 | 章节版本管理 | R11 | 快照/列表/回滚，回滚后正文与该版本逐字一致 |
| P0 | 作品导出 txt / docx | R16 | 可指定章节范围（如 1-10） |
| P0 | 一键启动脚本 | R6 | 双击后服务拉起 + 浏览器自动开，全程无需命令行 |
| P0 | BYOK 多模型配置 + 密钥环 | R5 | ≥5 家模型；密钥入系统密钥环，库中只存 `key_ref` |
| P0 | 状态回写引擎（含人工确认） | R3 | 逐条确认后才写库 |
| P0 | 向量索引 + 写前召回（两路） | R4 | 进章自动展示；结构化+语义双路合并；写 `recall_log` |
| P1→M1 | 三级大纲工作台 | R7 | 总纲/卷纲/章节卡三级；章节卡可关联章节 |
| P2→M1 | 字数统计与日更记录 | R17 | 顶栏显示总字数；按天统计新增 |

> **`P1→M1` / `P2→M1` 的含义**：文档原标 P1/P2，因落在 10 步实施顺序或经拍板而**上提进 M1**，属锁定范围，后续不得当作"越界"裁撤。

### 2.1 M1 实施顺序（严格串行，每步可独立验证）

| 步 | 内容 | 需求 | 完成标志 |
|---|---|---|---|
| 1 | 骨架 + SQLite 连接 + schema 建库 | — | 能建空库 |
| 2 | 作品 CRUD + 目录扫描 | R15 | 能新建/切换作品 |
| 3 | 设定库（人物/世界词条/伏笔） | R1 | 能录入并查到 |
| 4 | 章节编辑器后端 + 自动保存 | R2 | 能写能存不丢字 |
| 5 | 版本管理 | R11 | 能回滚 |
| 6 | 导出 txt / docx | R16 | **到此即可开始真实写作** |
| 7 | 一键启动脚本 | R6 | 双击可用 |
| 8 | 模型配置 + 密钥环 + 有效性检测 | R5 | 能连通模型 |
| 9 | 章末回写（含人工确认） | R3 | 记忆机制成立 |
| 10 | 向量索引 + 两路召回 | R4 | **核心闭环跑通** |
| 11 | 大纲页 | R7 | 三级大纲可管理 |
| 12 | 字数统计与日更 | R17 | 顶栏字数 + 日更曲线 |

---

## 3 明确不做（Out-of-Scope，锁定）

完整表格（21 条，含原因与"何时考虑"）见 `spec-分片归档.md` 第 3 章。**开发中如有人提出以下功能，直接拒绝，走变更流程。**

**永久排除（12 条）**——与 `12-需求变更记录` §2 的 6 条已作废决定完全一致：

| 不做 | 原因 |
|---|---|
| 一键生成整本书 | 长篇必崩 + 网文平台明令禁止（阅文禁整章生成、晋江越线锁章禁榜） |
| 云端同步与账号体系 | 与"数据不出本机"核心定位冲突 |
| 内容社区与作品分发 | 属另一类产品形态 |
| 移动端应用 | 小说创作依赖大屏与键盘 |
| 模型微调 | 成本高、维护难 |
| 自动发布至网文平台 | 接口不稳 + 合规风险 |
| Word 级编辑器 | 范围失控 |
| 产品化能力（支付/订阅/税务/合规/客服） | 不售卖 |
| 免费层/付费层切分 | 全功能开放 |
| License 授权校验（激活码/设备绑定/防篡改） | 不收费即无需校验；本地校验天然可破解 |
| 内置模型额度档位 | BYOK 为永久方案 |
| 桌面应用打包（Tauri/Electron） | 打包/签名/跨平台编译/杀软误报，投入产出比不足 |

**延期（9 条）**：R0 选题建议 → M3 ｜ R8 一致性审校 → M2 ｜ R10 去 AI 味 → M2 ｜ R9 拆书 → M3 ｜ R12 关系图谱 → M3 ｜ R13 素材库 → M3 ｜ R14 数据看板 → M3 ｜ R18 敏感词自查 → M3 ｜ R19 全书级检索 → M3

> **R19 边界（明确）**：M1 **仅在 R1 设定库范围内**提供检索（`GET /api/books/{book}/search`）。**全书/全稿级检索留 M3**。此边界必须在自检时注意，避免红线 3 的"全文检索可用"被判不达标。

**里程碑分期**：M1 = 11 项（R1–R7、R11、R15–R17）｜M2 = 2 项（R8、R10）｜M3 = 7 项（R0、R9、R12–R14、R18、R19）。合计 20 项，无遗漏、无重复。

---

## 4 技术架构（版本锚定）

### 4.1 运行时形态

```
start.bat / start.sh
    ├─ 拉起 FastAPI（127.0.0.1:随机可用端口）
    └─ 自动打开浏览器 → http://127.0.0.1:<port>

浏览器（React SPA）◄─► FastAPI 路由层 → 服务层 → 仓储层
                                            ↓
                        books/<书名>/novel.db（SQLite）
                        + 系统密钥环（API Key）
                                            ↓
                        用户自带 Key（BYOK）→ DeepSeek / 通义 / Kimi / Claude / Ollama
```

| 约束 | 内容 |
|---|---|
| 无服务端组件 | 项目自身不含云端服务，不采集数据、无遥测 |
| 单用户单机 | 不设计并发、不设计账号体系 |
| 数据落盘 | 全部落在 `books/` 下，一个作品一个文件夹 |
| 密钥 | 系统密钥环（Windows Credential Manager / macOS Keychain），库中只存 `key_ref` |

### 4.2 版本锚定表（**唯一依据，已逐个验证存在性**）

> 所有版本号已于 2026-09-20 通过 npm registry 与 PyPI 官方接口**逐个验证存在**（HTTP 200）。
> 原则：**钉死实际版本按该版本 API 写**；pre-v1 依赖**等号锁死**，禁浮动范围。

**后端 `backend/requirements.txt`**

| 层 | 技术 | 锁定版本 | 锁定原因 |
|---|---|---|---|
| 运行时 | Python | **3.12.x** | 冻结 3.12；内置 sqlite3 自带 FTS5 与可加载扩展；3.13 free-threaded 与 sqlite-vec 组合未验证，M1 不上 |
| 内置 | SQLite | 3.45.x（随 Python 3.12）；下限 3.35 | 3.35+ 支持 `DROP COLUMN`；FTS5 需编译期启用（运行时自检） |
| Web | fastapi | **0.141.1** | 当前稳定；Pydantic v2 原生 |
| ASGI | uvicorn[standard] | **0.53.0** | 与 FastAPI 0.141 配套；Windows 无 uvloop 自动回退 |
| 校验 | pydantic | **2.13.5** | v2 语法，与 FastAPI 0.141 匹配 |
| 配置 | pydantic-settings | **2.15.0** | 与 v2 对齐 |
| 密钥环 | keyring | **25.7.0** | Windows Credential Manager / macOS Keychain 后端 |
| HTTP | httpx | **0.28.1** | 调各家模型 API（含 SSE 流式） |
| 导出 | python-docx | **1.2.0** | R16 docx 导出 |
| HTML 清洗 | beautifulsoup4 | **4.15.0** | 导出 docx 前清洗 TipTap HTML |
| XML | lxml | **6.1.3** | bs4 后端（`09` 的 `<6` 上限已过时，**必须上调**） |
| 向量扩展 | **sqlite-vec** | **0.1.9（等号锁死）** | pre-v1，破坏性变更；`win_amd64` wheel 已确认存在（内附 `vec0.dll`） |
| 测试 | pytest | **9.1.1** | `09` 的 `<9` 上限已过时 |
| 测试 | pytest-asyncio | **1.4.0** | `09` 的 `<1` 上限已过时 |

> **不上 ORM**：仅用 Python 标准库 `sqlite3`（见 `ADR-003`）。手写 SQL 更直观、性能可控、少一层抽象。

**前端 `frontend/package.json`**

| 层 | 技术 | 锁定版本 | 锁定原因 |
|---|---|---|---|
| 运行时 | Node.js | **22 LTS** | Vite 5 要求 Node 18+ |
| UI | react / react-dom | **18.3.1** | 团队冻结 React 18（18 线终版；上游已 19.3.0，M1 不跳） |
| 路由 | react-router-dom | **6.30.6** | 6 线最高（上游已 7.18.4，破坏性，不跳） |
| 语言 | typescript | **5.9.3** | 5 线最高（上游已 7.0.2，M1 不跳） |
| 构建 | vite | **5.4.21** | 团队冻结 Vite 5（上游已 8.3.0，M1 不跳） |
| 构建插件 | @vitejs/plugin-react | **4.7.0** | 与 Vite 5 配套（上游已 6.1.1） |
| 编辑器 | @tiptap/react / starter-kit / pm | **2.27.3**（三者同版） | 冻结 TipTap 2.x（上游已 3.31.3） |
| 服务端状态 | @tanstack/react-query | **5.103.1** | 与上游最新一致 |
| 客户端状态 | zustand | **4.5.7** | 4 线最高（上游已 5.0.15） |
| 图标 | **lucide-react** | **1.47.0（等号锁死）** | P0 规则：描边 SVG 图标库全项目统一，禁 emoji（见 `ADR-004`） |
| 样式 | 原生 CSS 变量 + CSS Modules | 无第三方版本 | 设计契约锁定，**不引入 Tailwind / UI 组件库** |

### 4.3 分层纪律（不可越界）

| 层 | 职责 | 禁止 |
|---|---|---|
| `routers/` | 解析请求、调服务、格式化响应 | 写业务逻辑、直接碰数据库 |
| `services/` | 业务规则、编排、事务 | `import fastapi` 的 Request/Response |
| `repositories/` | SQL 查询、外部调用 | 写业务判断 |
| `services/llm/` | 统一模型调用接口、密钥管理 | 感知业务语义 |

> **自查方法**：`services/` 下若出现 `from fastapi import Request`，即为违规。

**目录口径修正**：`03` §1.2 含 `routers/topics.py`（R0 → M3）。**M1 不创建该文件**（不镀金，连骨架都不留）。

---

## 5 API 端点清单（锁定）

统一前缀 `/api`（**不加版本前缀** —— 本地单用户工具，版本化收益为零）。请求/响应 JSON；长耗时 AI 调用走 SSE（路径后缀 `/stream`）。

错误统一结构：`{ "error": { "code": "...", "message": "...", "detail": null } }`

**总计 36 个 path**（`06-openapi.yaml` 原有 33 个 + 补齐 2 个遗漏端点 + 新增 1 个能力探测端点）。完整清单见 `spec-分片归档.md` 第 5 章。

### 5.1 books（R15）
`GET /api/books` ｜ `POST /api/books` ｜ `GET /api/books/{book}` ｜ `PATCH /api/books/{book}` ｜ `DELETE /api/books/{book}`（移入回收目录，**不物理删除**）

### 5.2 settings（R1）
`GET|POST /api/books/{book}/characters` ｜ `GET|PATCH|DELETE /api/characters/{id}` ｜ `GET /api/characters/{id}/affected-chapters`（设定变更追踪，约束 3）｜ `GET|POST /api/books/{book}/world-entries` ｜ `PATCH|DELETE /api/world-entries/{id}` ｜ `GET|POST /api/books/{book}/foreshadows` ｜ `PATCH /api/foreshadows/{id}`

### 5.3 outlines（R7）
`GET|POST /api/books/{book}/outlines` ｜ `PATCH|DELETE /api/outlines/{id}` ｜ **`POST /api/outlines/{id}/expand`** ★

### 5.4 chapters（R2 / R11）
`GET|POST /api/books/{book}/chapters`（列表**不含正文**）｜ `GET|PATCH|DELETE /api/chapters/{id}` ｜ `GET|POST /api/chapters/{id}/versions` ｜ `POST /api/chapters/{id}/versions/{vid}/restore`

### 5.5 memory（R3 / R4，产品核心）
`GET /api/chapters/{id}/recall`（写前召回，**有写 `recall_log` 副作用，前端禁缓存**）｜ `POST /api/chapters/{id}/finalize`（出建议，**不落库**）｜ `POST /api/chapters/{id}/finalize/confirm`（单事务落库，8 步）｜ `GET /api/books/{book}/memory/summary` ｜ `GET /api/books/{book}/memory/character-states?upto_seq=` ｜ `GET /api/books/{book}/memory/plot-arcs` ｜ `GET /api/books/{book}/recall-logs`

### 5.6 providers（R5）
`GET|POST /api/providers`（**绝不返回密钥明文**）｜ `PATCH|DELETE /api/providers/{id}` ｜ `POST /api/providers/{id}/test` ｜ **`GET /api/providers/{id}/usage`** ★

### 5.7 export / stats / search（R16 / R17 / R19）
`GET /api/books/{book}/export?format=txt|docx&range=` ｜ `GET /api/books/{book}/stats` ｜ `GET /api/books/{book}/search?q=`（**M1 仅覆盖设定库范围**）

### 5.8 system（能力探测）

`GET /api/system/capabilities` → `{ vector_available, fts_available, llm_configured }`

**无副作用**。`vector_available` / `fts_available` 取连接层**启动自检**结果（进程内缓存）；`llm_configured` 反映**当前**配置状态（模型配置即时生效，**不是启动快照**）。

**M1 不做运行时重算**（无 `?refresh`）：`vec_chunk` / FTS 虚拟表是**建库时**按自检结果决定是否创建的。若当时跳过，运行期即便扩展可加载、库中也没有对应表 —— 重算返回 `true` 会成为**假阳性**，比不重算更糟（用户会以为问题已解决）。
前端 `[重新检测]` 退化为「重新拉取缓存值」，并固定提示「若已安装，请重启应用生效」。（将来若要真正支持热恢复，需在运行期安全加载扩展 + 补建虚拟表 + 保证多连接状态一致，M1 阶段代价不成比例。）

前端 StatusBar 据此显示降级常驻提示（**不阻断写作**，红线 3）。

### 5.9 M1 不实现（仅登记契约，不写路由）
- `audit` 组 3 条（R8/R10/R18 → M2/M3）
- `topics` 组 2 条（R0 → M3）

> ★ = **本次核对发现 `06-openapi.yaml` 遗漏、已确认必须补入的 2 个端点**。不补则 R7 的 AI 展开与 R5 的费用预估**无契约可依**，对应 TC 无法执行。

---

## 6 数据库表清单（锁定）

**存储策略**：**一本书一个 SQLite 库** → `books/<slug>/novel.db`。`schema.sql` 为唯一真相源。
**统一口径**：**15 张普通表 + 3 张虚拟表 = 18 个库对象**（`03` §2.2 漏列两张 FTS 表，以此口径为准）。

### 6.1 普通表（15 张）

| # | 表 | 域 | 用途 | M1 |
|---|---|---|---|---|
| 1 | `book` | 基础 | 书籍元信息与全书摘要 | 用 |
| 2 | `character` | 设定 | 人物卡（四要素） | 用 |
| 3 | `character_relation` | 设定 | 人物关系 | 建、不用（R12→M3） |
| 4 | `world_entry` | 设定 | 世界词条（势力/地点/规则/物品） | 用 |
| 5 | `foreshadow` | 设定 | 伏笔台账 | 用 |
| 6 | `outline` | 大纲 | 三级大纲（自关联） | 用 |
| 7 | `chapter` | 创作 | 章节正文 | 用 |
| 8 | `chapter_version` | 创作 | 章节历史版本（R11） | 用 |
| 9 | `character_state` | 记忆 | 角色状态变更点（**增量式**） | 用 |
| 10 | `plot_arc` | 记忆 | 剧情线进展 | 用 |
| 11 | `recall_log` | 记忆 | 召回记录（调优/成本监控唯一依据） | 用 |
| 12 | `chunk_meta` | 向量 | 文本分块元数据 | 用 |
| 13 | `llm_provider` | AI | 模型配置（**只存 `key_ref`**） | 用 |
| 14 | `writing_log` | 统计 | 日更记录（R17） | 用 |
| 15 | `material` | 素材 | 桥段/金句库 | 建、不用（R13→M3） |

### 6.2 虚拟表（3 张）

| # | 表 | 类型 | 用途 | 依赖 |
|---|---|---|---|---|
| 16 | `vec_chunk` | sqlite-vec `vec0` | 向量索引 `FLOAT[1024]` | 需加载扩展；不可用则跳过并降级 |
| 17 | `chapter_fts` | FTS5 | 章节正文全文检索 | 需 FTS5；不可用则降级 |
| 18 | `setting_fts` | FTS5 | 设定检索（character / world_entry） | 同上 |

> **FTS 同步机制（M1 定稿）**：`chapter_fts` / `setting_fts` **不上 TRIGGER**，由**应用层同步维护** —— 章节保存/删除、设定增改删时由 `repositories/` 同步写入。
> 理由：触发器隐式副作用难追踪，与「手写 SQL、便于审计」的决策冲突。

### 6.3 核心读取规则（**产品灵魂，必须精确实现**）

```sql
-- 角色状态是增量式：读某角色在第 N 章的状态 = 取 chapter_seq <= N 的最后一条
SELECT state FROM character_state
WHERE character_id = ? AND chapter_seq <= ?
ORDER BY chapter_seq DESC LIMIT 1;
```
状态无变化时**不写记录**（增量），否则库会随章节线性膨胀。

### 6.4 索引（8 个，以 `05` 为准）

`idx_chapter_seq`(UNIQUE) ｜ `idx_version_chapter` ｜ `idx_char_state_lookup(character_id, chapter_seq DESC)` ｜ `idx_foreshadow_open(status, importance)` ｜ `idx_outline_hierarchy(level, parent_id, seq)` ｜ `idx_chunk_source(source_type, source_id)` ｜ `idx_recall_chapter(chapter_seq)` ｜ `idx_char_role(role, status)`

### 6.5 对 `05` 的修正点（**双方已裁决，Phase 3 落地**）

| 编号 | 修正内容 |
|---|---|
| D-18 | `chunk_meta` **增 `embedding BLOB` 列** —— 扩展不可用时向量仍可重建（1024×4B≈4KB/块，百万字约 1250 块≈5MB，成本可控） |
| D-10 | 补 `idx_version_chapter`、`idx_char_role` 进文档口径 |
| D-11 | `character.role` 存**英文枚举** `protagonist/supporting/antagonist/minor`，`NOT NULL DEFAULT 'supporting'` |
| D-08 | `recall_log` 的 `structured_hits` / `semantic_hits` 两列为既有必需字段 |
| — | 外键：连接建立后**必须** `PRAGMA foreign_keys = ON`（SQLite 默认关闭） |

> 唯一真源为 `ai-novel/backend/app/db/schema.sql`（文件头注明「相对原 `05` 的修正点清单」）。交接包 `05-数据库schema.sql` 已改为**由真源同步生成的派生副本**（勿手工编辑）；二者一致性用 `docs/tools/sync_handover_schema.py --check` 机械校验——见 `ADR-006`。

---

## 7 页面清单（锁定）

M1 共 **6 个页面**。**质检页不列入 M1**（R8/R10/R18 后置）。

| 页面 | 路由 | 核心组件 | 对应 API | 说明 |
|---|---|---|---|---|
| 书库（首页） | `/` | BookCard、NewBookForm、EmptyState | `GET|POST|DELETE /api/books` | 作品卡片列表；新建表单字段：书名（必填）/题材/目标字数/一句话卖点。**不做题材必选** |
| **写作台** ★核心 | `/book/:slug/desk` | ChapterTree、Editor、RecallPanel、WritebackDialog、TopBar、StatusBar | chapters 组 + memory 组 | 左章节树 220px ｜中编辑器自适应最小 480px｜右召回栏 340px。**占 80% 使用时间** |
| 设定库 | `/book/:slug/settings` | CharacterForm、WorldEntryTree、ForeshadowTable、Tabs | settings 组全部 | 三 Tab；人物卡四要素字段**必须带灰色说明文字** |
| 大纲 | `/book/:slug/outline` | OutlineTree、OutlineDetail、ChapterCardList | outlines 组 | 三级树，左树右详情；"AI 展开"只出候选，**填入编辑框等用户改完再存** |
| 统计 | `/book/:slug/stats` | StatCards、DailyChart | `GET /api/books/{book}/stats` | 总字数、章数、日更曲线（R17） |
| 设置 | `/book/:slug/config` | ProviderList、TaskRoleMapping、WritingModeSwitch、ExportPanel | providers 组 + `PATCH /api/books/{book}` | 模型配置 + 任务级分配 + 写作模式三档 + 导出 |

### 7.1 写作台三条硬性交互（红线落地，不可简化）

1. **进章立即渲染编辑器**（先用缓存内容）→ **并行**请求召回 → 右栏骨架屏。
   **召回请求绝不阻塞编辑**：用户点开就能写。
2. **召回分级展示**：`未回收伏笔` + `本章人物` **默认展开**；`相关历史片段` + `剧情线` **默认折叠**。
3. **回写弹窗默认全勾、每条可编辑、可删除、不做二次确认**；点「取消」= 什么都不做（章节仍为 `draft`）。

### 7.2 降级（红线 3 的界面体现）

未配模型时，召回面板显示提示条「未配置 AI 模型 / 人物状态与伏笔仍可正常显示（结构化召回不依赖模型）/ [去配置]」。
**绝不出现整个召回面板空白**——结构化召回只查本地库，必须出结果。

---

## 8 设计 Token（锁定）

**唯一真相源**：`frontend/src/styles/design-tokens.css`（CSS 变量）+ `docs/design-tokens.json`（同源 JSON）。
规模：**CSS 315 个唯一命名 / JSON 316 个叶子 token**，四层架构 `primitive → semantic → component`。

| 项 | 锁定值 |
|---|---|
| 主色 | `#1565C0`（深蓝） |
| 强调色 | `#00897B`（绿） |
| 警示色 | `#C62828`（红）；橙色用于「埋了很久的伏笔」 |
| 文字 | 正文 `#212121` / 次要 `#616161` |
| UI 字体 | 无衬线（Noto Sans SC + Inter），**自托管于 `frontend/public/fonts/`，不依赖 CDN** |
| 编辑器字体 | 衬线 `Noto Serif SC`（`--font-editor`），长时阅读省力、给写作画布稿纸感 |
| 编辑器正文 | `17px` / 行高 `1.9` |
| UI 字号 | `13–14px` |
| 圆角 | 卡片 `8px` / 按钮 `6px` |
| 布局 | 左栏 220 ｜右栏 340 ｜顶栏 52 ｜状态栏 28 ｜正文最大宽 720 ｜最小可用宽度 900 |
| **图标库** | **`lucide-react` 1.47.0**，strokeWidth **1.75**，尺寸 16（行内）/ 20（按钮内）/ 24（独立）。**必须经 `Icon` 单一入口渲染，业务代码禁止直接 import** |
| 主题 | 浅色（深色模式 M1 不做，但颜色全部走 CSS 变量，便于后续加） |
| 对标基调 | Notion / Linear / Obsidian 的克制克制工具感 |

### 8.1 硬性禁止（P0，违反即退回重做）

- ⛔ **禁止 emoji 作为功能图标**——统一用 `lucide-react` 描边图标
- ⛔ 禁止紫色→粉色渐变主视觉
- ⛔ 禁止硬编码颜色（唯一例外 `#fff` / `#000`）——全部走 Token
- ⛔ 禁止弹跳/弹性缓动 `cubic-bezier(0.68, -0.55, 0.265, 1.55)`
- ⛔ 禁止空洞占位文案（"Welcome to" / "Lorem ipsum" / "Sign up today"）
- ⛔ 禁止"千篇一律 Hero 页"——展示真实产品内容

---

## 9 验收标准（锁定）

**完整依据**：`07-验收用例.md` 的 **36 条 TC**（Given-When-Then，含**前置/步骤/预期**三要素）。
判定规则：**★ 用例必须全部通过，且无「高」级缺陷遗留**，方可判定 M1 通过、进入 M2。

### 9.1 六条 ★ 红线用例（EARS 表述，不通过即交付失败）

| 编号 | EARS 格式验收标准 | 优先级 |
|---|---|---|
| TC-10 | **When** 用户修改一个已被既有章节引用过的人物卡，**系统必须**在保存前列出受影响的章节清单并允许查看详情 | ★ 高 |
| TC-18 | **While** 系统未配置任何 AI 模型，**系统必须**支持新建作品、录入设定、写章节、存版本、回滚、导出、字数统计与设定检索的全部操作，**不得**出现功能阻断或报错弹窗 | ★ 高 |
| TC-19 | **While** 系统未配置任何 AI 模型且已存在人物与未回收伏笔，**当**用户进入章节，**系统必须**在召回面板展示「未回收伏笔」与「本章人物」两区内容；**不得**出现整个召回面板空白 | ★ 高 |
| TC-24 | **When** 用户点「完成本章」后点「取消」，**系统必须**不向 `character_state` 写入任何记录，且 `chapter.status` 保持 `draft`；**If** 用户取消勾选部分条目后确认，**系统必须**只写入被勾选的条目 | ★ 高 |
| TC-28 | **When** 用户点击章节树中的任一章节，**系统必须**在无任何额外点击的情况下自动填充召回面板，**且**编辑器立即可用、不被召回请求阻塞 | ★ 高 |
| TC-26 | **When** 用户确认回写，**系统必须**在同一事务内完成 8 步写入（章节状态、角色状态、剧情线、伏笔、全书摘要、分块与向量、日更记录），**全部成功或全部回滚**，不允许部分成功 | ★ 高 |

### 9.2 其余用例分布（30 条，明细见 `07-验收用例.md`）

| 分组 | 用例 | 覆盖 |
|---|---|---|
| 启动与安装 | TC-01～03 | 一键启动、重复启动不冲突、无模型时的首页 |
| 书库 | TC-04～06 | 新建/切换/删除作品（删除入回收目录，非物理删除） |
| 设定库 | TC-07～09 | 人物卡四要素、世界词条层级、伏笔台账 |
| 编辑器与版本 | TC-11～14 | 自动保存、中断不丢字、列表性能（<500ms 且不含正文）、版本回滚 |
| 导出 | TC-15～17 | txt、docx、范围导出 |
| 模型配置 | TC-20～23 | 添加并检测、**密钥三处不落盘**、错误密钥可读提示、任务级模型分配 |
| 回写 | TC-25、27 | 回写内容可编辑、JSON 解析失败不写库不崩溃 |
| 召回 | TC-29～33 | 分级展示、伏笔排序与时龄、**增量状态取即时值**、召回可追溯、片段可跳转 |
| 性能 | TC-34 | 百万字压力测试（列表<1s／单章<300ms／召回<2s／检索<1s／内存<1GB） |
| 数据完整性 | TC-35～36 | 外键级联、备份与恢复（整目录复制） |

> **CRUD 完整性原则**：凡实体具有管理界面，必须实现与其字段对应的**完整 CRUD**，不允许留下"有新增无删除"或"有编辑无删除"的半成品。

---

## 10 边界与约束

| 类别 | 约束 |
|---|---|
| 浏览器 | Chrome/Edge 110+、Firefox 110+、Safari 16+（依赖 `structuredClone`、可选链、`Intl.Segmenter`）。**不支持 IE** |
| 响应式 | 最小可用宽度 **900px**；<1200px 右栏折叠为图标条；<900px 左栏折叠。**本产品不做手机端** |
| 操作系统 | 优先保证 Windows 可用（目标用户主要在 Windows）；macOS / Ubuntu 兼容 |
| 环境隔离 | **禁止污染系统 Python**——后端依赖必须装在 `.venv`；启动脚本自动检测虚拟环境，不存在则提示先初始化 |
| 性能目标 | 见 TC-34（百万字量级） |
| 错误处理 | 类型化错误码 + 全局异常处理器统一转 `{error:{code,message,detail}}`；**绝不把堆栈或原始 HTTP 错误返回前端** |
| 错误文案 | 后端 `error.code` 必须映射为可读中文（如 `LLM_NOT_CONFIGURED` → "还没有配置 AI 模型，去设置里添加一个吧"） |
| 日志 | 结构化 JSON 行 + `request_id`；**禁止记录** API Key、正文全文、隐私数据 |
| 提交规范 | Conventional Commits；每步一个 tag `m1-stepNN-xxx` |
| 分支 | 单人极简：`main` + `feat/<step-name>`；不强制 PR，但合并到 main 的代码必须能跑通 |
| 许可证 | **MIT**（已拍板） |
| 交付物 | 源码 + `README.md` + `LICENSE` + 启动脚本 + 验收报告（填 `07` §13 模板）+ 提示词实测报告（见 `08` §7.6） |

---

## 11 内嵌已知坑（M1 硬约束，共 20 条）

> 写法为「现象 → 规避」，目的在事前避开，而非事后返工。完整版见 `spec-分片归档.md` 第 11 章。

### A. 数据引擎（最高风险）

1. **sqlite-vec 在 Windows 加载失败**：`load_extension` 报 "The specified module could not be found"。根因是 `vec0.dll` 由 MinGW 编译、依赖 `libgcc_s_seh-1.dll`——**装 VC++ Redistributable 解决不了**。规避：用官方 `win_amd64` wheel（已确认存在）+ 启动执行 `SELECT vec_version()` 自检 + **失败立即降级纯结构化召回**，不抛错、不阻断启动（红线 3）。
2. **Python 未启用可加载扩展**：自编译 / conda / Microsoft Store / WSL 的 Python 可能 `AttributeError: enable_load_extension`。规避：启动 `hasattr(conn, "enable_load_extension")` 自检，失败即降级。
3. **FTS5 可能未编入**：标准发行版默认含 `ENABLE_FTS5`，但自编译 / WSL / 旧 Ubuntu 可能缺失。规避：启动执行 `PRAGMA compile_options;` 自检；缺失则跳过 FTS 建表、把"全文检索"标为不可用，不得阻断。
4. **sqlite-vec 是 pre-v1**：API 与行为会破坏性变更 → **等号锁死 `==0.1.9`**，禁 `>=`/`^`。
5. **`chunk_meta` 的 UNIQUE 对 NULL 不生效**：SQLite 视 NULL 互不相等，`chapter_seq IS NULL` 的 setting 类分块会重复入库。规避：应用层去重（先查后写 / `INSERT OR REPLACE`）。

### B. 召回与回写（红线相关）

6. **confirm 事务中"写 vec_chunk"会因扩展不可用而失败**，破坏 8 步原子性（TC-26）。规避：该步**条件化**——扩展可用才写 `vec_chunk`，否则只写 `chunk_meta`（向量字节落到 `chunk_meta.embedding`），其余步骤照常。
7. **`GET /api/chapters/{id}/recall` 有写副作用**（写 `recall_log`）：前端**禁缓存**、禁并发重复触发（否则 `recall_log` 灌水、毁掉调优依据）。规避：`staleTime: 0` + `enabled` 由当前章号驱动，一次进章仅触发一次。
8. **未配模型时语义召回必须整体跳过**（查询生成与 embedding 都需模型），但**结构化召回必须照常返回**，面板绝不整体空白（TC-19）。规避：先跑结构化，再按 provider 可用性决定是否跑语义，语义失败静默降级为"相关片段为空"。
9. **提示词 JSON 解析失败**：做**一次重试**（附上解析错误信息）；仍失败则返回可读错误 + 原始输出，**不写库、不崩溃**，章节仍可存为 draft（TC-27）。
10. **注入预算硬上限 4000 字**：按重要性截断（高重要度伏笔全量、中低只注标题）；合并去重后按"结构化在前、语义在后"排序再截断。

### C. 章节与版本（性能相关）

11. **章节列表禁返回正文**：只回 `ChapterBrief`（无 `content`），保证 200 章列表 < 500ms（TC-13）。
12. **自动保存节流 2s，只 UPDATE 不快照**：快照仅发生在「完成本章 / 手动存版本 / 回滚前」三时机，否则库体积失控。
13. **删除章节需同时清理 FTS 与向量**：删 `chapter` 后要删对应 `chapter_fts` 行与 `chunk_meta`/`vec_chunk`（`chapter_version`/`character_state` 由 `ON DELETE CASCADE` 处理）。

### D. 存储与安全

14. **WAL 产生三个文件**（`.db` + `.db-wal` + `.db-shm`）：备份/迁移/恢复必须**整目录复制**，只拷 `.db` 会丢最近事务（TC-36）。
15. **外键需每连接开启**：连接建立后立即 `PRAGMA foreign_keys = ON`，否则级联删除不生效（TC-35）。
16. **密钥永不落盘/落日志/回显**：DB 只存 `key_ref`；密钥读取后仅用于当次请求、用后即弃（TC-21）。
17. **换 embedding 模型需整库重建向量**：`vec_chunk` 维度建库时固定为 `FLOAT[1024]`，换模型（尤其换维度）必须重建；`chunk_meta.embedding_model` 留痕所用模型。

### E. 工程一致性

18. **`09` 的依赖范围已过时**：`lxml>=5.2,<6` 挡住 6.1.3、`pytest>=8.2,<9` 挡住 9.1.1、`pytest-asyncio>=0.24,<1` 挡住 1.4.0；`sqlite-vec` 改等号 `==0.1.9`；`@tiptap/*` 提到 `2.27.3`。
19. **中文字数统计**：前端用 `Intl.Segmenter`，后端保存时**重算**并落 `chapter.word_count`，允许 ±2 字误差（TC-11）。
20. **一书一库的连接管理**：切换作品 = 切换 `novel.db` 路径；连接需 `row_factory = sqlite3.Row` 且**各书独立**，避免 WAL 句柄与路径串书。

---

## 12 端到端验证步骤（Spec 锁定的最后一项）

> 一条可执行的端到端步骤，覆盖**核心成功流 + 关键错误流 + 两条红线**。

### 12.1 环境准备

```bash
cd ai-novel

# 后端虚拟环境（禁止污染系统 Python）
python -m venv .venv
.venv/Scripts/activate          # Windows
# source .venv/bin/activate      # macOS / Linux
pip install -r backend/requirements.txt

# 前端
cd frontend && npm install && npm run build && cd ..
```

### 12.2 启动自检（**三项能力必须先验，这是最高风险点**）

```bash
# ① sqlite-vec 扩展可加载？→ 期望打印 vec_version
python -c "import sqlite3,sqlite_vec; c=sqlite3.connect(':memory:'); c.enable_load_extension(True); sqlite_vec.load(c); print('vec_version:', c.execute('select vec_version()').fetchone()[0])"

# ② Python 是否支持加载扩展？→ 期望打印 True
python -c "import sqlite3; print(hasattr(sqlite3.connect(':memory:'), 'enable_load_extension'))"

# ③ FTS5 是否编入？→ 期望输出含 ENABLE_FTS5 的行
python -c "import sqlite3; print([r[0] for r in sqlite3.connect(':memory:').execute('pragma compile_options') if 'FTS5' in r[0]])"
```

**任一项失败不是阻塞**：按第 11 章坑 1/2/3 降级（跳过向量或 FTS，结构化召回照常），但**必须在启动日志里明确记录降级原因**。

### 12.3 一键启动

```bash
./start.bat      # Windows（双击或此处执行）
# ./start.sh     # macOS / Linux
```
**断言**：终端打印端口号；浏览器**自动打开**；页面无白屏、无控制台报错；全程无需输入命令。

### 12.4 核心成功流（未配模型，验证红线 3）

```bash
BASE=http://127.0.0.1:<port>

# 建书 → 断言 201，且 books/<slug>/novel.db 与 meta.json 生成
curl -s -X POST $BASE/api/books -H "Content-Type: application/json" \
  -d '{"title":"测试书","genre":"玄幻","target_words":100000}'

# 录入人物卡（四要素）→ 断言 201
curl -s -X POST $BASE/api/books/测试书/characters -H "Content-Type: application/json" \
  -d '{"name":"张三","role":"protagonist","surface_identity":"旧货摊主","secret_desire":"查明师父死因","fatal_weakness":"不信任任何人","contradiction":"嘴上说不管，每次都出手"}'

# 新建伏笔 → 断言 201
curl -s -X POST $BASE/api/books/测试书/foreshadows -H "Content-Type: application/json" \
  -d '{"title":"神秘玉佩的来历","planted_chapter_seq":1,"importance":"high"}'

# 写章节 → 断言 200，word_count 被后端重算
curl -s -X PATCH $BASE/api/chapters/1 -H "Content-Type: application/json" \
  -d '{"content":"张三握紧剑柄，指节的伤口又裂开了。"}'

# 导出 → 断言 200，Content-Type 为 text/plain 或 docx，中文无乱码
curl -s -o out.txt "$BASE/api/books/测试书/export?format=txt&range=1-10"

# 统计 → 断言 200，总字数 > 0
curl -s "$BASE/api/books/测试书/stats"
```

**关键断言**：以上全部成功，**且从未配置任何模型**——这是红线 3（降级可用）。

### 12.5 红线 1：写前召回自动触发

```bash
# 断言：characters 与 open_foreshadows 均非空（结构化召回不依赖模型）
curl -s "$BASE/api/chapters/1/recall"
```
**界面断言**：点击章节树进入该章 → 右栏**无需任何点击**自动填充 → 编辑器立即可输入（不被召回请求阻塞）→ `recall_log` 表新增一条记录。

### 12.6 红线 2：回写必须经人工确认

```bash
# ① 生成建议（断言：返回体含 character_updates，且此时数据库无新增）
curl -s -X POST $BASE/api/chapters/1/finalize

# ② 取消 → 断言 character_state 无新增、chapter.status 仍为 draft
#    （界面上点「取消」后立即执行下面这条 SQL 验证）
sqlite3 books/测试书/novel.db "select count(*) from character_state;"

# ③ 确认（只勾选部分条目）→ 断言只有被勾选的条目入库
curl -s -X POST $BASE/api/chapters/1/finalize/confirm -H "Content-Type: application/json" \
  -d '{"chapter_summary":"...","character_updates":[{"name":"张三","state":"左臂伤口裂开","accepted":true}]}'
sqlite3 books/测试书/novel.db "select count(*) from character_state;"
```

### 12.7 关键错误流

```bash
# 错误密钥 → 断言：可读中文提示，且不含原始 HTTP 状态码或堆栈
curl -s -X POST $BASE/api/providers/1/test

# 不存在的章节 → 断言：{"error":{"code":"CHAPTER_NOT_FOUND",...}}
curl -s $BASE/api/chapters/99999
```

### 12.8 密钥不落盘（安全红线）

```bash
grep -r "<你的Key明文片段>" books/ logs/ frontend/dist/ 2>/dev/null   # 断言：无输出
sqlite3 data/app.db "select key_ref from llm_provider;"   # 断言：只有引用名（模型配置已全局化，存全局库）
```

### 12.9 百万字压测（TC-34）

用脚本生成约 1000 章 / 每章 1000 字的模拟数据（含人物状态、伏笔、向量分块），测量：章节列表 <1s ｜单章 <300ms ｜完整召回 <2s ｜全文检索 <1s ｜内存 <1GB。
**不达标时**：记录实测值与瓶颈点，作为 M2 优化输入（不作为 M1 阻塞项）。

---

## 13 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-09-20 | Spec v1.0 生成 | 基于已评审的 `01/03/04/05/06/07` 材料，合并团队三份校验产出 | 全项目 |
| 2026-09-20 | M1 范围上提：+R7 大纲页、+R17 字数统计 | 老大拍板（写作台顶栏需显示字数；章节卡是真实写作刚需） | 第 2、3、7 章 |
| 2026-09-20 | 审校页（R8/R10/R18）移出 M1 | 老大拍板后置到 M2/M3 | 第 2、3、7 章 |
| 2026-09-20 | `06-openapi.yaml` 补 2 个缺失端点（D-05/D-06） | 契约核对接出 `outlines/expand` 与 `providers/usage` 遗漏，不补则 R7/R5 无契约可依 | 第 5 章 |
| 2026-09-20 | `chunk_meta` 增 `embedding BLOB` 列（D-18） | 换取扩展不可用时向量可重建 | 第 6 章、第 11 章坑 6 |
| 2026-09-20 | 依赖版本全面上调并逐个验证存在性 | `09` 的范围上限已挡住当前稳定版（lxml/pytest/pytest-asyncio），sqlite-vec 需等号锁死 | 第 4 章 |
| 2026-09-20 | 图标库锁定 `lucide-react` 1.47.0（P0） | 禁止 emoji 作功能图标，须全项目统一一套描边 SVG 图标库 | 第 8 章 |
| 2026-09-20 | embedding 锁定 `bge-m3` / 1024 维（经 Ollama） | 原 1024 维为占位；与 schema 完全一致、无需改表 | 第 4、6 章 |
| 2026-09-20 | 许可证定 MIT | 老大拍板（自用 + 分享定位下最省事、最利于传播） | 第 10 章 |
| 2026-09-20 | 新增 `GET /api/system/capabilities`（35→36 端点） | 前端 StatusBar 需在向量 / FTS 降级时显示常驻提示，且不阻断写作 | 第 5 章 |
| 2026-09-20 | FTS 同步定为**应用层写入，不上 TRIGGER** | 触发器隐式副作用难追踪，与「手写 SQL、便于审计」冲突 | 第 6 章 |
| 2026-09-20 | 明确 P0-1 emoji 门禁**扫描范围** | ★ 等 Markdown 排版符号不承载图标语义；原始材料 `07-验收用例.md` 本身即用 ★ 标红线用例 | 第 0 章 |
| 2026-09-20 | `capabilities` **撤销运行时重算**（此前一版的 `?refresh` 设计作废） | `vec_chunk` / FTS 表在**建库时点**决定，运行期重算会返回**假阳性**（库中无表却报可用）。`llm_configured` 例外 —— 模型配置即时生效 | 第 5 章 |
| 2026-09-20 | 开发工具版本（ruff / eslint 等）**M1 冻结不升** | 不随包发布、不影响交付物与用户体验；避免 lint 规则变化分散功能开发注意力。M3 开源前再评估 | 第 4 章 |

---

*Spec 结束。本文件为 M1 团队唯一开发依据。*
