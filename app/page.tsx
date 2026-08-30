"use client";

import {
  Children,
  type FormEvent,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  AppWindow,
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Atom,
  BookOpen,
  Bot,
  Box,
  Boxes,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Cloud,
  Code2,
  Cog,
  Copy,
  Cpu,
  Database,
  Factory,
  FileCode2,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Globe2,
  HeartPulse,
  History,
  Home as HomeIcon,
  Import,
  Landmark,
  Languages,
  Layers3,
  Library,
  Maximize2,
  Monitor,
  Moon,
  MoreHorizontal,
  Network,
  Package,
  PanelRight,
  Pencil,
  Plane,
  Plus,
  Rocket,
  RotateCcw,
  Search,
  Server,
  Shield,
  ShoppingCart,
  Store,
  Sun,
  Table2,
  Trash2,
  Truck,
  Upload,
  Users,
  Warehouse,
  Wrench,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Project = {
  id: string;
  code: string;
  name: string;
  kind: "platform" | "project";
  parentId: string | null;
  icon: string;
  description: string;
  anchorVersionId?: string | null;
  anchorEnvironmentId?: string | null;
  environmentCount: number;
  versionCount: number;
  tableCount: number;
  fieldCount: number;
};
type Environment = {
  id: string;
  projectId: string;
  versionId: string | null;
  code: string;
  name: string;
  stage: string;
  sortOrder: number;
  projectName: string;
  versionName: string | null;
  tableCount: number;
  fieldCount: number;
};
type Version = {
  id: string;
  projectId: string;
  name: string;
  sourceVersion: string | null;
  repositoryId: string | null;
  gitRef: string | null;
  gitCommit: string | null;
  status: string;
  projectName: string;
  repositoryName: string | null;
  repository: string | null;
};
type Module = {
  id: string;
  code: string;
  name: string;
  description: string;
  tableCount: number;
  projectCount: number;
};
type TableItem = {
  id: string;
  code: string;
  name: string;
  comment: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
  moduleId: string | null;
  moduleName: string | null;
  fieldCount: number;
  projectNames?: string | null;
  environmentNames?: string | null;
  scopeCount?: number;
};
type FieldItem = {
  id: string;
  code: string;
  name: string;
  dataType: string;
  nullable: number;
  defaultValue: string | null;
  comment: string;
  extra: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
  sourceKind: string;
  tableId: string;
  tableName: string;
  tableCode: string;
  moduleName: string | null;
  projectNames: string | null;
  environmentNames: string | null;
  scopeCount: number;
};
type Scope = {
  fieldId: string;
  projectId: string;
  versionId: string;
  environmentId: string;
  state: string;
  origin: string;
  revisionId?: string | null;
  revision?: number | null;
  revisionDataType?: string | null;
  revisionNullable?: number | null;
  revisionDefaultValue?: string | null;
  revisionComment?: string | null;
  revisionExtra?: string | null;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
type TableScope = {
  tableId: string;
  projectId: string;
  versionId: string;
  environmentId: string;
  state: string;
  origin: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
type CatalogIndex = {
  id: string;
  tableId: string;
  name: string;
  kind: string;
  columnsJson: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
  sourceKind?: string;
  importBatchId?: string | null;
  createdAt?: string;
};
type IndexScope = {
  indexId: string;
  projectId: string;
  versionId: string;
  environmentId: string;
  state: string;
  origin: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
type CatalogConstraint = {
  id: string;
  tableId: string;
  name: string;
  kind: string;
  definition: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
type SearchObject = {
  id: string;
  name: string;
  kind: string;
  tableId: string;
  tableName: string;
  columnsJson?: string;
  definition?: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
type ConstraintScope = {
  constraintId: string;
  projectId: string;
  versionId: string;
  environmentId: string;
  state: string;
  origin: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
type TableInsight = {
  table: TableItem;
  fields: FieldItem[];
  tableScopes: TableScope[];
  fieldScopes: Scope[];
  indexes?: CatalogIndex[];
  indexScopes?: IndexScope[];
  constraints?: CatalogConstraint[];
  constraintScopes?: ConstraintScope[];
};
type ImportBatch = {
  id: string;
  code: string;
  name: string;
  sourceKind: string;
  fileName: string | null;
  sourcePath?: string | null;
  gitCommit?: string | null;
  status: string;
  addedCount: number;
  duplicateCount: number;
  modifiedCount: number;
  removedCount: number;
  conflictCount: number;
  createdAt: string;
  projectId: string;
  versionId: string;
  moduleId?: string | null;
  projectName: string;
  versionName: string;
  moduleName?: string | null;
  environmentIds?: string | null;
  environmentNames?: string | null;
  rawSql?: string;
};
type ImportItem = {
  id: string;
  statementNo: number;
  action: string;
  tableName: string;
  columnName: string;
  result: string;
  message: string;
  resolutionKind?: "same" | "variant" | "separate" | null;
  reviewStatus?: "confirmed" | "pending" | null;
};
type ImportInsight = {
  batch: ImportBatch & {
    repository?: string | null;
    repositoryBranch?: string | null;
    gitRef?: string | null;
  };
  items: ImportItem[];
};
type ImportPreviewItem = {
  tableName: string;
  columnName: string;
  fieldCode?: string;
  result: "added" | "modified" | "removed" | "unchanged" | "conflict";
  before: string | null;
  after: string | null;
  changes: string[];
  resolutionKind?: "same" | "variant" | "separate";
  reviewStatus?: "confirmed" | "pending";
};
type ImportPreview = {
  items: ImportPreviewItem[];
  summary: Record<string, number>;
  signature: string;
};
type ScopePreview = {
  items: ImportPreviewItem[];
  summary: Record<string, number>;
  baseCount: number;
  targetCount: number;
  baseTablePresent?: boolean | null;
  targetTablePresent?: boolean | null;
  indexItems?: {
    name: string;
    kind: string;
    columnsJson: string;
    result: "added" | "modified" | "removed" | "unchanged";
  }[];
};
type CompareFocus = {
  kind: "all" | "table" | "field";
  id: string;
  name: string;
};
type HistoryEvent = {
  id: string;
  kind: "revision" | "removed" | "table_created";
  revision: number;
  code: string | null;
  tableName: string;
  columnName: string | null;
  dataType: string | null;
  nullable: number;
  defaultValue: string | null;
  comment: string;
  extra: string;
  sourceKind: string;
  message?: string;
  batchName: string | null;
  batchCode: string | null;
  projectName: string | null;
  versionName: string | null;
  environmentNames: string | null;
  createdAt: string;
};
type SchemaHistory = {
  focus: {
    kind: "table" | "field";
    id: string;
    code: string;
    tableName: string;
    columnName: string | null;
  };
  events: HistoryEvent[];
};
type EnvironmentInsight = {
  environment: Environment & { parentId: string | null };
  coverage: {
    expectedCount: number;
    presentCount: number;
    expectedTableCount: number;
    presentTableCount: number;
  } | null;
  missing: {
    id: string;
    code: string;
    name: string;
    dataType: string;
    comment: string;
    tableName: string;
  }[];
  imports: ImportBatch[];
};
type Repository = {
  id: string;
  name: string;
  repository: string;
  branch: string;
  pathPattern: string;
  projectId: string | null;
  lastCommit: string | null;
  enabled: number;
};
type CatalogData = {
  projects: Project[];
  environments: Environment[];
  versions: Version[];
  modules: Module[];
  tables: TableItem[];
  fields: FieldItem[];
  scopes: Scope[];
  tableTotal: number;
  fieldTotal: number;
  imports: ImportBatch[];
  repositories: Repository[];
};
type ProjectDifference = {
  id: string;
  code: string;
  name: string;
  dataType: string;
  comment: string;
  tableName: string;
  versionId: string;
  versionName: string;
  totalCount: number;
  presentCount: number;
  missingEnvironments: string | null;
};
type ProjectInsight = {
  differences: ProjectDifference[];
  imports: ImportBatch[];
};
type AnchorTarget = { versionId: string; environmentId: string };
type AnchorDiffItem = { tableName: string; columnName?: string; result: "added" | "modified" | "removed"; before: string | null; after: string | null; changes: string[] };
type AnchorInsight = {
  anchor: AnchorTarget & { versionName: string; environmentName: string };
  target: AnchorTarget & { versionName: string; environmentName: string };
  tableItems: { tableName: string; result: "added" | "removed" }[];
  fieldItems: AnchorDiffItem[];
  indexItems: AnchorDiffItem[];
  constraintItems: AnchorDiffItem[];
  sql: string;
  executions: { id: string; status: string; environmentId: string; environmentName: string; versionName: string; createdAt: string; sqlText: string }[];
};
type ReleaseChange = {
  id: string;
  code: string;
  name: string;
  action: string;
  tableName: string;
  fieldName: string;
  fieldId: string | null;
  projectId: string;
  versionId: string;
  sourceKind: string;
  sourcePath: string | null;
  gitCommit: string | null;
  sqlText: string;
  status: string;
  lifecycleStatus: "active" | "deprecated" | "removed";
  createdAt: string;
  projectName: string;
  versionName: string;
  environmentCount: number;
  pendingCount: number;
  executedCount: number;
  verifiedCount: number;
  failedCount: number;
  pendingEnvironments: string | null;
  environmentNames: string | null;
  environmentIds: string | null;
  environmentStatuses: string | null;
};
type ReleaseInsight = {
  changes: ReleaseChange[];
  summary: {
    changes: number;
    pending: number;
    executed: number;
    verified: number;
    failed: number;
  } | null;
};
type ReleaseGroup = {
  key: string;
  projectName: string;
  versionName: string;
  tableName: string;
  changes: ReleaseChange[];
};
type View = "explorer" | "projects" | "release" | "imports" | "settings";

type LifecycleObject = {
  id: string;
  entity: "table" | "field" | "index" | "constraint";
  name: string;
  tableName?: string;
  lifecycleStatus: string;
  lifecycleNote: string;
};
export function LifecycleWorkspace({
  locale,
  call,
  toast,
}: {
  locale: "zh" | "en";
  call: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
}) {
  const [objects, setObjects] = useState<LifecycleObject[]>([]);
  const [filter, setFilter] = useState<
    "all" | "active" | "deprecated" | "removed"
  >("all");
  const [query, setQuery] = useState("");
  const load = useCallback(
    () =>
      fetch("/api/catalog?mode=lifecycle")
        .then((response) => response.json())
        .then((result) =>
          setObjects(
            Array.isArray((result as { objects?: unknown }).objects)
              ? ((result as { objects: LifecycleObject[] }).objects)
              : [],
          ),
        )
        .catch(() => setObjects([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const visible = objects.filter(
    (item) =>
      (filter === "all" || item.lifecycleStatus === filter) &&
      `${item.name} ${item.tableName ?? ""} ${item.lifecycleNote}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const update = async (
    item: LifecycleObject,
    status: "active" | "deprecated" | "removed",
  ) => {
    try {
      await call("lifecycle.set", { entity: item.entity, id: item.id, status });
      await load();
      toast(locale === "zh" ? "状态已更新" : "Status updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Card className="md:col-span-2">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Archive className="size-4" />
            {locale === "zh" ? "对象生命周期" : "Object lifecycle"}
            <Badge variant="secondary">{visible.length}</Badge>
          </CardTitle>
          <SelectField
            value={filter}
            onValueChange={(value) => setFilter(value as typeof filter)}
            className="ml-auto w-32"
          >
            <option value="all">{locale === "zh" ? "全部" : "All"}</option>
            <option value="active">
              {locale === "zh" ? "正常" : "Active"}
            </option>
            <option value="deprecated">
              {locale === "zh" ? "废弃" : "Deprecated"}
            </option>
            <option value="removed">
              {locale === "zh" ? "已移除" : "Removed"}
            </option>
          </SelectField>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            locale === "zh"
              ? "搜索表、字段、索引或约束"
              : "Search tables, fields, indexes, or constraints"
          }
          className="h-9 text-xs"
        />
      </CardHeader>
      <CardContent className="divide-y p-0">
        {visible.slice(0, 200).map((item) => (
          <div
            key={`${item.entity}-${item.id}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted">
              {item.entity === "table" ? (
                <Table2 className="size-3.5" />
              ) : item.entity === "field" ? (
                <Database className="size-3.5" />
              ) : item.entity === "index" ? (
                <Network className="size-3.5" />
              ) : (
                <Shield className="size-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <code className="block truncate text-xs">
                {item.tableName && item.entity !== "table"
                  ? `${item.tableName}.${item.name}`
                  : item.name}
              </code>
              <span className="text-[10px] text-muted-foreground">
                {item.lifecycleNote || item.entity}
              </span>
            </span>
            <Badge variant="outline">
              {item.lifecycleStatus === "deprecated"
                ? locale === "zh"
                  ? "废弃"
                  : "Deprecated"
                : item.lifecycleStatus === "removed"
                  ? locale === "zh"
                    ? "已移除"
                    : "Removed"
                  : locale === "zh"
                    ? "正常"
                    : "Active"}
            </Badge>
            {item.lifecycleStatus === "active" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void update(item, "deprecated")}
              >
                {locale === "zh" ? "废弃" : "Deprecate"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void update(item, "active")}
              >
                {locale === "zh" ? "恢复" : "Restore"}
              </Button>
            )}
          </div>
        ))}
        {!visible.length && (
          <Empty text={locale === "zh" ? "暂无对象" : "No objects"} />
        )}
      </CardContent>
    </Card>
  );
}
type DetailMode = "side" | "center" | "full";
type DetailTarget =
  | { type: "project"; project: Project }
  | { type: "environment"; environment: Environment }
  | { type: "import"; importId: string };
type ModalKind =
  | "project"
  | "environment"
  | "version"
  | "module"
  | "table"
  | "field"
  | "repository"
  | null;
type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void>;
};

const empty: CatalogData = {
  projects: [],
  environments: [],
  versions: [],
  modules: [],
  tables: [],
  fields: [],
  scopes: [],
  tableTotal: 0,
  fieldTotal: 0,
  imports: [],
  repositories: [],
};
const emptySelect = "__drifty_empty__";
const projectIconOptions = [
  { value: "server", icon: Server, label: "服务器" },
  { value: "package", icon: Package, label: "产品" },
  { value: "building", icon: Building2, label: "企业" },
  { value: "briefcase", icon: Briefcase, label: "业务" },
  { value: "factory", icon: Factory, label: "制造" },
  { value: "warehouse", icon: Warehouse, label: "仓储" },
  { value: "store", icon: Store, label: "门店" },
  { value: "landmark", icon: Landmark, label: "机构" },
  { value: "boxes", icon: Boxes, label: "模块" },
  { value: "database", icon: Database, label: "数据" },
  { value: "cloud", icon: Cloud, label: "云" },
  { value: "code", icon: Code2, label: "开发" },
  { value: "cpu", icon: Cpu, label: "计算" },
  { value: "network", icon: Network, label: "网络" },
  { value: "shield", icon: Shield, label: "安全" },
  { value: "cog", icon: Cog, label: "系统" },
  { value: "activity", icon: Activity, label: "运行" },
  { value: "chart", icon: Globe2, label: "全球" },
  { value: "users", icon: Users, label: "用户" },
  { value: "cart", icon: ShoppingCart, label: "商城" },
  { value: "truck", icon: Truck, label: "物流" },
  { value: "plane", icon: Plane, label: "出行" },
  { value: "rocket", icon: Rocket, label: "增长" },
  { value: "flask", icon: FlaskConical, label: "实验" },
  { value: "heart", icon: HeartPulse, label: "健康" },
  { value: "book", icon: BookOpen, label: "知识" },
  { value: "library", icon: Library, label: "资料" },
  { value: "bot", icon: Bot, label: "自动化" },
  { value: "atom", icon: Atom, label: "技术" },
  { value: "archive", icon: Archive, label: "归档" },
  { value: "home", icon: HomeIcon, label: "主页" },
  { value: "box", icon: Box, label: "组件" },
  { value: "wrench", icon: Wrench, label: "工具" },
  { value: "zap", icon: Zap, label: "效率" },
] as const;
const words = {
  zh: {
    landscape: "全景",
    projects: "项目",
    structure: "结构",
    imports: "导入",
    settings: "设置",
    search: "搜索",
    theme: "主题",
    system: "系统",
    light: "浅色",
    dark: "深色",
    platform: "平台",
    customerProject: "项目",
    environment: "环境",
    version: "版本",
    fields: "字段",
    tables: "表",
    modules: "模块",
    addProject: "新增项目",
    addEnvironment: "新增环境",
    addVersion: "新增版本",
    addModule: "新增模块",
    addTable: "新增表",
    addField: "新增字段",
    addSource: "新增来源",
    edit: "编辑",
    remove: "删除",
    save: "保存",
    cancel: "取消",
    name: "名称",
    code: "编码",
    kind: "类型",
    description: "说明",
    parentPlatform: "来源平台",
    stage: "阶段",
    sort: "顺序",
    sourceVersion: "来源版本",
    tableName: "表名",
    tableComment: "表注释",
    fieldName: "字段名",
    dataType: "类型",
    comment: "注释",
    defaultValue: "默认值",
    nullable: "可空",
    targetProject: "项目",
    targetVersion: "版本",
    targetEnvs: "环境",
    ownerModule: "模块",
    repository: "仓库",
    branch: "分支",
    pathPattern: "路径",
    upload: "上传",
    runImport: "导入",
    recentImports: "记录",
    reset: "清空结构",
    revert: "撤销",
    unknown: "未分类",
    saved: "已保存",
    deleted: "已删除",
    loadError: "读取失败",
    confirmDelete: "确认删除？",
    confirmRevert: "确认撤销整批导入？",
    confirmReset: "确认清空全部结构数据？",
    noData: "暂无数据",
  },
  en: {
    landscape: "Overview",
    projects: "Projects",
    structure: "Schema",
    imports: "Import",
    settings: "Settings",
    search: "Search",
    theme: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
    platform: "Platform",
    customerProject: "Project",
    environment: "Environment",
    version: "Version",
    fields: "Fields",
    tables: "Tables",
    modules: "Modules",
    addProject: "New project",
    addEnvironment: "New environment",
    addVersion: "New version",
    addModule: "New module",
    addTable: "New table",
    addField: "New field",
    addSource: "New source",
    edit: "Edit",
    remove: "Delete",
    save: "Save",
    cancel: "Cancel",
    name: "Name",
    code: "Code",
    kind: "Kind",
    description: "Description",
    parentPlatform: "Platform",
    stage: "Stage",
    sort: "Order",
    sourceVersion: "Source version",
    tableName: "Table",
    tableComment: "Table comment",
    fieldName: "Field",
    dataType: "Type",
    comment: "Comment",
    defaultValue: "Default",
    nullable: "Nullable",
    targetProject: "Project",
    targetVersion: "Version",
    targetEnvs: "Environments",
    ownerModule: "Module",
    repository: "Repository",
    branch: "Branch",
    pathPattern: "Path",
    upload: "Upload",
    runImport: "Import",
    recentImports: "History",
    reset: "Reset schema",
    revert: "Revert",
    unknown: "Unclassified",
    saved: "Saved",
    deleted: "Deleted",
    loadError: "Could not load",
    confirmDelete: "Delete this item?",
    confirmRevert: "Revert this import?",
    confirmReset: "Reset all schema data?",
    noData: "No data",
  },
} as const;

function number(value: unknown) {
  return typeof value === "number" ? value : Number(value) || 0;
}
function formatDate(value: string, locale: "zh" | "en", compact = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", compact
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
    : { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date);
}
function importResultLabel(result: string, locale: "zh" | "en") {
  const labels: Record<string, [string, string]> = {
    added: ["已新增", "Added"],
    modified: ["已修改", "Modified"],
    removed: ["已删除", "Removed"],
    duplicate: ["已存在", "Existing"],
    skipped: ["已跳过", "Skipped"],
    conflict: ["需处理", "Conflict"],
    scope_removed: ["已删除", "Removed"],
  };
  const label = labels[result];
  return label ? label[locale === "zh" ? 0 : 1] : result;
}
function DriftyLogo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" className="fill-foreground" />
      <path
        d="M9 8H14.3C19.25 8 23 11.25 23 16C23 20.75 19.25 24 14.3 24H9V8Z"
        fill="none"
        strokeWidth="2.15"
        strokeLinejoin="round"
        className="stroke-background"
      />
      <path
        d="M12 12H16.1M12 16H18M12 20H15.4"
        fill="none"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="stroke-background"
      />
    </svg>
  );
}
function ProjectIcon({
  name,
  className = "size-4",
}: {
  name: string;
  className?: string;
}) {
  const option = projectIconOptions.find((item) => item.value === name);
  const Icon = option?.icon ?? Boxes;
  return <Icon className={className} />;
}
function ProjectIconPicker({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue || "boxes");
  return (
    <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto pr-1">
      <input type="hidden" name="icon" value={value} />
      {projectIconOptions.map((option) => {
        const Icon = option.icon;
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={option.label}
                aria-pressed={value === option.value}
                onClick={() => setValue(option.value)}
                className={`grid aspect-square place-items-center rounded-lg border transition-colors ${value === option.value ? "border-foreground bg-foreground text-background" : "border-transparent bg-muted/60 text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{option.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<CatalogData>(empty);
  const [view, setView] = useState<View>("explorer");
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [query, setQuery] = useState("");
  const [selectedField, setSelectedField] = useState<{
    field: FieldItem;
    scopes: Scope[];
  } | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableInsight | null>(null);
  const [compareFocus, setCompareFocus] = useState<CompareFocus | null>(null);
  const [detailStack, setDetailStack] = useState<DetailTarget[]>([]);
  const [detailMode, setDetailModeState] = useState<DetailMode>("side");
  const [projectTab, setProjectTab] = useState<
    "differences" | "history" | "environments"
  >("differences");
  const [modal, setModal] = useState<ModalKind>(null);
  const [editing, setEditing] = useState<Record<string, unknown>>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [scopeProject, setScopeProject] = useState("");
  const [scopeVersion, setScopeVersion] = useState("");
  const [scopeEnvs, setScopeEnvs] = useState<string[]>([]);
  const [importName, setImportName] = useState("");
  const [importSql, setImportSql] = useState("");
  const [importFile, setImportFile] = useState("");
  const [importModule, setImportModule] = useState("");
  const [importSourcePath, setImportSourcePath] = useState("");
  const [importGitCommit, setImportGitCommit] = useState("");
  const t = words[locale];
  const noticeTimer = useRef<number | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/catalog");
    if (!response.ok) throw new Error("load");
    const next = (await response.json()) as CatalogData;
    setData(next);
    setDetailStack((current) =>
      current.flatMap<DetailTarget>((target) => {
        if (target.type === "project") {
          const project = next.projects.find(
            (item) => item.id === target.project.id,
          );
          return project
            ? [
                {
                  type: "project",
                  project: {
                    ...project,
                    environmentCount: number(project.environmentCount),
                    versionCount: number(project.versionCount),
                    tableCount: number(project.tableCount),
                    fieldCount: number(project.fieldCount),
                  },
                },
              ]
            : [];
        }
        if (target.type === "environment") {
          const environment = next.environments.find(
            (item) => item.id === target.environment.id,
          );
          return environment
            ? [
                {
                  type: "environment",
                  environment: {
                    ...environment,
                    tableCount: number(environment.tableCount),
                    fieldCount: number(environment.fieldCount),
                    sortOrder: number(environment.sortOrder),
                  },
                },
              ]
            : [];
        }
        return [target];
      }),
    );
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedLocale =
        localStorage.getItem("drifty-locale") === "en" ? "en" : "zh";
      const savedTheme = localStorage.getItem("drifty-theme") as
        "system" | "light" | "dark" | null;
      const savedDetailMode = localStorage.getItem(
        "drifty-detail-mode",
      ) as DetailMode | null;
      setLocale(savedLocale);
      setTheme(savedTheme ?? "system");
      if (
        savedDetailMode === "side" ||
        savedDetailMode === "center" ||
        savedDetailMode === "full"
      )
        setDetailModeState(savedDetailMode);
      document.documentElement.lang = savedLocale === "zh" ? "zh-CN" : "en";
      document.documentElement.dataset.theme = savedTheme ?? "system";
      load().catch(() => setNotice(words[savedLocale].loadError));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const projects = useMemo(
    () =>
      data.projects.map((item) => ({
        ...item,
        environmentCount: number(item.environmentCount),
        versionCount: number(item.versionCount),
        tableCount: number(item.tableCount),
        fieldCount: number(item.fieldCount),
      })),
    [data.projects],
  );
  const environments = useMemo(
    () =>
      data.environments.map((item) => ({
        ...item,
        tableCount: number(item.tableCount),
        fieldCount: number(item.fieldCount),
        sortOrder: number(item.sortOrder),
      })),
    [data.environments],
  );
  const projectEnvs = (projectId: string) =>
    environments.filter((item) => item.projectId === projectId);
  const projectVersions = (projectId: string) =>
    data.versions.filter((item) => item.projectId === projectId);
  const activeDetail = detailStack[detailStack.length - 1] ?? null;
  const showDetail = (target: DetailTarget, nested = false) =>
    setDetailStack((current) => (nested ? [...current, target] : [target]));
  const closeDetail = () => setDetailStack([]);
  const backDetail = () => setDetailStack((current) => current.slice(0, -1));
  const chooseDetailMode = (mode: DetailMode) => {
    setDetailModeState(mode);
    localStorage.setItem("drifty-detail-mode", mode);
  };
  const call = useCallback(async (
    action: string,
    payload: Record<string, unknown> = {},
  ) => {
    setBusy(true);
    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "保存失败"));
      await load();
      return result;
    } finally {
      setBusy(false);
    }
  }, [load]);
  const toast = (message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      noticeTimer.current = null;
    }, 1800);
  };
  const chooseLocale = (next: "zh" | "en") => {
    setLocale(next);
    localStorage.setItem("drifty-locale", next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  };
  const cycleTheme = () => {
    const next =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    localStorage.setItem("drifty-theme", next);
    document.documentElement.dataset.theme = next;
  };
  const themeLabel =
    theme === "system" ? t.system : theme === "light" ? t.light : t.dark;
  const chooseScopeProject = (projectId: string) => {
    setScopeProject(projectId);
    setScopeVersion(projectVersions(projectId)[0]?.id ?? "");
    setScopeEnvs(projectEnvs(projectId).map((item) => item.id));
  };
  const go = (next: View) => {
    closeDetail();
    setView(next);
    if (next === "imports" && !scopeProject && projects[0])
      chooseScopeProject(projects[0].id);
  };
  const open = (
    kind: Exclude<ModalKind, null>,
    record: Record<string, unknown> = {},
  ) => {
    setEditing(record);
    setModal(kind);
    if (kind === "field" || kind === "table") {
      const supplied = Array.isArray(record.__scopes)
        ? (record.__scopes as (Scope | TableScope)[])
        : null;
      const existing =
        supplied ??
        (kind === "field"
          ? data.scopes.filter((scope) => scope.fieldId === record.id)
          : []);
      const first = existing[0];
      if (first) {
        setScopeProject(first.projectId);
        setScopeVersion(first.versionId);
        setScopeEnvs(
          existing
            .filter(
              (scope) =>
                scope.projectId === first.projectId &&
                scope.versionId === first.versionId,
            )
            .map((scope) => scope.environmentId),
        );
      } else
        chooseScopeProject(String(record.projectId ?? projects[0]?.id ?? ""));
    }
    if (kind === "environment" || kind === "version")
      setScopeProject(String(record.projectId ?? projects[0]?.id ?? ""));
  };
  const close = () => {
    setModal(null);
    setEditing({});
  };
  const submitSimple = async (
    event: FormEvent<HTMLFormElement>,
    action: string,
  ) => {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
    const values = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [
        key,
        value === emptySelect ? "" : value,
      ]),
    );
    const payload = { ...editing, ...values };
    try {
      await call(action, payload);
      close();
      toast(t.saved);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  const askConfirm = (request: Confirmation) => setConfirmation(request);
  const confirmAction = async () => {
    const request = confirmation;
    if (!request) return;
    try {
      await request.run();
      setConfirmation(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  const remove = async (entity: string, id: string) => {
    const project = projects.find((item) => item.id === id);
    const version = data.versions.find((item) => item.id === id);
    const label =
      project?.name ??
      data.modules.find((item) => item.id === id)?.name ??
      version?.name ??
      environments.find((item) => item.id === id)?.name ??
      data.tables.find((item) => item.id === id)?.name ??
      data.fields.find((item) => item.id === id)?.name ??
      data.repositories.find((item) => item.id === id)?.name ??
      "";
    const versionEnvironmentCount = version
      ? environments.filter((item) => item.versionId === version.id).length
      : 0;
    const impact = project
      ? locale === "zh"
        ? `同时删除 ${project.versionCount} 个版本、${project.environmentCount} 个环境，以及所属范围和导入记录。`
        : `This also removes ${project.versionCount} versions, ${project.environmentCount} environments, scopes, and import history.`
      : version
        ? locale === "zh"
          ? `该版本的字段登记与 SQL 导入记录会删除；绑定它的 ${versionEnvironmentCount} 个环境会保留，但变为未绑定版本。`
          : `Field registrations and SQL imports for this version will be deleted. Its ${versionEnvironmentCount} environments will remain but become unassigned.`
        : locale === "zh"
          ? "相关引用会一并清理。"
          : "Related references will be cleaned up.";
    askConfirm({
      title: t.confirmDelete,
      description: `${label ? `“${label}” · ` : ""}${impact} ${locale === "zh" ? "此操作无法撤销。" : "This cannot be undone."}`,
      confirmLabel: t.remove,
      run: async () => {
        await call("entity.delete", { entity, id });
        toast(t.deleted);
      },
    });
  };
  const submitField = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const table = data.tables.find(
      (item) => item.name === String(values.tableName).trim().toLowerCase(),
    );
    if (!table) {
      toast(locale === "zh" ? "请选择已有数据表" : "Choose an existing table");
      return;
    }
    try {
      await call("field.save", {
        ...editing,
        ...values,
        tableId: table.id,
        projectId: scopeProject,
        versionId: scopeVersion,
        environmentIds: scopeEnvs,
        nullable: values.nullable === "on",
      });
      close();
      toast(t.saved);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  const submitTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    try {
      await call("table.save", {
        ...editing,
        ...values,
        projectId: scopeProject,
        versionId: scopeVersion,
        environmentIds: scopeEnvs,
      });
      close();
      toast(t.saved);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  const selectTable = async (table: TableItem) => {
    try {
      const response = await fetch(
        `/api/catalog?mode=table&tableId=${encodeURIComponent(table.id)}`,
      );
      if (!response.ok) throw new Error("load");
      setSelectedTable((await response.json()) as TableInsight);
    } catch {
      toast(t.loadError);
    }
  };
  const updateDrawerLifecycle = async (
    entity: "table" | "field",
    objectId: string,
    projectId: string,
    status: "active" | "deprecated" | "removed",
  ) => {
    await call("lifecycle.set", { entity, id: objectId, projectId, status });
    if (entity === "table") {
      setSelectedTable((current) => current && current.table.id === objectId
        ? {
            ...current,
            tableScopes: current.tableScopes.map((scope) => scope.projectId === projectId ? { ...scope, lifecycleStatus: status } : scope),
            fieldScopes: current.fieldScopes.map((scope) => scope.projectId === projectId ? { ...scope, lifecycleStatus: status } : scope),
            indexScopes: current.indexScopes?.map((scope) => scope.projectId === projectId ? { ...scope, lifecycleStatus: status } : scope),
            constraintScopes: current.constraintScopes?.map((scope) => scope.projectId === projectId ? { ...scope, lifecycleStatus: status } : scope),
          }
        : current);
    } else {
      setSelectedField((current) => current && current.field.id === objectId
        ? { ...current, scopes: current.scopes.map((scope) => scope.projectId === projectId ? { ...scope, lifecycleStatus: status } : scope) }
        : current);
    }
    toast(locale === "zh" ? "项目内状态已更新" : "Project status updated");
  };
  const runImport = async () => {
    try {
      const result = await call("import.sql", {
        name: importName,
        sql: importSql,
        sourceKind:
          importSourcePath || importGitCommit
            ? "github"
            : importFile
              ? "upload"
              : "paste",
        fileName: importFile || null,
        sourcePath: importSourcePath,
        gitCommit: importGitCommit,
        projectId: scopeProject,
        versionId: scopeVersion,
        environmentIds: scopeEnvs,
        moduleId: importModule || null,
      });
      const warningCount = Array.isArray(result.warnings)
        ? result.warnings.length
        : 0;
      toast(
        result.duplicateBatch
          ? locale === "zh"
            ? `这份 SQL 已导入 · ${result.batchCode}`
            : `Already imported · ${result.batchCode}`
          : locale === "zh"
            ? `完成 · 新增 ${number(result.added)} · 修改 ${number(result.modified)} · 删除 ${number(result.removed)} · 重复 ${number(result.duplicates)} · 冲突 ${number(result.conflicts)}${warningCount ? ` · ${warningCount} 条提醒` : ""}`
            : `Done · ${number(result.added)} added · ${number(result.modified)} modified · ${number(result.removed)} removed · ${number(result.duplicates)} duplicate · ${number(result.conflicts)} conflict${warningCount ? ` · ${warningCount} warnings` : ""}`,
      );
      setImportName("");
      setImportSql("");
      setImportFile("");
      setImportSourcePath("");
      setImportGitCommit("");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    setImportFile(selected.map((file) => file.name).join(", "));
    setImportSql(
      (
        await Promise.all(
          selected.map(async (file) => `-- ${file.name}\n${await file.text()}`),
        )
      ).join("\n\n"),
    );
  };
  const reuseImport = (batch: ImportBatch) => {
    closeDetail();
    setView("imports");
    setScopeProject(batch.projectId);
    setScopeVersion(batch.versionId);
    setScopeEnvs((batch.environmentIds ?? "").split("|||").filter(Boolean));
    setImportModule(batch.moduleId ?? "");
    setImportName(
      locale === "zh" ? `${batch.name} · 再次执行` : `${batch.name} · rerun`,
    );
    setImportSql(batch.rawSql ?? "");
    setImportFile(batch.fileName ?? "");
    setImportSourcePath(batch.sourcePath ?? "");
    setImportGitCommit(batch.gitCommit ?? "");
  };
  const nav: { view: View; label: string; icon: typeof Search }[] = [
    {
      view: "explorer",
      label: locale === "zh" ? "查结构" : "Find schema",
      icon: Search,
    },
    { view: "projects", label: t.projects, icon: GitBranch },
    {
      view: "release",
      label: locale === "zh" ? "发布" : "Release",
      icon: Rocket,
    },
    { view: "imports", label: t.imports, icon: Import },
  ];
  const editFromDetail = (
    kind: Exclude<ModalKind, null>,
    record?: Record<string, unknown>,
  ) => open(kind, record);
  const detailContent =
    activeDetail?.type === "project" ? (
      <ProjectDetail
        key={`${activeDetail.project.id}-${projects.find((item) => item.id === activeDetail.project.id)?.anchorVersionId ?? ""}-${projects.find((item) => item.id === activeDetail.project.id)?.anchorEnvironmentId ?? ""}`}
        project={projects.find((item) => item.id === activeDetail.project.id) ?? activeDetail.project}
        tab={projectTab}
        setTab={setProjectTab}
        data={data}
        environments={environments}
        locale={locale}
        call={call}
        toast={toast}
        open={editFromDetail}
        remove={remove}
        onSelectEnvironment={(environment) =>
          showDetail({ type: "environment", environment }, true)
        }
        onSelectImport={(importId) =>
          showDetail({ type: "import", importId }, true)
        }
      />
    ) : activeDetail?.type === "environment" ? (
      <EnvironmentDetail
        key={activeDetail.environment.id}
        environment={activeDetail.environment}
        locale={locale}
        onEdit={() =>
          editFromDetail(
            "environment",
            activeDetail.environment as unknown as Record<string, unknown>,
          )
        }
        onSelectImport={(importId) =>
          showDetail({ type: "import", importId }, true)
        }
      />
    ) : activeDetail?.type === "import" ? (
      <ImportDetail
        key={activeDetail.importId}
        importId={activeDetail.importId}
        locale={locale}
        call={call}
        toast={toast}
        askConfirm={askConfirm}
        onReuse={reuseImport}
      />
    ) : null;

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto grid h-14 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4">
          <Button
            type="button"
            variant="ghost"
            className="group h-auto w-fit gap-2 p-1"
            onClick={() => go("explorer")}
            aria-label="Drifty"
          >
            <DriftyLogo className="size-8 transition-transform duration-200 ease-out group-hover:-rotate-3 group-hover:scale-[1.03] motion-reduce:transform-none" />
            <span className="hidden text-sm font-semibold tracking-tight sm:block">
              Drifty
            </span>
          </Button>
          <PrimaryNav view={view} nav={nav} go={go} />
          <div className="flex items-center justify-end gap-1">
            <LanguageSwitcher locale={locale} chooseLocale={chooseLocale} />
            <span className="hidden sm:inline-flex">
              <IconButton
                label={`${t.theme} · ${themeLabel}`}
                onClick={cycleTheme}
              >
                {theme === "dark" ? (
                  <Moon />
                ) : theme === "light" ? (
                  <Sun />
                ) : (
                  <Monitor />
                )}
              </IconButton>
            </span>
            <CreateMenu t={t} projects={projects} open={open} go={go} />
          </div>
        </div>
      </header>
      {notice && (
        <div className="drifty-toast-enter fixed left-1/2 top-18 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-foreground px-4 py-2 text-xs text-background shadow-xl">
          <Check className="size-3.5" />
          {notice}
        </div>
      )}
      {activeDetail && detailMode === "full" ? (
        <section className="mx-auto max-w-[1440px] px-4 py-4">
          <DetailSurface
            mode={detailMode}
            onModeChange={chooseDetailMode}
            canGoBack={detailStack.length > 1}
            onBack={backDetail}
            onClose={closeDetail}
            locale={locale}
          >
            {detailContent}
          </DetailSurface>
        </section>
      ) : (
        <section className="mx-auto max-w-[1440px] px-4 py-6">
          <div key={view} className="drifty-view-enter">
            {view === "explorer" && (
              <SchemaExplorerView
                query={query}
                setQuery={setQuery}
                totalTables={data.tableTotal}
                totalFields={data.fieldTotal}
                projects={projects}
                environments={environments}
                versions={data.versions}
                projectId={scopeProject}
                versionId={scopeVersion}
                environmentId={scopeEnvs.join(",")}
                setVersionId={setScopeVersion}
                locale={locale}
                call={call}
                toast={toast}
                onCompare={(focus) =>
                  setCompareFocus(focus ?? { kind: "all", id: "", name: "" })
                }
                onSelectTable={(table) => void selectTable(table)}
                onSelectField={(field, scopes) =>
                  setSelectedField({ field, scopes })
                }
              />
            )}
            {view === "projects" && (
              <div className="space-y-4">
                <ProjectsWorkspace
                  projects={projects}
                  projectVersions={projectVersions}
                  projectEnvs={projectEnvs}
                  locale={locale}
                  open={open}
                  remove={remove}
                  onSelect={(project) => {
                    setProjectTab("differences");
                    showDetail({ type: "project", project });
                  }}
                />
                <SettingsView
                  data={data}
                  t={t}
                  open={open}
                  remove={remove}
                  call={call}
                  toast={toast}
                  askConfirm={askConfirm}
                />
              </div>
            )}
            {view === "release" && (
              <ReleaseWorkspace
                projects={projects}
                locale={locale}
                call={call}
                toast={toast}
              />
            )}
            {view === "imports" && (
              <div className="space-y-4">
                <ImportWorkspace
                data={data}
                projects={projects}
                scopeProject={scopeProject}
                scopeVersion={scopeVersion}
                scopeEnvs={scopeEnvs}
                importName={importName}
                importSql={importSql}
                importFile={importFile}
                importSourcePath={importSourcePath}
                importGitCommit={importGitCommit}
                busy={busy}
                locale={locale}
                t={t}
                chooseScopeProject={chooseScopeProject}
                setScopeVersion={setScopeVersion}
                setScopeEnvs={setScopeEnvs}
                setImportName={setImportName}
                setImportSql={setImportSql}
                setImportSourcePath={setImportSourcePath}
                setImportGitCommit={setImportGitCommit}
                readFiles={readFiles}
                runImport={runImport}
                projectVersions={projectVersions}
                projectEnvs={projectEnvs}
                call={call}
                toast={toast}
                askConfirm={askConfirm}
                onSelectImport={(importId) =>
                  showDetail({ type: "import", importId })
                }
                />
              </div>
            )}
          </div>
        </section>
      )}
      <Sheet
        open={Boolean(selectedField)}
        onOpenChange={(open) => {
          if (!open) setSelectedField(null);
        }}
      >
        <SheetContent size="detail">
          {selectedField && (
            <FieldDetail
              field={selectedField.field}
              projects={projects}
              environments={environments}
              versions={data.versions}
              scopes={selectedField.scopes}
              tables={data.tables}
              locale={locale}
              onLifecycleChange={(projectId, status) =>
                updateDrawerLifecycle("field", selectedField.field.id, projectId, status)
              }
              onEdit={() => {
                const field = selectedField.field,
                  scopes = selectedField.scopes;
                setSelectedField(null);
                open("field", {
                  ...field,
                  __scopes: scopes,
                } as unknown as Record<string, unknown>);
              }}
              onDelete={() => {
                const field = selectedField.field;
                setSelectedField(null);
                void remove("field", field.id);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={Boolean(selectedTable)}
        onOpenChange={(open) => {
          if (!open) setSelectedTable(null);
        }}
      >
        <SheetContent size="detail">
          {selectedTable && (
            <TableDetail
              insight={selectedTable}
              projects={projects}
              environments={environments}
              versions={data.versions}
              locale={locale}
              onLifecycleChange={(projectId, status) =>
                updateDrawerLifecycle("table", selectedTable.table.id, projectId, status)
              }
              onSelectField={(field, scopes) => {
                setSelectedTable(null);
                setSelectedField({ field, scopes });
              }}
              onEdit={() => {
                const insight = selectedTable;
                setSelectedTable(null);
                open("table", {
                  ...insight.table,
                  __scopes: insight.tableScopes,
                } as unknown as Record<string, unknown>);
              }}
              onDelete={() => {
                const table = selectedTable.table;
                setSelectedTable(null);
                void remove("table", table.id);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      {compareFocus && (
        <ScopeCompareDialog
          key={`${compareFocus.kind}-${compareFocus.id}`}
          open
          onOpenChange={(open) => {
            if (!open) setCompareFocus(null);
          }}
          focus={compareFocus}
          projects={projects}
          versions={data.versions}
          environments={environments}
          locale={locale}
        />
      )}
      {activeDetail && detailMode !== "full" && (
        <DetailSurface
          mode={detailMode}
          onModeChange={chooseDetailMode}
          canGoBack={detailStack.length > 1}
          onBack={backDetail}
          onClose={closeDetail}
          locale={locale}
        >
          {detailContent}
        </DetailSurface>
      )}
      <Dialog
        open={Boolean(modal)}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent size="form" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modal ? modalTitle(modal, t, Boolean(editing.id)) : ""}
            </DialogTitle>
            <DialogDescription className="sr-only">Drifty</DialogDescription>
          </DialogHeader>
          {modal === "project" && (
            <form
              className="space-y-4"
              onSubmit={(event) => submitSimple(event, "project.save")}
            >
              <Field label={t.name}>
                <Input
                  name="name"
                  defaultValue={String(editing.name ?? "")}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.code}>
                  <Input
                    name="code"
                    defaultValue={String(editing.code ?? "")}
                  />
                </Field>
                <Field label={t.kind}>
                  <SelectField
                    name="kind"
                    defaultValue={String(editing.kind ?? "project")}
                  >
                    <option value="platform">{t.platform}</option>
                    <option value="project">{t.customerProject}</option>
                  </SelectField>
                </Field>
              </div>
              <Field label={locale === "zh" ? "项目图标" : "Project icon"}>
                <ProjectIconPicker
                  defaultValue={String(
                    editing.icon ??
                      (editing.kind === "platform" ? "server" : "package"),
                  )}
                />
              </Field>
              <Field label={t.parentPlatform}>
                <SelectField
                  name="parentId"
                  defaultValue={String(editing.parentId ?? "")}
                >
                  <option value="">—</option>
                  {projects
                    .filter(
                      (item) =>
                        item.kind === "platform" && item.id !== editing.id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </SelectField>
              </Field>
              <Field label={t.description}>
                <Textarea
                  name="description"
                  defaultValue={String(editing.description ?? "")}
                />
              </Field>
              {Boolean(editing.id) && (
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="mb-3 text-xs font-medium">
                    {locale === "zh" ? "项目基准" : "Project baseline"}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={locale === "zh" ? "锚定版本" : "Anchor version"}>
                      <SelectField name="anchorVersionId" defaultValue={String(editing.anchorVersionId ?? "")}>
                        <option value="">{locale === "zh" ? "未设置" : "Not set"}</option>
                        {projectVersions(String(editing.id)).map((version) => (
                          <option key={version.id} value={version.id}>{version.name}</option>
                        ))}
                      </SelectField>
                    </Field>
                    <Field label={locale === "zh" ? "锚定环境" : "Anchor environment"}>
                      <SelectField name="anchorEnvironmentId" defaultValue={String(editing.anchorEnvironmentId ?? "")}>
                        <option value="">{locale === "zh" ? "未设置" : "Not set"}</option>
                        {projectEnvs(String(editing.id)).map((environment) => (
                          <option key={environment.id} value={environment.id}>{environment.name}</option>
                        ))}
                      </SelectField>
                    </Field>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                    {locale === "zh" ? "后续同步比较默认以此版本和环境为基准。" : "Future sync comparisons use this version and environment by default."}
                  </p>
                </div>
              )}
              <ModalActions busy={busy} t={t} onClose={close} />
            </form>
          )}
          {modal === "module" && (
            <form
              className="space-y-4"
              onSubmit={(event) => submitSimple(event, "module.save")}
            >
              <Field label={t.name}>
                <Input
                  name="name"
                  defaultValue={String(editing.name ?? "")}
                  required
                />
              </Field>
              <Field label={t.code}>
                <Input name="code" defaultValue={String(editing.code ?? "")} />
              </Field>
              <Field label={t.description}>
                <Textarea
                  name="description"
                  defaultValue={String(editing.description ?? "")}
                />
              </Field>
              <ModalActions busy={busy} t={t} onClose={close} />
            </form>
          )}
          {modal === "version" && (
            <form
              className="space-y-4"
              onSubmit={(event) => submitSimple(event, "version.save")}
            >
              <Field label={t.targetProject}>
                <SelectField
                  name="projectId"
                  defaultValue={String(editing.projectId ?? scopeProject)}
                  required
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.version}>
                  <Input
                    name="name"
                    defaultValue={String(editing.name ?? "")}
                    placeholder="3.8.0"
                    required
                  />
                </Field>
                <Field label={t.sourceVersion}>
                  <Input
                    name="sourceVersion"
                    defaultValue={String(editing.sourceVersion ?? "")}
                  />
                </Field>
              </div>
              <div className="rounded-xl border p-3">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium">
                  <GitBranch className="size-3.5" />
                  {locale === "zh" ? "Git 来源" : "Git source"}
                </div>
                <div className="space-y-3">
                  <Field label={locale === "zh" ? "仓库来源" : "Repository"}>
                    <SelectField
                      name="repositoryId"
                      defaultValue={String(editing.repositoryId ?? "")}
                    >
                      <option value="">
                        {locale === "zh" ? "暂不关联" : "Not linked"}
                      </option>
                      {data.repositories
                        .filter(
                          (source) =>
                            !source.projectId ||
                            source.projectId ===
                              String(editing.projectId ?? scopeProject),
                        )
                        .map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.name} · {source.repository}
                          </option>
                        ))}
                    </SelectField>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label={locale === "zh" ? "分支 / Tag" : "Branch / Tag"}
                    >
                      <Input
                        name="gitRef"
                        defaultValue={String(editing.gitRef ?? "")}
                        placeholder="main"
                      />
                    </Field>
                    <Field label={locale === "zh" ? "提交" : "Commit"}>
                      <Input
                        name="gitCommit"
                        defaultValue={String(editing.gitCommit ?? "")}
                        placeholder="a1b2c3d"
                      />
                    </Field>
                  </div>
                </div>
              </div>
              <ModalActions
                busy={busy}
                t={t}
                onClose={close}
                onDelete={
                  editing.id
                    ? () => {
                        void remove("version", String(editing.id));
                        close();
                      }
                    : undefined
                }
              />
            </form>
          )}
          {modal === "environment" && (
            <form
              className="space-y-4"
              onSubmit={(event) => submitSimple(event, "environment.save")}
            >
              <Field label={t.targetProject}>
                <SelectField
                  name="projectId"
                  value={scopeProject}
                  onValueChange={setScopeProject}
                  required
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.name}>
                  <Input
                    name="name"
                    defaultValue={String(editing.name ?? "")}
                    required
                  />
                </Field>
                <Field label={t.code}>
                  <Input
                    name="code"
                    defaultValue={String(editing.code ?? "")}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.version}>
                  <SelectField
                    name="versionId"
                    defaultValue={String(editing.versionId ?? "")}
                  >
                    <option value="">—</option>
                    {projectVersions(scopeProject).map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
                <Field label={t.stage}>
                  <SelectField
                    name="stage"
                    defaultValue={String(editing.stage ?? "custom")}
                  >
                    <option value="development">Dev</option>
                    <option value="testing">Test</option>
                    <option value="production">Prod</option>
                    <option value="custom">Custom</option>
                  </SelectField>
                </Field>
              </div>
              <Field label={t.sort}>
                <Input
                  type="number"
                  name="sortOrder"
                  defaultValue={String(editing.sortOrder ?? 10)}
                />
              </Field>
              <ModalActions
                busy={busy}
                t={t}
                onClose={close}
                onDelete={
                  editing.id
                    ? () => {
                        void remove("environment", String(editing.id));
                        close();
                      }
                    : undefined
                }
              />
            </form>
          )}
          {modal === "table" && (
            <form className="space-y-4" onSubmit={submitTable}>
              <Field label={t.tableName}>
                <Input
                  name="name"
                  defaultValue={String(editing.name ?? "")}
                  placeholder="customer"
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.code}>
                  <Input
                    name="code"
                    defaultValue={String(editing.code ?? "")}
                  />
                </Field>
                <Field label={t.ownerModule}>
                  <SelectField
                    name="moduleId"
                    defaultValue={String(editing.moduleId ?? "")}
                  >
                    <option value="">{t.unknown}</option>
                    {data.modules.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
              </div>
              <Field label={t.tableComment}>
                <Input
                  name="comment"
                  defaultValue={String(editing.comment ?? "")}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.targetProject}>
                  <SelectField
                    value={scopeProject}
                    onValueChange={chooseScopeProject}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
                <Field label={t.targetVersion}>
                  <SelectField
                    value={scopeVersion}
                    onValueChange={setScopeVersion}
                  >
                    {projectVersions(scopeProject).map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
              </div>
              <ScopePicker
                envs={projectEnvs(scopeProject)}
                selected={scopeEnvs}
                onChange={setScopeEnvs}
                t={t}
              />
              <ModalActions busy={busy} t={t} onClose={close} />
            </form>
          )}
          {modal === "field" && (
            <form className="space-y-4" onSubmit={submitField}>
              <Field label={t.tableName}>
                <SearchSelect
                  name="tableName"
                  defaultValue={String(editing.tableName ?? "")}
                  placeholder={t.tableName}
                  searchLabel={t.search}
                  emptyLabel={t.noData}
                  options={data.tables.filter((table) => table.lifecycleStatus === "active" || table.name === String(editing.tableName ?? "")).map((table) => ({
                    value: table.name,
                    label: table.name,
                    meta: table.comment,
                  }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.fieldName}>
                  <Input
                    name="name"
                    defaultValue={String(editing.name ?? "")}
                    required
                  />
                </Field>
                <Field label={t.dataType}>
                  <Input
                    name="dataType"
                    defaultValue={String(editing.dataType ?? "")}
                    placeholder="varchar(50)"
                    required
                  />
                </Field>
              </div>
              <Field label={t.comment}>
                <Input
                  name="comment"
                  defaultValue={String(editing.comment ?? "")}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.defaultValue}>
                  <Input
                    name="defaultValue"
                    defaultValue={String(editing.defaultValue ?? "")}
                  />
                </Field>
                <label className="grid gap-2 text-xs font-medium">
                  <span>{t.nullable}</span>
                  <span className="flex h-9 items-center">
                    <Switch
                      name="nullable"
                      value="on"
                      defaultChecked={
                        editing.nullable === undefined ||
                        Boolean(editing.nullable)
                      }
                      aria-label={t.nullable}
                    />
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.targetProject}>
                  <SelectField
                    value={scopeProject}
                    onValueChange={chooseScopeProject}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
                <Field label={t.targetVersion}>
                  <SelectField
                    value={scopeVersion}
                    onValueChange={setScopeVersion}
                  >
                    {projectVersions(scopeProject).map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
              </div>
              <ScopePicker
                envs={projectEnvs(scopeProject)}
                selected={scopeEnvs}
                onChange={setScopeEnvs}
                t={t}
              />
              <ModalActions busy={busy} t={t} onClose={close} />
            </form>
          )}
          {modal === "repository" && (
            <form
              className="space-y-4"
              onSubmit={(event) => submitSimple(event, "repository.save")}
            >
              <Field label={t.name}>
                <Input
                  name="name"
                  defaultValue={String(editing.name ?? "")}
                  required
                />
              </Field>
              <Field label={t.repository}>
                <Input
                  name="repository"
                  defaultValue={String(editing.repository ?? "")}
                  placeholder="owner/repository"
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.branch}>
                  <Input
                    name="branch"
                    defaultValue={String(editing.branch ?? "main")}
                  />
                </Field>
                <Field label={t.targetProject}>
                  <SelectField
                    name="projectId"
                    defaultValue={String(editing.projectId ?? "")}
                  >
                    <option value="">—</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
              </div>
              <Field label={t.pathPattern}>
                <Input
                  name="pathPattern"
                  defaultValue={String(editing.pathPattern ?? "sql/**/*.sql")}
                />
              </Field>
              <ModalActions busy={busy} t={t} onClose={close} />
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void confirmAction();
              }}
            >
              {busy ? "…" : confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function DetailSurface({
  mode,
  onModeChange,
  canGoBack,
  onBack,
  onClose,
  locale,
  children,
}: {
  mode: DetailMode;
  onModeChange: (mode: DetailMode) => void;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  locale: "zh" | "en";
  children: ReactNode;
}) {
  const toolbar = (
    <div
      className={`flex h-11 shrink-0 items-center border-b px-3 ${mode === "full" ? "" : "pr-14"}`}
    >
      {canGoBack ? (
        <IconButton label={locale === "zh" ? "返回" : "Back"} onClick={onBack}>
          <ArrowLeft />
        </IconButton>
      ) : (
        <span className="size-9" />
      )}
      <div className="ml-auto flex items-center rounded-lg bg-muted/70 p-0.5">
        <IconButton
          label={locale === "zh" ? "侧边预览" : "Side peek"}
          active={mode === "side"}
          onClick={() => onModeChange("side")}
        >
          <PanelRight />
        </IconButton>
        <IconButton
          label={locale === "zh" ? "居中预览" : "Center peek"}
          active={mode === "center"}
          onClick={() => onModeChange("center")}
        >
          <AppWindow />
        </IconButton>
        <IconButton
          label={locale === "zh" ? "全页打开" : "Full page"}
          active={mode === "full"}
          onClick={() => onModeChange("full")}
        >
          <Maximize2 />
        </IconButton>
      </div>
      {mode === "full" && (
        <IconButton
          label={locale === "zh" ? "关闭" : "Close"}
          onClick={onClose}
        >
          <X />
        </IconButton>
      )}
    </div>
  );
  const content = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
  if (mode === "side")
    return (
      <Sheet
        open
        onOpenChange={(value) => {
          if (!value) onClose();
        }}
      >
        <SheetContent size="detail" className="p-0">
          <SheetTitle className="sr-only">Drifty</SheetTitle>
          <SheetDescription className="sr-only">Detail</SheetDescription>
          {toolbar}
          {content}
        </SheetContent>
      </Sheet>
    );
  if (mode === "center")
    return (
      <Dialog
        open
        onOpenChange={(value) => {
          if (!value) onClose();
        }}
      >
        <DialogContent size="detail" className="flex h-[86svh] min-h-0 flex-col gap-0 overflow-hidden rounded-2xl p-0">
          <DialogTitle className="sr-only">Drifty</DialogTitle>
          <DialogDescription className="sr-only">Detail</DialogDescription>
          {toolbar}
          {content}
        </DialogContent>
      </Dialog>
    );
  return (
    <div className="flex h-[calc(100svh-5.5rem)] min-h-0 flex-col overflow-hidden rounded-xl border bg-background">
      {toolbar}
      {content}
    </div>
  );
}

function SchemaExplorerView({
  query,
  setQuery,
  totalTables,
  totalFields,
  projects,
  environments,
  versions,
  projectId,
  versionId,
  environmentId,
  setVersionId,
  locale,
  call,
  toast,
  onCompare,
  onSelectTable,
  onSelectField,
}: {
  query: string;
  setQuery: (value: string) => void;
  totalTables: number;
  totalFields: number;
  projects: Project[];
  environments: Environment[];
  versions: Version[];
  projectId: string;
  versionId: string;
  environmentId: string;
  setVersionId: (value: string) => void;
  locale: "zh" | "en";
  call: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
  onCompare: (focus?: CompareFocus) => void;
  onSelectTable: (table: TableItem) => void;
  onSelectField: (field: FieldItem, scopes: Scope[]) => void;
}) {
  const [entity, setEntity] = useState<
    "table" | "field" | "index" | "constraint"
  >("table");
  const [lifecycleStatus, setLifecycleStatus] = useState<"all" | "active" | "deprecated" | "removed">("active");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(projectId ? projectId.split(",").filter(Boolean) : []);
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<string[]>(environmentId ? environmentId.split(",").filter(Boolean) : []);
  const activeProjectId = selectedProjectIds.join(",");
  const activeEnvironmentId = selectedEnvironmentIds.join(",");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Tabs
          value={entity}
          onValueChange={(value) => setEntity(value as typeof entity)}
        >
          <TabsList className="h-8">
            <TabsTrigger value="table" className="h-7 gap-1.5 px-3 text-xs">
              <Table2 className="size-3.5" />
              {locale === "zh" ? "数据表" : "Tables"}
              <span className="text-[10px] text-muted-foreground">
                {totalTables}
              </span>
            </TabsTrigger>
            <TabsTrigger value="field" className="h-7 gap-1.5 px-3 text-xs">
              <Database className="size-3.5" />
              {locale === "zh" ? "字段" : "Fields"}
              <span className="text-[10px] text-muted-foreground">
                {totalFields}
              </span>
            </TabsTrigger>
            <TabsTrigger value="index" className="h-7 gap-1.5 px-3 text-xs">
              <Network className="size-3.5" />
              {locale === "zh" ? "索引" : "Indexes"}
            </TabsTrigger>
            <TabsTrigger
              value="constraint"
              className="h-7 gap-1.5 px-3 text-xs"
            >
              <Shield className="size-3.5" />
              {locale === "zh" ? "约束" : "Constraints"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => onCompare()}
        >
          <ArrowLeftRight />
          {locale === "zh" ? "范围对比" : "Compare scopes"}
        </Button>
      </div>
      {entity === "table" ? (
        <TableExplorerView
          query={query}
          setQuery={setQuery}
          totalTables={totalTables}
          projects={projects}
          environments={environments}
          versions={versions}
          projectId={activeProjectId}
          versionId={versionId}
          environmentId={activeEnvironmentId}
          setProjectId={(value) => setSelectedProjectIds(value.split(",").filter(Boolean))}
          setVersionId={setVersionId}
          setEnvironmentId={(value) => setSelectedEnvironmentIds(value.split(",").filter(Boolean))}
          locale={locale}
          onCompare={onCompare}
          onSelectTable={onSelectTable}
          lifecycleStatus={lifecycleStatus}
          setLifecycleStatus={(value) => setLifecycleStatus(value as typeof lifecycleStatus)}
          call={call}
          toast={toast}
        />
      ) : entity === "field" ? (
        <ExplorerView
          query={query}
          setQuery={setQuery}
          totalFields={totalFields}
          projects={projects}
          environments={environments}
          versions={versions}
          projectId={activeProjectId}
          versionId={versionId}
          environmentId={activeEnvironmentId}
          setProjectId={(value) => setSelectedProjectIds(value.split(",").filter(Boolean))}
          setVersionId={setVersionId}
          setEnvironmentId={(value) => setSelectedEnvironmentIds(value.split(",").filter(Boolean))}
          locale={locale}
          onCompare={onCompare}
          onSelectField={onSelectField}
          lifecycleStatus={lifecycleStatus}
          setLifecycleStatus={(value) => setLifecycleStatus(value as typeof lifecycleStatus)}
          call={call}
          toast={toast}
        />
      ) : (
        <ObjectExplorerView
          query={query}
          setQuery={setQuery}
          entity={entity}
          projectId={activeProjectId}
          versionId={versionId}
          environmentId={activeEnvironmentId}
          locale={locale}
          lifecycleStatus={lifecycleStatus}
          setLifecycleStatus={(value) => setLifecycleStatus(value as typeof lifecycleStatus)}
          call={call}
          toast={toast}
        />
      )}
    </div>
  );
}

function ObjectExplorerView({
  query,
  setQuery,
  entity,
  projectId,
  versionId,
  environmentId,
  locale,
  lifecycleStatus,
  setLifecycleStatus,
  call,
  toast,
}: {
  query: string;
  setQuery: (value: string) => void;
  entity: "index" | "constraint";
  projectId: string;
  versionId: string;
  environmentId: string;
  locale: "zh" | "en";
  lifecycleStatus: "all" | "active" | "deprecated" | "removed";
  setLifecycleStatus: (value: "all" | "active" | "deprecated" | "removed") => void;
  call: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
}) {
  const [items, setItems] = useState<SearchObject[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const selectedProjectIds = projectId.split(",").filter(Boolean);
  const search = useCallback(
    async (nextOffset = 0) => {
      if (!query.trim()) {
        setItems([]);
        setTotal(0);
        setHasMore(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(
          `/api/catalog?mode=search&entity=${entity}&lifecycleStatus=${lifecycleStatus}&projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(versionId)}&environmentId=${encodeURIComponent(environmentId)}&q=${encodeURIComponent(query.trim())}&limit=20&offset=${nextOffset}`,
        );
        const result = (await response.json()) as {
          items: SearchObject[];
          total: number;
          hasMore: boolean;
        };
        setItems(
          nextOffset
            ? (current) => [...current, ...result.items]
            : result.items,
        );
        setTotal(result.total);
        setHasMore(result.hasMore);
        setOffset(nextOffset + result.items.length);
      } finally {
        setLoading(false);
      }
    },
    [entity, lifecycleStatus, projectId, versionId, environmentId, query],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void search(), 180);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const target = loadMoreRef.current;
    const root = resultsScrollRef.current;
    if (!target || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMoreRef.current) {
          loadingMoreRef.current = true;
          void search(offset).finally(() => {
            loadingMoreRef.current = false;
          });
        }
      },
      { root, rootMargin: "0px 0px 80px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, offset, search]);
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="border-b p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 rounded-xl border-0 bg-muted/70 pl-10 pr-4 text-sm shadow-none focus-visible:ring-1"
            placeholder={
              entity === "index"
                ? locale === "zh"
                  ? "搜索索引名、表名或字段"
                  : "Search index, table, or column"
                : locale === "zh"
                  ? "搜索约束名、表名或定义"
                  : "Search constraint, table, or definition"
            }
          />
        </div>
        <SelectField
          value={lifecycleStatus}
          onValueChange={(value) => setLifecycleStatus(value as typeof lifecycleStatus)}
          className="mt-2 w-full"
          aria-label={locale === "zh" ? "对象状态" : "Object status"}
        >
          <option value="all">{locale === "zh" ? "全部状态" : "All status"}</option>
          <option value="active">{locale === "zh" ? "正常" : "Active"}</option>
          <option value="deprecated">{locale === "zh" ? "废弃" : "Deprecated"}</option>
          <option value="removed">{locale === "zh" ? "已移除" : "Removed"}</option>
        </SelectField>
      </div>
      <div className="min-h-[420px]">
        {!query.trim() ? (
          <div className="grid min-h-[420px] place-items-center text-xs text-muted-foreground">
            {locale === "zh" ? "输入关键词开始搜索" : "Enter a search term"}
          </div>
        ) : loading && !items.length ? (
          <div className="grid min-h-[420px] place-items-center text-xs text-muted-foreground">
            {locale === "zh" ? "正在查找…" : "Searching…"}
          </div>
        ) : items.length ? (
          <div ref={resultsScrollRef} className="max-h-[60vh] overflow-y-auto overscroll-contain">
            <div className="divide-y">
            <div className="flex justify-between px-4 py-2 text-[10px] text-muted-foreground">
              <span>
                {locale === "zh" ? `找到 ${total} 项` : `${total} results`}
              </span>
              <span>
                {locale === "zh"
                  ? `已加载 ${items.length}`
                  : `${items.length} loaded`}
              </span>
            </div>
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted">
                  {entity === "index" ? (
                    <Network className="size-3.5" />
                  ) : (
                    <Shield className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <code className="block truncate text-xs font-semibold">
                    {item.name}
                  </code>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {item.tableName} ·{" "}
                    {entity === "index"
                      ? `${item.kind} · ${(JSON.parse(item.columnsJson ?? "[]") as string[]).join(", ")}`
                      : item.definition}
                  </span>
                </span>
                <Badge variant={item.lifecycleStatus === "deprecated" ? "outline" : item.lifecycleStatus === "removed" ? "destructive" : "secondary"} className="text-[10px]">
                  {item.lifecycleStatus === "deprecated" ? (locale === "zh" ? "废弃" : "Deprecated") : item.lifecycleStatus === "removed" ? (locale === "zh" ? "已移除" : "Removed") : (locale === "zh" ? "正常" : "Active")}
                </Badge>
                <Button type="button" variant="ghost" size="sm" disabled={selectedProjectIds.length !== 1} className="shrink-0 justify-start text-muted-foreground" onClick={() => { const nextStatus = item.lifecycleStatus === "active" ? "deprecated" : item.lifecycleStatus === "deprecated" ? "removed" : "active"; void call("lifecycle.set", { entity, id: item.id, projectId: selectedProjectIds[0], status: nextStatus }).then(() => { setItems((current) => lifecycleStatus !== "all" && nextStatus !== lifecycleStatus ? current.filter((entry) => entry.id !== item.id) : current.map((entry) => entry.id === item.id ? { ...entry, lifecycleStatus: nextStatus } : entry)); toast(locale === "zh" ? "状态已更新" : "Status updated"); }); }}>
                  {item.lifecycleStatus === "active" ? (locale === "zh" ? "废弃" : "Deprecate") : item.lifecycleStatus === "deprecated" ? (locale === "zh" ? "移除" : "Remove") : (locale === "zh" ? "恢复" : "Restore")}
                </Button>
                <Badge variant="outline" className="text-[10px]">
                  {item.kind}
                </Badge>
              </div>
            ))}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center p-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void search(offset)}
                  disabled={loading}
                >
                  {loading ? "…" : locale === "zh" ? "更多" : "More"}
                  <ChevronDown />
                </Button>
              </div>
            )}
            </div>
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center text-xs text-muted-foreground">
            {locale === "zh" ? "没有找到匹配对象" : "No matching objects"}
          </div>
        )}
      </div>
    </Card>
  );
}

function ScopeCoverage({
  projectId,
  versionId,
  environmentId,
  environments,
  versions,
  scopes,
  locale,
}: {
  projectId: string;
  versionId: string;
  environmentId: string;
  environments: Environment[];
  versions: Version[];
  scopes: Array<{ projectId: string; versionId: string; environmentId: string; state: string }>;
  locale: "zh" | "en";
}) {
  const selectedProjectIds = projectId.split(",").filter(Boolean);
  const selectedEnvironmentIds = environmentId.split(",").filter(Boolean);
  const [open, setOpen] = useState(false);
  const matchingEnvironments = environments.filter(
    (environment) =>
      (!selectedProjectIds.length || selectedProjectIds.includes(environment.projectId)) &&
      (!versionId || !environment.versionId || environment.versionId === versionId) &&
      (!selectedEnvironmentIds.length || selectedEnvironmentIds.includes(environment.id)),
  );
  const presence = matchingEnvironments.map((environment) => {
    const present = scopes.some(
      (scope) =>
        scope.environmentId === environment.id &&
        (!selectedProjectIds.length || selectedProjectIds.includes(scope.projectId)) &&
        (!versionId || scope.versionId === versionId) &&
        scope.state === "present",
    );
    const version = versions.find((item) => item.id === (environment.versionId || versionId));
    return { environment, version, present };
  });
  const projectCount = new Set(scopes.map((scope) => scope.projectId)).size;
  const environmentCount = new Set(scopes.map((scope) => scope.environmentId)).size;
  const presentCount = presence.filter((item) => item.present).length;
  const visiblePresence = presence.slice(0, 6);
  const missingCount = Math.max(0, presence.length - presentCount);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex min-w-0 max-w-[220px] items-center gap-2 rounded-md px-1.5 py-1 text-left text-[10px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={locale === "zh" ? "查看环境覆盖" : "View environment coverage"}
        >
          <span className="shrink-0 tabular-nums">{presence.length ? `${presentCount}/${presence.length}` : (locale === "zh" ? `${environmentCount} 个环境` : `${environmentCount} envs`)}</span>
          <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
            {visiblePresence.map(({ environment, present }) => (
              <span key={environment.id} className={`size-1.5 rounded-full ${present ? "bg-emerald-500" : "bg-muted-foreground/25"}`} />
            ))}
            {presence.length > visiblePresence.length && <span className="ml-0.5 text-[9px]">+</span>}
          </span>
          <span className="truncate">{presence.length ? (locale === "zh" ? "覆盖" : "coverage") : (locale === "zh" ? `${projectCount} 个项目` : `${projectCount} projects`)}</span>
        </button>
      </DialogTrigger>
      <DialogContent size="data" className="flex h-[min(72svh,680px)] min-h-0 flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-base">{locale === "zh" ? "环境覆盖" : "Environment coverage"}</DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            {presence.length
              ? (locale === "zh" ? `已覆盖 ${presentCount} 个环境，缺少 ${missingCount} 个环境` : `${presentCount} environments present, ${missingCount} missing`)
              : (locale === "zh" ? "当前对象还没有登记环境范围" : "This object has no registered environment scope")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]">
          {presence.length ? (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[minmax(0,1fr)_88px_84px] gap-3 border-b bg-muted/40 px-4 py-2 text-left text-[10px] font-medium text-muted-foreground sm:grid-cols-[minmax(240px,1fr)_120px_112px] sm:gap-4">
                <span>{locale === "zh" ? "环境" : "Environment"}</span>
                <span>{locale === "zh" ? "版本" : "Version"}</span>
                <span>{locale === "zh" ? "状态" : "Status"}</span>
              </div>
              <div className="divide-y">
                {presence.map(({ environment, version, present }) => (
                  <div key={environment.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_88px_84px] items-center gap-3 px-4 py-3 text-left text-xs sm:grid-cols-[minmax(240px,1fr)_120px_112px] sm:gap-4">
                    <div className="min-w-0">
                      <span className="block truncate font-medium">{environment.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{environment.projectName}</span>
                    </div>
                    <span className="truncate text-muted-foreground">{version?.name ?? (locale === "zh" ? "未绑定版本" : "No version")}</span>
                    <span className={`inline-flex items-center justify-start gap-1.5 whitespace-nowrap ${present ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {present ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5 opacity-60" />}
                      {present ? (locale === "zh" ? "存在" : "Present") : (locale === "zh" ? "不存在" : "Missing")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
              {locale === "zh" ? `${projectCount} 个项目 · ${environmentCount} 个环境范围` : `${projectCount} projects · ${environmentCount} environment scopes`}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TableExplorerView({
  query,
  setQuery,
  totalTables,
  projects,
  environments,
  versions,
  projectId,
  versionId,
  environmentId,
  setProjectId,
  setVersionId,
  setEnvironmentId,
  locale,
  onCompare,
  onSelectTable,
  lifecycleStatus,
  setLifecycleStatus,
  call,
  toast,
}: {
  query: string;
  setQuery: (value: string) => void;
  totalTables: number;
  projects: Project[];
  environments: Environment[];
  versions: Version[];
  projectId: string;
  versionId: string;
  environmentId: string;
  setProjectId: (value: string) => void;
  setVersionId: (value: string) => void;
  setEnvironmentId: (value: string) => void;
  locale: "zh" | "en";
  onCompare: (focus: CompareFocus) => void;
  onSelectTable: (table: TableItem) => void;
  lifecycleStatus: "all" | "active" | "deprecated" | "removed";
  setLifecycleStatus: (value: "all" | "active" | "deprecated" | "removed") => void;
  call: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
}) {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [tableScopes, setTableScopes] = useState<TableScope[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resolvedKey, setResolvedKey] = useState("");
  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const selectedProjectIds = projectId.split(",").filter(Boolean);
  const selectedEnvironmentIds = environmentId.split(",").filter(Boolean);
  const availableVersions = versions.filter(
    (item) => !selectedProjectIds.length || selectedProjectIds.includes(item.projectId),
  );
  const availableEnvironments = environments.filter(
    (item) =>
      (!selectedProjectIds.length || selectedProjectIds.includes(item.projectId)) &&
      (!versionId || item.versionId === versionId),
  );
  const chooseProjects = (ids: string[]) => {
    setProjectId(ids.join(","));
    setVersionId("");
    setEnvironmentId("");
  };
  const chooseVersion = (id: string) => {
    setVersionId(id);
    setEnvironmentId("");
  };
  const updateTableStatus = (table: TableItem, projectIds: string[], status: "active" | "deprecated" | "removed") => {
    if (projectIds.length !== 1) {
      toast(locale === "zh" ? "请先只选择一个项目" : "Select exactly one project first");
      return;
    }
    void call("lifecycle.set", { entity: "table", id: table.id, projectId: projectIds[0], status }).then(() => {
      setTables((current) => lifecycleStatus !== "all" && status !== lifecycleStatus ? current.filter((entry) => entry.id !== table.id) : current.map((entry) => entry.id === table.id ? { ...entry, lifecycleStatus: status } : entry));
      toast(locale === "zh" ? "表及关联对象状态已更新" : "Table and related object statuses updated");
    });
  };
  const searchKey = `${query.trim()}|${projectId}|${versionId}|${environmentId}|${lifecycleStatus}|table`;
  const searching = Boolean(query.trim() || projectId || versionId || environmentId) && resolvedKey !== searchKey;
  const searchParams = useCallback(
    (offset = 0) => {
      const params = new URLSearchParams({
        mode: "search",
        entity: "table",
        q: query.trim(),
        limit: "20",
        offset: String(offset),
      });
      if (projectId) params.set("projectId", projectId);
      if (versionId) params.set("versionId", versionId);
      if (environmentId) params.set("environmentId", environmentId);
      if (lifecycleStatus !== "all") params.set("lifecycleStatus", lifecycleStatus);
      return params;
    },
    [query, projectId, versionId, environmentId, lifecycleStatus],
  );
  useEffect(() => {
    const active = Boolean(query.trim() || projectId || versionId || environmentId);
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog?${searchParams()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search");
        const result = (await response.json()) as {
          tables: TableItem[];
          tableScopes: TableScope[];
          total: number;
          hasMore: boolean;
        };
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setTables(result.tables);
        setTableScopes(result.tableScopes);
        setResultTotal(result.total);
        setHasMore(result.hasMore);
        setResolvedKey(searchKey);
        requestAnimationFrame(() =>
          resultsScrollRef.current?.scrollTo({ top: 0 }),
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setTables([]);
          setTableScopes([]);
          setResultTotal(0);
          setHasMore(false);
          setResolvedKey(searchKey);
        }
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, projectId, versionId, environmentId, lifecycleStatus, searchKey, searchParams]);
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || resolvedKey !== searchKey) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/catalog?${searchParams(tables.length)}`,
      );
      if (!response.ok) throw new Error("search");
      const result = (await response.json()) as {
        tables: TableItem[];
        tableScopes: TableScope[];
        total: number;
        hasMore: boolean;
      };
      setTables((current) => [
        ...current,
        ...result.tables.filter(
          (table) => !current.some((existing) => existing.id === table.id),
        ),
      ]);
      setTableScopes((current) => [
        ...current,
        ...result.tableScopes.filter(
          (scope) =>
            !current.some(
              (existing) =>
                existing.tableId === scope.tableId &&
                existing.versionId === scope.versionId &&
                existing.environmentId === scope.environmentId,
            ),
        ),
      ]);
      setResultTotal(result.total);
      setHasMore(result.hasMore);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, resolvedKey, searchKey, searchParams, tables.length]);
  useEffect(() => {
    const target = loadMoreRef.current,
      root = resultsScrollRef.current;
    if (!target || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root, rootMargin: "0px 0px 80px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);
  return (
    <div className="space-y-4">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 rounded-xl border-0 bg-muted/70 pl-10 pr-4 text-sm shadow-none focus-visible:ring-1"
              placeholder={
                locale === "zh"
                  ? "输入 customer、表编码、模块或表说明"
                  : "Search table, code, module, or description"
              }
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <ProjectPicker projects={projects} selected={selectedProjectIds} onChange={chooseProjects} locale={locale} />
            <SelectField
              value={versionId}
              onValueChange={chooseVersion}
              disabled={selectedProjectIds.length !== 1}
            >
              <option value="">
                {locale === "zh" ? "所有版本" : "All versions"}
              </option>
              {availableVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name}
                </option>
              ))}
            </SelectField>
            <ScopePicker envs={availableEnvironments} selected={selectedEnvironmentIds} onChange={(ids) => setEnvironmentId(ids.join(","))} t={locale === "zh" ? words.zh : words.en} />
            <SelectField
              value={lifecycleStatus}
              onValueChange={(value) => setLifecycleStatus(value as typeof lifecycleStatus)}
              aria-label={locale === "zh" ? "表状态" : "Table status"}
            >
              <option value="all">{locale === "zh" ? "全部状态" : "All status"}</option>
              <option value="active">{locale === "zh" ? "正常" : "Active"}</option>
              <option value="deprecated">{locale === "zh" ? "废弃" : "Deprecated"}</option>
              <option value="removed">{locale === "zh" ? "已移除" : "Removed"}</option>
            </SelectField>
          </div>
        </div>
        <div className="min-h-[420px]">
          {!query.trim() && !projectId && !versionId && !environmentId ? (
            <div className="grid min-h-[420px] place-items-center px-6 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted">
                  <Table2 className="size-4 text-muted-foreground" />
                </span>
                <p className="mt-4 text-sm font-medium">
                  {locale === "zh" ? "从一张表开始" : "Start with a table"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {locale === "zh"
                    ? `按表名、编码、模块或说明搜索；共 ${totalTables} 张表。`
                    : `Search ${totalTables} tables by name, code, module, or description.`}
                </p>
              </div>
            </div>
          ) : searching ? (
            <div className="grid min-h-[420px] place-items-center text-xs text-muted-foreground">
              {locale === "zh" ? "正在查找…" : "Searching…"}
            </div>
          ) : tables.length ? (
            <div
              ref={resultsScrollRef}
              className="min-h-[420px] max-h-[60vh] overflow-y-auto overscroll-contain"
            >
              <div className="divide-y">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-2 text-[10px] text-muted-foreground backdrop-blur-sm">
                  <span>
                    {locale === "zh"
                      ? `找到 ${resultTotal} 张表`
                      : `${resultTotal} tables found`}
                  </span>
                  <span>
                    {locale === "zh"
                      ? `已加载 ${tables.length}`
                      : `${tables.length} loaded`}
                  </span>
                </div>
                {tables.map((table) => {
                  const scopes = tableScopes.filter(
                    (scope) => scope.tableId === table.id,
                  );
                  const lifecycleProjectIds = selectedProjectIds.length === 1
                    ? selectedProjectIds
                    : Array.from(new Set(scopes.map((scope) => scope.projectId)));
                  return (
                    <div
                      key={table.id}
                      className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-x-3 px-3 py-1.5 text-left transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_116px_220px_72px_72px]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTable(table)}
                        className="min-w-0 rounded-lg px-1 py-2 text-left"
                      >
                        <span className="min-w-0">
                          <code className="block truncate text-xs font-semibold">{table.name}</code>
                          <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                            {table.comment ||
                              table.moduleName ||
                              (locale === "zh"
                                ? "暂无说明"
                                : "No description")}{" "}
                            ·{" "}
                            {locale === "zh"
                              ? `${table.fieldCount} 个字段`
                              : `${table.fieldCount} fields`}
                          </span>
                        </span>
                      </button>
                      <code className="hidden truncate rounded-md bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground md:block">{table.code}</code>
                      <ScopeCoverage projectId={projectId} versionId={versionId} environmentId={environmentId} environments={environments} versions={versions} scopes={scopes} locale={locale} />
                      <LifecycleMenu status={table.lifecycleStatus ?? "active"} locale={locale} disabled={lifecycleProjectIds.length !== 1} onChange={(status) => updateTableStatus(table, lifecycleProjectIds, status)} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 justify-start text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          onCompare({
                            kind: "table",
                            id: table.id,
                            name: table.name,
                          })
                        }
                      >
                        <ArrowLeftRight />
                        {locale === "zh" ? "差异" : "Diff"}
                      </Button>
                    </div>
                  );
                })}
                {hasMore && (
                  <div ref={loadMoreRef} className="flex justify-center p-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loadingMore}
                      onClick={() => void loadMore()}
                    >
                      {loadingMore
                        ? "…"
                        : locale === "zh"
                          ? `更多 · 还有 ${Math.max(0, resultTotal - tables.length)}`
                          : `More · ${Math.max(0, resultTotal - tables.length)} left`}
                      <ChevronDown />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[420px] place-items-center px-6 text-center text-xs text-muted-foreground">
              {locale === "zh"
                ? "没有找到符合当前范围的数据表"
                : "No table matches this scope"}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ExplorerView({
  query,
  setQuery,
  totalFields,
  projects,
  environments,
  versions,
  projectId,
  versionId,
  environmentId,
  setProjectId,
  setVersionId,
  setEnvironmentId,
  locale,
  onCompare,
  onSelectField,
  lifecycleStatus,
  setLifecycleStatus,
  call,
  toast,
}: {
  query: string;
  setQuery: (value: string) => void;
  totalFields: number;
  projects: Project[];
  environments: Environment[];
  versions: Version[];
  projectId: string;
  versionId: string;
  environmentId: string;
  setProjectId: (value: string) => void;
  setVersionId: (value: string) => void;
  setEnvironmentId: (value: string) => void;
  locale: "zh" | "en";
  onCompare: (focus: CompareFocus) => void;
  onSelectField: (field: FieldItem, scopes: Scope[]) => void;
  lifecycleStatus: "all" | "active" | "deprecated" | "removed";
  setLifecycleStatus: (value: "all" | "active" | "deprecated" | "removed") => void;
  call: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
}) {
  const [fields, setFields] = useState<FieldItem[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resolvedKey, setResolvedKey] = useState("");
  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const selectedProjectIds = projectId.split(",").filter(Boolean);
  const selectedEnvironmentIds = environmentId.split(",").filter(Boolean);
  const availableVersions = versions.filter(
    (item) => !selectedProjectIds.length || selectedProjectIds.includes(item.projectId),
  );
  const availableEnvironments = environments.filter(
    (item) =>
      (!selectedProjectIds.length || selectedProjectIds.includes(item.projectId)) &&
      (!versionId || item.versionId === versionId),
  );
  const chooseProjects = (ids: string[]) => {
    setProjectId(ids.join(","));
    setVersionId("");
    setEnvironmentId("");
  };
  const chooseVersion = (id: string) => {
    setVersionId(id);
    setEnvironmentId("");
  };
  const searchKey = `${query.trim()}|${projectId}|${versionId}|${environmentId}|${lifecycleStatus}`;
  const searching = Boolean(query.trim() || projectId || versionId || environmentId) && resolvedKey !== searchKey;
  const searchParams = useCallback(
    (offset = 0) => {
      const params = new URLSearchParams({
        mode: "search",
        q: query.trim(),
        limit: "20",
        offset: String(offset),
      });
      if (projectId) params.set("projectId", projectId);
      if (versionId) params.set("versionId", versionId);
      if (environmentId) params.set("environmentId", environmentId);
      if (lifecycleStatus !== "all") params.set("lifecycleStatus", lifecycleStatus);
      return params;
    },
    [query, projectId, versionId, environmentId, lifecycleStatus],
  );
  useEffect(() => {
    const active = Boolean(query.trim() || projectId || versionId || environmentId);
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog?${searchParams()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search");
        const result = (await response.json()) as {
          fields: FieldItem[];
          scopes: Scope[];
          total: number;
          hasMore: boolean;
        };
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setFields(result.fields);
        setScopes(result.scopes);
        setResultTotal(result.total);
        setHasMore(result.hasMore);
        setResolvedKey(searchKey);
        requestAnimationFrame(() =>
          resultsScrollRef.current?.scrollTo({ top: 0 }),
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setFields([]);
          setScopes([]);
          setResultTotal(0);
          setHasMore(false);
          setResolvedKey(searchKey);
        }
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, projectId, versionId, environmentId, lifecycleStatus, searchKey, searchParams]);
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || resolvedKey !== searchKey) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/catalog?${searchParams(fields.length)}`,
      );
      if (!response.ok) throw new Error("search");
      const result = (await response.json()) as {
        fields: FieldItem[];
        scopes: Scope[];
        total: number;
        hasMore: boolean;
      };
      setFields((current) => [
        ...current,
        ...result.fields.filter(
          (field) => !current.some((existing) => existing.id === field.id),
        ),
      ]);
      setScopes((current) => [
        ...current,
        ...result.scopes.filter(
          (scope) =>
            !current.some(
              (existing) =>
                existing.fieldId === scope.fieldId &&
                existing.versionId === scope.versionId &&
                existing.environmentId === scope.environmentId,
            ),
        ),
      ]);
      setResultTotal(result.total);
      setHasMore(result.hasMore);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fields.length, hasMore, resolvedKey, searchKey, searchParams]);
  useEffect(() => {
    const target = loadMoreRef.current;
    const root = resultsScrollRef.current;
    if (!target || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root, rootMargin: "0px 0px 80px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);
  return (
    <div className="space-y-4">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 rounded-xl border-0 bg-muted/70 pl-10 pr-4 text-sm shadow-none focus-visible:ring-1"
              placeholder={
                locale === "zh"
                  ? "输入 customer.level、字段编码或说明"
                  : "Search customer.level, code, or description"
              }
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <ProjectPicker projects={projects} selected={selectedProjectIds} onChange={chooseProjects} locale={locale} />
            <SelectField
              value={versionId}
              onValueChange={chooseVersion}
              disabled={selectedProjectIds.length !== 1}
              aria-label={locale === "zh" ? "版本" : "Version"}
            >
              <option value="">
                {locale === "zh" ? "所有版本" : "All versions"}
              </option>
              {availableVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name}
                </option>
              ))}
            </SelectField>
            <ScopePicker
              envs={availableEnvironments}
              selected={selectedEnvironmentIds}
              onChange={(ids) => setEnvironmentId(ids.join(","))}
              t={locale === "zh" ? words.zh : words.en}
            />
            <SelectField
              value={lifecycleStatus}
              onValueChange={(value) => setLifecycleStatus(value as typeof lifecycleStatus)}
              aria-label={locale === "zh" ? "字段状态" : "Field status"}
            >
              <option value="all">{locale === "zh" ? "全部状态" : "All status"}</option>
              <option value="active">{locale === "zh" ? "正常" : "Active"}</option>
              <option value="deprecated">{locale === "zh" ? "废弃" : "Deprecated"}</option>
              <option value="removed">{locale === "zh" ? "已移除" : "Removed"}</option>
            </SelectField>
          </div>
        </div>
        <div className="min-h-[420px]">
          {!query.trim() && !projectId && !versionId && !environmentId ? (
            <div className="grid min-h-[420px] place-items-center px-6 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted">
                  <Search className="size-4 text-muted-foreground" />
                </span>
                <p className="mt-4 text-sm font-medium">
                  {locale === "zh" ? "从一个字段开始" : "Start with a field"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {locale === "zh"
                    ? `按字段名、表名、编码或说明搜索；共 ${totalFields} 个字段，只有搜索后才加载结果。`
                    : `Search by field, table, code, or description. ${totalFields} fields stay hidden until needed.`}
                </p>
              </div>
            </div>
          ) : searching ? (
            <div className="grid min-h-[420px] place-items-center text-xs text-muted-foreground">
              {locale === "zh" ? "正在查找…" : "Searching…"}
            </div>
          ) : fields.length ? (
            <div
              ref={resultsScrollRef}
              className="min-h-[420px] max-h-[60vh] overflow-y-auto overscroll-contain"
            >
              <div className="divide-y">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-2 text-[10px] text-muted-foreground backdrop-blur-sm">
                  <span>
                    {locale === "zh"
                      ? `找到 ${resultTotal} 个字段`
                      : `${resultTotal} fields found`}
                  </span>
                  <span>
                    {locale === "zh"
                      ? `已加载 ${fields.length}`
                      : `${fields.length} loaded`}
                  </span>
                </div>
                {fields.map((field) => {
                  const fieldScopes = scopes.filter(
                    (scope) => scope.fieldId === field.id,
                  );
                  const lifecycleProjectIds = selectedProjectIds.length === 1
                    ? selectedProjectIds
                    : Array.from(new Set(fieldScopes.map((scope) => scope.projectId)));
                  return (
                    <div
                      key={field.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40 md:grid md:grid-cols-[minmax(0,1fr)_220px_64px_96px_64px]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectField(field, fieldScopes)}
                        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg px-1 py-2 text-left focus-visible:bg-muted/50 focus-visible:outline-none"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <code className="truncate text-xs font-semibold">
                              {field.tableName}.{field.name}
                            </code>
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px]"
                            >
                              {field.code}
                            </Badge>
                          </span>
                          <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                            {field.comment || field.dataType}
                            {field.comment ? ` · ${field.dataType}` : ""}
                          </span>
                        </span>
                        <span className="flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
                          <ArrowRight className="size-3.5" />
                        </span>
                      </button>
                      <ScopeCoverage projectId={projectId} versionId={versionId} environmentId={environmentId} environments={environments} versions={versions} scopes={fieldScopes} locale={locale} />
                      <Badge variant={field.lifecycleStatus === "deprecated" ? "outline" : field.lifecycleStatus === "removed" ? "destructive" : "secondary"} className="hidden shrink-0 text-[10px] sm:inline-flex">
                        {field.lifecycleStatus === "deprecated" ? (locale === "zh" ? "废弃" : "Deprecated") : field.lifecycleStatus === "removed" ? (locale === "zh" ? "已移除" : "Removed") : (locale === "zh" ? "正常" : "Active")}
                      </Badge>
                      <div className="hidden items-center justify-start md:flex">
                        <Button type="button" variant="ghost" size="sm" disabled={lifecycleProjectIds.length !== 1} className="justify-start px-1.5 text-muted-foreground" onClick={() => { const nextStatus = field.lifecycleStatus === "active" ? "deprecated" : field.lifecycleStatus === "deprecated" ? "removed" : "active"; void call("lifecycle.set", { entity: "field", id: field.id, projectId: lifecycleProjectIds[0], status: nextStatus }).then(() => { setFields((current) => lifecycleStatus !== "all" && nextStatus !== lifecycleStatus ? current.filter((entry) => entry.id !== field.id) : current.map((entry) => entry.id === field.id ? { ...entry, lifecycleStatus: nextStatus } : entry)); toast(locale === "zh" ? "状态已更新" : "Status updated"); }); }}>
                          {field.lifecycleStatus === "active" ? (locale === "zh" ? "废弃" : "Deprecate") : field.lifecycleStatus === "deprecated" ? (locale === "zh" ? "移除" : "Remove") : (locale === "zh" ? "恢复" : "Restore")}
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 justify-start text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          onCompare({
                            kind: "field",
                            id: field.id,
                            name: `${field.tableName}.${field.name}`,
                          })
                        }
                      >
                        <ArrowLeftRight />
                        {locale === "zh" ? "差异" : "Diff"}
                      </Button>
                    </div>
                  );
                })}
                {hasMore && (
                  <div ref={loadMoreRef} className="flex justify-center p-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loadingMore}
                      onClick={() => void loadMore()}
                    >
                      {loadingMore
                        ? "…"
                        : locale === "zh"
                          ? `更多 · 还有 ${Math.max(0, resultTotal - fields.length)}`
                          : `More · ${Math.max(0, resultTotal - fields.length)} left`}
                      <ChevronDown />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[420px] place-items-center px-6 text-center text-xs text-muted-foreground">
              {locale === "zh"
                ? "没有找到符合当前范围的字段"
                : "No field matches this scope"}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function TableDetail({
  insight,
  projects,
  environments,
  versions,
  locale,
  onLifecycleChange,
  onSelectField,
  onEdit,
  onDelete,
}: {
  insight: TableInsight;
  projects: Project[];
  environments: Environment[];
  versions: Version[];
  locale: "zh" | "en";
  onLifecycleChange: (projectId: string, status: "active" | "deprecated" | "removed") => Promise<void>;
  onSelectField: (field: FieldItem, scopes: Scope[]) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { table, fields, tableScopes, fieldScopes } = insight;
  const [fieldQuery, setFieldQuery] = useState("");
  const visibleFields = fields.filter((field) =>
    `${field.name} ${field.code} ${field.comment ?? ""} ${field.dataType}`
      .toLowerCase()
      .includes(fieldQuery.trim().toLowerCase()),
  );
  return (
    <>
      <SheetHeader>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-mono">{table.name}</SheetTitle>
            <SheetDescription>
              {table.comment ||
                (locale === "zh" ? "暂无表说明" : "No table description")}
            </SheetDescription>
          </div>
          <EntityMenu
            t={locale === "zh" ? words.zh : words.en}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
          {[
            [locale === "zh" ? "表编码" : "Table code", table.code],
            [
              locale === "zh" ? "所属模块" : "Module",
              table.moduleName ?? (locale === "zh" ? "未分类" : "Unclassified"),
            ],
            [locale === "zh" ? "字段数" : "Fields", String(table.fieldCount)],
          ].map(([label, value]) => (
            <div key={label} className="bg-background p-3">
              <span className="block text-[10px] text-muted-foreground">
                {label}
              </span>
              <span className="mt-1 block truncate text-xs">{value}</span>
            </div>
          ))}
        </div>
        <ProjectLifecycleControl
          className="mt-4"
          projects={projects}
          scopes={tableScopes}
          locale={locale}
          onChange={onLifecycleChange}
          cascade
        />
        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs font-semibold">
            {locale === "zh" ? "表存在性" : "Table presence"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {locale === "zh"
              ? "按项目 · 版本 · 环境"
              : "Project · version · environment"}
          </span>
        </div>
        <div className="mt-3 space-y-3">
          {projects.map((project) => {
            const projectVersions = versions.filter(
              (version) => version.projectId === project.id,
            );
            if (!projectVersions.length) return null;
            return (
              <div key={project.id} className="rounded-xl border">
                <div className="flex items-center gap-2 border-b px-4 py-3">
                  <span
                    className={`size-2 rounded-full ${project.kind === "platform" ? "bg-emerald-500" : "bg-foreground/30"}`}
                  />
                  <strong className="text-xs">{project.name}</strong>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {project.code}
                  </span>
                </div>
                <div className="divide-y">
                  {projectVersions.map((version) => {
                    const envs = environments.filter(
                      (env) =>
                        env.projectId === project.id &&
                        (!env.versionId || env.versionId === version.id),
                    );
                    return (
                      <div
                        key={version.id}
                        className="grid gap-3 px-4 py-3 sm:grid-cols-[90px_1fr]"
                      >
                        <code className="text-[11px] text-muted-foreground">
                          {version.name}
                        </code>
                        <div className="flex flex-wrap gap-2">
                          {envs.map((env) => {
                            const present = tableScopes.some(
                              (scope) =>
                                scope.versionId === version.id &&
                                scope.environmentId === env.id,
                            );
                            return (
                              <span
                                key={env.id}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${present ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "text-muted-foreground"}`}
                              >
                                {present ? (
                                  <CheckCircle2 className="size-3" />
                                ) : (
                                  <XCircle className="size-3" />
                                )}
                                {env.name}
                              </span>
                            );
                          })}
                          {!envs.length && (
                            <span className="text-[10px] text-muted-foreground">
                              {locale === "zh" ? "暂无环境" : "No environments"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {!!insight.indexes?.length && (
          <>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs font-semibold">
                {locale === "zh" ? "索引" : "Indexes"}
              </span>
              <Badge variant="secondary">{insight.indexes.length}</Badge>
            </div>
            <div className="mt-3 divide-y overflow-hidden rounded-xl border">
              {insight.indexes.map((index) => {
                const columns = JSON.parse(index.columnsJson) as string[];
                const presentCount = (insight.indexScopes ?? []).filter(
                  (scope) =>
                    scope.indexId === index.id && scope.state === "present",
                ).length;
                return (
                  <div
                    key={index.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Database className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <code className="block truncate text-xs font-medium">
                        {index.name}
                      </code>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {index.kind} · {columns.join(", ")}
                      </span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {presentCount}
                      {locale === "zh" ? " 个环境" : " envs"}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {!!insight.constraints?.length && (
          <>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs font-semibold">
                {locale === "zh" ? "约束" : "Constraints"}
              </span>
              <Badge variant="secondary">{insight.constraints.length}</Badge>
            </div>
            <div className="mt-3 divide-y overflow-hidden rounded-xl border">
              {insight.constraints.map((constraint) => {
                const presentCount = (insight.constraintScopes ?? []).filter(
                  (scope) =>
                    scope.constraintId === constraint.id &&
                    scope.state === "present",
                ).length;
                return (
                  <div key={constraint.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Shield className="size-3.5 shrink-0 text-muted-foreground" />
                      <code className="text-xs font-medium">
                        {constraint.name}
                      </code>
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {constraint.kind}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate pl-6 text-[10px] text-muted-foreground">
                      {constraint.definition}
                    </p>
                    <span className="mt-1 block pl-6 text-[10px] text-muted-foreground">
                      {presentCount}
                      {locale === "zh" ? " 个环境" : " envs"}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs font-semibold">
            {locale === "zh" ? "字段" : "Fields"}
          </span>
          <Badge variant="secondary">{fields.length}</Badge>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={fieldQuery}
            onChange={(event) => setFieldQuery(event.target.value)}
            className="h-9 pl-9 text-xs"
            placeholder={
              locale === "zh"
                ? "搜索字段、编码或说明"
                : "Search fields, codes, or descriptions"
            }
          />
        </div>
        <div className="mt-2 divide-y overflow-hidden rounded-xl border">
          {visibleFields.map((field) => (
            <button
              key={field.id}
              type="button"
              onClick={() =>
                onSelectField(
                  field,
                  fieldScopes.filter((scope) => scope.fieldId === field.id),
                )
              }
              className="grid w-full grid-cols-[16px_minmax(0,1fr)_auto_16px] items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
            >
              <Database className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <code className="block truncate text-xs font-medium">
                  {field.name}
                </code>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {field.comment || field.dataType}
                  {field.comment ? ` · ${field.dataType}` : ""}
                </span>
              </span>
              <code className="rounded-md bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground">
                {field.code}
              </code>
              <ArrowRight className="size-3.5 text-muted-foreground" />
            </button>
          ))}
          {!visibleFields.length && (
            <Empty
              text={
                fieldQuery
                  ? locale === "zh"
                    ? "没有匹配字段"
                    : "No matching fields"
                  : locale === "zh"
                    ? "这张表还没有字段"
                    : "No fields in this table"
              }
            />
          )}
        </div>
      </div>
    </>
  );
}

function FieldDetail({
  field,
  projects,
  environments,
  versions,
  scopes,
  tables,
  locale,
  onLifecycleChange,
  onEdit,
  onDelete,
}: {
  field: FieldItem;
  projects: Project[];
  environments: Environment[];
  versions: Version[];
  scopes: Scope[];
  tables: TableItem[];
  locale: "zh" | "en";
  onLifecycleChange: (projectId: string, status: "active" | "deprecated" | "removed") => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const table = tables.find((item) => item.id === field.tableId);
  const fieldScopes = scopes.filter((scope) => scope.fieldId === field.id);
  return (
    <>
      <SheetHeader>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-mono">
              {field.tableName}.{field.name}
            </SheetTitle>
            <SheetDescription>
              {field.comment ||
                (locale === "zh" ? "暂无字段说明" : "No field description")}
            </SheetDescription>
          </div>
          <EntityMenu
            t={locale === "zh" ? words.zh : words.en}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {[
            [locale === "zh" ? "字段编码" : "Field code", field.code],
            [locale === "zh" ? "数据类型" : "Data type", field.dataType],
            [
              locale === "zh" ? "允许空值" : "Nullable",
              field.nullable
                ? locale === "zh"
                  ? "是"
                  : "Yes"
                : locale === "zh"
                  ? "否"
                  : "No",
            ],
            [locale === "zh" ? "默认值" : "Default", field.defaultValue ?? "—"],
            [
              locale === "zh" ? "所属模块" : "Module",
              field.moduleName ?? (locale === "zh" ? "未分类" : "Unclassified"),
            ],
            [
              locale === "zh" ? "数据来源" : "Source",
              field.sourceKind === "upload"
                ? locale === "zh"
                  ? "上传"
                  : "Upload"
                : field.sourceKind === "paste"
                  ? locale === "zh"
                    ? "粘贴"
                    : "Paste"
                  : field.sourceKind === "manual"
                    ? locale === "zh"
                      ? "手动"
                      : "Manual"
                    : field.sourceKind,
            ],
          ].map(([label, value]) => (
            <div key={label} className="bg-background p-3">
              <span className="block text-[10px] text-muted-foreground">
                {label}
              </span>
              <span className="mt-1 block truncate text-xs">{value}</span>
            </div>
          ))}
        </div>
        <ProjectLifecycleControl
          className="mt-4"
          projects={projects}
          scopes={fieldScopes}
          locale={locale}
          onChange={onLifecycleChange}
        />
        <div className="mt-5 rounded-xl border p-4">
          <span className="text-[10px] text-muted-foreground">
            {locale === "zh" ? "表说明" : "Table description"}
          </span>
          <p className="mt-1 text-xs leading-5">
            {table?.comment ||
              (locale === "zh" ? "暂无表说明" : "No table description")}
          </p>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs font-semibold">
            {locale === "zh" ? "存在性" : "Presence"}
          </span>
          <span className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" />
              {locale === "zh" ? "存在" : "Present"}
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="size-3" />
              {locale === "zh" ? "未登记" : "Missing"}
            </span>
          </span>
        </div>
        <div className="mt-3 space-y-3">
          {projects.map((project) => {
            const projectVersions = versions.filter(
              (version) => version.projectId === project.id,
            );
            if (!projectVersions.length) return null;
            return (
              <div key={project.id} className="rounded-xl border">
                <div className="flex items-center gap-2 border-b px-4 py-3">
                  <span
                    className={`size-2 rounded-full ${project.kind === "platform" ? "bg-emerald-500" : "bg-foreground/30"}`}
                  />
                  <strong className="text-xs">{project.name}</strong>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {project.code}
                  </span>
                </div>
                <div className="divide-y">
                  {projectVersions.map((version) => {
                    const envs = environments.filter(
                      (env) =>
                        env.projectId === project.id &&
                        (!env.versionId || env.versionId === version.id),
                    );
                    return (
                      <div
                        key={version.id}
                        className="grid gap-3 px-4 py-3 sm:grid-cols-[90px_1fr]"
                      >
                        <code className="text-[11px] text-muted-foreground">
                          {version.name}
                        </code>
                        <div className="flex flex-wrap gap-2">
                          {envs.map((env) => {
                            const scope = fieldScopes.find(
                              (item) =>
                                item.versionId === version.id &&
                                item.environmentId === env.id,
                            );
                            const present = Boolean(scope);
                            return (
                              <span
                                key={env.id}
                                title={
                                  present && scope?.revisionDataType
                                    ? `${locale === "zh" ? "修订" : "Revision"} ${scope.revision} · ${scope.revisionDataType}`
                                    : undefined
                                }
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${present ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "text-muted-foreground"}`}
                              >
                                {present ? (
                                  <CheckCircle2 className="size-3" />
                                ) : (
                                  <XCircle className="size-3" />
                                )}
                                {env.name}
                                {present && scope?.revisionDataType && (
                                  <span className="font-mono opacity-70">
                                    r{scope.revision}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                          {!envs.length && (
                            <span className="text-[10px] text-muted-foreground">
                              {locale === "zh" ? "暂无环境" : "No environments"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ProjectsWorkspace({
  projects,
  projectVersions,
  projectEnvs,
  locale,
  open,
  remove,
  onSelect,
}: {
  projects: Project[];
  projectVersions: (id: string) => Version[];
  projectEnvs: (id: string) => Environment[];
  locale: "zh" | "en";
  open: (
    kind: Exclude<ModalKind, null>,
    record?: Record<string, unknown>,
  ) => void;
  remove: (entity: string, id: string) => Promise<void>;
  onSelect: (project: Project) => void;
}) {
  const [filter, setFilter] = useState("");
  const visible = projects.filter((project) =>
    `${project.name} ${project.code} ${project.description}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="h-9 pl-9 text-xs"
            placeholder={locale === "zh" ? "搜索项目" : "Search projects"}
          />
        </div>
        <Button type="button" size="sm" onClick={() => open("project")}>
          <Plus />
          {locale === "zh" ? "项目" : "Project"}
        </Button>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="divide-y p-0">
          {visible.map((project) => {
            const versions = projectVersions(project.id);
            const envs = projectEnvs(project.id);
            return (
              <div
                key={project.id}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 hover:bg-muted/35"
              >
                <button
                  type="button"
                  onClick={() => onSelect(project)}
                  className="grid min-w-0 gap-3 rounded-lg p-1 text-left outline-none focus-visible:ring-2 sm:grid-cols-[minmax(220px,1fr)_160px_minmax(240px,1.4fr)] sm:items-center"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <ProjectIcon name={project.icon} />
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-xs">
                        {project.name}
                      </strong>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {project.description || project.code}
                      </span>
                    </span>
                  </span>
                  <span className="text-left text-[11px] text-muted-foreground">
                    {locale === "zh"
                      ? `${versions.length} 个版本`
                      : `${versions.length} versions`}
                    <strong className="ml-2 font-mono font-medium text-foreground">
                      {versions[0]?.name ?? "—"}
                    </strong>
                  </span>
                  <span className="flex flex-wrap justify-start gap-1.5 text-left">
                    {envs.map((env) => (
                      <span
                        key={env.id}
                        className="rounded-full border bg-background px-2 py-1 text-[10px] text-muted-foreground"
                      >
                        {env.name} · {env.fieldCount}{" "}
                        {locale === "zh" ? "字段" : "fields"}
                      </span>
                    ))}
                  </span>
                </button>
                <div className="flex items-center">
                  <ArrowRight className="mr-1 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  <EntityMenu
                    t={locale === "zh" ? words.zh : words.en}
                    onEdit={() =>
                      open(
                        "project",
                        project as unknown as Record<string, unknown>,
                      )
                    }
                    onDelete={() => void remove("project", project.id)}
                  />
                </div>
              </div>
            );
          })}
          {!visible.length && (
            <Empty
              text={locale === "zh" ? "没有找到项目" : "No projects found"}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectDetail({
  project,
  tab,
  setTab,
  data,
  environments,
  locale,
  call,
  toast,
  open,
  remove,
  onSelectEnvironment,
  onSelectImport,
}: {
  project: Project;
  tab: "differences" | "history" | "environments";
  setTab: (tab: "differences" | "history" | "environments") => void;
  data: CatalogData;
  environments: Environment[];
  locale: "zh" | "en";
  call: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
  open: (
    kind: Exclude<ModalKind, null>,
    record?: Record<string, unknown>,
  ) => void;
  remove: (entity: string, id: string) => Promise<void>;
  onSelectEnvironment: (environment: Environment) => void;
  onSelectImport: (id: string) => void;
}) {
  const versions = data.versions.filter(
    (version) => version.projectId === project.id,
  );
  const envs = environments.filter((env) => env.projectId === project.id);
  const [insight, setInsight] = useState<ProjectInsight>({
    differences: [],
    imports: [],
  });
  const [loading, setLoading] = useState(true);
  const [historyQuery, setHistoryQuery] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/catalog?mode=project&projectId=${encodeURIComponent(project.id)}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error("project");
        return response.json() as Promise<ProjectInsight>;
      })
      .then(setInsight)
      .catch((error) => {
        if ((error as Error).name !== "AbortError")
          setInsight({ differences: [], imports: [] });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [project.id]);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [project.id, tab]);
  const differences = insight.differences;
  const imports = insight.imports;
  const normalizedHistoryQuery = historyQuery.trim().toLowerCase();
  const visibleImports = imports.filter((batch) =>
    `${batch.name} ${batch.code} ${batch.versionName} ${batch.moduleName ?? ""} ${batch.environmentNames ?? ""} ${batch.sourcePath ?? ""}`
      .toLowerCase()
      .includes(normalizedHistoryQuery),
  );
  const missingByEnvironment = (name: string) =>
    differences.filter((item) =>
      (item.missingEnvironments ?? "").split("|||").includes(name),
    ).length;
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
            <ProjectIcon name={project.icon} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{project.name}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {project.description || project.code}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setTab("differences")}
          >
            <ArrowLeftRight />
            {locale === "zh" ? "锚点对齐" : "Anchor sync"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              open("project", project as unknown as Record<string, unknown>)
            }
          >
            <Pencil />
            {locale === "zh" ? "编辑" : "Edit"}
          </Button>
        </div>
      </SheetHeader>
      <div className="border-b px-6 py-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            [versions.length, locale === "zh" ? "版本" : "Versions"],
            [envs.length, locale === "zh" ? "环境" : "Environments"],
            [project.tableCount, locale === "zh" ? "数据表" : "Tables"],
            [project.fieldCount, locale === "zh" ? "字段" : "Fields"],
          ].map(([value, label]) => (
            <div key={String(label)}>
              <strong className="block text-lg tabular-nums">{value}</strong>
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as typeof tab)}
          className="mt-4"
        >
          <TabsList className="w-full">
            <TabsTrigger value="differences" className="flex-1">
              {locale === "zh" ? "结构差异" : "Differences"}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              {locale === "zh" ? "SQL 变更" : "SQL changes"}
              <Badge variant="secondary">{imports.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="environments" className="flex-1">
              {locale === "zh" ? "版本与环境" : "Versions & envs"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]"
      >
        {loading && tab !== "environments" ? (
          <div className="grid min-h-52 place-items-center text-xs text-muted-foreground">
            {locale === "zh" ? "正在整理项目数据…" : "Loading project details…"}
          </div>
        ) : (
          tab === "differences" && (
            <div className="min-h-full">
              <AnchorSyncPanel project={project} versions={versions} environments={envs} locale={locale} call={call} toast={toast} />
            </div>
          )
        )}
        {!loading && tab === "history" && (
          <div className="min-h-full">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                className="h-9 pl-9 text-xs"
                placeholder={
                  locale === "zh"
                    ? "搜索 SQL、版本、模块或环境"
                    : "Search SQL, version, module, or environment"
                }
              />
            </div>
            {visibleImports.length ? (
              <div className="space-y-2">
                {visibleImports.map((batch) => (
                  <button
                    type="button"
                    key={batch.id}
                    onClick={() => onSelectImport(batch.id)}
                    className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <FileCode2 className="size-3.5 text-muted-foreground" />
                      <strong className="min-w-0 flex-1 truncate text-xs">
                        {batch.name}
                      </strong>
                      <Badge
                        variant={
                          batch.status === "active" ? "secondary" : "outline"
                        }
                      >
                        {batch.versionName}
                      </Badge>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="mt-1 truncate text-[10px] text-muted-foreground">
                      {batch.code}
                      {batch.moduleName ? ` · ${batch.moduleName}` : ""}
                      {batch.environmentNames && (
                        <>
                          <span> · </span>
                          <EnvironmentSummary value={batch.environmentNames} locale={locale} />
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <span>
                        {formatDate(batch.createdAt, locale)}
                      </span>
                      <span>
                        {locale === "zh"
                          ? `新增 ${batch.addedCount}`
                          : `Added ${batch.addedCount}`}
                      </span>
                      <span>
                        {locale === "zh"
                          ? `修改 ${batch.modifiedCount}`
                          : `Modified ${batch.modifiedCount}`}
                      </span>
                      <span>
                        {locale === "zh"
                          ? `删除 ${batch.removedCount}`
                          : `Removed ${batch.removedCount}`}
                      </span>
                      <span>
                        {locale === "zh"
                          ? `重复 ${batch.duplicateCount}`
                          : `Duplicate ${batch.duplicateCount}`}
                      </span>
                      <span>
                        {locale === "zh"
                          ? `冲突 ${batch.conflictCount}`
                          : `Conflict ${batch.conflictCount}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                text={
                  historyQuery
                    ? locale === "zh"
                      ? "没有匹配的 SQL 记录"
                      : "No matching SQL changes"
                    : locale === "zh"
                      ? "还没有 SQL 导入记录"
                      : "No SQL import history yet"
                }
              />
            )}
          </div>
        )}
        {tab === "environments" && (
          <div className="min-h-full space-y-6">
            <section>
              <div className="mb-2 flex items-center">
                <div>
                  <strong className="block text-xs">
                    {locale === "zh" ? "版本" : "Versions"}
                  </strong>
                  <span className="text-[10px] text-muted-foreground">
                    {locale === "zh"
                      ? "版本可以关联 Git 分支、Tag 或提交"
                      : "Versions can track a Git branch, tag, or commit"}
                  </span>
                </div>
                <span className="ml-auto">
                  <IconButton
                    label={locale === "zh" ? "新增版本" : "New version"}
                    onClick={() => open("version", { projectId: project.id })}
                  >
                    <Plus />
                  </IconButton>
                </span>
              </div>
              <div className="divide-y rounded-xl border">
                {versions.map((version) => {
                  const linkedEnvironments = envs.filter(
                    (env) => env.versionId === version.id,
                  ).length;
                  return (
                    <div
                      key={version.id}
                      className="flex items-center gap-3 px-3 py-3"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                        <Layers3 className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate font-mono text-xs">
                          {version.name}
                        </strong>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {version.repository ? (
                            <>
                              <GitBranch className="mr-1 inline size-3" />
                              {version.repository}
                              {version.gitRef ? `@${version.gitRef}` : ""}
                              {version.gitCommit
                                ? ` · ${version.gitCommit.slice(0, 8)}`
                                : ""}
                            </>
                          ) : version.sourceVersion ? (
                            locale === "zh" ? (
                              `来源 ${version.sourceVersion}`
                            ) : (
                              `From ${version.sourceVersion}`
                            )
                          ) : locale === "zh" ? (
                            "独立版本"
                          ) : (
                            "Independent version"
                          )}{" "}
                          · {linkedEnvironments}{" "}
                          {locale === "zh" ? "个环境" : "environments"}
                        </span>
                      </span>
                      <EntityMenu
                        t={locale === "zh" ? words.zh : words.en}
                        onEdit={() =>
                          open(
                            "version",
                            version as unknown as Record<string, unknown>,
                          )
                        }
                        onDelete={() => void remove("version", version.id)}
                      />
                    </div>
                  );
                })}
                {!versions.length && (
                  <Empty
                    text={locale === "zh" ? "还没有版本" : "No versions yet"}
                  />
                )}
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center">
                <div>
                  <strong className="block text-xs">
                    {locale === "zh" ? "环境" : "Environments"}
                  </strong>
                  <span className="text-[10px] text-muted-foreground">
                    {locale === "zh"
                      ? "点击查看结构覆盖与 SQL 记录"
                      : "Open schema coverage and SQL history"}
                  </span>
                </div>
                <span className="ml-auto">
                  <IconButton
                    label={locale === "zh" ? "新增环境" : "New environment"}
                    onClick={() =>
                      open("environment", { projectId: project.id })
                    }
                  >
                    <Plus />
                  </IconButton>
                </span>
              </div>
              <div className="space-y-2">
                {envs.map((env) => {
                  const missing = missingByEnvironment(env.name);
                  return (
                    <div
                      key={env.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-xl border"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectEnvironment(env)}
                        className="flex min-w-0 items-center gap-3 p-3 text-left hover:bg-muted/50"
                      >
                        <span
                          className={`size-2 rounded-full ${env.stage === "production" ? "bg-emerald-500" : env.stage === "testing" ? "bg-amber-500" : "bg-sky-500"}`}
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-xs">{env.name}</strong>
                          <span className="text-[10px] text-muted-foreground">
                            {env.versionName ??
                              (locale === "zh"
                                ? "未绑定版本"
                                : "No version")}{" "}
                            · {env.fieldCount}{" "}
                            {locale === "zh" ? "个字段" : "fields"}
                          </span>
                        </span>
                        {missing ? (
                          <Badge
                            variant="secondary"
                            className="text-amber-700 dark:text-amber-300"
                          >
                            {locale === "zh"
                              ? `缺少 ${missing}`
                              : `Missing ${missing}`}
                          </Badge>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                            {locale === "zh" ? "已对齐" : "Aligned"}
                          </span>
                        )}
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                      </button>
                      <div className="pr-1">
                        <EntityMenu
                          t={locale === "zh" ? words.zh : words.en}
                          onEdit={() =>
                            open(
                              "environment",
                              env as unknown as Record<string, unknown>,
                            )
                          }
                          onDelete={() => void remove("environment", env.id)}
                        />
                      </div>
                    </div>
                  );
                })}
                {!envs.length && (
                  <Empty
                    text={
                      locale === "zh" ? "还没有环境" : "No environments yet"
                    }
                  />
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function AnchorSyncPanel({
  project,
  versions,
  environments,
  locale,
  call,
  toast,
}: {
  project: Project;
  versions: Version[];
  environments: Environment[];
  locale: "zh" | "en";
  call: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
}) {
  const [versionId, setVersionId] = useState(project.anchorVersionId ?? "");
  const [environmentId, setEnvironmentId] = useState(project.anchorEnvironmentId ?? "");
  const [insight, setInsight] = useState<AnchorInsight | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [registering, setRegistering] = useState(false);
  useEffect(() => {
    if (!project.anchorVersionId || !project.anchorEnvironmentId || !versionId || !environmentId) return;
    const controller = new AbortController();
    fetch(`/api/catalog?mode=anchor&projectId=${encodeURIComponent(project.id)}&versionId=${encodeURIComponent(versionId)}&environmentId=${encodeURIComponent(environmentId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<AnchorInsight> : response.json().then((body) => { throw new Error(String((body as { error?: string }).error ?? "无法读取差异")); }))
      .then(setInsight)
      .catch((error) => { if ((error as Error).name !== "AbortError") setInsight(null); })
      ;
    return () => controller.abort();
  }, [project.id, project.anchorVersionId, project.anchorEnvironmentId, versionId, environmentId]);
  const labels = locale === "zh"
    ? { title: "锚点对齐", hint: "以项目锚定版本 / 环境为准，生成目标环境的补齐 SQL。目标多出的字段和索引会保留，不自动删除。", anchor: "锚定", target: "对比目标", version: "版本", environment: "环境", generated: "待补齐", modified: "需修改", extra: "目标多出", register: "登记锚点已执行", sql: "生成 SQL", history: "执行记录", none: "没有差异，结构一致" }
    : { title: "Anchor sync", hint: "Use the project anchor to generate SQL for a target scope. Extra target objects are kept and never deleted automatically.", anchor: "Anchor", target: "Compare target", version: "Version", environment: "Environment", generated: "To add", modified: "To modify", extra: "Target extra", register: "Register anchor executed", sql: "Generated SQL", history: "Execution log", none: "No differences. Schemas match." };
  const summary = insight ? {
    add: insight.tableItems.filter((item) => item.result === "added").length + insight.fieldItems.filter((item) => item.result === "added").length + insight.indexItems.filter((item) => item.result === "added").length + insight.constraintItems.filter((item) => item.result === "added").length,
    modify: insight.fieldItems.filter((item) => item.result === "modified").length + insight.indexItems.filter((item) => item.result === "modified").length + insight.constraintItems.filter((item) => item.result === "modified").length,
    extra: insight.tableItems.filter((item) => item.result === "removed").length + insight.fieldItems.filter((item) => item.result === "removed").length + insight.indexItems.filter((item) => item.result === "removed").length + insight.constraintItems.filter((item) => item.result === "removed").length,
  } : null;
  const diffItems: Array<AnchorDiffItem & { label: string }> = insight ? [
    ...insight.tableItems.map((item) => ({ ...item, label: item.tableName, columnName: undefined, before: null, after: null, changes: [] })),
    ...insight.fieldItems.map((item) => ({ ...item, label: `${item.tableName}.${item.columnName ?? ""}` })),
    ...insight.indexItems.map((item) => ({ ...item, label: `${item.tableName} · index ${item.columnName ?? ""}` })),
    ...insight.constraintItems.map((item) => ({ ...item, label: `${item.tableName} · constraint ${item.columnName ?? ""}` })),
  ] : [];
  const register = async () => {
    if (!insight?.sql) return;
    setRegistering(true);
    try {
      await call("sql.register", { projectId: project.id, versionId: insight.anchor.versionId, anchorEnvironmentId: insight.anchor.environmentId, environmentIds: environments.map((item) => item.id), sqlText: insight.sql, name: `${project.name} · ${insight.target.versionName} / ${insight.target.environmentName}` });
      toast(locale === "zh" ? "已记录锚点 SQL，其他环境标记为待执行" : "Anchor SQL recorded; other environments are pending");
      const refreshed = await fetch(`/api/catalog?mode=anchor&projectId=${encodeURIComponent(project.id)}&versionId=${encodeURIComponent(versionId)}&environmentId=${encodeURIComponent(environmentId)}`);
      if (refreshed.ok) setInsight(await refreshed.json() as AnchorInsight);
    } catch (error) { toast(error instanceof Error ? error.message : String(error)); }
    finally { setRegistering(false); }
  };
  return (
    <Card className="mb-4 overflow-hidden border-dashed">
      <CardHeader className="gap-1 px-4 py-3">
        <div className="flex items-center gap-2"><ArrowLeftRight className="size-3.5 text-muted-foreground" /><CardTitle className="text-xs">{labels.title}</CardTitle><Badge variant="outline" className="ml-auto max-w-[55%] truncate text-[10px]">{project.anchorVersionId ? `${labels.anchor} · ${versions.find((item) => item.id === project.anchorVersionId)?.name ?? project.anchorVersionId} / ${environments.find((item) => item.id === project.anchorEnvironmentId)?.name ?? project.anchorEnvironmentId}` : "未设置"}</Badge></div>
        <p className="text-[10px] leading-4 text-muted-foreground">{labels.hint}</p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {!project.anchorVersionId || !project.anchorEnvironmentId ? <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">{locale === "zh" ? "请先在项目编辑中设置锚定版本和锚定环境。" : "Set an anchor version and environment in project edit first."}</p> : <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={labels.target + " · " + labels.version}><SelectField value={versionId} onValueChange={setVersionId} aria-label={labels.version}><SelectItem value={project.anchorVersionId}>{labels.anchor} · {versions.find((item) => item.id === project.anchorVersionId)?.name ?? project.anchorVersionId}</SelectItem>{versions.filter((item) => item.id !== project.anchorVersionId).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectField></Field>
            <Field label={labels.target + " · " + labels.environment}><SelectField value={environmentId} onValueChange={setEnvironmentId} aria-label={labels.environment}><SelectItem value={project.anchorEnvironmentId}>{labels.anchor} · {environments.find((item) => item.id === project.anchorEnvironmentId)?.name ?? project.anchorEnvironmentId}</SelectItem>{environments.filter((item) => item.id !== project.anchorEnvironmentId).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectField></Field>
          </div>
          {insight ? <>
            <div className="grid grid-cols-3 gap-2">{[[summary?.add ?? 0, labels.generated, "text-emerald-600"], [summary?.modify ?? 0, labels.modified, "text-blue-600"], [summary?.extra ?? 0, labels.extra, "text-red-600"]].map(([value, label, tone]) => <div key={String(label)} className="rounded-lg border px-3 py-2"><strong className={`block text-base tabular-nums ${tone}`}>{value}</strong><span className="text-[10px] text-muted-foreground">{label}</span></div>)}</div>
            {diffItems.length ? <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">{diffItems.map((item) => <div key={`${item.label}-${item.tableName}-${item.columnName ?? ""}`} className="rounded-md px-2 py-1.5 text-[11px] hover:bg-muted/40"><div className="flex items-center gap-2"><span className={`grid size-5 shrink-0 place-items-center rounded text-[10px] font-semibold ${item.result === "added" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : item.result === "modified" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>{item.result === "added" ? "+" : item.result === "modified" ? "~" : "−"}</span><span className="min-w-0 flex-1 truncate">{item.label}</span><span className="text-[10px] text-muted-foreground">{item.result === "added" ? labels.generated : item.result === "modified" ? labels.modified : labels.extra}</span></div>{item.changes?.length ? <div className="ml-7 mt-1 truncate text-[10px] text-muted-foreground">{item.changes.join(" · ")}</div> : null}{item.before || item.after ? <div className="ml-7 mt-1 space-y-0.5 font-mono text-[9px] leading-4">{item.before ? <div className={item.result === "removed" || item.result === "modified" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>− {item.before}</div> : null}{item.after ? <div className={item.result === "added" || item.result === "modified" ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}>+ {item.after}</div> : null}</div> : null}</div>)}</div> : <p className="rounded-lg bg-muted/50 px-3 py-3 text-center text-[11px] text-muted-foreground">{labels.none}</p>}
            {insight.sql ? <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setShowSql((value) => !value)}>{showSql ? labels.sql : `${labels.sql} · ${insight.sql.split(";").filter(Boolean).length}`}</Button><Button type="button" variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(insight.sql); toast(locale === "zh" ? "SQL 已复制" : "SQL copied"); }}><Copy className="size-3.5" /></Button><Button type="button" size="sm" disabled={registering} onClick={() => void register()}><Check className="size-3.5" />{registering ? "…" : labels.register}</Button></div>{showSql && <Textarea value={insight.sql} readOnly className="min-h-32 resize-y font-mono text-[10px] leading-5" />}</div> : null}
            {insight.executions.length ? <div className="border-t pt-3"><div className="mb-2 flex items-center gap-2 text-[10px] font-medium text-muted-foreground"><History className="size-3.5" />{labels.history}</div><div className="space-y-1">{insight.executions.slice(0, 5).map((execution) => <div key={execution.id} className="flex items-center gap-2 text-[10px]"><span className={`size-1.5 rounded-full ${execution.status === "executed" || execution.status === "verified" ? "bg-emerald-500" : execution.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} /><span className="min-w-0 flex-1 truncate">{execution.environmentName} · {execution.versionName}</span><span className="text-muted-foreground">{locale === "zh" ? ({ executed: "已执行", verified: "已核验", registered: "待执行", pending: "待执行", failed: "失败" } as Record<string, string>)[execution.status] ?? execution.status : execution.status}</span></div>)}</div></div> : null}
          </> : null}
        </>}
      </CardContent>
    </Card>
  );
}

function EnvironmentDetail({
  environment,
  locale,
  onEdit,
  onSelectImport,
}: {
  environment: Environment;
  locale: "zh" | "en";
  onEdit: () => void;
  onSelectImport: (id: string) => void;
}) {
  const [insight, setInsight] = useState<EnvironmentInsight | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/catalog?mode=environment&environmentId=${encodeURIComponent(environment.id)}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error("environment");
        return response.json() as Promise<EnvironmentInsight>;
      })
      .then(setInsight)
      .catch(() => {});
    return () => controller.abort();
  }, [environment.id]);
  const expected = number(insight?.coverage?.expectedCount),
    present = number(insight?.coverage?.presentCount),
    missing = Math.max(0, expected - present);
  const expectedTables = number(insight?.coverage?.expectedTableCount),
    presentTables = number(insight?.coverage?.presentTableCount);
  const stageLabel =
    environment.stage === "production"
      ? locale === "zh"
        ? "正式"
        : "Production"
      : environment.stage === "testing"
        ? locale === "zh"
          ? "测试"
          : "Testing"
        : environment.stage === "development"
          ? locale === "zh"
            ? "开发"
            : "Development"
          : locale === "zh"
            ? "自定义"
            : "Custom";
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <span
            className={`size-2 rounded-full ${environment.stage === "production" ? "bg-emerald-500" : environment.stage === "testing" ? "bg-amber-500" : "bg-sky-500"}`}
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{environment.name}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {environment.projectName} ·{" "}
              {environment.versionName ??
                (locale === "zh" ? "未绑定版本" : "No version")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={onEdit}
          >
            <Pencil />
            {locale === "zh" ? "编辑" : "Edit"}
          </Button>
        </div>
      </SheetHeader>
      <div className="border-b px-6 py-4">
        <div className="grid grid-cols-4 gap-2">
          <div>
            <strong className="block text-lg tabular-nums">
              {presentTables}
            </strong>
            <span className="text-[10px] text-muted-foreground">
              {locale === "zh" ? "已有表" : "Present tables"}
            </span>
          </div>
          <div>
            <strong className="block text-lg tabular-nums">
              {expectedTables}
            </strong>
            <span className="text-[10px] text-muted-foreground">
              {locale === "zh" ? "预期表" : "Expected tables"}
            </span>
          </div>
          <div>
            <strong className="block text-lg tabular-nums">{present}</strong>
            <span className="text-[10px] text-muted-foreground">
              {locale === "zh" ? "已有字段" : "Present fields"}
            </span>
          </div>
          <div>
            <strong
              className={`block text-lg tabular-nums ${missing ? "text-amber-600" : ""}`}
            >
              {missing}
            </strong>
            <span className="text-[10px] text-muted-foreground">
              {locale === "zh" ? "缺少字段" : "Missing fields"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          <Badge variant="secondary">{stageLabel}</Badge>
          <Badge variant="outline">{environment.code}</Badge>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]">
        {!insight ? (
          <Empty
            text={
              locale === "zh"
                ? "正在整理环境数据…"
                : "Loading environment details…"
            }
          />
        ) : (
          <>
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Database className="size-3.5" />
                <strong className="text-xs">
                  {locale === "zh" ? "结构状态" : "Schema status"}
                </strong>
                <Badge
                  variant={missing ? "secondary" : "outline"}
                  className="ml-auto"
                >
                  {missing
                    ? `${missing}`
                    : locale === "zh"
                      ? "已对齐"
                      : "Aligned"}
                </Badge>
              </div>
              {insight.missing.length ? (
                <div className="divide-y rounded-xl border">
                  {insight.missing.map((field) => (
                    <div key={field.id} className="px-3 py-2.5">
                      <code className="block truncate text-[11px] font-semibold">
                        {field.tableName}.{field.name}
                      </code>
                      <span className="text-[10px] text-muted-foreground">
                        {field.comment || field.dataType}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border p-4 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  {locale === "zh"
                    ? "当前环境已包含全部预期字段"
                    : "This environment contains every expected field"}
                </div>
              )}
            </section>
            <section>
              <div className="mb-2 flex items-center gap-2">
                <History className="size-3.5" />
                <strong className="text-xs">
                  {locale === "zh" ? "SQL 记录" : "SQL history"}
                </strong>
                <Badge variant="secondary" className="ml-auto">
                  {insight.imports.length}
                </Badge>
              </div>
              {insight.imports.length ? (
                <div className="space-y-2">
                  {insight.imports.map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => onSelectImport(batch.id)}
                      className="flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-muted/50"
                    >
                      <FileCode2 className="size-3.5 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs">
                          {batch.name}
                        </strong>
                        <span className="text-[10px] text-muted-foreground">
                          {batch.versionName} ·{" "}
                          {formatDate(batch.createdAt, locale)}
                        </span>
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  text={
                    locale === "zh"
                      ? "这个环境还没有 SQL 记录"
                      : "No SQL history for this environment"
                  }
                />
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function ImportDetail({
  importId,
  locale,
  call,
  toast,
  askConfirm,
  onReuse,
}: {
  importId: string;
  locale: "zh" | "en";
  call: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
  askConfirm: (request: Confirmation) => void;
  onReuse: (batch: ImportBatch) => void;
}) {
  const [insight, setInsight] = useState<ImportInsight | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [resolving, setResolving] = useState("");
  const [itemFilter, setItemFilter] = useState<"conflict" | "review" | "all">("conflict");
  const loadDetail = useCallback(
    () =>
      fetch(`/api/catalog?mode=import&importId=${encodeURIComponent(importId)}`)
        .then((response) => {
          if (!response.ok) throw new Error("import");
          return response.json() as Promise<ImportInsight>;
        })
        .then((result) => {
          setInsight(result);
          setName(result.batch.name);
          setItemFilter(result.batch.conflictCount > 0 ? "conflict" : "all");
        }),
    [importId],
  );
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  if (!insight)
    return (
      <Empty
        text={locale === "zh" ? "正在读取 SQL 记录…" : "Loading SQL record…"}
      />
    );
  const { batch, items } = insight;
  const conflictItems = items.filter((item) => item.result === "conflict");
  const reviewItems = items.filter((item) => item.reviewStatus === "pending");
  const visibleItems = (itemFilter === "conflict" ? conflictItems : itemFilter === "review" ? reviewItems : items);
  const rename = async () => {
    if (!name.trim()) return;
    try {
      await call("import.rename", { id: batch.id, name: name.trim() });
      setInsight({ ...insight, batch: { ...batch, name: name.trim() } });
      setRenaming(false);
      toast(locale === "zh" ? "名称已更新" : "Name updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(batch.rawSql ?? "");
      toast(locale === "zh" ? "SQL 已复制" : "SQL copied");
    } catch {
      toast(locale === "zh" ? "复制失败" : "Copy failed");
    }
  };
  const resolveConflict = async (
    itemId: string,
    resolution: "same" | "variant" | "separate",
    metadataOnly = false,
  ) => {
    const key = metadataOnly ? "metadata" : itemId;
    setResolving(key);
    try {
      const result = await call("import.conflict.resolve", {
        batchId: batch.id,
        itemId,
        resolution,
        metadataOnly,
      });
      await loadDetail();
      toast(
        locale === "zh"
          ? `已处理 ${number(result.resolved)} 个冲突`
          : `${number(result.resolved)} conflict(s) resolved`,
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setResolving("");
    }
  };
  const resolveAll = (resolution: "same" | "variant" | "separate") => {
    const labels = {
      same: locale === "zh" ? "全部采用已有定义" : "Use existing definitions for all",
      variant: locale === "zh" ? "全部保留并待核对" : "Keep all as variants",
      separate: locale === "zh" ? "全部设为独立逻辑字段" : "Separate all logical fields",
    };
    askConfirm({
      title: labels[resolution],
      description:
        locale === "zh"
          ? "这会一次处理本批次的全部冲突；之后仍可通过撤销本次导入恢复。"
          : "This resolves every conflict in this batch. You can revert this import afterwards.",
      confirmLabel: locale === "zh" ? "确认处理" : "Resolve",
      run: async () => {
        await resolveConflict("", resolution);
      },
    });
  };
  return (
    <>
      <SheetHeader>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
            <FileCode2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex gap-2">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
                <Button size="sm" onClick={() => void rename()}>
                  {locale === "zh" ? "保存" : "Save"}
                </Button>
              </div>
            ) : (
              <>
                <h2 className="truncate text-sm font-semibold">{batch.name}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {batch.code} · {batch.projectName} · {batch.versionName}
                </p>
              </>
            )}
          </div>
          {!renaming && (
            <IconButton
              label={locale === "zh" ? "编辑名称" : "Rename"}
              onClick={() => setRenaming(true)}
            >
              <Pencil />
            </IconButton>
          )}
        </div>
      </SheetHeader>
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">
            {locale === "zh"
              ? `新增 ${batch.addedCount}`
              : `Added ${batch.addedCount}`}
          </Badge>
          <Badge variant="secondary">
            {locale === "zh"
              ? `修改 ${batch.modifiedCount}`
              : `Modified ${batch.modifiedCount}`}
          </Badge>
          <Badge variant="secondary">
            {locale === "zh"
              ? `删除 ${batch.removedCount}`
              : `Removed ${batch.removedCount}`}
          </Badge>
          <Badge variant="outline">
            {locale === "zh"
              ? `重复 ${batch.duplicateCount}`
              : `Duplicate ${batch.duplicateCount}`}
          </Badge>
          <Badge variant={batch.conflictCount ? "destructive" : "outline"}>
            {locale === "zh"
              ? `冲突 ${batch.conflictCount}`
              : `Conflict ${batch.conflictCount}`}
          </Badge>
          <Badge variant="outline">
            {batch.status === "active"
              ? locale === "zh"
                ? "有效"
                : "Active"
              : locale === "zh"
                ? "已撤销"
                : "Reverted"}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>
            {formatDate(batch.createdAt, locale)}
          </span>
          {batch.moduleName && <span>{batch.moduleName}</span>}
          {batch.environmentNames && (
            <EnvironmentSummary value={batch.environmentNames} locale={locale} />
          )}
          {batch.sourcePath && <span>{batch.sourcePath}</span>}
          {batch.gitCommit && (
            <span>
              <GitCommitHorizontal className="mr-1 inline size-3" />
              {batch.gitCommit.slice(0, 10)}
            </span>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copySql()}
          >
            <Copy />
            {locale === "zh" ? "复制 SQL" : "Copy SQL"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onReuse(batch)}
          >
            <RotateCcw />
            {locale === "zh" ? "再次使用" : "Reuse"}
          </Button>
          {batch.conflictCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={Boolean(resolving)}
                onClick={() => void resolveConflict("", "same", true)}
              >
                <CheckCircle2 />
                {resolving === "metadata"
                  ? "…"
                  : locale === "zh"
                    ? "仅说明差异→同一字段"
                    : "Description-only → same"}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={Boolean(resolving)} onClick={() => resolveAll("same")}>
                {locale === "zh" ? "全部采用已有" : "Use existing for all"}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={Boolean(resolving)} onClick={() => resolveAll("variant")}>
                {locale === "zh" ? "全部保留待核对" : "Keep all for review"}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={Boolean(resolving)} onClick={() => resolveAll("separate")}>
                {locale === "zh" ? "全部设为独立" : "Separate all"}
              </Button>
            </div>
          )}
          {batch.status === "active" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive"
              onClick={() =>
                askConfirm({
                  title:
                    locale === "zh"
                      ? "确认撤销这条 SQL 记录？"
                      : "Revert this SQL record?",
                  description:
                    locale === "zh"
                      ? "会尽可能恢复这次新增、修改和删除前的登记；如果字段后来又被修改，将保留较新的结果。"
                      : "Added, modified, and removed records will be restored when safe. Newer field changes are preserved.",
                  confirmLabel: locale === "zh" ? "撤销" : "Revert",
                  run: async () => {
                    const result = await call("import.revert", {
                      id: batch.id,
                    });
                    await loadDetail();
                    toast(
                      number(result.skipped)
                        ? locale === "zh"
                          ? `已撤销，${number(result.skipped)} 个较新修改被保留`
                          : `Reverted; ${number(result.skipped)} newer changes kept`
                        : locale === "zh"
                          ? "已撤销"
                          : "Reverted",
                    );
                  },
                })
              }
            >
              <RotateCcw />
              {locale === "zh" ? "撤销" : "Revert"}
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <FileCode2 className="size-3.5" />
            <strong className="text-xs">SQL</strong>
          </div>
          <pre className="max-h-72 overflow-auto rounded-xl bg-muted/50 p-4 text-[10px] leading-5">
            {batch.rawSql || "—"}
          </pre>
        </section>
        <section>
          <div className="mb-2 flex items-center gap-2">
            <History className="size-3.5" />
            <strong className="text-xs">
              {locale === "zh" ? "解析结果" : "Parsed changes"}
            </strong>
            <Badge variant="secondary" className="ml-auto">
              {items.length}
            </Badge>
          </div>
          <div className="mb-3 flex items-center gap-1 rounded-lg bg-muted/40 p-1">
            {([
              ["conflict", locale === "zh" ? "冲突" : "Conflicts", conflictItems.length],
              ["review", locale === "zh" ? "待核对" : "Review", reviewItems.length],
              ["all", locale === "zh" ? "全部" : "All", items.length],
            ] as const).map(([value, label, count]) => (
              <button
                type="button"
                key={value}
                onClick={() => setItemFilter(value)}
                className={`rounded-md px-2.5 py-1 text-[10px] transition-colors ${itemFilter === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label} {count}
              </button>
            ))}
            <span className="ml-auto pr-2 text-[10px] text-muted-foreground">
              {locale === "zh" ? "优先处理冲突" : "Resolve conflicts first"}
            </span>
          </div>
          <div className="divide-y rounded-xl border">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-3 py-3">
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${item.result === "conflict" ? "bg-destructive" : item.result === "added" || item.result === "modified" || item.result === "removed" ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                />
                <span className="min-w-0 flex-1">
                  <code className="block truncate text-[11px] font-semibold">
                    {item.tableName}.{item.columnName}
                  </code>
                  <span className="text-[10px] text-muted-foreground">
                    {item.message || item.action}
                  </span>
                  {item.reviewStatus === "pending" && (
                    <Badge variant="outline" className="ml-2 text-[9px]">
                      {locale === "zh" ? "待核对" : "Review"}
                    </Badge>
                  )}
                  {item.resolutionKind === "separate" && (
                    <Badge variant="outline" className="ml-2 text-[9px]">
                      {locale === "zh" ? "逻辑独立" : "Separate identity"}
                    </Badge>
                  )}
                </span>
                {item.result === "conflict" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(resolving)}
                      >
                        {resolving === item.id
                          ? "…"
                          : locale === "zh"
                            ? "处理"
                            : "Resolve"}
                        <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem
                        onClick={() => void resolveConflict(item.id, "same")}
                      >
                        <div>
                          <div>{locale === "zh" ? "视为同一字段" : "Treat as same field"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {locale === "zh" ? "采用已有定义，忽略本次差异" : "Use the existing definition"}
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void resolveConflict(item.id, "variant")}
                      >
                        <div>
                          <div>{locale === "zh" ? "保留环境差异" : "Keep environment variant"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {locale === "zh" ? "仍是同一字段，并标记待核对" : "Same field, marked for review"}
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => void resolveConflict(item.id, "separate")}
                      >
                        <div>
                          <div>{locale === "zh" ? "独立逻辑字段" : "Separate logical field"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {locale === "zh" ? "同名但业务身份互不合并" : "Same name, independent identity"}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Badge variant="outline">
                    {importResultLabel(item.result, locale)}
                  </Badge>
                )}
              </div>
            ))}
            {!visibleItems.length && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {itemFilter === "conflict"
                  ? locale === "zh" ? "没有未处理的冲突" : "No unresolved conflicts"
                  : itemFilter === "review"
                    ? locale === "zh" ? "没有待核对项" : "No items pending review"
                    : locale === "zh" ? "没有解析结果" : "No parsed changes"}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function ImportWorkspace({
  data,
  projects,
  scopeProject,
  scopeVersion,
  scopeEnvs,
  importName,
  importSql,
  importFile,
  importSourcePath,
  importGitCommit,
  busy,
  locale,
  t,
  chooseScopeProject,
  setScopeVersion,
  setScopeEnvs,
  setImportName,
  setImportSql,
  setImportSourcePath,
  setImportGitCommit,
  readFiles,
  runImport,
  projectVersions,
  projectEnvs,
  call,
  toast,
  askConfirm,
  onSelectImport,
}: {
  data: CatalogData;
  projects: Project[];
  scopeProject: string;
  scopeVersion: string;
  scopeEnvs: string[];
  importName: string;
  importSql: string;
  importFile: string;
  importSourcePath: string;
  importGitCommit: string;
  busy: boolean;
  locale: "zh" | "en";
  t: (typeof words)["zh"] | (typeof words)["en"];
  chooseScopeProject: (id: string) => void;
  setScopeVersion: (id: string) => void;
  setScopeEnvs: (ids: string[]) => void;
  setImportName: (name: string) => void;
  setImportSql: (sql: string) => void;
  setImportSourcePath: (path: string) => void;
  setImportGitCommit: (commit: string) => void;
  readFiles: (files: FileList | null) => Promise<void>;
  runImport: () => Promise<void>;
  projectVersions: (id: string) => Version[];
  projectEnvs: (id: string) => Environment[];
  call: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
  askConfirm: (request: Confirmation) => void;
  onSelectImport: (id: string) => void;
}) {
  const ready = Boolean(
    importSql && scopeProject && scopeVersion && scopeEnvs.length,
  );
  const selectedVersion = data.versions.find(
    (version) => version.id === scopeVersion,
  );
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewTarget, setPreviewTarget] = useState({
    versionId: "",
    environmentId: "",
  });
  const [mappingPhysical, setMappingPhysical] = useState("");
  const [mappingLogical, setMappingLogical] = useState("");
  const [mappings, setMappings] = useState<{ id: string; physicalName: string; logicalName: string }[]>([]);
  useEffect(() => {
    if (!scopeProject) return;
    void call("table.mapping.list", { projectId: scopeProject }).then((result) => {
      setMappings((result.mappings ?? []) as { id: string; physicalName: string; logicalName: string }[]);
    }).catch(() => setMappings([]));
  }, [call, scopeProject]);
  const saveMapping = async () => {
    if (!scopeProject || !mappingPhysical.trim() || !mappingLogical.trim()) return;
    try {
      await call("table.mapping.save", { projectId: scopeProject, physicalName: mappingPhysical, logicalName: mappingLogical });
      const result = await call("table.mapping.list", { projectId: scopeProject });
      setMappings((result.mappings ?? []) as { id: string; physicalName: string; logicalName: string }[]);
      setMappingPhysical(""); setMappingLogical("");
      toast(locale === "zh" ? "逻辑表映射已保存" : "Table mapping saved");
    } catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  };
  const requestPreview = async (versionId: string, environmentId: string) => {
    if (!importSql || !scopeProject || !versionId || !environmentId) return;
    setPreviewing(true);
    try {
      const signature = `${scopeProject}|${versionId}|${environmentId}|${importSql}`;
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "import.preview",
          payload: {
            sql: importSql,
            projectId: scopeProject,
            versionId,
            environmentIds: [environmentId],
          },
        }),
      });
      const result = (await response.json()) as Omit<
        ImportPreview,
        "signature"
      > & { error?: string };
      if (!response.ok)
        throw new Error(
          result.error ??
            (locale === "zh" ? "无法预览 SQL" : "Could not preview SQL"),
        );
      setPreview({ ...result, signature });
      setPreviewTarget({ versionId, environmentId });
      setScopeVersion(versionId);
      setScopeEnvs([environmentId]);
      setPreviewOpen(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewing(false);
    }
  };
  const prepareImport = async () => {
    if (!ready) return;
    const versionId = scopeVersion;
    const matching = projectEnvs(scopeProject).filter(
      (env) => !env.versionId || env.versionId === versionId,
    );
    const environmentId =
      scopeEnvs.find((id) => matching.some((env) => env.id === id)) ??
      matching[0]?.id;
    if (environmentId) await requestPreview(versionId, environmentId);
  };
  const choosePreviewVersion = (versionId: string) => {
    const environment = projectEnvs(scopeProject).find(
      (env) => !env.versionId || env.versionId === versionId,
    );
    if (environment) void requestPreview(versionId, environment.id);
  };
  const choosePreviewEnvironment = (environmentId: string) => {
    if (environmentId)
      void requestPreview(previewTarget.versionId, environmentId);
  };
  const confirmPreview = () => {
    if (!preview) return;
    const changed =
      (preview.summary.added ?? 0) +
      (preview.summary.modified ?? 0) +
      (preview.summary.removed ?? 0);
    askConfirm({
      title:
        locale === "zh" ? "确认应用这份结构差异？" : "Apply this schema diff?",
      description:
        locale === "zh"
          ? `将新增 ${preview.summary.added ?? 0}、修改 ${preview.summary.modified ?? 0}、移除 ${preview.summary.removed ?? 0} 个字段登记。`
          : `This adds ${preview.summary.added ?? 0}, modifies ${preview.summary.modified ?? 0}, and removes ${preview.summary.removed ?? 0} field registrations.`,
      confirmLabel:
        locale === "zh" ? `应用 ${changed} 项变化` : `Apply ${changed} changes`,
      run: async () => {
        setPreviewOpen(false);
        await runImport();
      },
    });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Import className="size-3.5" />
            {locale === "zh" ? "导入结构 SQL" : "Import schema SQL"}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {locale === "zh"
              ? "一批可包含多张表；解析后只把结果登记到你选择的版本与环境。"
              : "One batch can contain many tables; parsed changes apply only to the selected version and environments."}
          </p>
        </div>
        <CardContent className="space-y-4 p-5">
          <Field label={locale === "zh" ? "变更名称" : "Change name"}>
            <Input
              value={importName}
              onChange={(event) => setImportName(event.target.value)}
              placeholder={
                locale === "zh"
                  ? "例如：客户等级字段调整"
                  : "e.g. Customer level update"
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.targetProject}>
              <SelectField
                value={scopeProject}
                onValueChange={chooseScopeProject}
              >
                <option value="">
                  {locale === "zh" ? "选择项目" : "Choose project"}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t.targetVersion}>
              <SelectField
                value={scopeVersion}
                onValueChange={setScopeVersion}
                disabled={!scopeProject}
              >
                <option value="">
                  {locale === "zh" ? "选择版本" : "Choose version"}
                </option>
                {projectVersions(scopeProject).map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t.targetEnvs}>
              <ScopePicker
                envs={projectEnvs(scopeProject)}
                selected={scopeEnvs}
                onChange={setScopeEnvs}
                t={t}
              />
            </Field>
          </div>
          <div className="rounded-xl border bg-muted/15 p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <GitBranch className="size-3.5 text-muted-foreground" />
              {locale === "zh" ? "逻辑表映射" : "Logical table mapping"}
              <span className="font-normal text-muted-foreground">{locale === "zh" ? "物理表改名时，先映射再比较" : "Map renamed physical tables before comparison"}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input value={mappingPhysical} onChange={(event) => setMappingPhysical(event.target.value)} placeholder={locale === "zh" ? "物理表名" : "Physical table"} />
              <Input value={mappingLogical} onChange={(event) => setMappingLogical(event.target.value)} placeholder={locale === "zh" ? "逻辑表名" : "Logical table"} />
              <Button type="button" variant="outline" onClick={() => void saveMapping()} disabled={!scopeProject || !mappingPhysical.trim() || !mappingLogical.trim()}>{locale === "zh" ? "保存映射" : "Save"}</Button>
            </div>
            {mappings.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">{mappings.map((mapping) => <span key={mapping.id} className="rounded-md bg-muted px-2 py-1"><code>{mapping.physicalName}</code> → <code>{mapping.logicalName}</code></span>)}</div>}
          </div>
          {selectedVersion?.repository && (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-[11px] font-medium">
                <GitBranch className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">
                  {selectedVersion.repository}
                  {selectedVersion.gitRef ? `@${selectedVersion.gitRef}` : ""}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label={locale === "zh" ? "SQL 文件路径" : "SQL file path"}
                >
                  <Input
                    value={importSourcePath}
                    onChange={(event) =>
                      setImportSourcePath(event.target.value)
                    }
                    placeholder="sql/V018__customer.sql"
                  />
                </Field>
                <Field label="Commit">
                  <Input
                    value={importGitCommit}
                    onChange={(event) => setImportGitCommit(event.target.value)}
                    placeholder={selectedVersion.gitCommit ?? "a1b2c3d"}
                  />
                </Field>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <span className="mr-1 py-1">
              {locale === "zh" ? "支持" : "Supports"}
            </span>
            {[
              "CREATE TABLE × N",
              "ADD COLUMN",
              "MODIFY COLUMN",
              "CHANGE COLUMN",
              "DROP COLUMN",
            ].map((label) => (
              <span
                key={label}
                className="rounded-full border px-2 py-1 font-mono"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="relative">
            <Textarea
              value={importSql}
              onChange={(event) => setImportSql(event.target.value)}
              className="min-h-80 resize-y rounded-xl bg-muted/25 p-4 font-mono text-xs leading-5"
              placeholder="CREATE TABLE customer ( … );"
            />
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <label>
                <input
                  className="hidden"
                  type="file"
                  accept=".sql,text/plain"
                  multiple
                  onChange={(event) => void readFiles(event.target.files)}
                />
                <Button asChild type="button" variant="secondary" size="sm">
                  <span>
                    <Upload />
                    {t.upload}
                  </span>
                </Button>
              </label>
              {importFile && (
                <Badge variant="secondary" className="max-w-64 truncate">
                  {importFile}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {ready
                ? locale === "zh"
                  ? "在宽弹框中选择版本和环境并查看差异"
                  : "Choose a version and environment in the diff dialog"
                : locale === "zh"
                  ? "请完成项目、版本、环境和 SQL"
                  : "Project, version, environment, and SQL are required"}
            </span>
            <Button
              disabled={busy || previewing || !ready}
              onClick={() => void prepareImport()}
            >
              <Import />
              {busy || previewing
                ? "…"
                : locale === "zh"
                  ? "查看差异"
                  : "View diff"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="self-start gap-0 overflow-hidden py-0 lg:max-h-[560px]">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <FileCode2 className="size-3.5" />
          <strong className="text-xs">{t.recentImports}</strong>
          <Badge variant="secondary" className="ml-auto">
            {data.imports.length}
          </Badge>
        </div>
        <CardContent className="max-h-[470px] divide-y overflow-y-auto p-0">
          {data.imports.map((batch) => (
            <div
              key={batch.id}
              className={`flex items-start gap-2 p-3 ${batch.status === "reverted" ? "opacity-45" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSelectImport(batch.id)}
                className="min-w-0 flex-1 rounded-lg p-1 text-left hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <strong className="min-w-0 flex-1 truncate text-xs">
                    {batch.name}
                  </strong>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                </div>
                <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                  {batch.projectName} · {batch.versionName}
                </span>
                {batch.environmentNames && (
                  <EnvironmentSummary value={batch.environmentNames} locale={locale} className="mt-1" />
                )}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span>{locale === "zh" ? "新增" : "Added"} {batch.addedCount}</span>
                  <span>{locale === "zh" ? "修改" : "Modified"} {batch.modifiedCount}</span>
                  <span>{locale === "zh" ? "删除" : "Removed"} {batch.removedCount}</span>
                  <span>{locale === "zh" ? "重复" : "Duplicate"} {batch.duplicateCount}</span>
                  <span className={batch.conflictCount ? "text-destructive" : ""}>{locale === "zh" ? "冲突" : "Conflict"} {batch.conflictCount}</span>
                </div>
              </button>
              {batch.status === "active" && batch.conflictCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive"
                  onClick={() => onSelectImport(batch.id)}
                >
                  {locale === "zh" ? "处理冲突" : "Resolve"}
                </Button>
              )}
              {batch.status === "active" && (
                <IconButton
                  label={t.revert}
                  onClick={() =>
                    askConfirm({
                      title: t.confirmRevert,
                      description:
                        t === words.zh
                          ? "会恢复这批导入新增、修改或删除的登记；后续发生过变化的字段不会被覆盖。"
                          : "This restores added, modified, or removed records without overwriting newer changes.",
                      confirmLabel: t.revert,
                      run: async () => {
                        const result = await call("import.revert", {
                          id: batch.id,
                        });
                        toast(
                          number(result.skipped)
                            ? t === words.zh
                              ? `已撤销，${number(result.skipped)} 个较新修改被保留`
                              : `Reverted; ${number(result.skipped)} newer changes kept`
                            : t.saved,
                        );
                      },
                    })
                  }
                >
                  <RotateCcw />
                </IconButton>
              )}
            </div>
          ))}
          {!data.imports.length && <Empty text={t.noData} />}
        </CardContent>
      </Card>
      <ImportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        preview={preview}
        previewing={previewing}
        locale={locale}
        versions={projectVersions(scopeProject)}
        environments={projectEnvs(scopeProject).filter(
          (env) => !env.versionId || env.versionId === previewTarget.versionId,
        )}
        versionId={previewTarget.versionId}
        environmentId={previewTarget.environmentId}
        onVersionChange={choosePreviewVersion}
        onEnvironmentChange={choosePreviewEnvironment}
        onConfirm={confirmPreview}
      />
    </div>
  );
}

function SchemaDiffViewer({
  preview,
  loading,
  locale,
  emptyText,
  indexItems,
}: {
  preview: {
    items: ImportPreviewItem[];
    summary: Record<string, number>;
  } | null;
  loading: boolean;
  locale: "zh" | "en";
  emptyText?: string;
  indexItems?: ScopePreview["indexItems"];
}) {
  const [filter, setFilter] = useState<"all" | ImportPreviewItem["result"]>(
    "all",
  );
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(80);
  const resolvedIndexItems =
    indexItems ?? (preview as ScopePreview | null)?.indexItems;
  const changed =
    preview?.items.filter((item) => item.result !== "unchanged") ?? [];
  const filtered = (
    filter === "all"
      ? changed
      : changed.filter((item) => item.result === filter)
  ).filter((item) =>
    `${item.tableName}.${item.columnName} ${item.fieldCode ?? ""} ${item.changes.join(" ")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const visible = filtered.slice(0, limit);
  const count = (result: ImportPreviewItem["result"]) =>
    number(preview?.summary[result]);
  const tone = (result: ImportPreviewItem["result"]) =>
    result === "added"
      ? "text-diff-added"
      : result === "removed"
        ? "text-diff-removed"
        : result === "modified"
          ? "text-diff-modified"
          : result === "conflict"
            ? "text-diff-conflict"
            : "text-muted-foreground";
  const surface = (result: ImportPreviewItem["result"]) =>
    result === "added"
      ? "bg-diff-added-bg"
      : result === "removed"
        ? "bg-diff-removed-bg"
        : result === "modified"
          ? "bg-diff-modified-bg"
          : result === "conflict"
            ? "bg-diff-conflict-bg"
            : "bg-muted/20";
  const stripe = (result: ImportPreviewItem["result"]) =>
    result === "added"
      ? "bg-diff-added"
      : result === "removed"
        ? "bg-diff-removed"
        : result === "modified"
          ? "bg-diff-modified"
          : result === "conflict"
            ? "bg-diff-conflict"
            : "bg-border";
  const label = (result: ImportPreviewItem["result"]) =>
    result === "added"
      ? locale === "zh"
        ? "新增"
        : "Added"
      : result === "removed"
        ? locale === "zh"
          ? "移除"
          : "Removed"
        : result === "modified"
          ? locale === "zh"
            ? "修改"
            : "Modified"
          : result === "conflict"
            ? locale === "zh"
              ? "冲突"
              : "Conflict"
            : locale === "zh"
              ? "一致"
              : "Unchanged";
  const filters: {
    value: "all" | ImportPreviewItem["result"];
    label: string;
    count: number;
    mark: string;
    tone: string;
  }[] = [
    {
      value: "all",
      label: locale === "zh" ? "全部变化" : "All changes",
      count: changed.length,
      mark: "≡",
      tone: "text-foreground",
    },
    {
      value: "added",
      label: locale === "zh" ? "新增" : "Added",
      count: count("added"),
      mark: "+",
      tone: "text-diff-added",
    },
    {
      value: "modified",
      label: locale === "zh" ? "修改" : "Modified",
      count: count("modified"),
      mark: "~",
      tone: "text-diff-modified",
    },
    {
      value: "removed",
      label: locale === "zh" ? "移除" : "Removed",
      count: count("removed"),
      mark: "−",
      tone: "text-diff-removed",
    },
    {
      value: "conflict",
      label: locale === "zh" ? "冲突" : "Conflict",
      count: count("conflict"),
      mark: "!",
      tone: "text-diff-conflict",
    },
  ];
  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/20 px-5 py-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-1 overflow-x-auto">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setFilter(item.value);
                setLimit(80);
              }}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[11px] transition-colors ${filter === item.value ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}
            >
              <span className={`font-mono text-xs ${item.tone}`}>
                {item.mark}
              </span>
              <span>{item.label}</span>
              <span className="tabular-nums text-[10px] opacity-60">
                {item.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full lg:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(80);
            }}
            className="h-8 bg-background pl-8 text-xs"
            placeholder={
              locale === "zh"
                ? "搜索表、字段或编码"
                : "Search table, field, or code"
            }
          />
        </div>
        <span className="hidden shrink-0 text-[10px] text-muted-foreground xl:block">
          {locale === "zh"
            ? `一致 ${count("unchanged")} · 共 ${preview?.items.length ?? 0}`
            : `${count("unchanged")} unchanged · ${preview?.items.length ?? 0} total`}
        </span>
      </div>
      {resolvedIndexItems?.some((item) => item.result !== "unchanged") && (
        <div className="shrink-0 border-b px-5 py-3">
          <div className="mb-2 text-[11px] font-semibold">
            {locale === "zh" ? "索引差异" : "Index differences"}
          </div>
          <div className="flex flex-wrap gap-2">
            {resolvedIndexItems
              .filter((item) => item.result !== "unchanged")
              .map((item) => {
                const columns = JSON.parse(item.columnsJson) as string[];
                const tone =
                  item.result === "added"
                    ? "text-diff-added"
                    : item.result === "removed"
                      ? "text-diff-removed"
                      : "text-diff-modified";
                return (
                  <div
                    key={item.name}
                    className="rounded-lg border bg-background px-3 py-2 text-[10px]"
                  >
                    <span className={`mr-2 font-mono font-semibold ${tone}`}>
                      {item.result === "added"
                        ? "+"
                        : item.result === "removed"
                          ? "−"
                          : "~"}
                    </span>
                    <code>{item.name}</code>
                    <span className="ml-2 text-muted-foreground">
                      {item.kind} · {columns.join(", ")}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
      <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background [scrollbar-gutter:stable]">
        {loading ? (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            <span className="animate-pulse">
              {locale === "zh" ? "正在计算差异…" : "Comparing…"}
            </span>
          </div>
        ) : visible.length ? (
          <div
            key={`${filter}-${query}`}
            className="drifty-view-enter font-mono"
          >
            <div className="sticky top-0 z-10 grid grid-cols-2 border-b bg-background/95 text-[10px] font-sans backdrop-blur-sm">
              <div className="border-r px-6 py-2 text-muted-foreground">
                {locale === "zh" ? "基准结构 · Before" : "Base structure · Before"}
              </div>
              <div className="px-6 py-2 text-muted-foreground">
                {locale === "zh" ? "目标结构 · After" : "Target structure · After"}
              </div>
            </div>
            {visible.map((item, index) => {
              const mark = item.result === "added" ? "+" : item.result === "removed" ? "−" : item.result === "modified" ? "~" : "!";
              const pane = (side: "before" | "after") => {
                const value = side === "before" ? item.before : item.after;
                const isChanged = item.result === "modified" || (side === "before" && item.result === "removed") || (side === "after" && item.result === "added");
                const paneClass = isChanged ? surface(item.result) : "bg-muted/10";
                const paneMark = item.result === "added" ? (side === "after" ? "+" : "·") : item.result === "removed" ? (side === "before" ? "−" : "·") : item.result === "modified" ? (side === "before" ? "−" : "+") : "!";
                return <div className={`relative grid min-h-14 grid-cols-[38px_22px_minmax(0,1fr)] border-b last:border-b-0 ${paneClass}`}><span className={`absolute inset-y-0 left-0 w-1 ${isChanged ? stripe(item.result) : "bg-border/50"}`} /><span className="grid place-items-center border-r text-[10px] tabular-nums text-muted-foreground">{index + 1}</span><span className={`grid place-items-center border-r text-xs font-semibold ${isChanged ? tone(item.result) : "text-muted-foreground/40"}`}>{paneMark}</span><code className={`break-all px-3 py-3 text-xs leading-6 ${value ? "text-foreground" : "text-muted-foreground/40"}`}>{value ?? "—"}</code></div>;
              };
              return (
                <article
                  key={`${item.tableName}.${item.columnName}.${index}`}
                  className="border-b last:border-b-0"
                >
                  <div className="flex min-h-11 items-center gap-3 border-b bg-muted/10 px-6 py-2.5 font-sans">
                    <span
                      className={`font-mono text-xs font-semibold ${tone(item.result)}`}
                    >
                      {mark}
                    </span>
                    <code className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {item.tableName}.{item.columnName}
                    </code>
                    {item.fieldCode && (
                      <span className="hidden text-[10px] text-muted-foreground md:block">
                        {item.fieldCode}
                      </span>
                    )}
                    {item.reviewStatus === "pending" && (
                      <Badge variant="outline" className="text-[9px] font-sans">
                        {locale === "zh" ? "待核对" : "Review"}
                      </Badge>
                    )}
                    {item.resolutionKind === "separate" && (
                      <Badge variant="outline" className="text-[9px] font-sans">
                        {locale === "zh" ? "逻辑独立" : "Separate"}
                      </Badge>
                    )}
                    <span
                      className={`text-[10px] font-medium ${tone(item.result)}`}
                    >
                      {label(item.result)}
                    </span>
                  </div>
                  {item.changes.length > 0 && (
                    <div className="flex min-h-9 flex-wrap items-center gap-x-5 gap-y-1 border-b px-[3.75rem] py-2 font-sans">
                      {item.changes.map((change) => (
                        <span
                          key={change}
                          className="text-[10px] text-muted-foreground"
                        >
                          {change}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 divide-x">
                    {pane("before")}
                    {pane("after")}
                  </div>
                </article>
              );
            })}
            {filtered.length > visible.length && (
              <div className="flex justify-center border-t p-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((current) => current + 80)}
                >
                  {locale === "zh"
                    ? `继续显示 · 还有 ${filtered.length - visible.length}`
                    : `Show more · ${filtered.length - visible.length} left`}
                  <ChevronDown />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <CheckCircle2 className="mx-auto size-6 text-diff-added" />
              <p className="mt-4 text-sm font-medium">
                {query
                  ? locale === "zh"
                    ? "没有匹配的差异"
                    : "No matching difference"
                  : (emptyText ??
                    (locale === "zh"
                      ? "两个范围的结构完全一致"
                      : "The two scopes match"))}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {changed.length
                  ? locale === "zh"
                    ? "可以切换其他变化类型"
                    : "Choose another change type"
                  : locale === "zh"
                    ? "没有新增、修改或删除字段"
                    : "No fields were added, modified, or removed"}
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function ImportPreviewDialog({
  open,
  onOpenChange,
  preview,
  previewing,
  locale,
  versions,
  environments,
  versionId,
  environmentId,
  onVersionChange,
  onEnvironmentChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ImportPreview | null;
  previewing: boolean;
  locale: "zh" | "en";
  versions: Version[];
  environments: Environment[];
  versionId: string;
  environmentId: string;
  onVersionChange: (id: string) => void;
  onEnvironmentChange: (id: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="workspace" className="flex h-[88svh] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-background p-0 shadow-2xl ring-1 ring-foreground/10">
        <DialogHeader className="shrink-0 border-b px-7 py-5">
          <div className="flex flex-col gap-5 pr-8 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold">
                {locale === "zh" ? "导入前预览" : "Import preview"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {locale === "zh"
                  ? "SQL 结构与目标版本、环境之间的字段差异"
                  : "Field differences between the SQL and target version and environment"}
              </DialogDescription>
            </div>
            <div className="grid min-w-0 gap-3 rounded-xl border bg-muted/15 p-3 sm:grid-cols-2 lg:w-[540px]">
              <SelectField
                value={versionId}
                onValueChange={onVersionChange}
                aria-label={locale === "zh" ? "对比版本" : "Compare version"}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {locale === "zh" ? "版本 · " : "Version · "}
                    {version.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                value={environmentId}
                onValueChange={onEnvironmentChange}
                aria-label={
                  locale === "zh" ? "对比环境" : "Compare environment"
                }
                disabled={!versionId}
              >
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {locale === "zh" ? "环境 · " : "Environment · "}
                    {environment.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        </DialogHeader>
        <SchemaDiffViewer
          preview={preview}
          loading={previewing}
          locale={locale}
          emptyText={
            locale === "zh"
              ? "这个环境与 SQL 结构完全一致"
              : "This environment matches the SQL"
          }
        />
        <div className="flex shrink-0 items-center gap-3 border-t bg-background px-7 py-4">
          <div className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {versions.find((item) => item.id === versionId)?.name ?? "—"} ·{" "}
            {environments.find((item) => item.id === environmentId)?.name ??
              "—"}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {locale === "zh" ? "取消" : "Cancel"}
          </Button>
          <Button
            type="button"
            disabled={!preview || previewing}
            onClick={onConfirm}
          >
            {locale === "zh" ? "确认导入" : "Confirm import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type CompareTarget = {
  projectId: string;
  versionId: string;
  environmentId: string;
};
function SchemaHistoryViewer({
  history,
  loading,
  error,
  locale,
}: {
  history: SchemaHistory | null;
  loading: boolean;
  error: string;
  locale: "zh" | "en";
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(80);
  const visibleEvents = (history?.events ?? []).filter((event) =>
    `${event.tableName}.${event.columnName ?? ""} ${event.code ?? ""} ${event.batchName ?? ""} ${event.projectName ?? ""} ${event.versionName ?? ""} ${event.environmentNames ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const shown = visibleEvents.slice(0, limit);
  const eventLabel = (event: HistoryEvent) =>
    event.kind === "table_created"
      ? locale === "zh"
        ? "创建表"
        : "Table created"
      : event.kind === "removed"
        ? locale === "zh"
          ? "删除"
          : "Removed"
        : event.revision <= 1
          ? locale === "zh"
            ? "新增"
            : "Added"
          : locale === "zh"
            ? "修改"
            : "Modified";
  const eventTone = (event: HistoryEvent) =>
    event.kind === "removed"
      ? "text-diff-removed"
      : event.kind === "revision" && event.revision > 1
        ? "text-diff-modified"
        : "text-diff-added";
  const definition = (event: HistoryEvent) =>
    event.dataType
      ? `${event.dataType}${event.nullable ? " NULL" : " NOT NULL"}${event.defaultValue !== null ? ` DEFAULT ${event.defaultValue}` : ""}${event.comment ? ` COMMENT ${event.comment}` : ""}${event.extra ? ` ${event.extra}` : ""}`
      : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b bg-muted/20 px-6 py-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(80);
            }}
            className="h-8 bg-background pl-8 text-xs"
            placeholder={
              locale === "zh"
                ? "搜索字段、版本或环境"
                : "Search field, version, or environment"
            }
          />
        </div>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {locale === "zh"
            ? `${visibleEvents.length} 条记录`
            : `${visibleEvents.length} events`}
        </span>
      </div>
      {loading ? (
        <div className="grid flex-1 place-items-center text-xs text-muted-foreground">
          <span className="animate-pulse">
            {locale === "zh" ? "正在读取历史…" : "Loading history…"}
          </span>
        </div>
      ) : error ? (
        <div className="grid flex-1 place-items-center text-sm text-destructive">
          {error}
        </div>
      ) : shown.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-5xl px-7 py-6">
            {shown.map((event, index) => (
              <div
                key={event.id}
                className="grid grid-cols-[110px_20px_minmax(0,1fr)] gap-4"
              >
                <time className="pt-0.5 text-right text-[10px] leading-5 text-muted-foreground">
                  {formatDate(event.createdAt, locale, true)}
                </time>
                <div className="relative flex justify-center">
                  <span
                    className={`relative z-10 mt-1.5 size-2.5 rounded-full bg-background ring-2 ${event.kind === "removed" ? "ring-diff-removed" : event.kind === "revision" && event.revision > 1 ? "ring-diff-modified" : "ring-diff-added"}`}
                  />
                  {index < shown.length - 1 && (
                    <span className="absolute inset-y-3 w-px bg-border" />
                  )}
                </div>
                <div className="mb-5 min-w-0 rounded-xl border bg-card px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-semibold ${eventTone(event)}`}
                    >
                      {eventLabel(event)}
                    </span>
                    <code className="min-w-0 flex-1 truncate text-xs font-medium">
                      {event.columnName
                        ? `${event.tableName}.${event.columnName}`
                        : event.tableName}
                    </code>
                    {event.revision > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        r{event.revision}
                      </span>
                    )}
                  </div>
                  {definition(event) && (
                    <code className="mt-2 block break-all rounded-md bg-muted/40 px-3 py-2 text-[10px] leading-5">
                      {definition(event)}
                    </code>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    {event.batchName && (
                      <span>
                        {event.batchName}
                        {event.batchCode ? ` · ${event.batchCode}` : ""}
                      </span>
                    )}
                    {event.projectName && <span>{event.projectName}</span>}
                    {event.versionName && <span>{event.versionName}</span>}
                    {event.environmentNames && (
                      <EnvironmentSummary value={event.environmentNames} locale={locale} />
                    )}
                    {event.message && <span>{event.message}</span>}
                  </div>
                </div>
              </div>
            ))}
            {visibleEvents.length > shown.length && (
              <div className="flex justify-center py-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((current) => current + 80)}
                >
                  {locale === "zh"
                    ? `继续显示 · 还有 ${visibleEvents.length - shown.length}`
                    : `Show more · ${visibleEvents.length - shown.length} left`}
                  <ChevronDown />
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
          {query
            ? locale === "zh"
              ? "没有匹配记录"
              : "No matching event"
            : locale === "zh"
              ? "暂时没有历史记录"
              : "No history yet"}
        </div>
      )}
    </div>
  );
}

function ScopeCompareDialog({
  open,
  onOpenChange,
  focus,
  projects,
  versions,
  environments,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focus: CompareFocus;
  projects: Project[];
  versions: Version[];
  environments: Environment[];
  locale: "zh" | "en";
}) {
  const [view, setView] = useState<"diff" | "history">("diff");
  const [base, setBase] = useState<CompareTarget>({
    projectId: "",
    versionId: "",
    environmentId: "",
  });
  const [target, setTarget] = useState<CompareTarget>({
    projectId: "",
    versionId: "",
    environmentId: "",
  });
  const [preview, setPreview] = useState<ScopePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<SchemaHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const projectVersions = (projectId: string) =>
    versions.filter((version) => version.projectId === projectId);
  const scopeEnvironments = (projectId: string, versionId: string) =>
    environments.filter(
      (environment) =>
        environment.projectId === projectId &&
        (!environment.versionId || environment.versionId === versionId),
    );
  const makeTarget = (projectId: string, preferredVersion = "") => {
    const versionId = projectVersions(projectId).some(
      (version) => version.id === preferredVersion,
    )
      ? preferredVersion
      : (projectVersions(projectId)[0]?.id ?? "");
    return {
      projectId,
      versionId,
      environmentId: scopeEnvironments(projectId, versionId)[0]?.id ?? "",
    };
  };
  useEffect(() => {
    if (!open || base.projectId || !projects.length) return;
    const timer = window.setTimeout(() => {
      const project = projects[0];
      const projectVersionList = versions.filter(
        (version) => version.projectId === project.id,
      );
      const create = (preferredVersion = "") => {
        const versionId = projectVersionList.some(
          (version) => version.id === preferredVersion,
        )
          ? preferredVersion
          : (projectVersionList[0]?.id ?? "");
        return {
          projectId: project.id,
          versionId,
          environmentId:
            environments.find(
              (environment) =>
                environment.projectId === project.id &&
                (!environment.versionId || environment.versionId === versionId),
            )?.id ?? "",
        };
      };
      const left = create(projectVersionList[0]?.id);
      const rightVersion = projectVersionList[1]?.id ?? left.versionId;
      const right = create(rightVersion);
      const alternate = environments.find(
        (environment) =>
          environment.projectId === project.id &&
          (!environment.versionId || environment.versionId === rightVersion) &&
          environment.id !== left.environmentId,
      );
      if (alternate) right.environmentId = alternate.id;
      setBase(left);
      setTarget(right);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, projects, versions, environments, base.projectId]);
  useEffect(() => {
    if (
      !open ||
      !base.projectId ||
      !base.versionId ||
      !base.environmentId ||
      !target.projectId ||
      !target.versionId ||
      !target.environmentId
    )
      return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const focusPayload =
          focus.kind === "table"
            ? { tableId: focus.id }
            : focus.kind === "field"
              ? { fieldId: focus.id }
              : {};
        const response = await fetch("/api/catalog", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "scope.compare",
            payload: { base, target, ...focusPayload },
          }),
          signal: controller.signal,
        });
        const result = (await response.json()) as ScopePreview & {
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "compare");
        setPreview(result);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") {
          setPreview(null);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, base, target, focus]);
  useEffect(() => {
    if (!open || focus.kind === "all") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const response = await fetch("/api/catalog", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "schema.history",
            payload: { kind: focus.kind, id: focus.id },
          }),
          signal: controller.signal,
        });
        const result = (await response.json()) as SchemaHistory & {
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "history");
        setHistory(result);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") {
          setHistory(null);
          setHistoryError(
            reason instanceof Error ? reason.message : String(reason),
          );
        }
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, focus]);
  const changeProject = (side: "base" | "target", projectId: string) => {
    const next = makeTarget(projectId);
    if (side === "base") setBase(next);
    else setTarget(next);
  };
  const changeVersion = (side: "base" | "target", versionId: string) => {
    const current = side === "base" ? base : target;
    const next = {
      ...current,
      versionId,
      environmentId:
        scopeEnvironments(current.projectId, versionId)[0]?.id ?? "",
    };
    if (side === "base") setBase(next);
    else setTarget(next);
  };
  const targetCard = (side: "base" | "target", value: CompareTarget) => {
    const isBase = side === "base";
    const tablePresent = isBase
      ? preview?.baseTablePresent
      : preview?.targetTablePresent;
    return (
      <div className="min-w-0 rounded-xl border bg-background p-4">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${isBase ? "bg-foreground/35" : "bg-diff-modified"}`}
          />
          <strong className="text-xs">
            {isBase
              ? locale === "zh"
                ? "基准范围"
                : "Base scope"
              : locale === "zh"
                ? "目标范围"
                : "Target scope"}
          </strong>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {focus.kind === "table" && tablePresent !== null && tablePresent !== undefined
              ? `${tablePresent ? (locale === "zh" ? "有表" : "table") : locale === "zh" ? "缺表" : "missing"} · `
              : ""}
            {isBase ? preview?.baseCount : preview?.targetCount}
            {locale === "zh" ? " 个字段" : " fields"}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <SelectField
            value={value.projectId}
            onValueChange={(projectId) => changeProject(side, projectId)}
            aria-label={locale === "zh" ? "项目" : "Project"}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            value={value.versionId}
            onValueChange={(versionId) => changeVersion(side, versionId)}
            aria-label={locale === "zh" ? "版本" : "Version"}
          >
            {projectVersions(value.projectId).map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            value={value.environmentId}
            onValueChange={(environmentId) =>
              side === "base"
                ? setBase({ ...value, environmentId })
                : setTarget({ ...value, environmentId })
            }
            aria-label={locale === "zh" ? "环境" : "Environment"}
          >
            {scopeEnvironments(value.projectId, value.versionId).map(
              (environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ),
            )}
          </SelectField>
        </div>
      </div>
    );
  };
  const title =
    focus.kind === "all"
      ? locale === "zh"
        ? "全库范围对比"
        : "Compare database scopes"
      : focus.name;
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setView("diff");
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent size="workspace" className="flex h-[90svh] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-background p-0 shadow-2xl ring-1 ring-foreground/10">
        <DialogHeader className="shrink-0 px-7 pb-4 pt-6">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            {focus.kind === "all"
              ? locale === "zh"
                ? "对比任意项目、版本与环境"
                : "Compare any project, version, and environment"
              : locale === "zh"
                ? "查看不同版本、环境的差异，以及完整变更历史"
                : "Compare versions and environments, or review the full history"}
          </DialogDescription>
        </DialogHeader>
        {focus.kind !== "all" && (
          <div className="shrink-0 border-t px-7 py-2">
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as "diff" | "history")}
            >
              <TabsList className="h-8">
                <TabsTrigger value="diff" className="h-7 px-3 text-xs">
                  <ArrowLeftRight className="size-3.5" />
                  {locale === "zh" ? "范围差异" : "Scope diff"}
                </TabsTrigger>
                <TabsTrigger value="history" className="h-7 px-3 text-xs">
                  <History className="size-3.5" />
                  {locale === "zh" ? "变更历史" : "History"}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
        {view === "diff" ? (
          <>
            <div className="grid shrink-0 items-center gap-3 border-y bg-muted/20 px-7 py-4 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]">
              {targetCard("base", base)}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="mx-auto rotate-90 lg:rotate-0"
                aria-label={locale === "zh" ? "交换范围" : "Swap scopes"}
                onClick={() => {
                  setBase(target);
                  setTarget(base);
                }}
              >
                <ArrowLeftRight />
              </Button>
              {targetCard("target", target)}
            </div>
            {error ? (
              <div className="grid flex-1 place-items-center px-6 text-sm text-destructive">
                {error}
              </div>
            ) : (
              <SchemaDiffViewer
                preview={preview}
                loading={loading}
                locale={locale}
              />
            )}
          </>
        ) : (
          <SchemaHistoryViewer
            history={history}
            loading={historyLoading}
            error={historyError}
            locale={locale}
          />
        )}
        <div className="flex shrink-0 items-center border-t px-7 py-4">
          <span className="text-[11px] text-muted-foreground">
            {view === "diff"
              ? locale === "zh"
                ? "方向：基准 → 目标"
                : "Direction: base → target"
              : locale === "zh"
                ? `${history?.events.length ?? 0} 条历史记录`
                : `${history?.events.length ?? 0} history events`}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="ml-auto"
            onClick={() => onOpenChange(false)}
          >
            {locale === "zh" ? "关闭" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseWorkspace({
  projects,
  locale,
  call,
  toast,
}: {
  projects: Project[];
  locale: "zh" | "en";
  call: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [insight, setInsight] = useState<ReleaseInsight>({
    changes: [],
    summary: null,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [lifecycleFilter, setLifecycleFilter] = useState<"active" | "deprecated" | "removed" | "all">("active");
  const [visibleLimit, setVisibleLimit] = useState(40);
  const [selectedGroup, setSelectedGroup] = useState<ReleaseGroup | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>("center");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: "release" });
      if (projectId) params.set("projectId", projectId);
      if (lifecycleFilter !== "all") params.set("lifecycleStatus", lifecycleFilter);
      const response = await fetch(`/api/catalog?${params}`);
      if (!response.ok) throw new Error("release");
      setInsight((await response.json()) as ReleaseInsight);
    } catch {
      setInsight({ changes: [], summary: null });
    } finally {
      setLoading(false);
    }
  }, [lifecycleFilter, projectId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const summary = {
    changes: number(insight.summary?.changes),
    pending: number(insight.summary?.pending),
    executed: number(insight.summary?.executed),
    verified: number(insight.summary?.verified),
    failed: number(insight.summary?.failed),
  };
  const filtered = insight.changes.filter((item) =>
    statusFilter === "all" || Number(item.pendingCount) > 0,
  );
  const grouped = Array.from(filtered.reduce((groups, item) => {
    const key = `${item.projectId}|${item.versionId}|${item.tableName}`;
    const current = groups.get(key) ?? { key, projectName: item.projectName, versionName: item.versionName, tableName: item.tableName, changes: [] as typeof filtered };
    current.changes.push(item);
    groups.set(key, current);
    return groups;
  }, new Map<string, ReleaseGroup>()).values())
    .filter((group) => `${group.projectName} ${group.versionName} ${group.tableName} ${group.changes.map((item) => `${item.fieldName} ${item.code}`).join(" ")}`.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((left, right) => right.changes.reduce((sum, item) => sum + Number(item.pendingCount), 0) - left.changes.reduce((sum, item) => sum + Number(item.pendingCount), 0));
  const visibleGroups = grouped.slice(0, visibleLimit);
  const setStatus = async (
    changeId: string,
    environmentId: string,
    status: string,
  ) => {
    try {
      await call("change.scopeStatus", { changeId, environmentId, status });
      toast(locale === "zh" ? "状态已更新" : "Status updated");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  const statusLabel = (status: string) =>
    status === "verified"
      ? locale === "zh"
        ? "已验证"
        : "Verified"
      : status === "executed"
        ? locale === "zh"
          ? "已执行"
          : "Executed"
        : status === "failed"
          ? locale === "zh"
            ? "失败"
            : "Failed"
          : status === "waived"
            ? locale === "zh"
              ? "已豁免"
              : "Waived"
            : locale === "zh"
              ? "待执行"
              : "Pending";
  return (
    <>
    <Card className="gap-0 overflow-hidden py-0">
      <div className="border-b p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setVisibleLimit(40);
            }}
            className="h-11 rounded-xl border-0 bg-muted/70 pl-10 pr-4 text-sm shadow-none focus-visible:ring-1"
            placeholder={
              locale === "zh"
                ? "搜索变更、字段或版本"
                : "Search changes, fields, or versions"
            }
          />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <SelectField
          value={projectId}
          onValueChange={(value) => {
            setProjectId(value);
            setVisibleLimit(40);
          }}
        >
          <option value="">
            {locale === "zh" ? "全部项目" : "All projects"}
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
          </SelectField>
          <SelectField value={lifecycleFilter} onValueChange={(value) => { setLifecycleFilter(value as typeof lifecycleFilter); setVisibleLimit(40); }}>
            <option value="active">{locale === "zh" ? "正常对象" : "Active objects"}</option>
            <option value="all">{locale === "zh" ? "全部生命周期" : "All lifecycle"}</option>
            <option value="deprecated">{locale === "zh" ? "废弃对象" : "Deprecated"}</option>
            <option value="removed">{locale === "zh" ? "已移除对象" : "Removed"}</option>
          </SelectField>
          <div className="flex items-center rounded-lg bg-muted/50 p-1">
          {([["pending", locale === "zh" ? "待处理" : "Pending"], ["all", locale === "zh" ? "全部变更" : "All changes"]] as const).map(([value, label]) => (
            <button type="button" key={value} onClick={() => { setStatusFilter(value); setVisibleLimit(40); }} className={`rounded-md px-2.5 py-1 ${statusFilter === value ? "bg-background font-medium shadow-sm text-foreground" : "hover:text-foreground"}`}>
              {label}
            </button>
          ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>{locale === "zh" ? "发布用于记录 SQL 在各环境的执行与验证状态" : "Release records SQL execution and verification across environments"}</span>
          <span>{locale === "zh" ? "待处理" : "Pending"} {summary.pending} · {locale === "zh" ? "共" : "Total"} {summary.changes}</span>
        </div>
      </div>
      <div className="min-h-[420px]">
        {loading ? (
          <Empty
            text={
              locale === "zh" ? "正在整理发布状态…" : "Loading release status…"
            }
          />
        ) : visibleGroups.length ? (
          <CardContent className="divide-y p-0">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-2 text-[10px] text-muted-foreground backdrop-blur-sm">
              <span>{locale === "zh" ? `找到 ${grouped.length} 张表` : `${grouped.length} tables found`}</span>
              <span>{locale === "zh" ? `已加载 ${visibleGroups.length}` : `${visibleGroups.length} loaded`}</span>
            </div>
            {visibleGroups.map((group) => {
              const groupPending = group.changes.reduce((sum, item) => sum + Number(item.pendingCount), 0);
              const pendingNames = Array.from(new Set(group.changes.flatMap((item) => (item.pendingEnvironments ?? "").split("|||").filter(Boolean))));
              return (
                <div key={group.key} className="px-4 py-3 transition-colors hover:bg-muted/30">
                  <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setSelectedGroup(group)}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><FileCode2 className="size-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs">{group.tableName}</strong>
                      <span className="mt-1 flex items-center gap-2 truncate text-[10px] text-muted-foreground"><span className="truncate">{group.projectName} · {group.versionName} · {group.changes.length} {locale === "zh" ? "个字段" : "fields"}</span>{group.changes[0]?.lifecycleStatus !== "active" && <Badge variant="outline" className="shrink-0 text-[9px]">{group.changes[0]?.lifecycleStatus === "deprecated" ? (locale === "zh" ? "废弃" : "Deprecated") : (locale === "zh" ? "已移除" : "Removed")}</Badge>}</span>
                    </span>
                    <span className="hidden max-w-[38%] truncate text-[10px] text-muted-foreground sm:block">{groupPending ? `${locale === "zh" ? "待处理：" : "Pending: "}${pendingNames.slice(0, 2).join("、")}${pendingNames.length > 2 ? ` +${pendingNames.length - 2}` : ""}` : locale === "zh" ? "已完成" : "Complete"}</span>
                    <Badge variant={groupPending ? "secondary" : "outline"}>{groupPending ? `${locale === "zh" ? "待处理 " : "Pending "}${groupPending}` : locale === "zh" ? "已完成" : "Complete"}</Badge>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
            {grouped.length > visibleGroups.length && (
              <div className="flex justify-center border-t p-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => setVisibleLimit((value) => value + 40)}>
                  {locale === "zh" ? `继续加载（还有 ${grouped.length - visibleGroups.length} 张表）` : `Load more (${grouped.length - visibleGroups.length} tables)`}
                </Button>
              </div>
            )}
          </CardContent>
        ) : (
          <Empty
            text={
              filter
                ? locale === "zh"
                  ? "没有匹配的变更"
                  : "No matching changes"
                : locale === "zh"
                  ? "当前没有真实发布变更。初始化建表导入不会进入这里，后续 ALTER、ADD、MODIFY、DROP 才会显示。"
                  : "No rollout changes yet. Initial CREATE snapshots stay out of this list; later ALTER, ADD, MODIFY, and DROP statements appear here."
            }
          />
        )}
      </div>
    </Card>
    {selectedGroup && (
      <DetailSurface
        mode={detailMode}
        onModeChange={setDetailMode}
        canGoBack={false}
        onBack={() => undefined}
        onClose={() => setSelectedGroup(null)}
        locale={locale}
      >
        <ReleaseGroupDetail
          group={selectedGroup}
          locale={locale}
          statusLabel={statusLabel}
          onStatus={setStatus}
        />
      </DetailSurface>
    )}
    </>
  );
}

function ReleaseGroupDetail({
  group,
  locale,
  statusLabel,
  onStatus,
}: {
  group: ReleaseGroup;
  locale: "zh" | "en";
  statusLabel: (status: string) => string;
  onStatus: (changeId: string, environmentId: string, status: string) => Promise<void>;
}) {
  const environments = Array.from(
    group.changes.reduce((result, change) => {
      const ids = (change.environmentIds ?? "").split("|||").filter(Boolean);
      const names = (change.environmentNames ?? "").split("|||");
      ids.forEach((id, index) => {
        if (!result.has(id)) result.set(id, { id, name: names[index] ?? id });
      });
      return result;
    }, new Map<string, { id: string; name: string }>()).values(),
  );
  const columns = `minmax(180px,1.3fr) repeat(${Math.max(environments.length, 1)}, minmax(112px,1fr))`;
  const statusTone = (status: string) =>
    status === "verified"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "executed"
        ? "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300"
        : status === "failed"
          ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
          : status === "waived"
            ? "border-muted-foreground/20 bg-muted text-muted-foreground"
            : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const statusDot = (status: string) =>
    status === "verified"
      ? "bg-emerald-500"
      : status === "executed"
        ? "bg-blue-500"
        : status === "failed"
          ? "bg-red-500"
          : status === "waived"
            ? "bg-muted-foreground/50"
            : "bg-amber-500";
  return (
    <>
      <SheetHeader className="px-5 py-4 pr-14">
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><FileCode2 className="size-3.5" /></span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-mono text-sm">{group.tableName}</SheetTitle>
            <SheetDescription>{group.projectName} · {group.versionName}</SheetDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">{group.changes.length} {locale === "zh" ? "字段" : "fields"}</Badge>
        </div>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>{locale === "zh" ? "按环境记录执行状态" : "Execution status by environment"}</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-500" />{statusLabel("pending")}</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />{statusLabel("verified")}</span>
        </div>
        <div className="min-w-[680px] overflow-hidden rounded-xl border bg-background">
          <div className="grid border-b bg-muted/35 px-3 py-2 text-[10px] font-medium text-muted-foreground" style={{ gridTemplateColumns: columns }}>
            <span>{locale === "zh" ? "字段变更" : "Field change"}</span>
            {environments.map((environment) => <span key={environment.id} className="truncate px-2" title={environment.name}>{environment.name}</span>)}
          </div>
          <div className="divide-y">
          {group.changes.map((change) => {
            const ids = (change.environmentIds ?? "").split("|||").filter(Boolean);
            const statuses = (change.environmentStatuses ?? "").split("|||");
            const statusByEnvironment = new Map(ids.map((id, index) => [id, statuses[index] ?? "pending"]));
            return (
              <section key={change.id} className="grid items-center px-3 py-3" style={{ gridTemplateColumns: columns }}>
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2"><strong className="truncate text-xs">{change.fieldName}</strong><Badge variant="outline" className="shrink-0 text-[9px]">{change.action.toUpperCase()}</Badge></div>
                  <code className="mt-1 block truncate text-[10px] text-muted-foreground">{change.code}</code>
                </div>
                {environments.map((environment) => {
                  const status = statusByEnvironment.get(environment.id);
                  if (!status) return <span key={`${change.id}-${environment.id}`} className="px-2 text-center text-xs text-muted-foreground/40">—</span>;
                  return (
                    <div key={`${change.id}-${environment.id}`} className={`mx-1 flex min-w-0 items-center gap-1 rounded-lg border px-1.5 py-1 ${statusTone(status)}`}>
                      <span className={`size-1.5 shrink-0 rounded-full ${statusDot(status)}`} />
                      <SelectField aria-label={`${environment.name} status`} value={status} onValueChange={(next) => void onStatus(change.id, environment.id, next)} className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-[10px] shadow-none focus-visible:ring-0">
                        <option value="pending">{statusLabel("pending")}</option><option value="executed">{statusLabel("executed")}</option><option value="verified">{statusLabel("verified")}</option><option value="failed">{statusLabel("failed")}</option><option value="waived">{statusLabel("waived")}</option>
                      </SelectField>
                    </div>
                  );
                })}
              </section>
            );
          })}
          </div>
        </div>
      </div>
    </>
  );
}

function SettingsView({
  data,
  t,
  open,
  remove,
  call,
  toast,
  askConfirm,
}: {
  data: CatalogData;
  t: (typeof words)["zh"] | (typeof words)["en"];
  open: (
    kind: Exclude<ModalKind, null>,
    record?: Record<string, unknown>,
  ) => void;
  remove: (entity: string, id: string) => Promise<void>;
  call: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
  askConfirm: (request: Confirmation) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-0">
        <CardHeader className="flex-row items-center">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Boxes className="size-4" />
            {t.modules}
            <Badge variant="secondary">{data.modules.length}</Badge>
          </CardTitle>
          <div className="ml-auto">
            <IconButton label={t.addModule} onClick={() => open("module")}>
              <Plus />
            </IconButton>
          </div>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {data.modules.map((module) => (
            <div key={module.id} className="flex items-center gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-xs">
                  {module.name}
                </strong>
                <span className="text-[10px] text-muted-foreground">
                  {module.code} · {module.tableCount}{" "}
                  {t === words.zh ? "张表" : "tables"}
                </span>
              </div>
              <EntityMenu
                t={t}
                onEdit={() =>
                  open("module", module as unknown as Record<string, unknown>)
                }
                onDelete={() => void remove("module", module.id)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="gap-0">
        <CardHeader className="flex-row items-center">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderGit2 className="size-4" />
            GitHub<Badge variant="secondary">{data.repositories.length}</Badge>
          </CardTitle>
          <div className="ml-auto">
            <IconButton label={t.addSource} onClick={() => open("repository")}>
              <Plus />
            </IconButton>
          </div>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {data.repositories.map((source) => (
            <div key={source.id} className="flex items-center gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-xs">
                  {source.name}
                </strong>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {source.repository} · {source.branch} · {source.pathPattern}
                </span>
              </div>
              <EntityMenu
                t={t}
                onEdit={() =>
                  open(
                    "repository",
                    source as unknown as Record<string, unknown>,
                  )
                }
                onDelete={() => void remove("repository", source.id)}
              />
            </div>
          ))}
          {!data.repositories.length && <Empty text={t.noData} />}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardContent className="flex items-center justify-between">
          <span className="text-sm font-medium">{t.reset}</span>
          <Button
            variant="destructive"
            size="icon"
            aria-label={t.reset}
            onClick={() =>
              askConfirm({
                title: t.confirmReset,
                description:
                  t === words.zh
                    ? "字段、表、环境范围和全部导入记录都将被清空，项目与环境设置会保留。此操作无法撤销。"
                    : "All fields, tables, scopes, and import history will be cleared. Projects and environments stay. This cannot be undone.",
                confirmLabel: t.reset,
                run: async () => {
                  await call("catalog.reset");
                  toast(t.saved);
                },
              })
            }
          >
            <Trash2 />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PrimaryNav({
  view,
  nav,
  go,
}: {
  view: View;
  nav: { view: View; label: string; icon: typeof Search }[];
  go: (view: View) => void;
}) {
  const current = nav.find((item) => item.view === view) ?? nav[0];
  const CurrentIcon = current.icon;
  return (
    <>
      <nav className="hidden items-center rounded-lg bg-muted/70 p-0.5 md:flex">
        {nav.map((item) => {
          const ItemIcon = item.icon;
          const active = item.view === view;
          return (
            <Button
              key={item.view}
              type="button"
              variant="ghost"
              size="sm"
              className={
                "h-8 gap-1.5 rounded-md px-3 text-xs " +
                (active
                  ? "bg-background shadow-sm hover:bg-background"
                  : "text-muted-foreground")
              }
              onClick={() => go(item.view)}
            >
              <ItemIcon className="size-3.5" />
              {item.label}
            </Button>
          );
        })}
      </nav>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="min-w-28 justify-between gap-2 md:hidden"
          >
            <CurrentIcon />
            <span>{current.label}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {nav.map((item) => {
            const ItemIcon = item.icon;
            return (
              <DropdownMenuItem key={item.view} onClick={() => go(item.view)}>
                <ItemIcon />
                {item.label}
                {item.view === view && <Check className="ml-auto" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function LanguageSwitcher({
  locale,
  chooseLocale,
}: {
  locale: "zh" | "en";
  chooseLocale: (locale: "zh" | "en") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <Languages />
          <span className="hidden sm:inline">
            {locale === "zh" ? "中文" : "English"}
          </span>
          <span className="sm:hidden">{locale === "zh" ? "中" : "EN"}</span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem onClick={() => chooseLocale("zh")}>
          中文{locale === "zh" && <Check className="ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => chooseLocale("en")}>
          English{locale === "en" && <Check className="ml-auto" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreateMenu({
  t,
  projects,
  open,
  go,
}: {
  t: (typeof words)["zh"] | (typeof words)["en"];
  projects: Project[];
  open: (
    kind: Exclude<ModalKind, null>,
    record?: Record<string, unknown>,
  ) => void;
  go: (view: View) => void;
}) {
  const projectId = projects[0]?.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" aria-label="New">
          <Plus />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={() => open("project")}>
          <GitBranch />
          {t.addProject}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!projectId}
          onClick={() => open("version", { projectId })}
        >
          <Layers3 />
          {t.addVersion}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!projectId}
          onClick={() => open("environment", { projectId })}
        >
          <Plus />
          {t.addEnvironment}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => open("module")}>
          <Boxes />
          {t.addModule}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => open("table")}>
          <Table2 />
          {t.addTable}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => open("field")}>
          <Database />
          {t.addField}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go("imports")}>
          <Import />
          {t.runImport}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScopePicker({
  envs,
  selected,
  onChange,
  t,
}: {
  envs: Environment[];
  selected: string[];
  onChange: (ids: string[]) => void;
  t: (typeof words)["zh"] | (typeof words)["en"];
}) {
  const chosen = envs.filter((env) => selected.includes(env.id));
  const all = envs.length > 0 && chosen.length === envs.length;
  const summary = !envs.length
    ? "—"
    : !chosen.length
      ? t.targetEnvs
      : all
        ? t === words.zh
          ? `全部环境 · ${envs.length}`
          : `All environments · ${envs.length}`
        : chosen.length <= 2
          ? chosen.map((env) => env.name).join(" · ")
          : t === words.zh
            ? `${chosen[0].name} 等 ${chosen.length} 个`
            : `${chosen[0].name} +${chosen.length - 1}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={!envs.length}
          className="w-full justify-between px-3 font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <CircleDot className="size-3.5 text-muted-foreground" />
            <span
              className={`truncate text-xs ${chosen.length ? "" : "text-muted-foreground"}`}
            >
              {summary}
            </span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-(--radix-dropdown-menu-trigger-width)"
      >
        <DropdownMenuCheckboxItem
          checked={all ? true : chosen.length ? "indeterminate" : false}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(checked) =>
            onChange(checked === true ? envs.map((env) => env.id) : [])
          }
          className="h-8 text-xs font-medium"
        >
          <span>{t === words.zh ? "全部环境" : "All environments"}</span>
          <span className="ml-auto pr-5 text-[10px] text-muted-foreground">
            {envs.length}
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {envs.map((env) => (
          <DropdownMenuCheckboxItem
            key={env.id}
            checked={selected.includes(env.id)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(
                checked === true
                  ? [...selected.filter((id) => id !== env.id), env.id]
                  : selected.filter((id) => id !== env.id),
              )
            }
            className="h-8 text-xs"
          >
            {env.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectPicker({
  projects,
  selected,
  onChange,
  locale,
}: {
  projects: Project[];
  selected: string[];
  onChange: (ids: string[]) => void;
  locale: "zh" | "en";
}) {
  const chosen = projects.filter((project) => selected.includes(project.id));
  const all = projects.length > 0 && chosen.length === projects.length;
  const summary = !chosen.length
    ? locale === "zh" ? "所有项目" : "All projects"
    : all
      ? locale === "zh" ? `全部项目 · ${projects.length}` : `All projects · ${projects.length}`
      : chosen.length <= 2
        ? chosen.map((project) => project.name).join(" · ")
        : locale === "zh" ? `${chosen[0].name} 等 ${chosen.length} 个` : `${chosen[0].name} +${chosen.length - 1}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={!projects.length} className="w-full justify-between px-3 font-normal">
          <span className={`truncate text-xs ${chosen.length ? "" : "text-muted-foreground"}`}>{summary}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuCheckboxItem checked={all ? true : chosen.length ? "indeterminate" : false} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => onChange(checked === true ? projects.map((project) => project.id) : [])} className="h-8 text-xs font-medium">
          {locale === "zh" ? "全部项目" : "All projects"}
          <span className="ml-auto pr-5 text-[10px] text-muted-foreground">{projects.length}</span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {projects.map((project) => <DropdownMenuCheckboxItem key={project.id} checked={selected.includes(project.id)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => onChange(checked === true ? [...selected.filter((id) => id !== project.id), project.id] : selected.filter((id) => id !== project.id))} className="h-8 text-xs">{project.name}</DropdownMenuCheckboxItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EnvironmentSummary({
  value,
  locale,
  className = "",
}: {
  value: string;
  locale: "zh" | "en";
  className?: string;
}) {
  const names = value.split("|||").map((name) => name.trim()).filter(Boolean);
  if (!names.length) return null;
  const visible = names.slice(0, 2);
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center gap-1 align-middle ${className}`}
      title={names.join(" · ")}
    >
      <span className="shrink-0 text-muted-foreground">
        {locale === "zh" ? `${names.length} 个环境` : `${names.length} envs`}
      </span>
      <span className="min-w-0 truncate">
        {visible.join(" · ")}
      </span>
      {names.length > visible.length && (
        <span className="shrink-0 text-muted-foreground">
          +{names.length - visible.length}
        </span>
      )}
    </span>
  );
}

function ProjectLifecycleControl({
  projects,
  scopes,
  locale,
  onChange,
  cascade = false,
  className = "",
}: {
  projects: Project[];
  scopes: { projectId: string; lifecycleStatus?: "active" | "deprecated" | "removed" }[];
  locale: "zh" | "en";
  onChange: (projectId: string, status: "active" | "deprecated" | "removed") => Promise<void>;
  cascade?: boolean;
  className?: string;
}) {
  const projectIds = Array.from(new Set(scopes.map((scope) => scope.projectId)));
  const availableProjects = projects.filter((project) => projectIds.includes(project.id));
  const [projectId, setProjectId] = useState(projectIds[0] ?? "");
  const [busy, setBusy] = useState(false);
  const selectedProjectId = projectIds.includes(projectId) ? projectId : projectIds[0] ?? "";
  const status = scopes.find((scope) => scope.projectId === selectedProjectId)?.lifecycleStatus ?? "active";
  if (!availableProjects.length) return null;
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${className}`}>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-xs font-medium">
          {locale === "zh" ? "项目内状态" : "Project status"}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {cascade
            ? locale === "zh" ? "表状态会同步到该项目内的字段、索引和约束" : "Applies to fields, indexes, and constraints in this project"
            : locale === "zh" ? "该项目的所有版本和环境共用此状态" : "Shared by every version and environment in this project"}
        </span>
      </span>
      {availableProjects.length > 1 ? (
        <SelectField value={selectedProjectId} onValueChange={setProjectId} className="w-32">
          {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </SelectField>
      ) : (
        <span className="max-w-28 truncate text-[11px] text-muted-foreground">{availableProjects[0]?.name}</span>
      )}
      <LifecycleMenu
        status={status}
        locale={locale}
        disabled={busy}
        onChange={(next) => {
          setBusy(true);
          void onChange(selectedProjectId, next).finally(() => setBusy(false));
        }}
      />
    </div>
  );
}

function LifecycleMenu({
  status,
  locale,
  onChange,
  disabled = false,
}: {
  status: "active" | "deprecated" | "removed";
  locale: "zh" | "en";
  onChange: (status: "active" | "deprecated" | "removed") => void;
  disabled?: boolean;
}) {
  const label = status === "deprecated"
    ? locale === "zh" ? "废弃" : "Deprecated"
    : status === "removed"
      ? locale === "zh" ? "已移除" : "Removed"
      : locale === "zh" ? "正常" : "Active";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} className="h-7 justify-start px-1.5 text-[10px] text-muted-foreground">
          {label}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["active", "deprecated", "removed"] as const).map((next) => (
          <DropdownMenuItem key={next} onClick={() => onChange(next)}>
            {next === "active" ? (locale === "zh" ? "正常" : "Active") : next === "deprecated" ? (locale === "zh" ? "废弃" : "Deprecated") : (locale === "zh" ? "已移除" : "Removed")}
            {next === status && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectField({
  children,
  name,
  value,
  defaultValue,
  onValueChange,
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const options = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement<{
    value?: string | number;
    children?: ReactNode;
    disabled?: boolean;
  }>[];
  const normalized = value ?? defaultValue ?? "";
  const rootValue = value === undefined ? undefined : value || emptySelect;
  const rootDefault =
    value === undefined ? defaultValue || emptySelect : undefined;
  return (
    <Select
      name={name}
      value={rootValue}
      defaultValue={rootDefault}
      required={required}
      disabled={disabled}
      onValueChange={(next) =>
        onValueChange?.(next === emptySelect ? "" : next)
      }
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={`h-9 w-full px-3 text-xs ${normalized ? "" : "text-muted-foreground"} ${className ?? ""}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option, index) => {
          const raw = String(option.props.value ?? "");
          if (required && !raw) return null;
          return (
            <SelectItem
              key={`${raw}-${index}`}
              value={raw || emptySelect}
              disabled={option.props.disabled}
              className="h-8 text-xs"
            >
              {option.props.children}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
function SearchSelect({
  name,
  defaultValue,
  placeholder,
  searchLabel,
  emptyLabel,
  options,
}: {
  name: string;
  defaultValue: string;
  placeholder: string;
  searchLabel: string;
  emptyLabel: string;
  options: { value: string; label: string; meta?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [filter, setFilter] = useState("");
  const selected = options.find((option) => option.value === value);
  const visible = options.filter((option) =>
    `${option.label} ${option.meta ?? ""}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFilter("");
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between px-3 font-normal"
          >
            <span
              className={`truncate text-xs ${selected ? "" : "text-muted-foreground"}`}
            >
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-(--radix-dropdown-menu-trigger-width) p-1"
        >
          <div className="p-1" onKeyDown={(event) => event.stopPropagation()}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={searchLabel}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {visible.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => {
                  setValue(option.value);
                  setOpen(false);
                }}
                className="h-9"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{option.label}</span>
                  {option.meta && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {option.meta}
                    </span>
                  )}
                </span>
                {value === option.value && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            {!visible.length && (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                {emptyLabel}
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
function IconButton({
  label,
  children,
  onClick,
  active = false,
  danger = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className={danger ? "text-destructive" : ""}
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function EntityMenu({
  t,
  onEdit,
  onDelete,
}: {
  t: (typeof words)["zh"] | (typeof words)["en"];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          {t.edit}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          {t.remove}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ text = "—" }: { text?: string }) {
  return (
    <div className="grid min-h-28 place-items-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}
function ModalActions({
  busy,
  t,
  onClose,
  onDelete,
}: {
  busy: boolean;
  t: (typeof words)["zh"] | (typeof words)["en"];
  onClose: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive"
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      )}
      <span className="flex-1" />
      <Button type="button" variant="ghost" onClick={onClose}>
        {t.cancel}
      </Button>
      <Button disabled={busy}>{busy ? "…" : t.save}</Button>
    </div>
  );
}
function modalTitle(
  kind: Exclude<ModalKind, null>,
  t: (typeof words)["zh"] | (typeof words)["en"],
  editing: boolean,
) {
  const add = {
    project: t.addProject,
    environment: t.addEnvironment,
    version: t.addVersion,
    module: t.addModule,
    table: t.addTable,
    field: t.addField,
    repository: t.addSource,
  }[kind];
  if (!editing) return add;
  const noun =
    t === words.zh
      ? {
          project: "项目",
          environment: "环境",
          version: "版本",
          module: "模块",
          table: "数据表",
          field: "字段",
          repository: "来源",
        }[kind]
      : {
          project: "project",
          environment: "environment",
          version: "version",
          module: "module",
          table: "table",
          field: "field",
          repository: "source",
        }[kind];
  return t === words.zh ? `${t.edit}${noun}` : `${t.edit} ${noun}`;
}
