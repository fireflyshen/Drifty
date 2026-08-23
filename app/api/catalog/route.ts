import { ensureDatabase } from '@/db/runtime';
import { fieldFingerprint, parseMysqlSql, type ParsedField } from '@/app/lib/mysql-parser';

const clean = (value:unknown) => typeof value === 'string' ? value.trim() : '';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

async function hash(value:string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2,'0')).join('');
}

function projectCode(name:string) {
  const ascii = name.replace(/[^A-Za-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  const result = ascii.length > 1 ? ascii.map((word) => word[0]).join('') : ascii[0]?.slice(0,8);
  return (result || `P${Date.now().toString().slice(-5)}`).toUpperCase();
}

function tableCode(name:string, used:Set<string>) {
  const words = name.split(/[_\-\s]+/).filter(Boolean);
  const base = (words.length > 1 ? words.map((word) => word[0]).join('') : name.slice(0,3)).replace(/[^A-Za-z0-9]/g,'').toUpperCase() || 'TAB';
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) { candidate = `${base}${suffix}`; suffix += 1; }
  used.add(candidate);
  return candidate;
}

function fieldCode(tablePrefix:string, used:Set<string>) {
  let sequence = 1;
  let candidate = `${tablePrefix}-${String(sequence).padStart(3,'0')}`;
  while (used.has(candidate)) { sequence += 1; candidate = `${tablePrefix}-${String(sequence).padStart(3,'0')}`; }
  used.add(candidate);
  return candidate;
}

async function runChunked(db:D1Database, statements:D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index,index + 50));
}

export async function GET(request:Request) {
  const db = await ensureDatabase();
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'base';

  if (mode === 'search') {
    const query=clean(url.searchParams.get('q')).toLowerCase();
    if (!query) return Response.json({ fields:[],scopes:[],total:0 });
    const where:string[]=[`(lower(f.code) LIKE ? OR lower(t.name || '.' || f.name) LIKE ? OR lower(f.comment) LIKE ? OR lower(t.comment) LIKE ?)`];
    const bindings:unknown[]=[`%${query}%`,`%${query}%`,`%${query}%`,`%${query}%`];
    const condition=where.join(' AND ');
    const [fieldRows,totalRow]=await Promise.all([
      db.prepare(`SELECT f.id,f.code,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,f.source_kind AS sourceKind,
        t.id AS tableId,t.name AS tableName,t.code AS tableCode,t.comment AS tableComment,m.name AS moduleName,
        group_concat(DISTINCT p.name) AS projectNames,group_concat(DISTINCT e.name) AS environmentNames,count(DISTINCT fs.environment_id) AS scopeCount
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id LEFT JOIN catalog_modules m ON m.id=t.module_id
        LEFT JOIN field_scopes fs ON fs.field_id=f.id LEFT JOIN catalog_projects p ON p.id=fs.project_id LEFT JOIN catalog_environments e ON e.id=fs.environment_id
        WHERE ${condition} GROUP BY f.id ORDER BY CASE WHEN lower(t.name || '.' || f.name)=? THEN 0 WHEN lower(f.code)=? THEN 1 ELSE 2 END,t.name,f.ordinal,f.name LIMIT 80`).bind(...bindings,` ${query}`.trim(),query).all(),
      db.prepare(`SELECT count(*) AS count FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE ${condition}`).bind(...bindings).first<{count:number}>(),
    ]);
    const ids=fieldRows.results.map(row=>String((row as Record<string,unknown>).id));
    const placeholders=ids.map(()=>'?').join(',');
    const scopeRows=ids.length?await db.prepare(`SELECT field_id AS fieldId,project_id AS projectId,version_id AS versionId,environment_id AS environmentId,state,origin FROM field_scopes WHERE field_id IN (${placeholders})`).bind(...ids).all():{results:[]};
    return Response.json({ fields:fieldRows.results,scopes:scopeRows.results,total:Number(totalRow?.count??0) });
  }

  if (mode === 'project') {
    const projectId=clean(url.searchParams.get('projectId'));
    const project=await db.prepare(`SELECT id,parent_id AS parentId FROM catalog_projects WHERE id=? AND archived=0`).bind(projectId).first<{id:string;parentId:string|null}>();
    if (!project) return Response.json({ error:'项目不存在。' },{ status:404 });
    const parentId=project.parentId||project.id;
    const [differenceRows,historyRows]=await Promise.all([
      db.prepare(`WITH expected AS (
          SELECT DISTINCT field_id FROM field_scopes WHERE project_id=? OR project_id=?
        ), version_envs AS (
          SELECT v.id AS version_id,v.name AS version_name,e.id AS environment_id,e.name AS environment_name
          FROM catalog_versions v JOIN catalog_environments e ON e.project_id=v.project_id AND (e.version_id=v.id OR e.version_id IS NULL)
          WHERE v.project_id=? AND e.archived=0
        ), matrix AS (
          SELECT ex.field_id,ve.version_id,ve.version_name,ve.environment_id,ve.environment_name,fs.field_id AS present
          FROM expected ex CROSS JOIN version_envs ve
          LEFT JOIN field_scopes fs ON fs.field_id=ex.field_id AND fs.project_id=? AND fs.version_id=ve.version_id AND fs.environment_id=ve.environment_id
        )
        SELECT f.id,f.code,f.name,f.data_type AS dataType,f.comment,t.name AS tableName,m.version_id AS versionId,m.version_name AS versionName,
          count(*) AS totalCount,sum(CASE WHEN m.present IS NOT NULL THEN 1 ELSE 0 END) AS presentCount,
          group_concat(CASE WHEN m.present IS NULL THEN m.environment_name END,'|||') AS missingEnvironments
        FROM matrix m JOIN catalog_fields f ON f.id=m.field_id JOIN catalog_tables t ON t.id=f.table_id
        GROUP BY f.id,m.version_id HAVING sum(CASE WHEN m.present IS NOT NULL THEN 1 ELSE 0 END)<count(*)
        ORDER BY (count(*)-sum(CASE WHEN m.present IS NOT NULL THEN 1 ELSE 0 END)) DESC,t.name,f.ordinal LIMIT 100`).bind(project.id,parentId,project.id,project.id).all(),
      db.prepare(`SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.status,b.added_count AS addedCount,
        b.duplicate_count AS duplicateCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,b.raw_sql AS rawSql,
        v.name AS versionName,group_concat(DISTINCT e.name) AS environmentNames
        FROM import_batches b JOIN catalog_versions v ON v.id=b.version_id
        LEFT JOIN field_scopes fs ON fs.import_batch_id=b.id LEFT JOIN catalog_environments e ON e.id=fs.environment_id
        WHERE b.project_id=? GROUP BY b.id ORDER BY b.created_at DESC LIMIT 50`).bind(project.id).all(),
    ]);
    return Response.json({ differences:differenceRows.results,imports:historyRows.results });
  }

  const [projects,environments,versions,modules,tables,fieldSummary,imports,repositories] = await db.batch([
    db.prepare(`SELECT p.id,p.code,p.name,p.kind,p.parent_id AS parentId,p.description,
      count(DISTINCT e.id) AS environmentCount,count(DISTINCT v.id) AS versionCount,count(DISTINCT fs.field_id) AS fieldCount
      FROM catalog_projects p LEFT JOIN catalog_environments e ON e.project_id=p.id AND e.archived=0
      LEFT JOIN catalog_versions v ON v.project_id=p.id LEFT JOIN field_scopes fs ON fs.project_id=p.id
      WHERE p.archived=0 GROUP BY p.id ORDER BY CASE p.kind WHEN 'platform' THEN 0 ELSE 1 END,p.name`),
    db.prepare(`SELECT e.id,e.project_id AS projectId,e.version_id AS versionId,e.code,e.name,e.stage,e.sort_order AS sortOrder,
      p.name AS projectName,v.name AS versionName,count(DISTINCT fs.field_id) AS fieldCount
      FROM catalog_environments e JOIN catalog_projects p ON p.id=e.project_id LEFT JOIN catalog_versions v ON v.id=e.version_id
      LEFT JOIN field_scopes fs ON fs.environment_id=e.id AND fs.version_id=e.version_id
      WHERE e.archived=0 GROUP BY e.id ORDER BY p.kind DESC,p.name,e.sort_order,e.name`),
    db.prepare(`SELECT v.id,v.project_id AS projectId,v.name,v.source_version AS sourceVersion,v.status,p.name AS projectName
      FROM catalog_versions v JOIN catalog_projects p ON p.id=v.project_id ORDER BY p.kind DESC,p.name,v.created_at DESC`),
    db.prepare(`SELECT m.id,m.code,m.name,m.description,count(DISTINCT t.id) AS tableCount,count(DISTINCT pm.project_id) AS projectCount
      FROM catalog_modules m LEFT JOIN catalog_tables t ON t.module_id=m.id LEFT JOIN catalog_project_modules pm ON pm.module_id=m.id
      GROUP BY m.id ORDER BY m.name`),
    db.prepare(`SELECT t.id,t.code,t.name,t.comment,t.module_id AS moduleId,m.name AS moduleName,count(DISTINCT f.id) AS fieldCount
      FROM catalog_tables t LEFT JOIN catalog_modules m ON m.id=t.module_id LEFT JOIN catalog_fields f ON f.table_id=t.id
      GROUP BY t.id ORDER BY t.name`),
    db.prepare(`SELECT count(*) AS count FROM catalog_fields`),
    db.prepare(`SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.status,b.added_count AS addedCount,
      b.duplicate_count AS duplicateCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,b.raw_sql AS rawSql,
      b.project_id AS projectId,p.name AS projectName,v.name AS versionName
      FROM import_batches b JOIN catalog_projects p ON p.id=b.project_id JOIN catalog_versions v ON v.id=b.version_id
      ORDER BY b.created_at DESC LIMIT 30`),
    db.prepare(`SELECT r.id,r.name,r.repository,r.branch,r.path_pattern AS pathPattern,r.project_id AS projectId,r.last_commit AS lastCommit,r.enabled
      FROM repository_sources r ORDER BY r.created_at DESC`),
  ]);
  return Response.json({ projects:projects.results,environments:environments.results,versions:versions.results,modules:modules.results,
    tables:tables.results,fields:[],scopes:[],fieldTotal:Number((fieldSummary.results[0] as {count?:number}|undefined)?.count??0),imports:imports.results,repositories:repositories.results });
}

export async function POST(request:Request) {
  const body = await request.json() as Record<string,unknown>;
  const action = clean(body.action);
  const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Record<string,unknown>;
  const db = await ensureDatabase();

  if (action === 'project.save') {
    const recordId = clean(payload.id);
    const name = clean(payload.name);
    const kind = clean(payload.kind) === 'platform' ? 'platform' : 'project';
    const code = (clean(payload.code) || projectCode(name)).toUpperCase();
    if (!name) return Response.json({ error:'请填写项目名称。' },{ status:400 });
    try {
      if (recordId) await db.prepare(`UPDATE catalog_projects SET code=?,name=?,kind=?,parent_id=?,description=? WHERE id=?`).bind(code,name,kind,clean(payload.parentId)||null,clean(payload.description),recordId).run();
      else await db.prepare(`INSERT INTO catalog_projects (id,code,name,kind,parent_id,description,archived,created_at) VALUES (?,?,?,?,?,?,0,?)`).bind(id(),code,name,kind,clean(payload.parentId)||null,clean(payload.description),now()).run();
      return Response.json({ ok:true });
    } catch { return Response.json({ error:'项目编码已经存在。' },{ status:409 }); }
  }

  if (action === 'module.save') {
    const recordId = clean(payload.id); const name = clean(payload.name); const code = (clean(payload.code)||projectCode(name)).toUpperCase();
    if (!name) return Response.json({ error:'请填写模块名称。' },{ status:400 });
    try {
      if (recordId) await db.prepare(`UPDATE catalog_modules SET code=?,name=?,description=? WHERE id=?`).bind(code,name,clean(payload.description),recordId).run();
      else await db.prepare(`INSERT INTO catalog_modules VALUES (?,?,?,?,?)`).bind(id(),code,name,clean(payload.description),now()).run();
      return Response.json({ ok:true });
    } catch { return Response.json({ error:'模块编码已经存在。' },{ status:409 }); }
  }

  if (action === 'version.save') {
    const recordId=clean(payload.id),projectId=clean(payload.projectId),name=clean(payload.name);
    if (!projectId||!name) return Response.json({ error:'请选择项目并填写版本。' },{ status:400 });
    try {
      if (recordId) await db.prepare(`UPDATE catalog_versions SET project_id=?,name=?,source_version=?,status=? WHERE id=?`).bind(projectId,name,clean(payload.sourceVersion)||null,clean(payload.status)||'active',recordId).run();
      else await db.prepare(`INSERT INTO catalog_versions VALUES (?,?,?,?,?,?)`).bind(id(),projectId,name,clean(payload.sourceVersion)||null,'active',now()).run();
      return Response.json({ ok:true });
    } catch { return Response.json({ error:'这个项目已经存在同名版本。' },{ status:409 }); }
  }

  if (action === 'environment.save') {
    const recordId=clean(payload.id),projectId=clean(payload.projectId),name=clean(payload.name),code=(clean(payload.code)||projectCode(name)).toLowerCase();
    if (!projectId||!name) return Response.json({ error:'请选择项目并填写环境名称。' },{ status:400 });
    try {
      if (recordId) await db.prepare(`UPDATE catalog_environments SET project_id=?,version_id=?,code=?,name=?,stage=?,sort_order=? WHERE id=?`).bind(projectId,clean(payload.versionId)||null,code,name,clean(payload.stage)||'custom',Number(payload.sortOrder)||0,recordId).run();
      else await db.prepare(`INSERT INTO catalog_environments VALUES (?,?,?,?,?,?,?,?,?)`).bind(id(),projectId,clean(payload.versionId)||null,code,name,clean(payload.stage)||'custom',Number(payload.sortOrder)||0,0,now()).run();
      return Response.json({ ok:true });
    } catch { return Response.json({ error:'这个项目已经存在同名环境编码。' },{ status:409 }); }
  }

  if (action === 'table.save') {
    const recordId=clean(payload.id),name=clean(payload.name).toLowerCase();
    if (!name) return Response.json({ error:'请填写表名。' },{ status:400 });
    const codes = new Set((await db.prepare(`SELECT code FROM catalog_tables`).all<{code:string}>()).results.map((item)=>item.code));
    const code=(clean(payload.code)||tableCode(name,codes)).toUpperCase();
    try {
      if (recordId) await db.prepare(`UPDATE catalog_tables SET code=?,name=?,comment=?,module_id=? WHERE id=?`).bind(code,name,clean(payload.comment),clean(payload.moduleId)||null,recordId).run();
      else await db.prepare(`INSERT INTO catalog_tables VALUES (?,?,?,?,?,NULL,?)`).bind(id(),code,name,clean(payload.comment),clean(payload.moduleId)||null,now()).run();
      return Response.json({ ok:true });
    } catch { return Response.json({ error:'表名或表编码已经存在。' },{ status:409 }); }
  }

  if (action === 'field.save') {
    const recordId=clean(payload.id),tableId=clean(payload.tableId),name=clean(payload.name).toLowerCase(),dataType=clean(payload.dataType).toLowerCase();
    const projectId=clean(payload.projectId),versionId=clean(payload.versionId);
    const environmentIds=Array.isArray(payload.environmentIds)?payload.environmentIds.map(clean).filter(Boolean):[];
    if (!tableId||!name||!dataType) return Response.json({ error:'请选择表，并填写字段名和类型。' },{ status:400 });
    const table=await db.prepare(`SELECT code FROM catalog_tables WHERE id=?`).bind(tableId).first<{code:string}>();
    if (!table) return Response.json({ error:'所选数据表不存在。' },{ status:400 });
    const codes=new Set((await db.prepare(`SELECT code FROM catalog_fields`).all<{code:string}>()).results.map((item)=>item.code));
    const code=recordId?clean(payload.code):fieldCode(table.code,codes);
    try {
      const fieldId=recordId||id();
      if (recordId) await db.prepare(`UPDATE catalog_fields SET table_id=?,name=?,data_type=?,nullable=?,default_value=?,comment=?,extra=? WHERE id=?`).bind(tableId,name,dataType,payload.nullable===false?0:1,clean(payload.defaultValue)||null,clean(payload.comment),clean(payload.extra),recordId).run();
      else await db.prepare(`INSERT INTO catalog_fields VALUES (?,?,?,?,?,?,?,?,?,0,'manual',NULL,?)`).bind(fieldId,tableId,code,name,dataType,payload.nullable===false?0:1,clean(payload.defaultValue)||null,clean(payload.comment),clean(payload.extra),now()).run();
      if (projectId&&versionId&&environmentIds.length) {
        if (recordId) await db.prepare(`DELETE FROM field_scopes WHERE field_id=? AND project_id=? AND version_id=?`).bind(fieldId,projectId,versionId).run();
        await runChunked(db,environmentIds.map((environmentId)=>db.prepare(`INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present','manual',NULL,?)`).bind(fieldId,projectId,versionId,environmentId,now())));
      }
      return Response.json({ ok:true,code });
    } catch { return Response.json({ error:'这张表中已经存在同名字段。' },{ status:409 }); }
  }

  if (action === 'entity.delete') {
    const entity=clean(payload.entity),recordId=clean(payload.id);
    const allowed:Record<string,string>={ project:'catalog_projects',module:'catalog_modules',version:'catalog_versions',environment:'catalog_environments',table:'catalog_tables',field:'catalog_fields',repository:'repository_sources' };
    if (!allowed[entity]||!recordId) return Response.json({ error:'删除目标无效。' },{ status:400 });
    const target = await db.prepare(`SELECT id FROM ${allowed[entity]} WHERE id=?`).bind(recordId).first();
    if (!target) return Response.json({ error:'该对象不存在或已经删除。' },{ status:404 });
    try {
      if (entity==='project') {
        await db.batch([
          db.prepare(`DELETE FROM import_items WHERE batch_id IN (SELECT id FROM import_batches WHERE project_id=?)`).bind(recordId),
          db.prepare(`DELETE FROM catalog_fields WHERE import_batch_id IN (SELECT id FROM import_batches WHERE project_id=?) AND NOT EXISTS (SELECT 1 FROM field_scopes fs WHERE fs.field_id=catalog_fields.id AND fs.project_id<>?)`).bind(recordId,recordId),
          db.prepare(`DELETE FROM catalog_tables WHERE import_batch_id IN (SELECT id FROM import_batches WHERE project_id=?) AND NOT EXISTS (SELECT 1 FROM catalog_fields f WHERE f.table_id=catalog_tables.id)`).bind(recordId),
          db.prepare(`UPDATE catalog_fields SET import_batch_id=NULL WHERE import_batch_id IN (SELECT id FROM import_batches WHERE project_id=?)`).bind(recordId),
          db.prepare(`UPDATE catalog_tables SET import_batch_id=NULL WHERE import_batch_id IN (SELECT id FROM import_batches WHERE project_id=?)`).bind(recordId),
          db.prepare(`DELETE FROM import_batches WHERE project_id=?`).bind(recordId),
          db.prepare(`DELETE FROM repository_sources WHERE project_id=?`).bind(recordId),
          db.prepare(`UPDATE catalog_projects SET parent_id=NULL WHERE parent_id=?`).bind(recordId),
          db.prepare(`DELETE FROM catalog_projects WHERE id=?`).bind(recordId),
        ]);
      } else if (entity==='version') {
        await db.batch([
          db.prepare(`DELETE FROM import_items WHERE batch_id IN (SELECT id FROM import_batches WHERE version_id=?)`).bind(recordId),
          db.prepare(`DELETE FROM catalog_fields WHERE import_batch_id IN (SELECT id FROM import_batches WHERE version_id=?) AND NOT EXISTS (SELECT 1 FROM field_scopes fs WHERE fs.field_id=catalog_fields.id AND fs.version_id<>?)`).bind(recordId,recordId),
          db.prepare(`DELETE FROM catalog_tables WHERE import_batch_id IN (SELECT id FROM import_batches WHERE version_id=?) AND NOT EXISTS (SELECT 1 FROM catalog_fields f WHERE f.table_id=catalog_tables.id)`).bind(recordId),
          db.prepare(`UPDATE catalog_fields SET import_batch_id=NULL WHERE import_batch_id IN (SELECT id FROM import_batches WHERE version_id=?)`).bind(recordId),
          db.prepare(`UPDATE catalog_tables SET import_batch_id=NULL WHERE import_batch_id IN (SELECT id FROM import_batches WHERE version_id=?)`).bind(recordId),
          db.prepare(`DELETE FROM import_batches WHERE version_id=?`).bind(recordId),
          db.prepare(`DELETE FROM catalog_versions WHERE id=?`).bind(recordId),
        ]);
      } else if (entity==='module') {
        await db.batch([
          db.prepare(`UPDATE import_batches SET module_id=NULL WHERE module_id=?`).bind(recordId),
          db.prepare(`DELETE FROM catalog_modules WHERE id=?`).bind(recordId),
        ]);
      } else if (entity==='table') {
        await db.batch([
          db.prepare(`UPDATE import_items SET field_id=NULL WHERE field_id IN (SELECT id FROM catalog_fields WHERE table_id=?)`).bind(recordId),
          db.prepare(`DELETE FROM catalog_tables WHERE id=?`).bind(recordId),
        ]);
      } else if (entity==='field') {
        await db.batch([
          db.prepare(`UPDATE import_items SET field_id=NULL WHERE field_id=?`).bind(recordId),
          db.prepare(`DELETE FROM catalog_fields WHERE id=?`).bind(recordId),
        ]);
      } else await db.prepare(`DELETE FROM ${allowed[entity]} WHERE id=?`).bind(recordId).run();
      const remaining = await db.prepare(`SELECT id FROM ${allowed[entity]} WHERE id=?`).bind(recordId).first();
      if (remaining) return Response.json({ error:'删除没有生效，请重试。' },{ status:409 });
      return Response.json({ ok:true });
    }
    catch { return Response.json({ error:'该对象仍被其他数据引用，暂时不能删除。' },{ status:409 }); }
  }

  if (action === 'repository.save') {
    const name=clean(payload.name),repository=clean(payload.repository),branch=clean(payload.branch)||'main',pathPattern=clean(payload.pathPattern)||'sql/**/*.sql';
    if (!name||!repository) return Response.json({ error:'请填写来源名称和 GitHub 仓库。' },{ status:400 });
    await db.prepare(`INSERT INTO repository_sources VALUES (?,?,?,?,?,?,NULL,1,?)`).bind(id(),name,repository,branch,pathPattern,clean(payload.projectId)||null,now()).run();
    return Response.json({ ok:true });
  }

  if (action === 'import.sql') {
    const sql=clean(payload.sql),projectId=clean(payload.projectId),versionId=clean(payload.versionId),moduleId=clean(payload.moduleId)||null;
    const environmentIds=Array.isArray(payload.environmentIds)?payload.environmentIds.map(clean).filter(Boolean):[];
    const sourceKind=['paste','upload','github'].includes(clean(payload.sourceKind))?clean(payload.sourceKind):'paste';
    if (!sql||!projectId||!versionId||!environmentIds.length) return Response.json({ error:'请提供 SQL，并选择项目、版本和至少一个环境。' },{ status:400 });
    const parsed=parseMysqlSql(sql);
    if (!parsed.fields.length) return Response.json({ error:'没有识别到字段定义。',warnings:parsed.warnings },{ status:400 });
    const fingerprint=await hash(`${projectId}|${versionId}|${environmentIds.sort().join(',')}|${sql.replace(/\s+/g,' ').trim()}`);
    const existingBatch=await db.prepare(`SELECT id,code FROM import_batches WHERE fingerprint=? AND status='active'`).bind(fingerprint).first<{id:string;code:string}>();
    if (existingBatch) return Response.json({ ok:true,duplicateBatch:true,batchCode:existingBatch.code,warnings:parsed.warnings });

    const [tableRows,fieldRows,batchCount]=await Promise.all([
      db.prepare(`SELECT id,code,name,comment,module_id AS moduleId FROM catalog_tables`).all<{id:string;code:string;name:string;comment:string;moduleId:string|null}>(),
      db.prepare(`SELECT f.id,f.code,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,t.name AS tableName,t.id AS tableId FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id`).all<{id:string;code:string;name:string;dataType:string;nullable:number;defaultValue:string|null;comment:string;extra:string;tableName:string;tableId:string}>(),
      db.prepare(`SELECT count(*) AS count FROM import_batches`).first<{count:number}>(),
    ]);
    const tableMap=new Map(tableRows.results.map((item)=>[item.name.toLowerCase(),item]));
    const parsedTableMap=new Map(parsed.tables.map((item)=>[item.name,item]));
    const fieldMap=new Map(fieldRows.results.map((item)=>[`${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`,item]));
    const tableCodes=new Set(tableRows.results.map((item)=>item.code)); const fieldCodes=new Set(fieldRows.results.map((item)=>item.code));
    const batchDate=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10).replaceAll('-','');
    const batchId=id(),batchCode=`IMP-${batchDate}-${String((batchCount?.count??0)+1).padStart(3,'0')}`;
    const statements:D1PreparedStatement[]=[];
    let added=0,duplicates=0,conflicts=0;

    for (const parsedField of parsed.fields) {
      let table=tableMap.get(parsedField.tableName);
      if (!table) {
        const created={ id:id(),code:tableCode(parsedField.tableName,tableCodes),name:parsedField.tableName,comment:parsedTableMap.get(parsedField.tableName)?.comment??'',moduleId };
        statements.push(db.prepare(`INSERT INTO catalog_tables VALUES (?,?,?,?,?,?,?)`).bind(created.id,created.code,created.name,created.comment,moduleId,batchId,now()));
        table=created; tableMap.set(created.name,created);
      } else {
        const tableComment=parsedTableMap.get(parsedField.tableName)?.comment;
        if (tableComment&&!table.comment) { statements.push(db.prepare(`UPDATE catalog_tables SET comment=? WHERE id=?`).bind(tableComment,table.id)); table.comment=tableComment; }
      }
      const key=`${parsedField.tableName}.${(parsedField.previousName||parsedField.columnName).toLowerCase()}`;
      const existing=fieldMap.get(key);
      if (parsedField.action==='drop') {
        if (!existing) { duplicates+=1; statements.push(importItem(db,batchId,parsedField,null,'skipped','字段不存在，无需删除。')); continue; }
        environmentIds.forEach((environmentId)=>statements.push(db.prepare(`DELETE FROM field_scopes WHERE field_id=? AND version_id=? AND environment_id=?`).bind(existing.id,versionId,environmentId)));
        statements.push(importItem(db,batchId,parsedField,existing.id,'scope_removed','已从所选环境移除字段关系。')); continue;
      }
      const incomingFingerprint=fieldFingerprint(parsedField);
      if (existing) {
        const existingFingerprint=fieldFingerprint({ tableName:parsedField.tableName,columnName:existing.name,dataType:existing.dataType,nullable:Boolean(existing.nullable),defaultValue:existing.defaultValue,comment:existing.comment,extra:existing.extra });
        if (incomingFingerprint!==existingFingerprint) {
          conflicts+=1; statements.push(importItem(db,batchId,parsedField,existing.id,'conflict','同名字段定义不同，未自动覆盖。')); continue;
        }
        duplicates+=1;
        environmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`).bind(existing.id,projectId,versionId,environmentId,sourceKind,batchId,now())));
        statements.push(importItem(db,batchId,parsedField,existing.id,'duplicate','字段已存在，仅补充缺少的环境关系。')); continue;
      }
      const fieldId=id(),code=fieldCode(table.code,fieldCodes);
      statements.push(db.prepare(`INSERT INTO catalog_fields VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?)`).bind(fieldId,table.id,code,parsedField.columnName.toLowerCase(),parsedField.dataType,parsedField.nullable?1:0,parsedField.defaultValue,parsedField.comment,parsedField.extra,parsedField.ordinal,sourceKind,batchId,now()));
      environmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`).bind(fieldId,projectId,versionId,environmentId,sourceKind,batchId,now())));
      statements.push(importItem(db,batchId,parsedField,fieldId,'added','新增字段并应用到所选环境。'));
      fieldMap.set(`${parsedField.tableName}.${parsedField.columnName.toLowerCase()}`,{id:fieldId,code,name:parsedField.columnName,dataType:parsedField.dataType,nullable:parsedField.nullable?1:0,defaultValue:parsedField.defaultValue,comment:parsedField.comment,extra:parsedField.extra,tableName:parsedField.tableName,tableId:table.id});
      added+=1;
    }
    statements.unshift(db.prepare(`INSERT INTO import_batches (id,code,name,source_kind,file_name,fingerprint,raw_sql,project_id,version_id,module_id,status,added_count,duplicate_count,conflict_count,created_at,reverted_at) VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,NULL)`).bind(batchId,batchCode,clean(payload.name)||clean(payload.fileName)||'SQL 导入',sourceKind,clean(payload.fileName)||null,fingerprint,sql,projectId,versionId,moduleId,added,duplicates,conflicts,now()));
    await runChunked(db,statements);
    return Response.json({ ok:true,batchCode,added,duplicates,conflicts,warnings:parsed.warnings });
  }

  if (action === 'import.revert') {
    const batchId=clean(payload.id); if (!batchId) return Response.json({ error:'导入批次无效。' },{ status:400 });
    const fields=(await db.prepare(`SELECT id FROM catalog_fields WHERE import_batch_id=?`).bind(batchId).all<{id:string}>()).results;
    const statements:D1PreparedStatement[]=[db.prepare(`DELETE FROM field_scopes WHERE import_batch_id=?`).bind(batchId)];
    fields.forEach((field)=>statements.push(db.prepare(`DELETE FROM catalog_fields WHERE id=? AND NOT EXISTS (SELECT 1 FROM field_scopes WHERE field_id=?)`).bind(field.id,field.id)));
    statements.push(db.prepare(`DELETE FROM catalog_tables WHERE import_batch_id=? AND NOT EXISTS (SELECT 1 FROM catalog_fields WHERE table_id=catalog_tables.id)`).bind(batchId));
    statements.push(db.prepare(`UPDATE import_batches SET status='reverted',reverted_at=? WHERE id=?`).bind(now(),batchId));
    await runChunked(db,statements); return Response.json({ ok:true });
  }

  if (action === 'catalog.reset') {
    await db.batch([db.prepare(`DELETE FROM field_scopes`),db.prepare(`DELETE FROM import_items`),db.prepare(`DELETE FROM import_batches`),db.prepare(`DELETE FROM catalog_fields`),db.prepare(`DELETE FROM catalog_tables`)]);
    return Response.json({ ok:true });
  }

  return Response.json({ error:'未知操作。' },{ status:400 });
}

function importItem(db:D1Database,batchId:string,field:ParsedField,fieldId:string|null,result:string,message:string) {
  return db.prepare(`INSERT INTO import_items VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id(),batchId,field.statementNo,field.action,field.tableName,field.columnName,fieldId,result,message,fieldFingerprint(field));
}
