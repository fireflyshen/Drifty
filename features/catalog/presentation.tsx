"use client";

import { Store } from "lucide-react";
import type { CatalogData, Environment, ModalKind, Project, View } from "@/features/catalog/model/types";
import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, Archive, Atom, BookOpen, Bot, Box, Boxes, Briefcase, Building2, Check, ChevronDown, CircleDot, Cloud, Code2, Cog, Cpu, Database, Factory, FlaskConical, GitBranch, Globe2, HeartPulse, HomeIcon, Import, Landmark, Languages, Layers3, Library, MoreHorizontal, Network, Package, Pencil, Plane, Plus, Rocket, Search, Server, Shield, ShoppingCart, Table2, Trash2, Truck, Users, Warehouse, Wrench, Zap } from "lucide-react";
import { Children, isValidElement, useState } from "react";

/**
 * 目录功能共享的展示配置与小型控件。
 *
 * 包含空数据默认值、文案、图标映射、格式化函数、导航/选择器和表单辅助组件。
 * 这些组件只处理展示与输入适配，不拥有目录业务数据。
 */
export const empty: CatalogData = {
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
export const emptySelect = "__drifty_empty__";
export const projectIconOptions = [
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
export const words = {
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

/** 规范化 API 数值。 */
export function number(value: unknown) {
  return typeof value === "number" ? value : Number(value) || 0;
}
/** 按语言格式化 UTC 时间。 */
export function formatDate(value: string, locale: "zh" | "en", compact = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", compact
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
    : { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date);
}
/** 转换导入结果文案。 */
export function importResultLabel(result: string, locale: "zh" | "en") {
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
/** 渲染产品标识。 */
export function DriftyLogo({ className = "size-8" }: { className?: string }) {
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
/** 按配置渲染项目图标。 */
export function ProjectIcon({
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
/** 选择并提交项目图标。 */
export function ProjectIconPicker({ defaultValue }: { defaultValue: string }) {
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

/** 渲染主导航。 */
export function PrimaryNav({
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

/** 切换界面语言。 */
export function LanguageSwitcher({
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

/** 提供上下文相关的新建入口。 */
export function CreateMenu({
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

/** 选择项目、版本和环境范围。 */
export function ScopePicker({
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

/** 选择项目。 */
export function ProjectPicker({
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

/** 压缩展示环境名称。 */
export function EnvironmentSummary({
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

/** 更新项目范围内的对象生命周期。 */
export function ProjectLifecycleControl({
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

/** 提供生命周期操作菜单。 */
export function LifecycleMenu({
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

/** 将原生选项适配到统一选择器。 */
export function SelectField({
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
/** 提供可搜索选择器。 */
export function SearchSelect({
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
/** 提供带提示的图标按钮。 */
export function IconButton({
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
/** 提供实体编辑和删除菜单。 */
export function EntityMenu({
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
/** 统一表单字段布局。 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
/** 渲染空状态。 */
export function Empty({ text = "—" }: { text?: string }) {
  return (
    <div className="grid min-h-28 place-items-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}
/** 渲染弹窗操作区。 */
export function ModalActions({
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
/** 生成实体弹窗标题。 */
export function modalTitle(
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
