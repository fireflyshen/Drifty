import { ensureDatabase } from '@/db/runtime';

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

export function POST() {
  return Response.json({ error:'This public deployment is read-only.' }, { status:405, headers:{ Allow:'GET' } });
}
