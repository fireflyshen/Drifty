import { ensureDatabase } from '@/db/runtime';

type FieldInput = {
  code?: string;
  tableName?: string;
  columnName?: string;
  dataType?: string;
  businessMeaning?: string;
  moduleSlug?: string;
  version?: string;
};

type ChangeInput = {
  changeCode?: string;
  fieldCode?: string;
  migrationVersion?: string;
  title?: string;
  fromValue?: string;
  toValue?: string;
  risk?: string;
};

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export async function GET() {
  const db = await ensureDatabase();
  const [fields, modules, projects, changes] = await db.batch([
    db.prepare(`SELECT sf.id, sf.code, sf.table_name AS tableName, sf.column_name AS columnName, sf.data_type AS dataType,
      sf.business_meaning AS businessMeaning, sf.first_version AS firstVersion, sf.current_version AS currentVersion,
      m.slug AS moduleSlug, m.name AS moduleName, m.kind AS moduleKind,
      group_concat(p.code, ',') AS projectCodes
      FROM schema_fields sf JOIN modules m ON m.id = sf.module_id
      LEFT JOIN project_modules pm ON pm.module_id = m.id LEFT JOIN projects p ON p.id = pm.project_id
      GROUP BY sf.id ORDER BY sf.code`),
    db.prepare(`SELECT m.id, m.slug, m.name, m.kind, m.version, m.description, count(DISTINCT sf.id) AS fieldCount,
      count(DISTINCT pm.project_id) AS projectCount FROM modules m
      LEFT JOIN schema_fields sf ON sf.module_id = m.id LEFT JOIN project_modules pm ON pm.module_id = m.id
      GROUP BY m.id ORDER BY CASE m.kind WHEN 'core' THEN 0 ELSE 1 END, m.name`),
    db.prepare(`SELECT p.id, p.code, p.name, p.core_version AS coreVersion, p.status,
      group_concat(m.name || '@' || pm.version, '|') AS manifest
      FROM projects p LEFT JOIN project_modules pm ON pm.project_id = p.id LEFT JOIN modules m ON m.id = pm.module_id
      GROUP BY p.id ORDER BY p.code`),
    db.prepare(`SELECT mc.id, mc.change_code AS changeCode, mc.migration_version AS migrationVersion, mc.title,
      mc.from_value AS fromValue, mc.to_value AS toValue, mc.status, mc.risk, mc.created_at AS createdAt,
      sf.code AS fieldCode, sf.table_name || '.' || sf.column_name AS fieldPath, m.name AS moduleName,
      group_concat(DISTINCT p.code) AS projectCodes
      FROM migration_changes mc JOIN schema_fields sf ON sf.id = mc.field_id JOIN modules m ON m.id = mc.module_id
      LEFT JOIN project_modules pm ON pm.module_id = m.id LEFT JOIN projects p ON p.id = pm.project_id
      GROUP BY mc.id ORDER BY mc.created_at DESC`),
  ]);

  return Response.json({ fields:fields.results, modules:modules.results, projects:projects.results, changes:changes.results });
}

export async function POST(request: Request) {
  const body = await request.json() as { action?:string; field?:FieldInput; change?:ChangeInput };
  const db = await ensureDatabase();

  if (body.action === 'field') {
    const input = body.field ?? {};
    const code = clean(input.code).toUpperCase();
    const tableName = clean(input.tableName).toLowerCase();
    const columnName = clean(input.columnName).toLowerCase();
    const dataType = clean(input.dataType);
    const businessMeaning = clean(input.businessMeaning);
    const moduleSlug = clean(input.moduleSlug);
    const version = clean(input.version) || '1.0.0';

    if (!/^\w{2,8}-\d{3,}$/.test(code) || !/^\w+$/.test(tableName) || !/^\w+$/.test(columnName) || !dataType || !businessMeaning || !moduleSlug) {
      return Response.json({ error:'Complete every field with a valid object code.' }, { status:400 });
    }

    const ownerModule = await db.prepare('SELECT id FROM modules WHERE slug = ?').bind(moduleSlug).first<{ id:string }>();
    if (!ownerModule) return Response.json({ error:'Selected module does not exist.' }, { status:400 });

    try {
      await db.prepare(`INSERT INTO schema_fields (id, code, table_name, column_name, data_type, business_meaning, module_id, first_version, current_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), code, tableName, columnName, dataType, businessMeaning, ownerModule.id, version, version, new Date().toISOString()).run();
      return Response.json({ ok:true }, { status:201 });
    } catch {
      return Response.json({ error:'That field code already exists.' }, { status:409 });
    }
  }

  if (body.action === 'change') {
    const input = body.change ?? {};
    const changeCode = clean(input.changeCode).toUpperCase();
    const fieldCode = clean(input.fieldCode).toUpperCase();
    const migrationVersion = clean(input.migrationVersion).toUpperCase();
    const title = clean(input.title);
    const fromValue = clean(input.fromValue);
    const toValue = clean(input.toValue);
    const risk = ['low', 'medium', 'high'].includes(clean(input.risk)) ? clean(input.risk) : 'medium';

    if (!/^CR-\d{4}-\d{4,}$/.test(changeCode) || !/^V\d{3,}$/.test(migrationVersion) || !fieldCode || !title || !fromValue || !toValue) {
      return Response.json({ error:'Use CR-YYYY-NNNN and VNNN identifiers and complete every field.' }, { status:400 });
    }

    const field = await db.prepare('SELECT id, module_id AS moduleId FROM schema_fields WHERE code = ?').bind(fieldCode).first<{ id:string; moduleId:string }>();
    if (!field) return Response.json({ error:'Selected field does not exist.' }, { status:400 });

    try {
      await db.prepare(`INSERT INTO migration_changes (id, change_code, field_id, module_id, migration_version, title, from_value, to_value, status, risk, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .bind(crypto.randomUUID(), changeCode, field.id, field.moduleId, migrationVersion, title, fromValue, toValue, risk, new Date().toISOString()).run();
      return Response.json({ ok:true }, { status:201 });
    } catch {
      return Response.json({ error:'That change code already exists.' }, { status:409 });
    }
  }

  return Response.json({ error:'Unknown registry action.' }, { status:400 });
}
