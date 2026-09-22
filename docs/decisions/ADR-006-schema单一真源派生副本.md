# ADR-006: schema 单一真源（真源留在后端，交接包 05 为同步派生副本）

## Status: Accepted (2026-09-21)

## Background

M1 收尾阶段发现项目里存在**两份 `schema.sql`**，构成「双真源」缺陷（P0 级交付物缺陷）：

| 文件 | 角色 |
|---|---|
| `小说/05-数据库schema.sql` | 交接包 ④ 号材料；`00-交接说明.md` 第 4 节指引新开发者「写第 1 步时用」 |
| `ai-novel/backend/app/db/schema.sql` | **运行期真源**；`app/db/schema_loader.py:14` 的 `SCHEMA_PATH` 指向它，`apply_schema()` 读的就是它 |

二者可执行 DDL 不一致，且**照 05 建库会出错**：

1. **05 的 `chunk_meta` 缺两列** `embedding BLOB` / `embedding_dim INTEGER NOT NULL DEFAULT 1024`（真源有，落实 D-18「向量可重建源」）。而 `app/repositories/chunk_repo.py:41/50/57` 的 INSERT 明确写入这两列 → 按 05 建库后，向量**一写即 `no such column: embedding`**。
2. **05 把 `vec_chunk` 放在主段无条件创建，且全文无任何 `@@OPTIONAL` 条件块标记**（真源把它挪进 `-- @@OPTIONAL vec` 块，`schema_loader.py:44-52` 据此按能力择取）。真源注释（红线 3）已点名：三张虚拟表若不标记、随主段一起执行，**缺扩展 / 缺 FTS5 的环境会整体建库失败**，在「建书库」第一步就崩。已实测复现：无标记形态在缺 sqlite-vec 的机器上执行到 `CREATE VIRTUAL TABLE vec_chunk USING vec0(...)` 即报 `no such module: vec0`。

根因是 M0 的既定做法——「原 `05` 不改，修正版落地到 `backend/app/db/schema.sql`」（见 `契约差异清单.md` §四「下一步」、`spec-M1规格契约.md:320`）。该做法把 05 冻结成**陈旧且危险**的发布物，却仍被交接文档当作建库依据，随交接包扩散。

## Decision

采纳**方案（甲）：单一真源 + 派生**。

- **唯一真源**：`ai-novel/backend/app/db/schema.sql`。任何人只改这一份。
- **派生副本**：`小说/05-数据库schema.sql` 改为**由真源同步生成的副本**，文件头注明「本文件为派生副本，勿手工编辑；运行期真源是后者」并写清同步/建库方式。
- **同步与校验工具**：`ai-novel/docs/tools/sync_handover_schema.py`
  - `--write`：用真源重新生成 05 派生副本（同步方式）。
  - `--check`：机械校验二者一致，退出码 0/1，可直接作提交前门禁。

**两维校验**（缺一不可，因为它们抓的是两类不同缺陷）：
1. **可执行 DDL 骨架一致**——按 loader 口径（解析 `@@OPTIONAL` 块、去行注释、按 `;` 切分、折叠空白）比对语句，仅允许注释差异。抓「缺列」类漂移。
2. **条件块标记一致**——比对 `-- @@OPTIONAL <cap>` 标记序列。抓「虚拟表被无条件执行 → 建库崩」类隐患（DDL 骨架 diff 抓不到它，因为骨架保留段内语句）。

## 否决的方案

- **方案（乙）单一真源 + 指针**（05 不再含 DDL，改成一份说明页）：否决。交接包的价值在**自包含**——`00-交接说明.md` 的明示目标是「让完全没有上下文的新对话/新开发者，仅凭本包材料就能独立完成 M1」。把 05 变成纯指针，会让「走到 schema 这一步」的人拿不到任何 DDL，必须进仓库翻文件，削弱交接包的自包含性。派生副本（甲）在保留自包含性的同时，用「文件头声明 + 机械校验」压住漂移风险。
- **保持现状 + 仅在文档里口头提醒**：否决。这是把「事后踩坑」留给下一个人；缺列问题直到运行时写向量才暴露，属最贵的「沉默逻辑错误」。必须机械可验证。

## Consequences

**正面**
- 按交接包走到 schema 一步，拿到的脚本与运行期真源**逐条一致**（缺列、误执行两个隐患同时消除）。
- 「是否漂移」由一条命令判定，不再依赖人工比对。
- 05 仍是可直接阅读的完整 DDL，交接包保持自包含。

**负面 / 代价**
- 交接包与仓库之间多了一份需**定期同步**的产物；靠 `--check` 门禁约束（建议纳入提交前检查）。
- 05 不再可用 sqlite3 / DB 工具直接执行（因其含 `@@OPTIONAL` 条件块标记，须经 `schema_loader.apply_schema()` 解析）。文件头已明写此点。

## Related ADRs

- ADR-001（一书一 SQLite 库）：建库动作由「执行 05」更正为「经 loader 执行真源 schema」；ADR-001 为历史决策，不追改，以本 ADR 为准。
- ADR-003（手写 SQL 不上 ORM）：`schema.sql` 作为每库唯一真相源——本 ADR 把「唯一真源」收敛到后端那一份。
- ADR-005（bge-m3 / 1024 维）：`vec_chunk.embedding FLOAT[1024]` 与 `chunk_meta.embedding_dim DEFAULT 1024` 的维度一致性由真源保证。
