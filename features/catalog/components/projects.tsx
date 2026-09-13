"use client";

import { number } from "@/features/catalog/presentation";
import { History } from "lucide-react";
import type { AnchorDiffItem, AnchorInsight, CatalogData, Environment, EnvironmentInsight, ModalKind, Project, ProjectInsight, Version } from "@/features/catalog/model/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { SheetHeader } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Empty, EntityMenu, EnvironmentSummary, Field, IconButton, ProjectIcon, SelectField, formatDate, words } from "@/features/catalog/presentation";
import { ArrowLeftRight, ArrowRight, Check, CheckCircle2, Copy, Database, FileCode2, GitBranch, Layers3, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * 项目与环境工作区。
 *
 * 负责项目列表、项目详情、锚点同步和环境覆盖信息的展示与交互。
 */
/** 展示平台与项目列表，并提供新增、选择和汇总入口。 */
export function ProjectsWorkspace({
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

/** 展示项目基本信息、环境、版本、差异、导入记录和锚点配置。 */
export function ProjectDetail({
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
    coverage: [],
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
          setInsight({ differences: [], imports: [], coverage: [] });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [project.id]);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [project.id, tab]);
  const imports = insight.imports;
  const normalizedHistoryQuery = historyQuery.trim().toLowerCase();
  const visibleImports = imports.filter((batch) =>
    `${batch.name} ${batch.code} ${batch.versionName} ${batch.moduleName ?? ""} ${batch.environmentNames ?? ""} ${batch.sourcePath ?? ""}`
      .toLowerCase()
      .includes(normalizedHistoryQuery),
  );
  const missingByEnvironment = (environmentId: string) => {
    const coverage = insight.coverage.find(
      (item) => item.environmentId === environmentId,
    );
    return coverage
      ? Math.max(0, number(coverage.expectedCount) - number(coverage.presentCount))
      : 0;
  };
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
                  const missing = missingByEnvironment(env.id);
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

/** 比较锚定范围与目标范围，并登记锚点 SQL 的执行记录。 */
export function AnchorSyncPanel({
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
            {insight.executions.length ? <div className="border-t pt-3"><div className="mb-2 flex items-center gap-2 text-[10px] font-medium text-muted-foreground"><History className="size-3.5" />{labels.history}</div><div className="space-y-1">{insight.executions.slice(0, 5).map((execution) => <div key={execution.id} className="flex items-center gap-2 text-[10px]"><span className={`size-1.5 rounded-full ${execution.status === "executed" || execution.status === "verified" ? "bg-emerald-500" : execution.status === "failed" ? "bg-red-500" : execution.status === "waived" ? "bg-muted-foreground/40" : "bg-amber-500"}`} /><span className="min-w-0 flex-1 truncate">{execution.environmentName} · {execution.versionName}</span><span className="text-muted-foreground">{locale === "zh" ? ({ executed: "已执行", verified: "已核验", registered: "待执行", pending: "待执行", failed: "失败", waived: "已撤销" } as Record<string, string>)[execution.status] ?? execution.status : execution.status}</span></div>)}</div></div> : null}
          </> : null}
        </>}
      </CardContent>
    </Card>
  );
}

/** 展示环境覆盖率、缺失字段和最近导入记录。 */
export function EnvironmentDetail({
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
