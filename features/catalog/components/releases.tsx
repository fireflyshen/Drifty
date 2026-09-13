"use client";

import { number } from "@/features/catalog/presentation";
import type { DetailMode, Project, ReleaseGroup, ReleaseInsight } from "@/features/catalog/model/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DetailSurface } from "@/features/catalog/components/explorer";
import { Empty, SelectField } from "@/features/catalog/presentation";
import { ArrowRight, FileCode2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * 发布变更工作区。
 *
 * 负责按导入批次聚合变更，展示各环境执行状态并登记状态更新。
 */
/** 聚合并展示发布变更和环境状态。 */
export function ReleaseWorkspace({
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
    const key = item.importBatchId || item.id;
    const current = groups.get(key) ?? { key, projectName: item.projectName, versionName: item.versionName, name: item.batchName || item.name, changes: [] as typeof filtered };
    current.changes.push(item);
    groups.set(key, current);
    return groups;
  }, new Map<string, ReleaseGroup>()).values())
    .filter((group) => `${group.projectName} ${group.versionName} ${group.name} ${group.changes.map((item) => `${item.tableName} ${item.fieldName} ${item.code}`).join(" ")}`.toLowerCase().includes(filter.trim().toLowerCase()))
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
  const openGroup = async (group: ReleaseGroup) => {
    setSelectedGroup(group);
    const batchId=group.changes[0]?.importBatchId;
    const total=Math.max(...group.changes.map((change)=>Number(change.batchTotal)||1));
    if(!batchId||group.changes.length>=total)return;
    try {
      const params=new URLSearchParams({mode:"release",batchId,limit:"5000"});
      if(projectId)params.set("projectId",projectId);
      if(lifecycleFilter!=="all")params.set("lifecycleStatus",lifecycleFilter);
      const response=await fetch(`/api/catalog?${params}`);
      if(!response.ok)throw new Error("release detail");
      const detail=await response.json() as ReleaseInsight;
      setSelectedGroup((current)=>current?.key===group.key?{...current,changes:detail.changes}:current);
    } catch {
      toast(locale==="zh"?"完整变更包加载失败":"Failed to load the complete change package");
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
              <span>{locale === "zh" ? `找到 ${grouped.length} 个变更包` : `${grouped.length} change packages found`}</span>
              <span>{locale === "zh" ? `已加载 ${visibleGroups.length}` : `${visibleGroups.length} loaded`}</span>
            </div>
            {visibleGroups.map((group) => {
              const groupPending = group.changes.reduce((sum, item) => sum + Number(item.pendingCount), 0);
              const pendingNames = Array.from(new Set(group.changes.flatMap((item) => (item.pendingEnvironments ?? "").split("|||").filter(Boolean))));
              return (
                <div key={group.key} className="px-4 py-3 transition-colors hover:bg-muted/30">
                  <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => void openGroup(group)}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><FileCode2 className="size-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs">{group.name}</strong>
                      <span className="mt-1 flex items-center gap-2 truncate text-[10px] text-muted-foreground"><span className="truncate">{group.projectName} · {group.versionName} · {Math.max(...group.changes.map((change)=>Number(change.batchTotal)||1))} {locale === "zh" ? "项变更" : "changes"}</span>{group.changes[0]?.lifecycleStatus !== "active" && <Badge variant="outline" className="shrink-0 text-[9px]">{group.changes[0]?.lifecycleStatus === "deprecated" ? (locale === "zh" ? "废弃" : "Deprecated") : (locale === "zh" ? "已移除" : "Removed")}</Badge>}</span>
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
                  {locale === "zh" ? `继续加载（还有 ${grouped.length - visibleGroups.length} 个变更包）` : `Load more (${grouped.length - visibleGroups.length} packages)`}
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

/** 展示单个发布批次的变更详情。 */
export function ReleaseGroupDetail({
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
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(60);
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
  const filteredChanges = group.changes.filter((change) =>
    `${change.tableName}.${change.fieldName} ${change.code} ${change.action}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const visibleChanges = filteredChanges.slice(0, visibleLimit);
  return (
    <>
      <SheetHeader className="px-5 py-4 pr-14">
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><FileCode2 className="size-3.5" /></span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-sm">{group.name}</SheetTitle>
            <SheetDescription>{group.projectName} · {group.versionName}</SheetDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">{group.changes.length} {locale === "zh" ? "项" : "changes"}</Badge>
        </div>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]">
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(60); }} className="h-9 rounded-lg border-0 bg-muted/60 pl-9 shadow-none" placeholder={locale === "zh" ? "搜索表、字段或变更编号" : "Search table, field, or change"} />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{locale === "zh" ? `${filteredChanges.length} 项` : `${filteredChanges.length} changes`}</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-500" />{statusLabel("pending")}</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />{statusLabel("verified")}</span>
          </div>
        </div>
        <div className="min-w-[680px] overflow-hidden rounded-xl border bg-background">
          <div className="grid border-b bg-muted/35 px-3 py-2 text-[10px] font-medium text-muted-foreground" style={{ gridTemplateColumns: columns }}>
            <span>{locale === "zh" ? "结构变更" : "Schema change"}</span>
            {environments.map((environment) => <span key={environment.id} className="truncate px-2" title={environment.name}>{environment.name}</span>)}
          </div>
          <div className="divide-y">
          {visibleChanges.map((change) => {
            const ids = (change.environmentIds ?? "").split("|||").filter(Boolean);
            const statuses = (change.environmentStatuses ?? "").split("|||");
            const statusByEnvironment = new Map(ids.map((id, index) => [id, statuses[index] ?? "pending"]));
            return (
              <section key={change.id} className="grid items-center px-3 py-3" style={{ gridTemplateColumns: columns }}>
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2"><strong className="truncate text-xs">{change.tableName}.{change.fieldName}</strong><Badge variant="outline" className="shrink-0 text-[9px]">{change.action.toUpperCase()}</Badge></div>
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
        {filteredChanges.length > visibleChanges.length && (
          <div className="flex justify-center py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setVisibleLimit((value) => value + 60)}>
              {locale === "zh" ? `继续加载（还有 ${filteredChanges.length - visibleChanges.length} 项）` : `Load more (${filteredChanges.length - visibleChanges.length})`}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
