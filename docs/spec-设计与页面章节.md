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
