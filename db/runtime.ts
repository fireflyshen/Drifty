import { env } from 'cloudflare:workers';

const statements = [
  `CREATE TABLE IF NOT EXISTS modules (id text PRIMARY KEY NOT NULL, slug text NOT NULL UNIQUE, name text NOT NULL, kind text NOT NULL, version text NOT NULL, description text DEFAULT '' NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS projects (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, name text NOT NULL, core_version text NOT NULL, status text DEFAULT 'current' NOT NULL, created_at text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS project_modules (project_id text NOT NULL, module_id text NOT NULL, version text NOT NULL, PRIMARY KEY(project_id, module_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS schema_fields (id text PRIMARY KEY NOT NULL, code text NOT NULL UNIQUE, table_name text NOT NULL, column_name text NOT NULL, data_type text NOT NULL, business_meaning text NOT NULL, module_id text NOT NULL, first_version text NOT NULL, current_version text NOT NULL, created_at text NOT NULL, FOREIGN KEY(module_id) REFERENCES modules(id))`,
  `CREATE INDEX IF NOT EXISTS idx_schema_fields_module_id ON schema_fields(module_id)`,
  `CREATE TABLE IF NOT EXISTS migration_changes (id text PRIMARY KEY NOT NULL, change_code text NOT NULL UNIQUE, field_id text NOT NULL, module_id text NOT NULL, migration_version text NOT NULL, title text NOT NULL, from_value text NOT NULL, to_value text NOT NULL, status text DEFAULT 'draft' NOT NULL, risk text DEFAULT 'medium' NOT NULL, created_at text NOT NULL, FOREIGN KEY(field_id) REFERENCES schema_fields(id), FOREIGN KEY(module_id) REFERENCES modules(id))`,
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
];

export function getD1() { if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.'); return env.DB; }
export async function ensureDatabase() {
  const db = getD1();
  await db.batch(statements.map((sql) => db.prepare(sql)));
  await db.batch(seeds.map((sql) => db.prepare(sql)));
  return db;
}
