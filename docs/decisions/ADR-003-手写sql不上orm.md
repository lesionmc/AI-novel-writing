# ADR-003: 手写 SQL，不引入 ORM

## Status: Accepted (2026-09-20)

## Background

后端为 Python + FastAPI，数据访问层需访问 SQLite（含 FTS5 虚拟表 `chapter_fts` / `setting_fts`，以及 sqlite-vec 的 `vec0` 虚拟表 `vec_chunk`）。表结构已冻结在 `schema.sql`，是唯一真相源；查询以主键/外键/分页为主，**不含复杂动态查询**。团队规模小、要求后续接手者能直接读懂数据流。

《09-开发规范与依赖版本》已倾向手写 SQL（“表结构已冻结、查询不复杂、减少抽象层”），但未固化为决策。

## Decision

**使用 Python 标准库 `sqlite3` + 参数化 SQL，不引入 SQLAlchemy 等 ORM。**

- 所有 SQL 收敛在 `repositories/` 下，一律参数化（`?` 占位），**禁止字符串拼接 SQL**。
- 连接建立后立即 `PRAGMA foreign_keys = ON`，设 `row_factory = sqlite3.Row`。
- 多步写入包在单事务内（如 `confirmChapterWriteback` 的 8 步必须原子）。
- row → Pydantic 模型的手工映射写在仓储/服务边界。

## Consequences

**正面**
- **零额外依赖**，与“本地轻量、可读”的项目气质一致。
- 对**虚拟表天然友好**：FTS5 的 `MATCH`、sqlite-vec 的 KNN `ORDER BY distance` 与 `vec_version()` 等，无需 ORM 厂商支持即可直接用。
- 性能与执行计划完全可控，SQL 即文档；异常/降级分支（扩展不可用、FTS5 缺失）易于就地处理。
- 少一层抽象，便于接手者理解完整数据流。

**负面 / 代价**
- 需手写迁移脚本（版本化 + 回滚说明）与结果映射，样板代码略多。
- 无 ORM 的类型/关系自动校验，schema 与代码的一致性靠**测试**保证（需补仓储层单测）。
- 表结构若频繁变动，维护成本高于 ORM（本项目表结构在 M0 已冻结，影响可控）。

## Related ADRs

- ADR-001（一书一 SQLite 库）：`schema.sql` 作为每库唯一真相源。
- ADR-002（双路召回架构）：手写 SQL 使虚拟表查询与降级路径直接可控。
