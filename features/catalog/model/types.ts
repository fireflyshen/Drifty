/**
 * Drifty 目录领域的前端数据契约。
 *
 * 本模块只描述 API 与界面之间传递的数据，不包含请求、状态或渲染逻辑。
 * 类型按项目范围、结构对象、导入、对比和发布五组组织，业务组件统一从这里取类型，
 * 避免各页面维护彼此漂移的局部定义。
 */
export type Project = {
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
export type Environment = {
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
export type Version = {
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
export type Module = {
  id: string;
  code: string;
  name: string;
  description: string;
  tableCount: number;
  projectCount: number;
};
export type TableItem = {
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
export type FieldItem = {
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
export type Scope = {
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
export type TableScope = {
  tableId: string;
  projectId: string;
  versionId: string;
  environmentId: string;
  state: string;
  origin: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
export type CatalogIndex = {
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
export type IndexScope = {
  indexId: string;
  projectId: string;
  versionId: string;
  environmentId: string;
  state: string;
  origin: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
export type CatalogConstraint = {
  id: string;
  tableId: string;
  name: string;
  kind: string;
  definition: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
export type SearchObject = {
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
export type ConstraintScope = {
  constraintId: string;
  projectId: string;
  versionId: string;
  environmentId: string;
  state: string;
  origin: string;
  lifecycleStatus?: "active" | "deprecated" | "removed";
  lifecycleNote?: string;
};
export type TableInsight = {
  table: TableItem;
  fields: FieldItem[];
  tableScopes: TableScope[];
  fieldScopes: Scope[];
  indexes?: CatalogIndex[];
  indexScopes?: IndexScope[];
  constraints?: CatalogConstraint[];
  constraintScopes?: ConstraintScope[];
};
export type ImportBatch = {
  id: string;
  code: string;
  name: string;
  sourceKind: string;
  importMode?: "snapshot" | "change" | "executed";
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
export type ImportItem = {
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
export type ImportInsight = {
  batch: ImportBatch & {
    repository?: string | null;
    repositoryBranch?: string | null;
    gitRef?: string | null;
  };
  items: ImportItem[];
};
export type ImportPreviewItem = {
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
export type ImportPreview = {
  importMode?: "snapshot" | "change" | "executed";
  items: ImportPreviewItem[];
  summary: Record<string, number>;
  signature: string;
};
export type ImportMode = "snapshot" | "change" | "executed";
export type ScopePreview = {
  items: ImportPreviewItem[];
  summary: Record<string, number>;
  baseCount: number;
  targetCount: number;
  baseTablePresent?: boolean | null;
  targetTablePresent?: boolean | null;
  alignmentSql?: string;
  alignmentItems?: {
    key: string;
    action: "add" | "modify" | "drop";
    tableName: string;
    columnName: string;
    before: string | null;
    after: string | null;
    sql: string;
    destructive: boolean;
  }[];
  alignmentSummary?: {
    added: number;
    modified: number;
    dropped: number;
  };
  indexItems?: {
    name: string;
    kind: string;
    columnsJson: string;
    result: "added" | "modified" | "removed" | "unchanged";
  }[];
  constraintItems?: {
    name: string;
    kind: string;
    definition: string;
    result: "added" | "modified" | "removed" | "unchanged";
  }[];
};
export type CompareFocus = {
  kind: "all" | "table" | "field";
  id: string;
  name: string;
};
export type HistoryEvent = {
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
export type SchemaHistory = {
  focus: {
    kind: "table" | "field";
    id: string;
    code: string;
    tableName: string;
    columnName: string | null;
  };
  events: HistoryEvent[];
};
export type EnvironmentInsight = {
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
export type Repository = {
  id: string;
  name: string;
  repository: string;
  branch: string;
  pathPattern: string;
  projectId: string | null;
  lastCommit: string | null;
  enabled: number;
};
export type CatalogData = {
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
export type ProjectDifference = {
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
export type ProjectInsight = {
  differences: ProjectDifference[];
  imports: ImportBatch[];
  coverage: {
    environmentId: string;
    environmentName: string;
    expectedCount: number;
    presentCount: number;
  }[];
};
export type AnchorTarget = { versionId: string; environmentId: string };
export type AnchorDiffItem = { tableName: string; columnName?: string; result: "added" | "modified" | "removed"; before: string | null; after: string | null; changes: string[] };
export type AnchorInsight = {
  anchor: AnchorTarget & { versionName: string; environmentName: string };
  target: AnchorTarget & { versionName: string; environmentName: string };
  tableItems: { tableName: string; result: "added" | "removed" }[];
  fieldItems: AnchorDiffItem[];
  indexItems: AnchorDiffItem[];
  constraintItems: AnchorDiffItem[];
  sql: string;
  executions: { id: string; status: string; environmentId: string; environmentName: string; versionName: string; createdAt: string; sqlText: string }[];
};
export type ReleaseChange = {
  id: string;
  code: string;
  name: string;
  action: string;
  tableName: string;
  fieldName: string;
  fieldId: string | null;
  importBatchId: string | null;
  batchName: string;
  batchTotal: number;
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
export type ReleaseInsight = {
  changes: ReleaseChange[];
  summary: {
    changes: number;
    pending: number;
    executed: number;
    verified: number;
    failed: number;
  } | null;
};
export type ReleaseGroup = {
  key: string;
  projectName: string;
  versionName: string;
  name: string;
  changes: ReleaseChange[];
};
export type View = "explorer" | "projects" | "release" | "imports" | "settings";

export type LifecycleObject = {
  id: string;
  entity: "table" | "field" | "index" | "constraint";
  name: string;
  tableName?: string;
  lifecycleStatus: string;
  lifecycleNote: string;
};
export type DetailMode = "side" | "center" | "full";
export type DetailTarget =
  | { type: "project"; project: Project }
  | { type: "environment"; environment: Environment }
  | { type: "import"; importId: string };
export type ModalKind =
  | "project"
  | "environment"
  | "version"
  | "module"
  | "table"
  | "field"
  | "repository"
  | null;
export type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void>;
};
export type CompareTarget = {
  projectId: string;
  versionId: string;
  environmentId: string;
};
