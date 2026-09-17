"use client";

import { number } from "@/features/catalog/presentation";
import { History } from "lucide-react";
import type { CatalogData, Confirmation, Environment, ImportBatch, ImportInsight, ImportMode, ImportPreview, ImportPreviewItem, Project, ScopePreview, Version } from "@/features/catalog/model/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SheetHeader } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Empty, EnvironmentSummary, Field, IconButton, ScopePicker, SelectField, formatDate, importResultLabel, words } from "@/features/catalog/presentation";
import { ArrowLeftRight, ArrowRight, CheckCircle2, ChevronDown, Copy, Download, FileCode2, GitBranch, GitCommitHorizontal, Import, Pencil, RotateCcw, Search, ShieldCheck, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * SQL 导入工作区。
 *
 * 负责导入配置、预览、差异检查、冲突展示和历史批次详情；
 * 解析与落库仍由服务端目录 API 完成。
 */
/** 展示单个导入批次的元数据、明细和回滚入口。 */
export function ImportDetail({
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
  const [itemQuery, setItemQuery] = useState("");
  const [itemLimit, setItemLimit] = useState(80);
  const [showFullSql, setShowFullSql] = useState(false);
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
          setItemQuery("");
          setItemLimit(80);
          setShowFullSql(false);
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
  const rawSql = batch.rawSql ?? "";
  const sqlPreview = showFullSql ? rawSql : rawSql.slice(0, 12000);
  const conflictItems = items.filter((item) => item.result === "conflict");
  const reviewItems = items.filter((item) => item.reviewStatus === "pending");
  const filteredItems = (
    itemFilter === "conflict"
      ? conflictItems
      : itemFilter === "review"
        ? reviewItems
        : items
  ).filter((item) =>
    `${item.tableName}.${item.columnName} ${item.message} ${item.action}`
      .toLowerCase()
      .includes(itemQuery.trim().toLowerCase()),
  );
  const visibleItems = filteredItems.slice(0, itemLimit);
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
          <Badge variant="outline">
            {batch.importMode==="change"
              ? locale === "zh" ? "变更计划" : "Change plan"
              : batch.importMode==="executed"
                ? locale === "zh" ? "已执行记录" : "Executed SQL"
                : locale === "zh" ? "环境快照" : "Snapshot"}
          </Badge>
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
            {sqlPreview || "—"}
            {!showFullSql && rawSql.length > sqlPreview.length ? "\n…" : ""}
          </pre>
          {rawSql.length > 12000 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowFullSql((current) => !current)}
            >
              {showFullSql
                ? locale === "zh"
                  ? "收起完整 SQL"
                  : "Collapse SQL"
                : locale === "zh"
                  ? "查看完整 SQL"
                  : "Show full SQL"}
              <ChevronDown
                className={showFullSql ? "rotate-180 transition-transform" : "transition-transform"}
              />
            </Button>
          )}
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
                onClick={() => {
                  setItemFilter(value);
                  setItemLimit(80);
                }}
                className={`rounded-md px-2.5 py-1 text-[10px] transition-colors ${itemFilter === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label} {count}
              </button>
            ))}
            <span className="ml-auto pr-2 text-[10px] text-muted-foreground">
              {locale === "zh"
                ? `显示 ${visibleItems.length}/${filteredItems.length}`
                : `${visibleItems.length}/${filteredItems.length} shown`}
            </span>
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={itemQuery}
              onChange={(event) => {
                setItemQuery(event.target.value);
                setItemLimit(80);
              }}
              className="h-9 pl-9 text-xs"
              placeholder={
                locale === "zh"
                  ? "搜索表、字段或处理说明"
                  : "Search table, field, or message"
              }
            />
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
            {filteredItems.length > visibleItems.length && (
              <div className="flex justify-center p-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setItemLimit((current) => current + 80)}
                >
                  {locale === "zh"
                    ? `继续显示 · 还有 ${filteredItems.length - visibleItems.length}`
                    : `Show more · ${filteredItems.length - visibleItems.length} left`}
                  <ChevronDown />
                </Button>
              </div>
            )}
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

/** 组织导入配置、预览与执行流程。 */
export function ImportWorkspace({
  data,
  projects,
  scopeProject,
  scopeVersion,
  scopeEnvs,
  importName,
  importMode,
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
  setImportMode,
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
  importMode: ImportMode;
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
  setImportMode: (mode: ImportMode) => void;
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
  const copyReadonlyExporter = async () => {
    try {
      const response = await fetch("/tools/export_mysql_schema.py");
      if (!response.ok) throw new Error(String(response.status));
      const script = await response.text();
      if (!navigator.clipboard)
        throw new Error(
          locale === "zh" ? "当前浏览器不支持复制" : "Clipboard unavailable",
        );
      await navigator.clipboard.writeText(script);
      toast(locale === "zh" ? "只读导出脚本已复制" : "Read-only exporter copied");
    } catch (error) {
      toast(
        locale === "zh"
          ? `复制失败：${error instanceof Error ? error.message : String(error)}`
          : `Copy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
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
      const signature = `${importMode}|${scopeProject}|${versionId}|${environmentId}|${importSql}`;
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "import.preview",
          payload: {
            sql: importSql,
            importMode,
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
      if(importMode==="snapshot")setScopeEnvs([environmentId]);
      else if(!scopeEnvs.includes(environmentId))setScopeEnvs([...scopeEnvs,environmentId]);
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
    const matching = projectEnvs(scopeProject);
    const environmentId =
      scopeEnvs.find((id) => matching.some((env) => env.id === id)) ??
      matching[0]?.id;
    if (environmentId) await requestPreview(versionId, environmentId);
  };
  const choosePreviewVersion = (versionId: string) => {
    const environment = projectEnvs(scopeProject)[0];
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
        locale === "zh"
          ? importMode==="snapshot"?"保存这份环境快照？":importMode==="change"?"登记这份变更计划？":"登记这份已执行 SQL？"
          : importMode==="snapshot"?"Save this environment snapshot?":importMode==="change"?"Register this change plan?":"Record this executed SQL?",
      description:
        locale === "zh"
          ? importMode==="snapshot"
            ? `只更新所选环境的实际快照：新增 ${preview.summary.added ?? 0}、变化 ${preview.summary.modified ?? 0}、缺少 ${preview.summary.removed ?? 0}。不会进入发布。`
            : importMode==="change"
              ? `登记 ${changed} 项待发布变化，不修改任何环境的实际结构。`
              : `把 ${changed} 项变化记录为已在所选环境执行，后续可用快照验证。`
          : importMode==="snapshot"
            ? `Update only the selected environment snapshot: ${preview.summary.added ?? 0} added, ${preview.summary.modified ?? 0} changed, ${preview.summary.removed ?? 0} missing. Nothing is released.`
            : importMode==="change"
              ? `Register ${changed} planned changes without altering observed structure.`
              : `Record ${changed} changes as executed; a later snapshot can verify them.`,
      confirmLabel:
        locale === "zh" ? importMode==="snapshot"?"保存快照":importMode==="change"?"登记计划":"登记已执行" : importMode==="snapshot"?"Save snapshot":importMode==="change"?"Register plan":"Record execution",
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
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/55 p-1">
            {([
              ["snapshot", locale === "zh" ? "采集快照" : "Capture", locale === "zh" ? "记录一个环境当前实际结构" : "Observe one environment"],
              ["change", locale === "zh" ? "变更计划" : "Plan", locale === "zh" ? "登记待发布 SQL，不改现状" : "Register SQL without applying"],
              ["executed", locale === "zh" ? "已执行记录" : "Executed", locale === "zh" ? "补记已在所选环境执行的 SQL" : "Record SQL already executed"],
            ] as const).map(([value,label,description])=>(
              <button
                key={value}
                type="button"
                onClick={()=>{
                  setImportMode(value);
                  if(value==="snapshot"&&scopeEnvs.length>1)setScopeEnvs(scopeEnvs.slice(0,1));
                }}
                className={`min-w-0 rounded-lg px-3 py-2 text-left transition-colors ${importMode===value?"bg-background shadow-sm ring-1 ring-border":"text-muted-foreground hover:text-foreground"}`}
              >
                <strong className="block truncate text-[11px] font-medium">{label}</strong>
                <span className="mt-0.5 hidden truncate text-[9px] text-muted-foreground sm:block">{description}</span>
              </button>
            ))}
          </div>
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
                onValueChange={(versionId)=>{
                  setScopeVersion(versionId);
                  const ids=projectEnvs(scopeProject).map((env)=>env.id);
                  setScopeEnvs(importMode==="snapshot"?ids.slice(0,1):ids);
                }}
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
            <Field label={importMode==="snapshot"?(locale === "zh" ? "采集环境" : "Environment"):t.targetEnvs}>
              {importMode==="snapshot" ? (
                <SelectField value={scopeEnvs[0]??""} onValueChange={(value)=>setScopeEnvs(value?[value]:[])} disabled={!scopeProject}>
                  <option value="">{locale === "zh" ? "选择一个环境" : "Choose one environment"}</option>
                  {projectEnvs(scopeProject).map((env)=><option key={env.id} value={env.id}>{env.name}</option>)}
                </SelectField>
              ) : (
                <ScopePicker envs={projectEnvs(scopeProject)} selected={scopeEnvs} onChange={setScopeEnvs} t={t} />
              )}
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
          <div className="rounded-xl border border-dashed bg-muted/15 p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold">
                  {locale === "zh"
                    ? "内网数据库只读采集"
                    : "Read-only intranet collection"}
                </div>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  {locale === "zh"
                    ? "下载或复制独立 Python 脚本，在内网按表清单执行。脚本只允许读取 information_schema 和 SHOW CREATE TABLE，不读取业务数据。"
                    : "Copy or download the standalone Python script and run it inside the intranet with a table list. It only allows information_schema and SHOW CREATE TABLE reads."}
                </p>
                <code className="mt-2 block overflow-x-auto rounded-lg bg-background px-3 py-2 text-[9px] leading-4 text-muted-foreground">
                  python export_mysql_schema.py --database your_db --user
                  schema_reader --tables-file drifty-tables.txt --out
                  drifty-schema.sql
                </code>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyReadonlyExporter()}
                  >
                    <Copy />
                    {locale === "zh" ? "复制脚本" : "Copy script"}
                  </Button>
                  <Button asChild type="button" variant="outline" size="sm">
                    <a href="/tools/export_mysql_schema.py" download>
                      <Download />
                      {locale === "zh" ? "下载脚本" : "Download script"}
                    </a>
                  </Button>
                  <Button asChild type="button" variant="ghost" size="sm">
                    <a href="/tools/drifty-tables.example.txt" download>
                      <FileCode2 />
                      {locale === "zh" ? "表清单模板" : "Table-list template"}
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="relative">
            <Textarea
              value={importSql}
              onChange={(event) => {
                const next=event.target.value;
                setImportSql(next);
                if(!next.trim())return;
                if(/\bALTER\s+TABLE\b/i.test(next)&&importMode==="snapshot")setImportMode("executed");
                else if(/\bCREATE\s+TABLE\b/i.test(next)&&!/\bALTER\s+TABLE\b/i.test(next)&&importMode!=="snapshot"){
                  setImportMode("snapshot");
                  if(scopeEnvs.length>1)setScopeEnvs(scopeEnvs.slice(0,1));
                }
              }}
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
                  ? importMode==="snapshot"?"预览该环境相较上一次快照的变化":importMode==="change"?"预览后登记为待发布变更，不修改环境现状":"预览并补记所选环境已经执行的变化"
                  : importMode==="snapshot"?"Preview changes since the previous snapshot":importMode==="change"?"Register as a release plan without changing current state":"Record changes already executed in selected environments"
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
                  ? importMode==="change"?"预览计划":"查看差异"
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
                  <Badge variant="outline" className="text-[9px]">
                    {batch.importMode==="change"?(locale === "zh"?"计划":"Plan"):batch.importMode==="executed"?(locale === "zh"?"已执行":"Executed"):(locale === "zh"?"快照":"Snapshot")}
                  </Badge>
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
        environments={projectEnvs(scopeProject)}
        versionId={previewTarget.versionId}
        environmentId={previewTarget.environmentId}
        onVersionChange={choosePreviewVersion}
        onEnvironmentChange={choosePreviewEnvironment}
        onConfirm={confirmPreview}
      />
    </div>
  );
}

/** 按对象类型渲染结构差异。 */
export function SchemaDiffViewer({
  preview,
  loading,
  locale,
  emptyText,
  indexItems,
  constraintItems,
}: {
  preview: {
    items: ImportPreviewItem[];
    summary: Record<string, number>;
  } | null;
  loading: boolean;
  locale: "zh" | "en";
  emptyText?: string;
  indexItems?: ScopePreview["indexItems"];
  constraintItems?: ScopePreview["constraintItems"];
}) {
  const [filter, setFilter] = useState<"all" | ImportPreviewItem["result"]>(
    "all",
  );
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(80);
  const resolvedIndexItems =
    indexItems ?? (preview as ScopePreview | null)?.indexItems;
  const resolvedConstraintItems =
    constraintItems ?? (preview as ScopePreview | null)?.constraintItems;
  const changed =
    preview?.items.filter((item) => item.result !== "unchanged") ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = (
    filter === "all"
      ? changed
      : changed.filter((item) => item.result === filter)
  ).filter((item) =>
    `${item.tableName}.${item.columnName} ${item.fieldCode ?? ""} ${item.changes.join(" ")}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const visible = filtered.slice(0, limit);
  const filteredIndexItems = (resolvedIndexItems ?? []).filter(
    (item) =>
      item.result !== "unchanged" &&
      (filter === "all" || item.result === filter) &&
      `${item.name} ${item.kind} ${item.columnsJson}`
        .toLowerCase()
        .includes(normalizedQuery),
  );
  const filteredConstraintItems = (resolvedConstraintItems ?? []).filter(
    (item) =>
      item.result !== "unchanged" &&
      (filter === "all" || item.result === filter) &&
      `${item.name} ${item.kind} ${item.definition}`
        .toLowerCase()
        .includes(normalizedQuery),
  );
  const structuralCount = (result: ImportPreviewItem["result"]) =>
    (resolvedIndexItems ?? []).filter((item) => item.result === result).length +
    (resolvedConstraintItems ?? []).filter((item) => item.result === result)
      .length;
  const count = (result: ImportPreviewItem["result"]) =>
    number(preview?.summary[result]) + structuralCount(result);
  const changedCount =
    changed.length +
    (resolvedIndexItems ?? []).filter((item) => item.result !== "unchanged").length +
    (resolvedConstraintItems ?? []).filter(
      (item) => item.result !== "unchanged",
    ).length;
  const hasVisibleStructural =
    filteredIndexItems.length > 0 || filteredConstraintItems.length > 0;
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
      count: changedCount,
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
            ? `一致 ${count("unchanged")} · 共 ${(preview?.items.length ?? 0) + (resolvedIndexItems?.length ?? 0) + (resolvedConstraintItems?.length ?? 0)}`
            : `${count("unchanged")} unchanged · ${(preview?.items.length ?? 0) + (resolvedIndexItems?.length ?? 0) + (resolvedConstraintItems?.length ?? 0)} total`}
        </span>
      </div>
      {filteredIndexItems.length > 0 && (
        <div className="shrink-0 border-b px-5 py-3">
          <div className="mb-2 text-[11px] font-semibold">
            {locale === "zh" ? "索引差异" : "Index differences"}
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredIndexItems.map((item) => {
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
      {filteredConstraintItems.length > 0 && (
        <div className="shrink-0 border-b px-5 py-3">
          <div className="mb-2 text-[11px] font-semibold">
            {locale === "zh" ? "约束差异" : "Constraint differences"}
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredConstraintItems.map((item) => {
              const itemTone =
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
                  <span className={`mr-2 font-mono font-semibold ${itemTone}`}>
                    {item.result === "added"
                      ? "+"
                      : item.result === "removed"
                        ? "−"
                        : "~"}
                  </span>
                  <code>{item.name}</code>
                  <span className="ml-2 text-muted-foreground">
                    {item.kind} · {item.definition}
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
              {hasVisibleStructural ? (
                <ArrowLeftRight className="mx-auto size-6 text-diff-modified" />
              ) : (
                <CheckCircle2 className="mx-auto size-6 text-diff-added" />
              )}
              <p className="mt-4 text-sm font-medium">
                {hasVisibleStructural
                  ? locale === "zh"
                    ? "字段一致，索引或约束存在差异"
                    : "Fields match; indexes or constraints differ"
                  : query
                  ? locale === "zh"
                    ? "没有匹配的差异"
                    : "No matching difference"
                  : (emptyText ??
                    (locale === "zh"
                      ? "两个范围的结构完全一致"
                      : "The two scopes match"))}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {hasVisibleStructural
                  ? locale === "zh"
                    ? "结构差异已显示在上方"
                    : "Structural differences are shown above"
                  : changedCount
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

/** 在提交前展示导入预览并接收确认。 */
export function ImportPreviewDialog({
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
                {locale === "zh"
                  ? preview?.importMode==="snapshot"?"环境快照预览":preview?.importMode==="change"?"变更计划预览":"已执行记录预览"
                  : preview?.importMode==="snapshot"?"Environment snapshot":preview?.importMode==="change"?"Change plan":"Executed SQL"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {locale === "zh"
                  ? preview?.importMode==="snapshot"?"保存该环境此刻的真实结构，不会产生待发布任务":preview?.importMode==="change"?"只登记待发布 SQL，不修改当前环境结构":"记录已经执行的 SQL，等待后续快照验证"
                  : preview?.importMode==="snapshot"?"Capture observed structure without creating release work":preview?.importMode==="change"?"Register SQL without changing observed structure":"Record executed SQL for later snapshot verification"}
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
            {locale === "zh" ? preview?.importMode==="snapshot"?"保存快照":preview?.importMode==="change"?"登记计划":"登记已执行" : preview?.importMode==="snapshot"?"Save snapshot":preview?.importMode==="change"?"Register plan":"Record execution"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
