# ADR-005: embedding 模型选型（BAAI/bge-m3，1024 维）

## Status: Accepted (2026-09-20)

## Background

语义召回（ADR-002 的软路径）与 `vec_chunk` 的向量维度需要一个确定的 embedding 模型。《03-技术方案》§6.3 将“向量维度 1024”记为**占位值**，并注明“随 embedding 模型确定后调整”。

选型硬约束：
1. **中文效果**要好（产品是中文长篇小说）；
2. **本地可运行**（本地优先、数据不出本机）；
3. 与 **sqlite-vec** 配合良好；
4. **换模型需重建全部向量**，代价高 —— 维度与模型必须尽早锁死；
5. 成本为零或极低（开源免费定位，不承担模型成本）。

当前 `05-schema.sql` 已把 `vec_chunk.embedding` 定为 `FLOAT[1024]`，且栈内已有 **Ollama** 作为 provider。

## Decision

锁定 **BAAI/bge-m3** 为默认 embedding 模型，**稠密维度 1024**（与 schema 完全一致，无需改表）。

- **运行方式：经 Ollama 提供**（`ollama pull bge-m3`），复用栈内既有 Ollama provider，**不在 Python 端引入 `sentence-transformers`/torch**（避免 requirements 体积暴涨）。
- 备选（轻量）：**qwen3-embedding:0.6b**（原生 1024 维、约 639MB、32K 上下文，走 Ollama），适合低算力机器。
- 云端回退（可选）：**通义 text-embedding-v3**（支持 1024 维输出），适合无本地算力的用户。
- 维度**固定 1024**：`chunk_meta.embedding_model` 记录所用模型名；换模型（或换维度）必须**整库重建向量**。

**候选对比**（2026-09-20 资料）：

| 模型 | 维度 | 上下文 | 中文 | 部署 | 结论 |
|---|---|---|---|---|---|
| **BAAI/bge-m3** | **1024** | 8192 | 极佳 | Ollama / HF，569M（约 2.27GB） | **选中**：维度匹配、中文最强、长上下文 |
| qwen3-embedding:0.6b | 1024(MRL) | 32K | 优 | Ollama，约 639MB | 备选：更省资源 |
| mxbai-embed-large | 1024 | 512 | 一般（英文向） | Ollama | 否决：中文与长文本弱 |
| nomic-embed-text | 768 | 8192 | 一般（英文向） | Ollama | 否决：需改维度且中文弱 |
| OpenAI text-embedding-3-small | 1536 | 8191 | 良好 | API（收费） | 否决为首选：需改维度、收费、数据出本地 |

**关键理由**：bge-m3 的 1024 维**恰好与已冻结的 schema 一致**，锁定它可**零改表**；且其 8192 token 上下文适合长章节分块；本地免费、数据不出机器，契合产品定位。

## Consequences

**正面**
- 维度 1024 与 `vec_chunk FLOAT[1024]` 一致，`05-schema.sql` **无需改动**。
- 中文检索质量最优，长文本（>512 字）不受上下文截断。
- 免费、本地、隐私；不向 Python 依赖树引入 torch（走 Ollama）。
- 语义路仍只是“软”补充（ADR-002），未装 Ollama 也不破红线（结构化召回照常）。

**负面 / 代价**
- 语文化召回的“完整形态”依赖用户安装 Ollama（M1 视为可选增强，前端需提示“未启用语义召回”而非报错）。
- bge-m3 首次拉取约 2.27GB，需在文档中明示磁盘/时间成本。
- 换模型/换维度必须整库重建向量（`chunk_meta.embedding_model` 用于识别是否需重建）。

## Related ADRs

- ADR-002（双路召回架构）：本模型服务于其中的软路径。
- ADR-001（一书一 SQLite 库）：向量随书库存储与迁移。
