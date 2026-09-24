# AI 小说创作工具 · 后端（M1）

本地、开源、单用户单机的长篇中文小说写作助手后端。核心价值：**记忆外置**（设定库 + 写前召回 + 章节回写）解决长篇"吃书"。

## 技术栈（版本锁定，勿改）

Python 3.12 ｜ FastAPI 0.141.1 ｜ uvicorn[standard] 0.53.0 ｜ pydantic 2.13.5 ｜
pydantic-settings 2.15.0 ｜ keyring 25.7.0 ｜ httpx 0.28.1 ｜ python-docx 1.2.0 ｜
beautifulsoup4 4.15.0 ｜ lxml 6.1.3 ｜ **sqlite-vec 0.1.9** ｜ pytest 9.1.1 ｜ pytest-asyncio 1.4.0。

**无 ORM**：仅用标准库 `sqlite3` + 手写 SQL（ADR-003）。虚拟环境位于仓库根 `.venv`，
**严禁污染系统 Python**。

## 初始化（首次运行，仅一次）

需先创建虚拟环境，**必须使用 Python 3.12.x**（3.13+/free-threaded 与 sqlite-vec 组合未验证，M1 不支持）。

```bash
# Windows（在仓库根 ai-novel/ 执行）
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

# macOS / Linux（在仓库根 ai-novel/ 执行）
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
```

> 若 `py -3.12` / `python3.12` 不可用，请改用任意 3.12.x 解释器的**绝对路径**执行 `-m venv .venv`
> （例如 uv 托管的 `...\uv\python\cpython-3.12.13-...\python.exe`）。
> `requirements.txt` 含 `sqlite-vec==0.1.9`（等号锁死）；若默认镜像缺失，加
> `--index-url https://pypi.org/simple` 重试。

## 运行

```bash
# Windows（在仓库根 ai-novel/ 执行）
./start.bat
# macOS / Linux
./start.sh
```

启动脚本会**先校验虚拟环境存在**（不存在则报错退出并提示执行上一步初始化，**绝不静默回退到系统 Python**），
随后从 `backend/` 目录执行 `python -m app`：启动前**校验解释器为 3.12.x**（不符则报错退出并打印实际版本），
自动选可用端口（优先默认端口 **5210**，被占用才另挑空闲端口）、终端打印端口号、就绪后自动打开浏览器（Spec §12.3）。
可调环境变量：`AINOVEL_PORT`（指定端口；不指定时默认 5210）、`AINOVEL_NO_BROWSER=1`（不自动开浏览器）、`AINOVEL_LOG_LEVEL`。

直接开发调试：

```bash
cd backend
../.venv/Scripts/python.exe -m app           # Windows
../.venv/bin/python -m app                   # macOS / Linux
```

## 自检

```bash
cd backend
../.venv/Scripts/python.exe -m ruff check app tests     # 静态检查
../.venv/Scripts/python.exe -m pytest -q                # 单元 / 集成测试
```

单测覆盖红线与四类定向用例：角色状态 `chapter_seq <= N` 增量取值、两路召回合并去重、
回写事务回滚（all-or-nothing）、JSON 解析容错（围栏 / 重试一次 / 可读报错不落库）。

## 目录结构（分层，只能向下依赖）

```
app/
├── routers/        # 路由：仅参数校验 + 调 service + 组装响应（禁直连 DB）
├── services/       # 业务逻辑、事务编排（禁 import fastapi Request/Response）
│   └── llm/        # 模型调用（secrets / clients / registry / prompts）
├── repositories/   # 数据访问：只写 SQL
├── models/         # Pydantic 请求 / 响应模型
├── prompts/        # 提示词模板（.md）
├── db/             # 连接层 + 能力自检 + schema + 作品注册表
├── utils/          # 纯工具（无业务、无副作用）
├── config.py       # 配置（pydantic-settings）
├── errors.py       # 类型化错误（统一 {error:{code,message,detail}}）
├── main.py         # 入口：只装配
└── __main__.py     # 启动器：随机端口 + 开浏览器
```

**硬规则**：单文件 ≤ 300 行；一个资源 = controller + service + repository 三件套；入口零业务逻辑。

## 数据与存储

- **一本书一个 SQLite 库**：`books/<slug>/novel.db`（WAL 模式）。
- 库对象口径：15 张普通表 + 3 张虚拟表（`vec_chunk` / `chapter_fts` / `setting_fts`）。
- 删除作品移入 `.recycle/`；作品目录含 `meta.json`。

### 启动期数据库能力自检（红线 3）

连接层启动时执行三项自检：`hasattr(conn,"enable_load_extension")`、sqlite-vec `SELECT vec_version()`、
`PRAGMA compile_options` 含 `ENABLE_FTS5`。**任一失败降级而非报错**：跳过 `vec_chunk` 或两张 FTS 表，
把降级原因写入结构化日志，仍建出可用库。能力状态经 `GET /api/system/capabilities` 暴露，
无模型 / 无扩展时结构化召回与本地写作功能照常可用。

## 契约要点与实现约定

- **统一响应**：错误为 `{"error":{"code","message","detail"}}`，可读中文，绝不外泄堆栈 / 原始 HTTP 错误。
- **写前召回** `GET /api/chapters/{id}/recall`：结构化优先 + 语义补充，两路合并去重，预算硬截断 4000 字，
  写 `recall_log`（`structured_hits`/`semantic_hits`/`injected_chars`/`injected_tokens_est`）。**有副作用，前端禁缓存**。
- **章末回写** `POST /api/chapters/{id}/finalize/confirm`：单事务 8 步，全部成功或全部回滚；
  `vec_chunk` 写入**条件化**（扩展可用才写）。
- **角色状态增量**：取 `chapter_seq <= N` 的最后一条；状态未变化不写。
- **密钥安全**：`key_ref` → 系统密钥环；明文仅用于当次请求，随即丢弃；绝不明文落入 `.env`/DB/日志/响应。

### by-id 端点的作品归属解析（重要实现约定）

契约中 `GET /api/chapters/{id}`、`/api/characters/{id}` 等端点**不含作品 slug**，而 `id` 仅在同一作品库内唯一。
单用户单机场景采用「**当前作品指针**」解析（见 `app/services/workspace.py`）：

- 凡带 `{book}` 的端点会更新当前作品指针（持久化于 `data/active_book.json`）；
- by-id 端点**优先在当前作品中定位**，未命中则**回退全库扫描**（唯一命中才采纳；多库命中且无当前作品时返回冲突错误）。

**前提**：同一时刻用户只打开一部作品。M1 单窗口工作台满足此前提；多窗口并发打开不同作品时，
by-id 端点须先确保当前作品指向正确（前端进入作品时调用带 `{book}` 的端点即可）。
