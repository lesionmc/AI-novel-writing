# OPEN-DECISIONS · 悬而未决登记册

> **规则**：出现「定不下来 / 先放一放 / 等外部条件」的事，**立即**在这里落条；
> 只追加 + 就地关闭（OPEN → RESOLVED，补 Resolution 字段），**不删除、不覆盖**。
> 每次开工前先扫一遍本表，逐条判断能否关闭。
> 关闭的条目可升格为 ADR（见同目录 `ADR-00X-*.md`）。

**三类固定 slug**
- `waiting-on-external-condition` —— 等外部条件（老大拍板 / 第三方能力）
- `design-decision-to-evaluate` —— 设计待评估（需对比或试点）
- `existing-design-boundary` —— 现有设计的边界约束（不是缺陷，是已知取舍）

**当前状态：12 条 → 11 条已关闭，1 条 OPEN。**
2026-09-22 第 4 次对话老大指令「全部做，全部修复，你拿主意，帮我完成，然后测试」，
授权逐条决策并执行。

| Date | Source | Open Item | Slug | Related Constraints | Current Leaning | Blocked By | Resolves When | Status |
|------|--------|-----------|------|---------------------|-----------------|------------|---------------|--------|
| 2026-09-22 | 复核 | **正文类 AI（续写/扩写/剧情走向/校对）做不做** | waiting-on-external-condition | 需求文档强制声明「不在写的环节代笔」 | 已按「全部做」执行，并**同步修订**该声明 | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **一个模型能否承担多个任务角色** | design-decision-to-evaluate | `task_role` 单值 + CHECK 不保证唯一 | 决定**不改表结构**，保持界面如实提示 | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **语义召回为空：embedding 模型从哪来** | waiting-on-external-condition | 现有平台只有聊天模型 | 决定**不下载本地模型**，改为把"为什么用不了"讲清楚 | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **一致性审校 R8 是否解冻** | existing-design-boundary | 契约唯一 deferred | 决定**解冻并实现**（SSE 两轮审校） | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **选题数据策略：写死 / 联网 / 混合 / 用户维护** | design-decision-to-evaluate | 「纯本地读文件、绝不联网」 | 决定**保持本地不联网**，改在提示词层禁编造 | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **开书是否改成「骨架优先」向导** | waiting-on-external-condition | 六阶段路线图 | 决定**只做轻量指路**，不做新状态机 | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **AI 对话是否升级为后端会话表** | design-decision-to-evaluate | 已做前端本地留存 | 决定**保持前端留存**；「记忆」由上下文注入解决 | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **书库遗留的旧 `llm_provider` 表要不要 DROP** | existing-design-boundary | 迁移源需保留 | 决定**保留**（已有回归测试锁死"无人读它"） | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **契约路径参数名与实现不一致** | existing-design-boundary | 16 条历史端点 | 决定**历史不动**，**新端点统一用 `{chapter_id}`** | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **FTS5 用 `unicode61`，中文子串 MATCH 恒为 0** | existing-design-boundary | 功能靠 LIKE 兜底仍正确 | 决定**改为 `trigram` + 存量迁移** | — | 已拍板 | **RESOLVED** |
| 2026-09-22 | 复核 | **`_清理_20260922`（65.7MB）与 `.venv.broken`（30.2MB）是否删除** | waiting-on-external-condition | C 盘紧张 | 已删 `.venv.broken` 与全部构建缓存；**归档目录保留** | — | 部分执行 | **RESOLVED** |
| 2026-09-22 | 复核 | **小说《重生之我在末世开超市》2 处遗留** | waiting-on-external-condition | ① ch5 倒计时日期矛盾；② ch4 双仓库未合并 | 待确认这本是否作交付成品 | 老大确认 | 老大拍板后 | **OPEN** |

---

## 已关闭（含 Resolution）

### OD-01 正文类 AI —— 已实现，且**同步修订了定位声明**

**决定**：四个能力**全部做**，但按「是否产出正文」分两类，不允许"偷偷代笔"。

| 能力 | 产出 | 处理 |
|---|---|---|
| 剧情走向 | 方向选项 | 与「不在写的环节代笔」完全一致 |
| 校对 | 问题清单 + 建议 | 一致（只挑错，不改字） |
| 续写 / 扩写 | **正文草稿** | 作者**显式开启**；**后端零落库**；草稿经作者删改后才成为正文 |

**Resolution**：
- 契约新增 4 条 path（`plot-directions` / `proofread` / `continue` / `expand`）；
- 实现见 `services/writing_ai_service.py` + `services/writing_context.py`
  + `prompts/{plot_directions,proofread,continue_writing,expand_writing}.md`；
- **定位声明已正式修订**（不是绕过）：`12-需求变更记录.md` §2.7 写明四条硬约束，
  并注明 `01/02-需求文档*.docx` 原句待同步。

### OD-02 一个模型多角色 —— 决定不改表结构

**Resolution**：改表要动 5 个消费点 + 迁移，而"多 agent"的真正形态是**按能力分工**
（写作 AI 走 `content`、审校走 `review`，本身已是分工）。
保持现状，并已在界面如实提示"多模型抢同一角色"与"角色未启用"。

### OD-03 embedding 模型 —— 决定不自带

**Resolution**：本机 C 盘紧张、本地向量模型要几百 MB 且首次需联网下载，收益不确定。
改为**把"为什么用不了"讲清楚**：`RecallPanel` 在「已配模型但没有嵌入角色」时
明确说明缺什么，而不是让用户看到恒为 0 的「历史片段」却以为功能坏了。

### OD-04 一致性审校 —— 已实现

**Resolution**：
- 后端 `services/consistency_service.py`：按《08-提示词规格》§3.2 做**分块 + 全局两轮**，
  SSE 推 `progress` / `conflict` / `done`；
- 路由 `POST /api/books/{book}/audit/consistency/stream`（未配模型时**在开流前**返回 JSON 错误，
  避免前端收到"莫名断掉"的流）；
- 前端 `components/audit/ConsistencySection.tsx` 边审边出、可中断；
- `task_role='review'` 从"没人用"变成**真实消费点**（未单独配 review 时回落默认模型）。

### OD-05 选题数据 —— 决定保持本地

**Resolution**：不引入联网（会破坏「数据不外流」卖点）。改在**提示词层**硬约束
禁止编造书名，字段语义收敛为「常见套路」，界面标签从「对标作品」改为
「同类常见套路」+ 明确标注 AI 生成。

### OD-06 开书向导 —— 决定不做完整向导

**Resolution**：已有页面齐全，缺的只是指路。空章节时给「先搭骨架」引导卡
指向设定库 / 大纲，**不新增路由与状态机**。

### OD-07 会话表 —— 决定保持前端留存

**Resolution**：`setupChatArchive.ts` 已解决"点错就丢"；而"AI 要有记忆"这个真诉求
由**上下文注入**解决 —— 新增的 `services/writing_context.py` 会把
设定库 + 人物现状 + 未回收伏笔 + 大纲 + 上一章摘要 + 最近正文组装成"记忆包"，
所有写作 AI 能力共用同一个包（只有一处拼装逻辑，可审计）。

### OD-08 书库旧表 —— 决定保留

**Resolution**：`provider_migration.py` 明确写了"旧库按设计保留、不删"（删了就丢掉老用户
升级时的迁移来源），且 `tests/test_global_providers.py` 已锁死"新书库不含该表"。

### OD-09 契约参数名 —— 历史不动，新端点统一

**Resolution**：新增的 4 条 path 一律写 `{chapter_id}`（与实现一致）；
历史 16 条保持 `{id}` 不动（动 16 个路由签名，零功能收益、高回归风险）。
新增 `docs/tools/check_contract_parity.py` 把"参数名差异"识别为**提醒而非失败**，
避免以后有人把它误判成缺陷。

### OD-10 FTS 分词 —— 已改 trigram + 存量迁移

**Resolution**：
- `schema.sql` 的 `chapter_fts` / `setting_fts` 改为 `tokenize='trigram'`；
- `services/fts_migration.py` 启动时幂等重建存量书库（判据 = 表定义里有没有 `trigram`，
  **不依赖额外标记**；DDL 从真源 schema 取，**不硬编码**）；
- **真实书库实测**：`断齿钥匙` 由 **0 条 → 15 条**，索引行数正确，二次运行 = 0（幂等）；
- **重要边界**：trigram 对**少于 3 个字符**的查询一律不命中（「陈默」这类两字词很常见），
  所以 `search_setting_repo` 里那条 **LIKE 兜底必须保留** —— 它不是老代码残留，是必要补充。

### OD-11 清理 —— 已删可再生部分，归档目录保留

**Resolution**：
- **已删**：`ai-novel/.venv.broken`（30.2 MB，bootstrap 改名保留的废弃虚拟环境）
  + 全部 `__pycache__` / `.ruff_cache` / `.pytest_cache`，合计释放约 **30.5 MB**；
- **保留** `_清理_20260922/`（220 项 / 65.7 MB）：内含 **M2 小说版本链 v2~v5**、
  33 张验收截图、QA 报告 —— 这些是"可逐版对照"的历史证据，删除不可逆。
  **若确认不需要，一条命令即可清掉：**
  ```powershell
  Remove-Item -LiteralPath 'C:\Users\lhx\Desktop\小说-AI创作工具\_清理_20260922' -Recurse -Force
  ```
