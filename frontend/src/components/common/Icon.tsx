/**
 * Icon —— 全项目图标唯一入口
 * -----------------------------------------------------------------------------
 * 契约（Spec §8.3 / §10，设计师锁定）：
 *  - 图标库 lucide-react@1.47.0（等号锁死），全项目统一，禁混用、禁 emoji
 *  - 描边宽度固定 1.75（lucide 默认 2，必须在此处覆盖）
 *  - 尺寸 16（行内）/ 20（按钮内）/ 24（独立 / 空态）
 *  - 取色一律 currentColor，随文字色
 *  - 业务代码**禁止**直接 import 图标库；替换图标库时只改本文件
 *  - 显式具名 import（而非 icons[...] 全量对象），保留 tree-shaking
 */

import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  Activity,
  Archive,
  ArrowRight,
  Bold,
  BookMarked,
  BookOpen,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleDot,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  Flag,
  FolderPlus,
  Funnel,
  GitBranch,
  Globe,
  Hash,
  History,
  Info,
  Italic,
  KeyRound,
  Layers,
  Leaf,
  Library,
  Lightbulb,
  Link2,
  List,
  ListTree,
  Loader2,
  Maximize2,
  MessageSquare,
  Monitor,
  Moon,
  MoonStar,
  Palette,
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  Plug,
  Plus,
  Quote,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Sparkles,
  Sun,
  Table2,
  Tag,
  Target,
  TrendingUp,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import type { IconName, IconSize } from '@/types/ui';

/** 语义名 → lucide 组件（显式具名 import，可 tree-shake） */
const ICONS: Record<IconName, LucideIcon> = {
  plus: Plus,
  trash: Trash2,
  edit: Pencil,
  save: Save,
  check: Check,
  close: X,
  settings: Settings,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  chevronUp: ChevronUp,
  search: Search,
  filter: Funnel,
  warning: TriangleAlert,
  info: Info,
  error: CircleAlert,
  user: User,
  users: Users,
  chapter: FileText,
  foreshadow: Flag,
  plotArc: GitBranch,
  recover: CircleCheck,
  jump: ArrowRight,
  retry: RefreshCw,
  view: BookMarked,
  model: Plug,
  export: Download,
  stats: TrendingUp,
  outline: ListTree,
  world: Globe,
  book: Library,
  library: Library,
  more: Ellipsis,
  arrowRight: ArrowRight,
  loader: Loader2,
  archive: Archive,
  key: KeyRound,
  plug: Plug,
  target: Target,
  calendar: CalendarDays,
  trendingUp: TrendingUp,
  bold: Bold,
  italic: Italic,
  undo: Undo2,
  redo: Redo2,
  collapseLeft: PanelLeftClose,
  collapseRight: PanelRightClose,
  focus: Maximize2,
  folderPlus: FolderPlus,
  filePlus: FilePlus2,
  externalLink: ExternalLink,
  quote: Quote,
  layers: Layers,
  globe: Globe,
  clock: Clock,
  copy: Copy,
  download: Download,
  up: Upload,
  eye: Eye,
  link: Link2,
  history: History,
  list: List,
  activity: Activity,
  tag: Tag,
  dot: CircleDot,
  hash: Hash,
  table: Table2,
  bookmark: Bookmark,
  sparkles: Sparkles,
  send: Send,
  chat: MessageSquare,
  lightbulb: Lightbulb,
  palette: Palette,
  sun: Sun,
  moon: Moon,
  moonStar: MoonStar,
  leaf: Leaf,
  monitor: Monitor,
  bookOpen: BookOpen,
  audit: ClipboardCheck,
};

export interface IconProps extends Omit<LucideProps, 'ref' | 'size' | 'strokeWidth'> {
  name: IconName;
  /** 契约尺寸：16 / 20 / 24 */
  size?: IconSize;
  /** 提供时表示图标有独立语义（role=img + aria-label），否则视为装饰性（aria-hidden） */
  label?: string;
}

export function Icon({ name, size = 20, label, ...rest }: IconProps) {
  const Cmp = ICONS[name];
  return (
    <Cmp
      size={size}
      strokeWidth={1.75}
      color="currentColor"
      focusable="false"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      {...rest}
    />
  );
}
