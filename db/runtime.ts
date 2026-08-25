import { env } from 'cloudflare:workers';

const statements = [
  `CREATE TABLE IF NOT EXISTS runtime_meta (key text PRIMARY KEY NOT NULL, value text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS modules (id text PRIMARY KEY NOT NULL, slug text NOT NULL UNIQUE, name text NOT NULL, kind text NOT NULL, version text NOT NULL, description text DEFAULT '' NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS projects (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, name text NOT NULL, core_version text NOT NULL, status text DEFAULT 'current' NOT NULL, created_at text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS project_modules (project_id text NOT NULL, module_id text NOT NULL, version text NOT NULL, PRIMARY KEY(project_id, module_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS schema_fields (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, table_name text NOT NULL, column_name text NOT NULL, data_type text NOT NULL, business_meaning text NOT NULL, module_id text NOT NULL, first_version text NOT NULL, current_version text NOT NULL, created_at text NOT NULL, FOREIGN KEY(module_id) REFERENCES modules(id))`,
  `CREATE INDEX IF NOT EXISTS idx_schema_fields_module_id ON schema_fields(module_id)`,
  `CREATE TABLE IF NOT EXISTS migration_changes (id text PRIMARY KEY NOT NULL, change_code text NOT NULL UNIQUE, field_id text NOT NULL, module_id text NOT NULL, migration_version text NOT NULL, title text NOT NULL, from_value text NOT NULL, to_value text NOT NULL, status text DEFAULT 'draft' NOT NULL, risk text DEFAULT 'medium' NOT NULL, created_at text NOT NULL, FOREIGN KEY(field_id) REFERENCES schema_fields(id), FOREIGN KEY(module_id) REFERENCES modules(id))`,
  `CREATE TABLE IF NOT EXISTS catalog_projects (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, name text NOT NULL, kind text DEFAULT 'project' NOT NULL, parent_id text, icon text DEFAULT 'boxes' NOT NULL, description text DEFAULT '' NOT NULL, archived integer DEFAULT 0 NOT NULL, created_at text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS catalog_modules (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, name text NOT NULL, description text DEFAULT '' NOT NULL, created_at text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS catalog_project_modules (project_id text NOT NULL, module_id text NOT NULL, PRIMARY KEY(project_id,module_id), FOREIGN KEY(project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE, FOREIGN KEY(module_id) REFERENCES catalog_modules(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS catalog_versions (id text PRIMARY KEY NOT NULL, project_id text NOT NULL, name text NOT NULL, source_version text, repository_id text, git_ref text, git_commit text, status text DEFAULT 'active' NOT NULL, created_at text NOT NULL, FOREIGN KEY(project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE, UNIQUE(project_id,name))`,
  `CREATE TABLE IF NOT EXISTS catalog_environments (id text PRIMARY KEY NOT NULL, project_id text NOT NULL, version_id text, code text NOT NULL, name text NOT NULL, stage text DEFAULT 'custom' NOT NULL, sort_order integer DEFAULT 0 NOT NULL, archived integer DEFAULT 0 NOT NULL, created_at text NOT NULL, FOREIGN KEY(project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE, FOREIGN KEY(version_id) REFERENCES catalog_versions(id) ON DELETE SET NULL, UNIQUE(project_id,code))`,
  `CREATE INDEX IF NOT EXISTS idx_catalog_environments_project ON catalog_environments(project_id)`,
  `CREATE TABLE IF NOT EXISTS catalog_tables (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, name text NOT NULL UNIQUE, comment text DEFAULT '' NOT NULL, module_id text, import_batch_id text, created_at text NOT NULL, FOREIGN KEY(module_id) REFERENCES catalog_modules(id) ON DELETE SET NULL)`,
  `CREATE TABLE IF NOT EXISTS catalog_fields (id text PRIMARY KEY NOT NULL, table_id text NOT NULL, code text NOT NULL UNIQUE, name text NOT NULL, data_type text NOT NULL, nullable integer DEFAULT 1 NOT NULL, default_value text, comment text DEFAULT '' NOT NULL, extra text DEFAULT '' NOT NULL, ordinal integer DEFAULT 0 NOT NULL, source_kind text DEFAULT 'manual' NOT NULL, import_batch_id text, created_at text NOT NULL, FOREIGN KEY(table_id) REFERENCES catalog_tables(id) ON DELETE CASCADE, UNIQUE(table_id,name))`,
  `CREATE INDEX IF NOT EXISTS idx_catalog_fields_table ON catalog_fields(table_id)`,
  `CREATE TABLE IF NOT EXISTS table_scopes (table_id text NOT NULL, project_id text NOT NULL, version_id text NOT NULL, environment_id text NOT NULL, state text DEFAULT 'present' NOT NULL, origin text DEFAULT 'manual' NOT NULL, import_batch_id text, created_at text NOT NULL, PRIMARY KEY(table_id,version_id,environment_id), FOREIGN KEY(table_id) REFERENCES catalog_tables(id) ON DELETE CASCADE, FOREIGN KEY(project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE, FOREIGN KEY(version_id) REFERENCES catalog_versions(id) ON DELETE CASCADE, FOREIGN KEY(environment_id) REFERENCES catalog_environments(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS idx_table_scopes_environment ON table_scopes(environment_id)`,
  `CREATE TABLE IF NOT EXISTS field_scopes (field_id text NOT NULL, project_id text NOT NULL, version_id text NOT NULL, environment_id text NOT NULL, state text DEFAULT 'present' NOT NULL, origin text DEFAULT 'manual' NOT NULL, import_batch_id text, created_at text NOT NULL, PRIMARY KEY(field_id,version_id,environment_id), FOREIGN KEY(field_id) REFERENCES catalog_fields(id) ON DELETE CASCADE, FOREIGN KEY(project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE, FOREIGN KEY(version_id) REFERENCES catalog_versions(id) ON DELETE CASCADE, FOREIGN KEY(environment_id) REFERENCES catalog_environments(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS idx_field_scopes_environment ON field_scopes(environment_id)`,
  `CREATE TABLE IF NOT EXISTS catalog_field_revisions (id text PRIMARY KEY NOT NULL, field_id text NOT NULL, revision integer NOT NULL, data_type text NOT NULL, nullable integer DEFAULT 1 NOT NULL, default_value text, comment text DEFAULT '' NOT NULL, extra text DEFAULT '' NOT NULL, ordinal integer DEFAULT 0 NOT NULL, source_kind text DEFAULT 'manual' NOT NULL, import_batch_id text, fingerprint text NOT NULL, created_at text NOT NULL, FOREIGN KEY(field_id) REFERENCES catalog_fields(id) ON DELETE CASCADE, UNIQUE(field_id,revision))`,
  `CREATE INDEX IF NOT EXISTS idx_catalog_field_revisions_field ON catalog_field_revisions(field_id)`,
  `CREATE TABLE IF NOT EXISTS catalog_field_scope_revisions (field_id text NOT NULL, version_id text NOT NULL, environment_id text NOT NULL, revision_id text NOT NULL, updated_at text NOT NULL, PRIMARY KEY(field_id,version_id,environment_id), FOREIGN KEY(field_id) REFERENCES catalog_fields(id) ON DELETE CASCADE, FOREIGN KEY(version_id) REFERENCES catalog_versions(id) ON DELETE CASCADE, FOREIGN KEY(environment_id) REFERENCES catalog_environments(id) ON DELETE CASCADE, FOREIGN KEY(revision_id) REFERENCES catalog_field_revisions(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS idx_catalog_field_scope_revisions_revision ON catalog_field_scope_revisions(revision_id)`,
  `CREATE TABLE IF NOT EXISTS catalog_changes (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, name text NOT NULL, action text NOT NULL, table_name text NOT NULL, field_name text NOT NULL, field_id text, project_id text NOT NULL, version_id text NOT NULL, source_kind text NOT NULL, source_path text, git_commit text, sql_text text NOT NULL, import_batch_id text, status text DEFAULT 'planned' NOT NULL, created_at text NOT NULL, FOREIGN KEY(field_id) REFERENCES catalog_fields(id) ON DELETE SET NULL, FOREIGN KEY(project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE, FOREIGN KEY(version_id) REFERENCES catalog_versions(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS idx_catalog_changes_version ON catalog_changes(version_id)`,
  `CREATE TABLE IF NOT EXISTS catalog_change_scopes (change_id text NOT NULL, environment_id text NOT NULL, status text DEFAULT 'pending' NOT NULL, executed_at text, verified_at text, note text DEFAULT '' NOT NULL, PRIMARY KEY(change_id,environment_id), FOREIGN KEY(change_id) REFERENCES catalog_changes(id) ON DELETE CASCADE, FOREIGN KEY(environment_id) REFERENCES catalog_environments(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS idx_catalog_change_scopes_environment ON catalog_change_scopes(environment_id)`,
  `CREATE TABLE IF NOT EXISTS import_batches (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, name text NOT NULL, source_kind text NOT NULL, file_name text, source_path text, git_commit text, fingerprint text NOT NULL, raw_sql text DEFAULT '' NOT NULL, project_id text NOT NULL, version_id text NOT NULL, module_id text, status text DEFAULT 'active' NOT NULL, added_count integer DEFAULT 0 NOT NULL, duplicate_count integer DEFAULT 0 NOT NULL, modified_count integer DEFAULT 0 NOT NULL, removed_count integer DEFAULT 0 NOT NULL, conflict_count integer DEFAULT 0 NOT NULL, created_at text NOT NULL, reverted_at text, FOREIGN KEY(project_id) REFERENCES catalog_projects(id), FOREIGN KEY(version_id) REFERENCES catalog_versions(id), FOREIGN KEY(module_id) REFERENCES catalog_modules(id))`,
  `CREATE TABLE IF NOT EXISTS import_items (id text PRIMARY KEY NOT NULL, batch_id text NOT NULL, statement_no integer NOT NULL, action text NOT NULL, table_name text NOT NULL, column_name text NOT NULL, field_id text, result text NOT NULL, message text DEFAULT '' NOT NULL, fingerprint text NOT NULL, before_snapshot text, FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS idx_import_items_batch ON import_items(batch_id)`,
  `CREATE TABLE IF NOT EXISTS import_batch_environments (batch_id text NOT NULL, environment_id text NOT NULL, PRIMARY KEY(batch_id,environment_id), FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE, FOREIGN KEY(environment_id) REFERENCES catalog_environments(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS idx_import_batch_environments_environment ON import_batch_environments(environment_id)`,
  `INSERT OR IGNORE INTO import_batch_environments (batch_id,environment_id) SELECT DISTINCT import_batch_id,environment_id FROM field_scopes WHERE import_batch_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS repository_sources (id text PRIMARY KEY NOT NULL, name text NOT NULL, repository text NOT NULL, branch text DEFAULT 'main' NOT NULL, path_pattern text NOT NULL, project_id text, last_commit text, enabled integer DEFAULT 1 NOT NULL, created_at text NOT NULL)`,
  `PRAGMA optimize`,
];

const seeds = [
  `INSERT OR IGNORE INTO modules VALUES ('mod-core','core','ERP Core','core','2.3.0','Shared ERP schema baseline')`,
  `INSERT OR IGNORE INTO modules VALUES ('mod-level','customer-level','Customer Level','feature','1.0.0','Reusable customer level capability')`,
  `INSERT OR IGNORE INTO modules VALUES ('mod-region','customer-region','Customer Region','feature','1.0.0','Customer region segmentation')`,
  `INSERT OR IGNORE INTO modules VALUES ('mod-channel','customer-channel','Customer Channel','feature','1.0.0','Customer acquisition channel')`,
  `INSERT OR IGNORE INTO projects VALUES ('project-a','A','Project A','2.3.0','current','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO projects VALUES ('project-b','B','Project B','2.3.0','current','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO projects VALUES ('project-c','C','Project C','2.2.0','upgrade','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO project_modules VALUES ('project-a','mod-core','2.3.0')`, `INSERT OR IGNORE INTO project_modules VALUES ('project-a','mod-level','1.0.0')`,
  `INSERT OR IGNORE INTO project_modules VALUES ('project-b','mod-core','2.3.0')`, `INSERT OR IGNORE INTO project_modules VALUES ('project-b','mod-level','1.0.0')`,
  `INSERT OR IGNORE INTO project_modules VALUES ('project-b','mod-region','1.0.0')`, `INSERT OR IGNORE INTO project_modules VALUES ('project-c','mod-core','2.2.0')`,
  `INSERT OR IGNORE INTO project_modules VALUES ('project-c','mod-channel','1.0.0')`,
  `INSERT OR IGNORE INTO schema_fields VALUES ('field-001','CUS-001','customer','id','integer','Customer primary identifier','mod-core','1.0.0','2.3.0','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO schema_fields VALUES ('field-002','CUS-002','customer','name','varchar(120)','Customer display name','mod-core','1.0.0','2.3.0','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO schema_fields VALUES ('field-003','CUS-003','customer','level','varchar(50)','Customer credit level','mod-level','1.0.0','1.2.0','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO schema_fields VALUES ('field-004','CUS-004','customer','region','varchar(40)','Customer operating region','mod-region','1.0.0','1.0.0','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO schema_fields VALUES ('field-005','CUS-005','customer','channel','varchar(30)','Customer acquisition channel','mod-channel','1.0.0','1.0.0','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO migration_changes VALUES ('change-182','CR-2026-0182','field-003','mod-level','V002','Customer level length','varchar(20)','varchar(50)','review','medium','2026-08-22T10:12:00Z')`,
  `INSERT OR IGNORE INTO migration_changes VALUES ('change-179','CR-2026-0179','field-004','mod-region','V001','Added customer region','—','varchar(40)','approved','low','2026-08-21T09:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_projects (id,code,name,kind,parent_id,icon,description,archived,created_at) VALUES ('cat-platform','PLATFORM','平台主线','platform',NULL,'server','公司持续演进的标准平台',0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_projects (id,code,name,kind,parent_id,icon,description,archived,created_at) VALUES ('cat-project-a','A','项目 A','project','cat-platform','package','基于平台主线的客户项目',0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_projects (id,code,name,kind,parent_id,icon,description,archived,created_at) VALUES ('cat-project-b','B','项目 B','project','cat-platform','building','包含个性字段的客户项目',0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_modules VALUES ('cat-module-core','CORE','基础资料','平台通用数据库结构','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_modules VALUES ('cat-module-customer','CUSTOMER','客户管理','客户与渠道相关结构','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_versions (id,project_id,name,source_version,status,created_at) VALUES ('cat-version-platform','cat-platform','3.8.0',NULL,'active','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_versions (id,project_id,name,source_version,status,created_at) VALUES ('cat-version-a','cat-project-a','2.6.1','3.7.0','active','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_versions (id,project_id,name,source_version,status,created_at) VALUES ('cat-version-b','cat-project-b','4.1.0','3.8.0','active','2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-platform-dev','cat-platform','cat-version-platform','dev','开发环境','development',10,0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-platform-test','cat-platform','cat-version-platform','test','测试环境','testing',20,0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-platform-prod','cat-platform','cat-version-platform','prod','正式环境','production',30,0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-a-dev','cat-project-a','cat-version-a','dev','开发环境','development',10,0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-a-test','cat-project-a','cat-version-a','test','测试环境','testing',20,0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-a-prod','cat-project-a','cat-version-a','prod','正式环境','production',30,0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-b-dev','cat-project-b','cat-version-b','dev','开发环境','development',10,0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-b-test','cat-project-b','cat-version-b','test','测试环境','testing',20,0,'2026-08-01T00:00:00Z')`,
  `INSERT OR IGNORE INTO catalog_environments VALUES ('cat-env-b-prod','cat-project-b','cat-version-b','prod','正式环境','production',30,0,'2026-08-01T00:00:00Z')`,
];

export function getD1() { if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.'); return env.DB; }
export async function ensureDatabase() {
  const db = getD1();
  await db.batch(statements.map((sql) => db.prepare(sql)));
  const [projectColumns,versionColumns,importColumns,importItemColumns,changeColumns] = await Promise.all([
    db.prepare(`PRAGMA table_info(catalog_projects)`).all<{name:string}>(),
    db.prepare(`PRAGMA table_info(catalog_versions)`).all<{name:string}>(),
    db.prepare(`PRAGMA table_info(import_batches)`).all<{name:string}>(),
    db.prepare(`PRAGMA table_info(import_items)`).all<{name:string}>(),
    db.prepare(`PRAGMA table_info(catalog_changes)`).all<{name:string}>(),
  ]);
  const alterations:D1PreparedStatement[]=[];
  if (!projectColumns.results.some((column) => column.name === 'icon')) alterations.push(db.prepare(`ALTER TABLE catalog_projects ADD COLUMN icon text DEFAULT 'boxes' NOT NULL`));
  if (!versionColumns.results.some((column) => column.name === 'repository_id')) alterations.push(db.prepare(`ALTER TABLE catalog_versions ADD COLUMN repository_id text`));
  if (!versionColumns.results.some((column) => column.name === 'git_ref')) alterations.push(db.prepare(`ALTER TABLE catalog_versions ADD COLUMN git_ref text`));
  if (!versionColumns.results.some((column) => column.name === 'git_commit')) alterations.push(db.prepare(`ALTER TABLE catalog_versions ADD COLUMN git_commit text`));
  if (!importColumns.results.some((column) => column.name === 'raw_sql')) alterations.push(db.prepare(`ALTER TABLE import_batches ADD COLUMN raw_sql text DEFAULT '' NOT NULL`));
  if (!importColumns.results.some((column) => column.name === 'source_path')) alterations.push(db.prepare(`ALTER TABLE import_batches ADD COLUMN source_path text`));
  if (!importColumns.results.some((column) => column.name === 'git_commit')) alterations.push(db.prepare(`ALTER TABLE import_batches ADD COLUMN git_commit text`));
  if (!importColumns.results.some((column) => column.name === 'modified_count')) alterations.push(db.prepare(`ALTER TABLE import_batches ADD COLUMN modified_count integer DEFAULT 0 NOT NULL`));
  if (!importColumns.results.some((column) => column.name === 'removed_count')) alterations.push(db.prepare(`ALTER TABLE import_batches ADD COLUMN removed_count integer DEFAULT 0 NOT NULL`));
  if (!importItemColumns.results.some((column) => column.name === 'before_snapshot')) alterations.push(db.prepare(`ALTER TABLE import_items ADD COLUMN before_snapshot text`));
  if (!changeColumns.results.some((column) => column.name === 'import_batch_id')) alterations.push(db.prepare(`ALTER TABLE catalog_changes ADD COLUMN import_batch_id text`));
  if (alterations.length) await db.batch(alterations);
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_versions_repository ON catalog_versions(repository_id)`).run();
  const tableScopeMarker = await db.prepare(`SELECT value FROM runtime_meta WHERE key='table_scope_backfill_v1'`).first();
  if (!tableScopeMarker) {
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO table_scopes (table_id,project_id,version_id,environment_id,state,origin,import_batch_id,created_at) SELECT DISTINCT f.table_id,fs.project_id,fs.version_id,fs.environment_id,fs.state,fs.origin,fs.import_batch_id,fs.created_at FROM field_scopes fs JOIN catalog_fields f ON f.id=fs.field_id`),
      db.prepare(`INSERT OR IGNORE INTO runtime_meta (key,value) VALUES ('table_scope_backfill_v1','1')`),
    ]);
  }
  // Existing catalog data predates revisioned definitions. Create a stable baseline revision
  // and point every existing scope at it; later imports create new revisions instead of
  // rewriting the definition that another environment still uses.
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at)
      SELECT f.id || ':r1',f.id,1,f.data_type,f.nullable,f.default_value,f.comment,f.extra,f.ordinal,f.source_kind,f.import_batch_id,
        lower(f.name)||'|'||lower(f.data_type)||'|'||f.nullable||'|'||coalesce(f.default_value,'')||'|'||f.comment||'|'||f.extra,f.created_at
      FROM catalog_fields f`),
    db.prepare(`INSERT OR IGNORE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at)
      SELECT fs.field_id,fs.version_id,fs.environment_id,fs.field_id || ':r1',fs.created_at FROM field_scopes fs`),
  ]);
  const seedMarker = await db.prepare(`SELECT value FROM runtime_meta WHERE key='initial_seed'`).first();
  if (!seedMarker) {
    await db.batch([
      ...seeds.map((sql) => db.prepare(sql)),
      db.prepare(`INSERT OR IGNORE INTO runtime_meta (key,value) VALUES ('initial_seed','1')`),
    ]);
  }
  // Run once more after first-run seeds so the seeded catalog is revisioned immediately.
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at)
      SELECT f.id || ':r1',f.id,1,f.data_type,f.nullable,f.default_value,f.comment,f.extra,f.ordinal,f.source_kind,f.import_batch_id,
        lower(f.name)||'|'||lower(f.data_type)||'|'||f.nullable||'|'||coalesce(f.default_value,'')||'|'||f.comment||'|'||f.extra,f.created_at FROM catalog_fields f`),
    db.prepare(`INSERT OR IGNORE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at)
      SELECT fs.field_id,fs.version_id,fs.environment_id,fs.field_id || ':r1',fs.created_at FROM field_scopes fs`),
  ]);
  return db;
}
