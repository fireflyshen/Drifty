import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
