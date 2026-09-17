"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  GitBranch,
  Import,
  Monitor,
  Moon,
  Rocket,
  Search,
  Sun,
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  CatalogData,
  CompareFocus,
  Confirmation,
  DetailMode,
  DetailTarget,
  FieldItem,
  ImportBatch,
  ImportMode,
  ModalKind,
  Scope,
  TableInsight,
  TableItem,
  TableScope,
  View,
} from "@/features/catalog/model/types";
import {
  CreateMenu,
  DriftyLogo,
  Field,
  IconButton,
  LanguageSwitcher,
  ModalActions,
  PrimaryNav,
  ProjectIconPicker,
  ScopePicker,
  SearchSelect,
  SelectField,
  empty,
  emptySelect,
  modalTitle,
  number,
  words,
} from "@/features/catalog/presentation";
import {
  DetailSurface,
  FieldDetail,
  SchemaExplorerView,
  TableDetail,
} from "@/features/catalog/components/explorer";
import {
  EnvironmentDetail,
  ProjectDetail,
  ProjectsWorkspace,
} from "@/features/catalog/components/projects";
import {
  ImportDetail,
  ImportWorkspace,
} from "@/features/catalog/components/imports";
import { ScopeCompareDialog } from "@/features/catalog/components/history";
import { ReleaseWorkspace } from "@/features/catalog/components/releases";
import { SettingsView } from "@/features/catalog/components/settings";

/** 应用壳与客户端编排器：持有跨工作区状态，加载目录数据，并把命令与导航能力下发给各功能模块。 */
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
  const [importMode, setImportMode] = useState<ImportMode>("snapshot");
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
    const ids=projectEnvs(projectId).map((item) => item.id);
    setScopeEnvs(importMode==="snapshot"?ids.slice(0,1):ids);
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
        importMode,
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
      const verifiedCount = number(result.verifiedChanges);
      toast(
        result.duplicateBatch
          ? locale === "zh"
            ? `这份 SQL 已导入 · ${result.batchCode}`
            : `Already imported · ${result.batchCode}`
          : locale === "zh"
            ? `完成 · 新增 ${number(result.added)} · 修改 ${number(result.modified)} · 删除 ${number(result.removed)} · 重复 ${number(result.duplicates)} · 冲突 ${number(result.conflicts)}${verifiedCount ? ` · 已核验 ${verifiedCount}` : ""}${warningCount ? ` · ${warningCount} 条提醒` : ""}`
            : `Done · ${number(result.added)} added · ${number(result.modified)} modified · ${number(result.removed)} removed · ${number(result.duplicates)} duplicate · ${number(result.conflicts)} conflict${verifiedCount ? ` · ${verifiedCount} verified` : ""}${warningCount ? ` · ${warningCount} warnings` : ""}`,
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
    const next=(await Promise.all(selected.map(async (file) => `-- ${file.name}\n${await file.text()}`))).join("\n\n");
    setImportSql(next);
    if(/\bALTER\s+TABLE\b/i.test(next))setImportMode("executed");
    else if(/\bCREATE\s+TABLE\b/i.test(next)){setImportMode("snapshot");setScopeEnvs((current)=>current.slice(0,1));}
  };
  const reuseImport = (batch: ImportBatch) => {
    closeDetail();
    setView("imports");
    setScopeProject(batch.projectId);
    setScopeVersion(batch.versionId);
    setScopeEnvs((batch.environmentIds ?? "").split("|||").filter(Boolean));
    setImportModule(batch.moduleId ?? "");
    setImportMode(batch.importMode ?? (/\bALTER\s+TABLE\b/i.test(batch.rawSql ?? "") ? "executed" : "snapshot"));
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
                importMode={importMode}
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
                setImportMode={setImportMode}
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
