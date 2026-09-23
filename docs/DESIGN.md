# AI 小说创作工具 DESIGN.md

> 生成日期：2026-09-20 ｜ 设计师：颜好看 ｜ 基于：《01-需求文档（专业版）》V1.0 + 《03-技术方案》V1.0 + 《04-界面设计说明》V1.0
> 三轴刻度：Variance=3 / Motion=3 / Density=4
> 定位：本文件是全项目**设计契约源文件**（9 节标准）。页面清单与组件清单见 `spec-分片归档.md`；Token 定义见 `design-tokens.css` / `design-tokens.json`。

---

## 1. Visual Theme & Atmosphere（视觉主题与氛围）

- **视觉主题关键词**：沉静 · 可靠 · 专注 · 克制 · 稿纸感
- **氛围描述**：像一盏台灯下的稿纸与钢笔——界面在写作者需要时安静在场，不需要时彻底退开。结构化信息（伏笔 / 人物状态）用清晰的清单呈现，不用数据看板式的炫目图表。深蓝是"结构"，青绿是"确认"，橙色只留给"埋了很久的伏笔"。
- **对标品牌**：Notion（密集信息的克制呈现）· Linear（严谨应用骨架与 150ms 功能性动效）· Obsidian（本地优先、双栏写作、画布去干扰）
- **自有识别点**：中文书稿衬线体编辑画布（"像稿纸"）+ 深蓝结构色 + 青绿确认色

## 2. Color Palette & Roles（色彩与角色）

- **A1-identity**：`--color-bg` #F5F6F8 · `--color-surface` #FFFFFF · `--color-text-primary` #212121 · `--color-text-secondary` #616161 · `--color-primary` #1565C0 · `--color-border` #E2E6EB
- **A2-semantic**：`--color-danger` #C62828 · `--color-warning` #B26A00 · `--color-success` #2E7D32 · `--color-info` = primary · `--color-foreshadow-aging` #E65100
- **B-slot 别名**：`--color-surface-sunken` · `--color-surface-hover` · `--color-text-tertiary` · `--color-text-disabled` · `--color-primary-soft` · `--color-accent-soft` · `--color-danger-soft`
- **C-extension**：`--color-foreshadow-aging*`（伏笔老化橙，产品专属语义）、`--color-editor-*`（编辑器画布）、`--color-importance-*` / `--color-status-*`（别名，不新增色相）
- **每屏强调色 ≤2 处**：`--color-accent`（青绿）仅用于确认类动作与"已连通/已保存"状态；结构高亮统一用 `--color-primary`（深蓝）。
- **配色来源**：`references/design-systems/color-palettes.md` 第 29 套「保险安全蓝绿」为结构原型（蓝主色 + 绿强调），实际色值由《04》§6.3 锁定并覆盖。
- **可访问性修正**：小字不得直用 `--color-accent`（白底 3.9:1），改用 `--color-accent-strong` #00695C；伏笔老化小字用 `--color-foreshadow-aging-strong` #A63C00。

## 3. Typography（排版）

- **字体栈**：UI = `--font-ui`（Inter + Noto Sans SC）；编辑器正文 = `--font-editor`（Noto Serif SC 等中文书稿衬线）；等宽 = `--font-mono`（JetBrains Mono）。`--font-display` / `--font-body` 均别名至 `--font-ui`。
- **配对来源**：`typography-pairings.md` 第 5 套 Minimal Swiss（Inter）+ 第 22 套 Chinese Simplified（Noto Sans SC）；编辑器衬线体为项目 C-extension。
- **字号阶梯**（px / rem）：`2xs` 11 / `xs` 12 / `sm` 13 / `base` 14 / `lg` 16 / `xl` 18 / `2xl` 20 / `3xl` 24 / `4xl` 30；**编辑器正文专用 `--text-editor-body` 17px**。
- **字重**：3 级 —— 400 正文 / 500 次标题·按钮·表头 / 600 主标题。
- **行高**：UI 正文 1.5；标题 1.25–1.4；**编辑器正文 1.9**（《04》锁定）。
- **字距**：标题 `-0.02em`；11–13px 辅助 `+0.012em`；ALL CAPS 拉丁标签 `+0.08em`；正文 `0`。
- **落地提示（本地运行）**：三款字体建议随构建自托管于 `frontend/public/fonts/`，不依赖 Google Fonts CDN；字体栈已内置系统回退。

## 4. Components（组件规范）

- **按钮**：变体 primary（深蓝）/ secondary（白底描边）/ ghost / accent（青绿，确认类）/ destructive（红）；尺寸 sm 28 / md 32 / lg 40；状态 default/hover/active/disabled/loading/focus-visible。
- **输入框**：default / focus（`--color-primary` 边框 + 焦点环）/ error（红边框 + 就近错误文字）/ disabled（凹陷底）。
- **卡片**：1px 边框 + 8px 圆角 + **默认无阴影**；hover 仅改变边框/底色，不浮起。
- **导航**：顶部横向一级导航（书库/写作台/设定库/大纲/统计/设置），当前项高亮；写作台内嵌左章节树 + 右召回面板。
- **模态框 / Toast / Badge / Avatar**：模态尺寸 640px（回写确认）/ 420px（通用确认）；Toast 3s 自动消失；Badge 对齐 status/importance 语义色。
- **图标**：`lucide-react==1.47.0`（严格描边 SVG，MIT，版本等号锁死）。尺寸 16/20/24px、描边 1.75（在 `Icon` 组件内覆盖 lucide 默认 2）、`currentColor` 取色，经 `components/common/Icon` 单一入口渲染；业务代码禁直接 import 图标库、禁用 `icons[...]` 全量对象（破坏 tree-shaking）。**禁止 emoji 作功能图标。**

## 5. Layout & Spacing（布局与间距）

- **间距基准**：4px 网格 —— 4/8/12/16/20/24/32/40/48/64（禁用 5/7/13/15/22/30）。
- **圆角阶梯**：xs 2 / sm 4 / button 6 / card 8 / lg 12 / xl 16 / pill 9999。
- **关键布局常量**：左栏 `--layout-sidebar-width` 220px · 右栏 `--layout-recall-panel-width` 340px · 顶栏 52px · 状态栏 28px · 编辑区正文最大宽 720px 居中 · 最小可用宽 900px（**不做手机端**）。
- **响应式降级**：<1200px 右栏折叠为图标条（40px）；<900px 左栏也折叠。
- **二级页内容最大宽**：`--layout-content-max` 1120px。

## 6. Depth & Elevation（深度与阴影）

- **阴影阶梯**：`--shadow-none` / `xs` / `sm` / `md` / `lg`；浅色主题**靠 1px 边框分层**，阴影只服务浮层（下拉 1000 / 遮罩 1100 / 弹窗 1200 / Toast 1300 / Tooltip 1400）。
- **z-index 层级**：base 0 / raised 10 / sticky 100 / topbar 200 / statusbar 300 / dropdown 1000 / overlay 1100 / modal 1200 / toast 1300 / tooltip 1400。
- **模糊 / 毛玻璃**：默认不使用（无功能目的的装饰性模糊禁用）。

## 7. Do's & Don'ts（设计守则）

**应该做的**
- 编辑器正文用书稿衬线体 17px / 行高 1.9，正文最大宽 720px 居中留白。
- 召回面板**分级展示**：未回收伏笔 + 本章人物默认展开，相关片段 + 剧情线默认折叠。
- 结构化召回（伏笔/人物）**不依赖模型**，未配置 Key 时依然出结果（降级可用）。
- 回写确认**逐条可改可删**，默认全选但人工过眼，不做"一键全收"、不做二次确认。
- 异步一律：骨架屏 / 就地错误条 + 重试 / 顶部黄条离线，**不用全屏遮罩、不弹 alert**。
- 所有颜色走 Token；每屏强调色 ≤2 处；图标统一描边 SVG。

**不应该做的**
- 禁止 emoji 作功能图标（《04》线框符号仅为示意）。
- 禁止紫色→粉色渐变、禁止发光边框 + 毛玻璃三位一体 AI 模板套路。
- 禁止卡片彩色左边框强调、禁止卡片圆角 ≥24px、禁止 1px 边框 + ≥16px 模糊阴影同元素叠加。
- 禁止把技术错误原文（堆栈、HTTP 状态码）丢给用户。
- 禁止硬编码色值（唯一例外 `#fff` / `#000`）。
- 禁止弹跳/弹性缓动、禁止 >500ms 动画、禁止纯装饰动效。

## 8. Responsive & Accessibility（响应式与无障碍）

- **响应式策略**：桌面优先（写作依赖大屏与键盘）。断点 900px / 1200px 控制左右栏折叠；**不做移动端**。
- **触摸目标**：最小 44×44px（`--touch-target-min`）。
- **键盘可达**：顶部导航、章节树、召回分区折叠、弹窗均可键盘操作；弹窗焦点陷阱 + `Esc` 关闭；快捷键 `Ctrl+S` 保存 / `Ctrl+Enter` 完成本章 / `Ctrl+F` 本章查找 / `Ctrl+Shift+F` 焦点模式。
- **焦点可见**：`:focus-visible` 2px 焦点环（`--focus-ring-shadow`），禁止移除。
- **对比度**：正文 ≥4.5:1；小字专用修正色见第 2 节。
- **动效**：`@media (prefers-reduced-motion: reduce)` 下全部时长归零（已内置于 `design-tokens.css`）。
- **5 态覆盖**：Loading（骨架屏）/ Empty（引导文案 + 主行动）/ Error（分类文案 + 重试）/ Populated / Edge（超长文本、零结果、边界）。

## 9. Agent Implementation Guide（实现指南）

- **技术栈（架构师锁定，勿改）**：React 18 + Vite 5 + TypeScript + TipTap + TanStack Query + Zustand；**样式用原生 CSS 变量 + CSS Modules，不引入 Tailwind 或 UI 组件库**（《09》§2.2）。
- **样式接入**：`main.tsx` 顶部 `import './styles/design-tokens.css'`；组件样式一律 `var(--token)` 取值。
- **Token 消费**：
  - CSS：`color: var(--color-text-secondary); border: 1px solid var(--color-border);`
  - TS（需要数值时）：`import tokens from '../../docs/design-tokens.json'`（或构建期生成 `tokens.ts`）。
- **一键启动**：双击 `start.bat` → 拉起 FastAPI → 自动打开浏览器（《03》§1.1）。
- **已知坑提醒**：
  - 召回请求**不得阻塞**编辑器渲染（先用缓存内容，召回到了再填）。
  - 「本章人物」区**不得出现空列表**，空则降级取最近出场前 3 位。
  - 密钥 `key_ref` 永不回显明文。
  - 中文字数统计用 `Intl.Segmenter`（Chrome/Edge 110+、Firefox 110+、Safari 16+）。
- **变更记录**：

| 日期 | 变更 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-09-20 | 建立 DESIGN.md（9 节）+ 锁定 Token | 落地《04》视觉规范为设计契约 | 全前端 |

---

*DESIGN.md 结束。*
