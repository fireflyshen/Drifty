import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const runtimeMeta = sqliteTable('runtime_meta', {
  key: text('key').primaryKey(), value: text('value').notNull(),
});

export const modules = sqliteTable('modules', {
  id: text('id').primaryKey(), slug: text('slug').notNull().unique(), name: text('name').notNull(),
  kind: text('kind', { enum: ['core', 'feature'] }).notNull(), version: text('version').notNull(),
  description: text('description').notNull().default(''),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(),
  coreVersion: text('core_version').notNull(), status: text('status', { enum: ['current', 'upgrade'] }).notNull().default('current'),
  createdAt: text('created_at').notNull(),
});

export const projectModules = sqliteTable('project_modules', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }), version: text('version').notNull(),
}, (table) => [primaryKey({ columns: [table.projectId, table.moduleId] })]);

export const schemaFields = sqliteTable('schema_fields', {
  id: text('id').primaryKey(), code: text('code').notNull().unique(), tableName: text('table_name').notNull(),
  columnName: text('column_name').notNull(), dataType: text('data_type').notNull(), businessMeaning: text('business_meaning').notNull(),
  moduleId: text('module_id').notNull().references(() => modules.id), firstVersion: text('first_version').notNull(),
  currentVersion: text('current_version').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [index('idx_schema_fields_module_id').on(table.moduleId)]);

export const migrationChanges = sqliteTable('migration_changes', {
  id: text('id').primaryKey(), changeCode: text('change_code').notNull().unique(),
  fieldId: text('field_id').notNull().references(() => schemaFields.id), moduleId: text('module_id').notNull().references(() => modules.id),
  migrationVersion: text('migration_version').notNull(), title: text('title').notNull(), fromValue: text('from_value').notNull(),
  toValue: text('to_value').notNull(), status: text('status', { enum: ['draft', 'review', 'approved'] }).notNull().default('draft'),
  risk: text('risk', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'), createdAt: text('created_at').notNull(),
});

export const catalogProjects = sqliteTable('catalog_projects', {
  id: text('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(),
  kind: text('kind', { enum: ['platform', 'project'] }).notNull().default('project'), parentId: text('parent_id'),
  icon: text('icon').notNull().default('boxes'), description: text('description').notNull().default(''),
  archived: integer('archived').notNull().default(0), createdAt: text('created_at').notNull(),
});

export const catalogModules = sqliteTable('catalog_modules', {
  id: text('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(),
  description: text('description').notNull().default(''), createdAt: text('created_at').notNull(),
});

export const catalogProjectModules = sqliteTable('catalog_project_modules', {
  projectId: text('project_id').notNull().references(() => catalogProjects.id, { onDelete:'cascade' }),
  moduleId: text('module_id').notNull().references(() => catalogModules.id, { onDelete:'cascade' }),
}, (table) => [primaryKey({ columns:[table.projectId, table.moduleId] })]);

export const catalogVersions = sqliteTable('catalog_versions', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => catalogProjects.id, { onDelete:'cascade' }),
  name: text('name').notNull(), sourceVersion: text('source_version'), repositoryId: text('repository_id'),
  gitRef: text('git_ref'), gitCommit: text('git_commit'), status: text('status', { enum:['active','closed'] }).notNull().default('active'),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('uq_catalog_versions_project_name').on(table.projectId, table.name), index('idx_catalog_versions_repository').on(table.repositoryId)]);

export const catalogEnvironments = sqliteTable('catalog_environments', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => catalogProjects.id, { onDelete:'cascade' }),
  versionId: text('version_id').references(() => catalogVersions.id, { onDelete:'set null' }), code: text('code').notNull(), name: text('name').notNull(),
  stage: text('stage').notNull().default('custom'), sortOrder: integer('sort_order').notNull().default(0), archived: integer('archived').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('uq_catalog_environments_project_code').on(table.projectId, table.code), index('idx_catalog_environments_project').on(table.projectId)]);

export const catalogTables = sqliteTable('catalog_tables', {
  id: text('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull().unique(),
  comment: text('comment').notNull().default(''), moduleId: text('module_id').references(() => catalogModules.id, { onDelete:'set null' }),
  importBatchId: text('import_batch_id'), createdAt: text('created_at').notNull(),
});

export const catalogFields = sqliteTable('catalog_fields', {
  id: text('id').primaryKey(), tableId: text('table_id').notNull().references(() => catalogTables.id, { onDelete:'cascade' }),
  code: text('code').notNull().unique(), name: text('name').notNull(), dataType: text('data_type').notNull(), nullable: integer('nullable').notNull().default(1),
  defaultValue: text('default_value'), comment: text('comment').notNull().default(''), extra: text('extra').notNull().default(''), ordinal: integer('ordinal').notNull().default(0),
  sourceKind: text('source_kind').notNull().default('manual'), importBatchId: text('import_batch_id'), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('uq_catalog_fields_table_name').on(table.tableId, table.name), index('idx_catalog_fields_table').on(table.tableId)]);

export const fieldScopes = sqliteTable('field_scopes', {
  fieldId: text('field_id').notNull().references(() => catalogFields.id, { onDelete:'cascade' }),
  projectId: text('project_id').notNull().references(() => catalogProjects.id, { onDelete:'cascade' }),
  versionId: text('version_id').notNull().references(() => catalogVersions.id, { onDelete:'cascade' }),
  environmentId: text('environment_id').notNull().references(() => catalogEnvironments.id, { onDelete:'cascade' }),
  state: text('state').notNull().default('present'), origin: text('origin').notNull().default('manual'), importBatchId: text('import_batch_id'), createdAt: text('created_at').notNull(),
}, (table) => [primaryKey({ columns:[table.fieldId, table.versionId, table.environmentId] }), index('idx_field_scopes_environment').on(table.environmentId)]);

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(), sourceKind: text('source_kind').notNull(),
  fileName: text('file_name'), sourcePath: text('source_path'), gitCommit: text('git_commit'), fingerprint: text('fingerprint').notNull(), rawSql: text('raw_sql').notNull().default(''), projectId: text('project_id').notNull().references(() => catalogProjects.id),
  versionId: text('version_id').notNull().references(() => catalogVersions.id), moduleId: text('module_id').references(() => catalogModules.id),
  status: text('status').notNull().default('active'), addedCount: integer('added_count').notNull().default(0), duplicateCount: integer('duplicate_count').notNull().default(0),
  conflictCount: integer('conflict_count').notNull().default(0), createdAt: text('created_at').notNull(), revertedAt: text('reverted_at'),
});

export const importItems = sqliteTable('import_items', {
  id: text('id').primaryKey(), batchId: text('batch_id').notNull().references(() => importBatches.id, { onDelete:'cascade' }),
  statementNo: integer('statement_no').notNull(), action: text('action').notNull(), tableName: text('table_name').notNull(), columnName: text('column_name').notNull(),
  fieldId: text('field_id'), result: text('result').notNull(), message: text('message').notNull().default(''), fingerprint: text('fingerprint').notNull(),
}, (table) => [index('idx_import_items_batch').on(table.batchId)]);

export const importBatchEnvironments = sqliteTable('import_batch_environments', {
  batchId: text('batch_id').notNull().references(() => importBatches.id, { onDelete:'cascade' }),
  environmentId: text('environment_id').notNull().references(() => catalogEnvironments.id, { onDelete:'cascade' }),
}, (table) => [primaryKey({ columns:[table.batchId, table.environmentId] }), index('idx_import_batch_environments_environment').on(table.environmentId)]);

export const repositorySources = sqliteTable('repository_sources', {
  id: text('id').primaryKey(), name: text('name').notNull(), repository: text('repository').notNull(), branch: text('branch').notNull().default('main'),
  pathPattern: text('path_pattern').notNull(), projectId: text('project_id').references(() => catalogProjects.id),
  lastCommit: text('last_commit'), enabled: integer('enabled').notNull().default(1), createdAt: text('created_at').notNull(),
});
