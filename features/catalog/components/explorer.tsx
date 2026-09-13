"use client";

import type { CompareFocus, DetailMode, Environment, FieldItem, Project, Scope, SearchObject, TableInsight, TableItem, TableScope, Version } from "@/features/catalog/model/types";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EntityMenu, IconButton, LifecycleMenu, ProjectLifecycleControl, ProjectPicker, ScopePicker, SelectField, words } from "@/features/catalog/presentation";
import { AppWindow, ArrowLeft, ArrowLeftRight, ArrowRight, CheckCircle2, ChevronDown, Database, Maximize2, Network, PanelRight, Search, Shield, Table2, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 结构查询工作区。
 *
 * 负责表、字段、索引、约束的检索、筛选、分页、详情展示和范围覆盖率展示；
 * 写操作通过上层传入的回调完成。
 */
/** 为详情内容提供侧栏、居中弹窗和全屏三种统一容器。 */
export function DetailSurface({
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

/** 在表、字段、索引、约束四类结构视图之间切换。 */
export function SchemaExplorerView({
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

/** 查询并分页展示索引或约束等通用结构对象。 */
export function ObjectExplorerView({
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

/** 展示一个结构对象在项目、版本和环境范围内的覆盖情况。 */
export function ScopeCoverage({
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
    const version = versions.find((item) => item.id === (versionId || environment.versionId));
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

/** 查询、筛选并分页展示表，同时打开表详情。 */
export function TableExplorerView({
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

/** 查询、筛选并分页展示字段，是结构查询工作区的字段入口。 */
export function ExplorerView({
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

/** 展示单张表的字段、索引、约束、范围和生命周期信息。 */
export function TableDetail({
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
                      (env) => env.projectId === project.id,
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

/** 展示单个字段的定义、范围修订和生命周期信息。 */
export function FieldDetail({
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
                      (env) => env.projectId === project.id,
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
