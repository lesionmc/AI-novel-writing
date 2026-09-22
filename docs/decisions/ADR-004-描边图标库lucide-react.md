# ADR-004: 锁定 lucide-react 作为全项目描边 SVG 图标库

## Status: Accepted (2026-09-20)

## Background

项目级 P0 规则：**禁止 emoji 作为功能图标**；Spec 必须锁定**一套**描边（stroke）风格 SVG 图标库，全项目统一、不混用。设计契约《DESIGN.md》§4 与《spec-设计与页面章节》§8.3/§10 已把图标库列为**占位（`--icon.library = "PENDING"`）**，明确“待架构师锁定后替换”，并要求所有图标经 `Icon` 组件**单一入口**渲染，替换时只改一处。

《04-界面设计说明》线框图中出现的警示三角、人物、文档、图钉、对勾、折线、齿轮等符号仅为线框示意，**不得落地为 emoji**。

前端栈为 React 18 + Vite 5 + TypeScript，样式为原生 CSS 变量 + CSS Modules，不引入 UI 组件库。

## Decision

锁定 **lucide-react**，版本 **等号锁死 `lucide-react==1.47.0`**。

- 统一描边：全项目 strokeWidth 固定 **1.75**（覆盖 lucide 默认 2），对齐设计 token `--icon-stroke-width: 1.75`；颜色一律 `currentColor`。
- 尺寸走 token：`--icon-size-inline 16` / `--icon-size-button 20` / `--icon-size-standalone 24`。
- **单一入口**：所有图标经 `components/common/Icon` 渲染；业务代码**禁止**直接 `import` 图标库具体文件（也不得使用 `icons[...]` 全量对象，以免破坏 tree-shaking）。
- 需要 M1 语义图标（新建/删除/编辑/保存/完成/设置/折叠/搜索/筛选/警告/信息/人物/章节/伏笔/剧情线/回收/跳转/重试/查看/连通/导出/统计/大纲/世界词条/关闭）均在 lucide 主库覆盖；个别缺失者用 `@lucide/lab` 或项目自绘补充，仍走 `Icon` 入口。

**候选对比**（2026-09-20 实测版本）：

| 候选 | 版本 | 风格 | 优点 | 否决/保留理由 |
|---|---|---|---|---|
| **lucide-react** | 1.47.0 | 严格描边（24px 网格、2px 默认） | 1400+ 图标、ESM 逐图标可 tree-shake、TS 类型完整、MIT、社区最活跃、Feather 血统 | **选中** |
| @heroicons/react | 2.2.0 | 描边 + 实心双套 | 官方、简洁 | outline 尺寸集有限（24/20/16），覆盖面与生态活跃度不及 lucide |
| @tabler/icons-react | 3.47.0 | 描边 | 5000+ 图标、覆盖广 | 体量更大、风格细节与 24px/2px 一致性不及 lucide，非首选 |
| phosphor / 自绘 | — | — | 高度定制 | 需自建维护，M1 不划算 |

## Consequences

**正面**
- 满足 P0 规则：全项目**一套描边图标库、零 emoji**。
- tree-shaking 使打包只含实际使用的图标，契合“本地轻量”。
- 单一入口让后续更换图标库只需改 `Icon` 一处（设计契约已预留）。
- 与 React 18 / Vite 5 组合成熟，TS 类型完整。

**负面 / 代价**
- lucide 默认 strokeWidth=2，需在 `Icon` 统一改为 1.75（遗漏则与设计 token 不一致）。
- 极个别产品化语义（如“伏笔老化”“剧情线”）无直接对应图标，需语义近似或自绘。
- 锁死版本（等号），升级需回归图标视觉一致性。

## Related ADRs

- 与设计契约《DESIGN.md》§4、《spec-设计与页面章节》§8.3/§10 一一对应（替换 PENDING 占位）。
