"use client";

import { Download, History } from "lucide-react";
import type { CompareFocus, CompareTarget, Environment, HistoryEvent, Project, SchemaHistory, ScopePreview, Version } from "@/features/catalog/model/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SchemaDiffViewer } from "@/features/catalog/components/imports";
import { EnvironmentSummary, SelectField, formatDate } from "@/features/catalog/presentation";
import { ArrowLeftRight, ChevronDown, Search } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 结构历史与范围对比视图。
 *
 * 负责渲染表/字段修订历史，并比较两个项目-版本-环境范围之间的结构差异。
 */
/** 展示表或字段的修订历史。 */
export function SchemaHistoryViewer({
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

type AlignmentItem = NonNullable<ScopePreview["alignmentItems"]>[number];

function AlignmentReviewDialog({
  open,
  onOpenChange,
  items,
  selectedKeys,
  onSelectedKeysChange,
  onDownload,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AlignmentItem[];
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  onDownload: (items: AlignmentItem[]) => void;
  locale: "zh" | "en";
}) {
  const selected = new Set(selectedKeys);
  const selectedItems = items.filter((item) => selected.has(item.key));
  const selectedDrops = selectedItems.filter(
    (item) => item.action === "drop",
  ).length;
  const safeKeys = items
    .filter((item) => !item.destructive)
    .map((item) => item.key);
  const actionLabel = (action: AlignmentItem["action"]) =>
    action === "add"
      ? locale === "zh"
        ? "新增"
        : "ADD"
      : action === "modify"
        ? locale === "zh"
          ? "修改"
          : "MODIFY"
        : locale === "zh"
          ? "删除"
          : "DROP";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="workspace"
        className="flex h-[82svh] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-background p-0 shadow-2xl ring-1 ring-foreground/10"
      >
        <DialogHeader className="shrink-0 border-b px-7 py-5">
          <DialogTitle className="text-base font-semibold">
            {locale === "zh" ? "审核字段对齐 SQL" : "Review field alignment SQL"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            {locale === "zh"
              ? "默认只选择新增和修改；删除字段必须手动勾选。这里只下载脚本，不会连接或修改数据库。"
              : "Adds and modifications are selected by default. Drops require explicit selection. This only downloads SQL and never changes a database."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/15 px-7 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelectedKeysChange(safeKeys)}
          >
            {locale === "zh" ? "仅选择安全项" : "Select safe changes"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectedKeysChange(items.map((item) => item.key))}
          >
            {locale === "zh" ? "全选（含删除）" : "Select all, including drops"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectedKeysChange([])}
          >
            {locale === "zh" ? "清空" : "Clear"}
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {locale === "zh"
              ? `已选 ${selectedItems.length}/${items.length}${selectedDrops ? ` · 含 ${selectedDrops} 项删除` : ""}`
              : `${selectedItems.length}/${items.length} selected${selectedDrops ? ` · ${selectedDrops} drops` : ""}`}
          </span>
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.8fr)]">
          <div className="min-h-0 overflow-y-auto border-r p-4">
            <div className="space-y-2">
              {items.map((item) => (
                <label
                  key={item.key}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${selected.has(item.key) ? "bg-muted/30" : "opacity-65 hover:opacity-100"}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.key)}
                    onChange={(event) =>
                      onSelectedKeysChange(
                        event.target.checked
                          ? [...selectedKeys, item.key]
                          : selectedKeys.filter((key) => key !== item.key),
                      )
                    }
                    className="mt-1 size-4 accent-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          item.destructive
                            ? "font-semibold text-destructive"
                            : "font-semibold"
                        }
                      >
                        {actionLabel(item.action)}
                      </span>
                      <code className="truncate">
                        {item.tableName}.{item.columnName}
                      </code>
                    </div>
                    <div className="mt-2 space-y-1 font-mono text-[10px] leading-4">
                      {item.before && (
                        <div className="break-all text-diff-removed">
                          − {item.before}
                        </div>
                      )}
                      {item.after && (
                        <div className="break-all text-diff-added">
                          + {item.after}
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col bg-muted/10 p-4">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">
              {locale === "zh" ? "将导出的 SQL" : "SQL to export"}
            </div>
            <Textarea
              value={selectedItems.map((item) => item.sql).join("\n")}
              readOnly
              className="min-h-0 flex-1 resize-none bg-background font-mono text-[10px] leading-5"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t px-7 py-4">
          <span
            className={`text-[11px] ${selectedDrops ? "text-destructive" : "text-muted-foreground"}`}
          >
            {selectedDrops
              ? locale === "zh"
                ? "删除字段会永久丢失其中的数据，请先确认备份。"
                : "Dropping fields permanently removes their data. Confirm backups first."
              : locale === "zh"
                ? "未选择破坏性删除语句"
                : "No destructive drops selected"}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="ml-auto"
            onClick={() => onOpenChange(false)}
          >
            {locale === "zh" ? "返回" : "Back"}
          </Button>
          <Button
            type="button"
            disabled={!selectedItems.length}
            onClick={() => onDownload(selectedItems)}
          >
            <Download />
            {locale === "zh" ? "下载已选 SQL" : "Download selected SQL"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 比较两个项目版本环境范围的结构。 */
export function ScopeCompareDialog({
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
  const [alignmentReviewOpen, setAlignmentReviewOpen] = useState(false);
  const [selectedAlignmentKeys, setSelectedAlignmentKeys] = useState<string[]>(
    [],
  );
  const projectVersions = (projectId: string) =>
    versions.filter((version) => version.projectId === projectId);
  const scopeEnvironments = (projectId: string, versionId: string) => {
    void versionId;
    return environments.filter(
      (environment) => environment.projectId === projectId,
    );
  };
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
              (environment) => environment.projectId === project.id,
            )?.id ?? "",
        };
      };
      const left = create(projectVersionList[0]?.id);
      const rightVersion = projectVersionList[1]?.id ?? left.versionId;
      const right = create(rightVersion);
      const alternate = environments.find(
        (environment) =>
          environment.projectId === project.id &&
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
  const beginScopeChange = () => {
    setAlignmentReviewOpen(false);
    setLoading(true);
    setError("");
  };
  const changeProject = (side: "base" | "target", projectId: string) => {
    beginScopeChange();
    const next = makeTarget(projectId);
    if (side === "base") setBase(next);
    else setTarget(next);
  };
  const changeVersion = (side: "base" | "target", versionId: string) => {
    beginScopeChange();
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
  const openAlignmentReview = () => {
    const items = preview?.alignmentItems ?? [];
    if (!items.length) return;
    setSelectedAlignmentKeys(
      items.filter((item) => !item.destructive).map((item) => item.key),
    );
    setAlignmentReviewOpen(true);
  };
  const exportAlignmentSql = (items: AlignmentItem[]) => {
    if (!items.length) return;
    const projectName = (scope: CompareTarget) =>
      projects.find((project) => project.id === scope.projectId)?.name ??
      scope.projectId;
    const versionName = (scope: CompareTarget) =>
      versions.find((version) => version.id === scope.versionId)?.name ??
      scope.versionId;
    const environmentName = (scope: CompareTarget) =>
      environments.find(
        (environment) => environment.id === scope.environmentId,
      )?.name ?? scope.environmentId;
    const content = [
      "-- Drifty field alignment SQL",
      `-- Base: ${projectName(base)} / ${versionName(base)} / ${environmentName(base)}`,
      `-- Target: ${projectName(target)} / ${versionName(target)} / ${environmentName(target)}`,
      "-- Direction: base -> target",
      `-- Selected changes: ADD ${items.filter((item) => item.action === "add").length}, MODIFY ${items.filter((item) => item.action === "modify").length}, DROP ${items.filter((item) => item.action === "drop").length}`,
      "-- Review before execution. DROP COLUMN statements are destructive.",
      "",
      items.map((item) => item.sql).join("\n"),
      "",
    ].join("\n");
    const blob = new Blob([content], { type: "text/sql;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    link.href = url;
    link.download = `drifty-field-alignment-${stamp}.sql`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
            onValueChange={(environmentId) => {
              beginScopeChange();
              if (side === "base") setBase({ ...value, environmentId });
              else setTarget({ ...value, environmentId });
            }}
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
    <>
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
                  beginScopeChange();
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
          {view === "diff" && (
            <Button
              type="button"
              variant="outline"
              className="ml-auto"
              disabled={loading || !preview?.alignmentItems?.length}
              onClick={openAlignmentReview}
              title={
                (preview?.alignmentSummary?.dropped ?? 0) > 0
                  ? locale === "zh"
                    ? `包含 ${preview?.alignmentSummary?.dropped ?? 0} 条删除字段语句，请执行前确认`
                    : `Includes ${preview?.alignmentSummary?.dropped ?? 0} DROP COLUMN statements; review before execution`
                  : undefined
              }
            >
              <Download />
              {preview?.alignmentItems?.length
                ? locale === "zh"
                  ? "导出对齐 SQL"
                  : "Export alignment SQL"
                : locale === "zh"
                  ? "字段已对齐"
                  : "Fields aligned"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className={view === "diff" ? "ml-2" : "ml-auto"}
            onClick={() => onOpenChange(false)}
          >
            {locale === "zh" ? "关闭" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <AlignmentReviewDialog
      open={alignmentReviewOpen}
      onOpenChange={setAlignmentReviewOpen}
      items={preview?.alignmentItems ?? []}
      selectedKeys={selectedAlignmentKeys}
      onSelectedKeysChange={setSelectedAlignmentKeys}
      onDownload={exportAlignmentSql}
      locale={locale}
    />
    </>
  );
}
