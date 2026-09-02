import { ensureDatabase } from '@/db/runtime';
import { fieldFingerprint, parseMysqlSql, type ParsedField } from '@/app/lib/mysql-parser';

const clean = (value:unknown) => typeof value === 'string' ? value.trim() : '';
const csv = (value:unknown) => clean(value).split(',').map((item) => item.trim()).filter(Boolean);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function lifecycleExpression(entity:string, objectExpression:string, projectIds:string[]) {
  const owner=objectExpression.split('.')[0];
  // Project-level lifecycle is the source of truth for a scoped query.  With
  // no scope (the explicit “all projects” view), aggregate all overrides so
  // deprecated/removed objects do not leak into the default active view.
  const projectFilter=projectIds.length?` AND lifecycle.project_id IN (${projectIds.map(()=>'?').join(',')})`:'';
  return {
    sql:`coalesce((SELECT lifecycle.status FROM catalog_object_lifecycles lifecycle WHERE lifecycle.entity='${entity}' AND lifecycle.object_id=${objectExpression}${projectFilter} ORDER BY CASE lifecycle.status WHEN 'removed' THEN 3 WHEN 'deprecated' THEN 2 ELSE 1 END DESC LIMIT 1),${owner}.lifecycle_status,'active')`,
    bindings:projectIds,
  };
}

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

function sqlIdentifier(value:string) { return `\`${value.replaceAll('`','``')}\``; }
function sqlLiteral(value:string) { return `'${value.replaceAll("'","''")}'`; }
function sqlDefault(value:string) {
  const trimmed=value.trim();
  if (/^(NULL|CURRENT_TIMESTAMP(?:\(\))?|TRUE|FALSE)$/i.test(trimmed) || /^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  return sqlLiteral(value);
}
function fieldDefinition(field:{dataType:string;nullable:number|boolean;defaultValue:string|null;comment:string;extra:string}) {
  return `${field.dataType}${field.nullable?' NULL':' NOT NULL'}${field.defaultValue!==null?` DEFAULT ${sqlDefault(field.defaultValue)}`:''}${field.comment?` COMMENT ${sqlLiteral(field.comment)}`:''}${field.extra?` ${field.extra}`:''}`;
}
function indexDefinition(index:{kind:string;name:string;columnsJson:string}) {
  let columns:string[]=[];
  try { columns=JSON.parse(index.columnsJson) as string[]; } catch { columns=[]; }
  const list=columns.map(sqlIdentifier).join(', ');
  if (index.kind==='primary') return `ADD PRIMARY KEY (${list})`;
  if (index.kind==='unique') return `ADD UNIQUE KEY ${sqlIdentifier(index.name)} (${list})`;
  if (index.kind==='fulltext') return `ADD FULLTEXT KEY ${sqlIdentifier(index.name)} (${list})`;
  if (index.kind==='spatial') return `ADD SPATIAL KEY ${sqlIdentifier(index.name)} (${list})`;
  return `ADD KEY ${sqlIdentifier(index.name)} (${list})`;
}

async function runChunked(db:D1Database, statements:D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index,index + 50));
}

async function validateScopeSelection(db:D1Database, projectId:string, versionId:string, environmentIds:string[]) {
  const version=await db.prepare(`SELECT id FROM catalog_versions WHERE id=? AND project_id=?`).bind(versionId,projectId).first();
  if (!version) return '所选版本不属于当前项目。';
  const ids=[...new Set(environmentIds)];
  if (!ids.length) return '请至少选择一个环境。';
  const placeholders=ids.map(()=>'?').join(',');
  const row=await db.prepare(`SELECT count(DISTINCT id) AS count FROM catalog_environments WHERE id IN (${placeholders}) AND project_id=? AND archived=0 AND (version_id=? OR version_id IS NULL)`).bind(...ids,projectId,versionId).first<{count:number}>();
  return Number(row?.count??0)===ids.length?null:'所选环境与当前项目或版本不匹配。';
}

export async function GET(request:Request) {
  const db = await ensureDatabase();
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'base';

  if (mode === 'lifecycle') {
    const [tables, fields, indexes, constraints] = await Promise.all([
      db.prepare(`SELECT id,'table' AS entity,name,NULL AS tableName,
        coalesce(lifecycle_status,'active') AS lifecycleStatus,coalesce(lifecycle_note,'') AS lifecycleNote
        FROM catalog_tables ORDER BY name`).all(),
      db.prepare(`SELECT f.id,'field' AS entity,f.name,t.name AS tableName,
        coalesce(f.lifecycle_status,'active') AS lifecycleStatus,coalesce(f.lifecycle_note,'') AS lifecycleNote
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id ORDER BY t.name,f.ordinal,f.name`).all(),
      db.prepare(`SELECT i.id,'index' AS entity,i.name,t.name AS tableName,
        coalesce(i.lifecycle_status,'active') AS lifecycleStatus,coalesce(i.lifecycle_note,'') AS lifecycleNote
        FROM catalog_indexes i JOIN catalog_tables t ON t.id=i.table_id ORDER BY t.name,i.name`).all(),
      db.prepare(`SELECT c.id,'constraint' AS entity,c.name,t.name AS tableName,
        coalesce(c.lifecycle_status,'active') AS lifecycleStatus,coalesce(c.lifecycle_note,'') AS lifecycleNote
        FROM catalog_constraints c JOIN catalog_tables t ON t.id=c.table_id ORDER BY t.name,c.name`).all(),
    ]);
    const objects = [...tables.results, ...fields.results, ...indexes.results, ...constraints.results];
    return Response.json({ objects });
  }

  if (mode === 'anchor') {
    const projectId=clean(url.searchParams.get('projectId'));
    if (!projectId) return Response.json({ error:'请选择项目。' },{ status:400 });
    const project=await db.prepare(`SELECT p.id,p.anchor_version_id AS anchorVersionId,p.anchor_environment_id AS anchorEnvironmentId,
      av.name AS anchorVersionName,ae.name AS anchorEnvironmentName,ae.version_id AS anchorEnvironmentVersionId
      FROM catalog_projects p LEFT JOIN catalog_versions av ON av.id=p.anchor_version_id
      LEFT JOIN catalog_environments ae ON ae.id=p.anchor_environment_id WHERE p.id=? AND p.archived=0`).bind(projectId).first<{id:string;anchorVersionId:string|null;anchorEnvironmentId:string|null;anchorVersionName:string|null;anchorEnvironmentName:string|null;anchorEnvironmentVersionId:string|null}>();
    if (!project?.anchorVersionId||!project.anchorEnvironmentId) return Response.json({ error:'请先为项目设置锚定版本和锚定环境。' },{ status:400 });
    if (project.anchorEnvironmentVersionId && project.anchorEnvironmentVersionId!==project.anchorVersionId) return Response.json({ error:'锚定环境与锚定版本不匹配，请重新设置。' },{ status:400 });
    const targetVersionId=clean(url.searchParams.get('versionId'))||project.anchorVersionId;
    const targetEnvironmentId=clean(url.searchParams.get('environmentId'))||project.anchorEnvironmentId;
    const target=await db.prepare(`SELECT v.id AS versionId,v.name AS versionName,e.id AS environmentId,e.name AS environmentName
      FROM catalog_versions v JOIN catalog_environments e ON e.project_id=v.project_id AND e.id=? AND (e.version_id=v.id OR e.version_id IS NULL)
      WHERE v.id=? AND v.project_id=?`).bind(targetEnvironmentId,targetVersionId,projectId).first<{versionId:string;versionName:string;environmentId:string;environmentName:string}>();
    if (!target) return Response.json({ error:'目标版本或环境不属于当前项目。' },{ status:400 });
    type ScopeTarget={versionId:string;environmentId:string};
    const anchor:ScopeTarget={versionId:project.anchorVersionId,environmentId:project.anchorEnvironmentId};
    const readFields=async(scope:ScopeTarget)=>(await db.prepare(`SELECT f.id,f.name,t.name AS tableName,
      CASE WHEN fr.id IS NOT NULL THEN fr.data_type ELSE f.data_type END AS dataType,
      CASE WHEN fr.id IS NOT NULL THEN fr.nullable ELSE f.nullable END AS nullable,
      CASE WHEN fr.id IS NOT NULL THEN fr.default_value ELSE f.default_value END AS defaultValue,
      CASE WHEN fr.id IS NOT NULL THEN fr.comment ELSE f.comment END AS comment,
      CASE WHEN fr.id IS NOT NULL THEN fr.extra ELSE f.extra END AS extra
      FROM field_scopes fs JOIN catalog_fields f ON f.id=fs.field_id JOIN catalog_tables t ON t.id=f.table_id
      LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
      LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id
      WHERE fs.project_id=? AND fs.version_id=? AND fs.environment_id=? AND fs.state='present'
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=f.id AND l.project_id=? LIMIT 1),f.lifecycle_status,'active')='active'`).bind(projectId,scope.versionId,scope.environmentId,projectId,projectId).all<{id:string;name:string;tableName:string;dataType:string;nullable:number;defaultValue:string|null;comment:string;extra:string}>()).results.map(item=>({...item,dataType:item.dataType,nullable:item.nullable,defaultValue:item.defaultValue,comment:item.comment,extra:item.extra}));
    const readIndexes=async(scope:ScopeTarget)=>(await db.prepare(`SELECT i.id,i.name,i.kind,i.columns_json AS columnsJson,t.name AS tableName FROM catalog_index_scopes s JOIN catalog_indexes i ON i.id=s.index_id JOIN catalog_tables t ON t.id=i.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='index' AND l.object_id=i.id AND l.project_id=? LIMIT 1),i.lifecycle_status,'active')='active'`).bind(projectId,scope.versionId,scope.environmentId,projectId,projectId).all<{id:string;name:string;kind:string;columnsJson:string;tableName:string}>()).results;
    const readConstraints=async(scope:ScopeTarget)=>(await db.prepare(`SELECT c.id,c.name,c.kind,c.definition,t.name AS tableName FROM catalog_constraint_scopes s JOIN catalog_constraints c ON c.id=s.constraint_id JOIN catalog_tables t ON t.id=c.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='constraint' AND l.object_id=c.id AND l.project_id=? LIMIT 1),c.lifecycle_status,'active')='active'`).bind(projectId,scope.versionId,scope.environmentId,projectId,projectId).all<{id:string;name:string;kind:string;definition:string;tableName:string}>()).results;
    const readTables=async(scope:ScopeTarget)=>(await db.prepare(`SELECT DISTINCT t.name FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'`).bind(projectId,scope.versionId,scope.environmentId,projectId).all<{name:string}>()).results.map(item=>item.name.toLowerCase());
    const [anchorFields,targetFields,anchorIndexes,targetIndexes,anchorConstraints,targetConstraints,anchorTables,targetTables,executions]=await Promise.all([
      readFields(anchor),readFields(target),readIndexes(anchor),readIndexes(target),readConstraints(anchor),readConstraints(target),readTables(anchor),readTables(target),
      db.prepare(`SELECT x.id,x.status,x.environment_id AS environmentId,e.name AS environmentName,v.name AS versionName,x.created_at AS createdAt,x.sql_text AS sqlText FROM catalog_sql_executions x JOIN catalog_environments e ON e.id=x.environment_id JOIN catalog_versions v ON v.id=x.version_id WHERE x.project_id=? ORDER BY x.created_at DESC LIMIT 200`).bind(projectId).all<{id:string;status:string;environmentId:string;environmentName:string;versionName:string;createdAt:string;sqlText:string}>(),
    ]);
    const fieldKey=(item:{tableName:string;name:string})=>`${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`;
    const anchorFieldMap=new Map(anchorFields.map(item=>[fieldKey(item),item])),targetFieldMap=new Map(targetFields.map(item=>[fieldKey(item),item]));
    const fieldItems=[...new Set([...anchorFieldMap.keys(),...targetFieldMap.keys()])].sort().map(key=>{const left=anchorFieldMap.get(key),right=targetFieldMap.get(key);if(left&&!right)return {tableName:left.tableName,columnName:left.name,result:'added' as const,before:fieldDefinition(left),after:null,changes:['锚点存在，目标环境缺少']};if(!left&&right)return {tableName:right.tableName,columnName:right.name,result:'removed' as const,before:null,after:fieldDefinition(right),changes:['目标环境存在，锚点已没有（保留，不自动删除）']};const changes:string[]=[];if(left!.dataType!==right!.dataType)changes.push(`类型：${left!.dataType} → ${right!.dataType}`);if(Boolean(left!.nullable)!==Boolean(right!.nullable))changes.push(`可空：${left!.nullable?'是':'否'} → ${right!.nullable?'是':'否'}`);if((left!.defaultValue??null)!==(right!.defaultValue??null))changes.push(`默认值：${left!.defaultValue??'—'} → ${right!.defaultValue??'—'}`);if(left!.comment!==right!.comment)changes.push(`注释：${left!.comment||'—'} → ${right!.comment||'—'}`);if(left!.extra!==right!.extra)changes.push(`属性：${left!.extra||'—'} → ${right!.extra||'—'}`);return {tableName:right!.tableName,columnName:right!.name,result:changes.length?'modified' as const:'modified' as const,before:fieldDefinition(left!),after:fieldDefinition(right!),changes};}).filter(item=>item.result!=='modified'||item.changes.length);
    const indexKey=(item:{tableName:string;name:string})=>`${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`;
    const anchorIndexMap=new Map(anchorIndexes.map(item=>[indexKey(item),item])),targetIndexMap=new Map(targetIndexes.map(item=>[indexKey(item),item]));
    const indexItems=[...new Set([...anchorIndexMap.keys(),...targetIndexMap.keys()])].sort().map(key=>{const left=anchorIndexMap.get(key),right=targetIndexMap.get(key);if(left&&!right)return {tableName:left.tableName,columnName:left.name,result:'added' as const,before:`${left.kind} (${left.columnsJson})`,after:null,changes:['锚点存在，目标环境缺少']};if(!left&&right)return {tableName:right.tableName,columnName:right.name,result:'removed' as const,before:null,after:`${right.kind} (${right.columnsJson})`,changes:['目标环境存在，锚点已没有（保留，不自动删除）']};const changed=left!.kind!==right!.kind||left!.columnsJson!==right!.columnsJson;return {tableName:right!.tableName,columnName:right!.name,result:changed?'modified' as const:'modified' as const,before:`${left!.kind} (${left!.columnsJson})`,after:`${right!.kind} (${right!.columnsJson})`,changes:changed?['索引定义不同']:[]};}).filter(item=>item.result!=='modified'||item.changes.length);
    const constraintKey=(item:{tableName:string;name:string})=>`${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`;
    const anchorConstraintMap=new Map(anchorConstraints.map(item=>[constraintKey(item),item])),targetConstraintMap=new Map(targetConstraints.map(item=>[constraintKey(item),item]));
    const constraintItems=[...new Set([...anchorConstraintMap.keys(),...targetConstraintMap.keys()])].sort().map(key=>{const left=anchorConstraintMap.get(key),right=targetConstraintMap.get(key);if(left&&!right)return {tableName:left.tableName,columnName:left.name,result:'added' as const,before:left.definition,after:null,changes:['锚点存在，目标环境缺少']};if(!left&&right)return {tableName:right.tableName,columnName:right.name,result:'removed' as const,before:null,after:right.definition,changes:['目标环境存在，锚点已没有（保留，不自动删除）']};const changed=left!.definition!==right!.definition;return {tableName:right!.tableName,columnName:right!.name,result:changed?'modified' as const:'modified' as const,before:left!.definition,after:right!.definition,changes:changed?['约束定义不同']:[]};}).filter(item=>item.result!=='modified'||item.changes.length);
    const tableSet=new Set(anchorTables),targetTableSet=new Set(targetTables);const tableItems=[...new Set([...anchorTables,...targetTables])].sort().filter(name=>tableSet.has(name)!==targetTableSet.has(name)).map(tableName=>({tableName,result:tableSet.has(tableName)?'added' as const:'removed' as const}));
    const sql:string[]=[];
    const anchorFieldsByTable=(tableName:string)=>anchorFields.filter(item=>item.tableName.toLowerCase()===tableName).map(item=>`${sqlIdentifier(item.name)} ${fieldDefinition(item)}`);
    for(const tableName of tableItems.filter(item=>item.result==='added').map(item=>item.tableName)){const definitions=anchorFieldsByTable(tableName);const indexes=anchorIndexes.filter(item=>item.tableName.toLowerCase()===tableName).map(item=>indexDefinition(item).replace(/^ADD /,''));sql.push(`CREATE TABLE IF NOT EXISTS ${sqlIdentifier(tableName)} (\n  ${[...definitions,...indexes].join(',\n  ')}\n);`);}
    for(const item of fieldItems.filter(item=>item.result==='added'||item.result==='modified')) if(!tableItems.some(table=>table.tableName===item.tableName&&table.result==='added')) sql.push(`ALTER TABLE ${sqlIdentifier(item.tableName)} ${item.result==='added'?'ADD COLUMN':'MODIFY COLUMN'} ${sqlIdentifier(item.columnName??'')} ${item.result==='added'?item.before??'':item.before??''};`);
    for(const item of indexItems.filter(item=>item.result==='added'||item.result==='modified')) if(!tableItems.some(table=>table.tableName===item.tableName&&table.result==='added')) {const anchorIndex=anchorIndexMap.get(`${item.tableName.toLowerCase()}.${item.columnName?.toLowerCase()}`);if(anchorIndex){if(item.result==='modified')sql.push(`ALTER TABLE ${sqlIdentifier(item.tableName)} ${anchorIndex.kind==='primary'?'DROP PRIMARY KEY':`DROP INDEX ${sqlIdentifier(anchorIndex.name)}`};`);sql.push(`ALTER TABLE ${sqlIdentifier(item.tableName)} ${indexDefinition(anchorIndex)};`);}}
    for(const item of constraintItems.filter(item=>item.result==='added'||item.result==='modified')) if(!tableItems.some(table=>table.tableName===item.tableName&&table.result==='added')) {const constraint=anchorConstraintMap.get(`${item.tableName.toLowerCase()}.${item.columnName?.toLowerCase()}`);if(constraint){if(item.result==='modified') sql.push(`ALTER TABLE ${sqlIdentifier(item.tableName)} ${constraint.kind==='foreign'?'DROP FOREIGN KEY':'DROP CHECK'} ${sqlIdentifier(constraint.name)};`);sql.push(`ALTER TABLE ${sqlIdentifier(item.tableName)} ADD ${constraint.definition.toUpperCase().startsWith('CONSTRAINT')?constraint.definition:`CONSTRAINT ${sqlIdentifier(constraint.name)} ${constraint.definition}`};`);}}
    return Response.json({ok:true,anchor:{versionId:anchor.versionId,environmentId:anchor.environmentId,versionName:project.anchorVersionName,environmentName:project.anchorEnvironmentName},target:{...target},tableItems,fieldItems,indexItems,constraintItems,sql:sql.join('\n'),executions:executions.results});
  }

  if (mode === 'search') {
    const query=clean(url.searchParams.get('q')).toLowerCase();
    const projectIds=csv(url.searchParams.get('projectId'));
    const versionId=clean(url.searchParams.get('versionId'));
    const environmentIds=csv(url.searchParams.get('environmentId'));
    // An environment identifies its owning project.  Use that context when
    // the user searches without explicitly selecting a project, so project
    // lifecycle overrides remain isolated and deterministic.
    const scopedProjectIds=projectIds.length?projectIds:(environmentIds.length
      ? (await db.prepare(`SELECT DISTINCT project_id AS projectId FROM catalog_environments WHERE id IN (${environmentIds.map(()=>'?').join(',')})`).bind(...environmentIds).all<{projectId:string}>()).results.map((row)=>row.projectId)
      : []);
    const lifecycleStatus=['active','deprecated','removed'].includes(clean(url.searchParams.get('lifecycleStatus')))?clean(url.searchParams.get('lifecycleStatus')):'';
    const requestedEntity=clean(url.searchParams.get('entity'));const entity=['table','field','index','constraint'].includes(requestedEntity)?requestedEntity:'field';
    const limit=Math.min(40,Math.max(1,Number(url.searchParams.get('limit'))||20));
    const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
    if (!query&&!projectIds.length&&!versionId&&!environmentIds.length) return Response.json(entity==='table'?{ tables:[],tableScopes:[],total:0,offset,hasMore:false }:entity==='field'?{ fields:[],scopes:[],total:0,offset,hasMore:false }:{ items:[],total:0,offset,hasMore:false });
    if (entity === 'table') {
      const pattern=`%${query}%`;
      const conditions=[`(lower(t.code) LIKE ? OR lower(t.name) LIKE ? OR lower(t.comment) LIKE ? OR lower(coalesce(m.name,'')) LIKE ?)`];
      const scopeBindings:unknown[]=[pattern,pattern,pattern,pattern];
      const selectedLifecycle=lifecycleExpression('table','t.id',scopedProjectIds);
      const filteredLifecycle=lifecycleExpression('table','t.id',scopedProjectIds);
      const tableScopeParts:string[]=[`scope_filter.table_id=t.id`];
      if (projectIds.length) { const placeholders=projectIds.map(()=>'?').join(','); tableScopeParts.push(`scope_filter.project_id IN (${placeholders})`); scopeBindings.push(...projectIds); }
      if (versionId) { tableScopeParts.push(`scope_filter.version_id=?`); scopeBindings.push(versionId); }
      if (environmentIds.length) { const placeholders=environmentIds.map(()=>'?').join(','); tableScopeParts.push(`scope_filter.environment_id IN (${placeholders})`); scopeBindings.push(...environmentIds); }
      if (tableScopeParts.length>1) conditions.push(`EXISTS (SELECT 1 FROM table_scopes scope_filter WHERE ${tableScopeParts.join(' AND ')})`);
      if (lifecycleStatus) { conditions.push(`${filteredLifecycle.sql}=?`); scopeBindings.push(...filteredLifecycle.bindings,lifecycleStatus); }
      const condition=conditions.join(' AND ');
      const [tableRows,totalRow]=await Promise.all([
        db.prepare(`SELECT t.id,t.code,t.name,t.comment,${selectedLifecycle.sql} AS lifecycleStatus,'' AS lifecycleNote,t.module_id AS moduleId,m.name AS moduleName,count(DISTINCT f.id) AS fieldCount,
          group_concat(DISTINCT p.name) AS projectNames,group_concat(DISTINCT e.name) AS environmentNames,count(DISTINCT ts.environment_id) AS scopeCount
          FROM catalog_tables t LEFT JOIN catalog_modules m ON m.id=t.module_id LEFT JOIN catalog_fields f ON f.table_id=t.id
          LEFT JOIN table_scopes ts ON ts.table_id=t.id LEFT JOIN catalog_projects p ON p.id=ts.project_id LEFT JOIN catalog_environments e ON e.id=ts.environment_id
          WHERE ${condition} GROUP BY t.id ORDER BY CASE WHEN lower(t.name)=? THEN 0 WHEN lower(t.code)=? THEN 1 ELSE 2 END,t.name LIMIT ? OFFSET ?`).bind(...selectedLifecycle.bindings,...scopeBindings,query,query,limit,offset).all(),
        db.prepare(`SELECT count(*) AS count FROM catalog_tables t LEFT JOIN catalog_modules m ON m.id=t.module_id WHERE ${condition}`).bind(...scopeBindings).first<{count:number}>(),
      ]);
      const ids=tableRows.results.map(row=>String((row as Record<string,unknown>).id));
      const placeholders=ids.map(()=>'?').join(',');
      const scopeRows=ids.length?await db.prepare(`SELECT s.table_id AS tableId,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.state,s.origin,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote FROM table_scopes s LEFT JOIN catalog_object_lifecycles l ON l.entity='table' AND l.object_id=s.table_id AND l.project_id=s.project_id WHERE s.table_id IN (${placeholders})`).bind(...ids).all():{results:[]};
      const total=Number(totalRow?.count??0);
      return Response.json({ tables:tableRows.results,tableScopes:scopeRows.results,total,offset,hasMore:offset+tableRows.results.length<total });
    }
    if (entity==='index'||entity==='constraint') {
      const tableName=entity==='index'?'catalog_indexes':'catalog_constraints';
      const conditionParts=[entity==='index'?'(lower(i.name) LIKE ? OR lower(t.name) LIKE ? OR lower(i.kind) LIKE ? OR lower(i.columns_json) LIKE ?)':'(lower(c.name) LIKE ? OR lower(t.name) LIKE ? OR lower(c.kind) LIKE ? OR lower(c.definition) LIKE ?)'];
      const pattern=`%${query}%`;
      const objectBindings:unknown[]=[pattern,pattern,pattern,pattern];
      const scopeTable=entity==='index'?'catalog_index_scopes':'catalog_constraint_scopes';
      const scopeKey=entity==='index'?'index_id':'constraint_id';
      const alias=entity==='index'?'i':'c';
      const selectedLifecycle=lifecycleExpression(entity,`${alias}.id`,scopedProjectIds);
      const filteredLifecycle=lifecycleExpression(entity,`${alias}.id`,scopedProjectIds);
      const objectScopeParts:string[]=[`scope_filter.${scopeKey}=${entity==='index'?'i':'c'}.id`];
      if (projectIds.length) { const placeholders=projectIds.map(()=>'?').join(','); objectScopeParts.push(`scope_filter.project_id IN (${placeholders})`); objectBindings.push(...projectIds); }
      if (versionId) { objectScopeParts.push(`scope_filter.version_id=?`); objectBindings.push(versionId); }
      if (environmentIds.length) { const placeholders=environmentIds.map(()=>'?').join(','); objectScopeParts.push(`scope_filter.environment_id IN (${placeholders})`); objectBindings.push(...environmentIds); }
      if (objectScopeParts.length>1) conditionParts.push(`EXISTS (SELECT 1 FROM ${scopeTable} scope_filter WHERE ${objectScopeParts.join(' AND ')})`);
      if (lifecycleStatus) { conditionParts.push(`${filteredLifecycle.sql}=?`); objectBindings.push(...filteredLifecycle.bindings,lifecycleStatus); }
      const condition=conditionParts.join(' AND ');
      const [rows,totalRow]=await Promise.all([
        db.prepare(`SELECT ${entity==='index'?`i.id,i.name,i.kind,i.columns_json AS columnsJson,${selectedLifecycle.sql} AS lifecycleStatus,'' AS lifecycleNote,t.id AS tableId,t.name AS tableName`:`c.id,c.name,c.kind,c.definition,${selectedLifecycle.sql} AS lifecycleStatus,'' AS lifecycleNote,t.id AS tableId,t.name AS tableName`} FROM ${tableName} ${alias} JOIN catalog_tables t ON t.id=${alias}.table_id WHERE ${condition} ORDER BY t.name,${alias}.name LIMIT ? OFFSET ?`).bind(...selectedLifecycle.bindings,...objectBindings,limit,offset).all(),
        db.prepare(`SELECT count(*) AS count FROM ${tableName} ${entity==='index'?'i':'c'} JOIN catalog_tables t ON t.id=${entity==='index'?'i.table_id':'c.table_id'} WHERE ${condition}`).bind(...objectBindings).first<{count:number}>(),
      ]);
      const total=Number(totalRow?.count??0);return Response.json({items:rows.results,total,offset,hasMore:offset+rows.results.length<total});
    }
    const where:string[]=[`(lower(f.code) LIKE ? OR lower(t.name || '.' || f.name) LIKE ? OR lower(f.comment) LIKE ? OR lower(t.comment) LIKE ?)`];
    const bindings:unknown[]=[`%${query}%`,`%${query}%`,`%${query}%`,`%${query}%`];
    const selectedLifecycle=lifecycleExpression('field','f.id',scopedProjectIds);
    const filteredLifecycle=lifecycleExpression('field','f.id',scopedProjectIds);
    const fieldScopeParts:string[]=[`scope_filter.field_id=f.id`];
    if (projectIds.length) { const placeholders=projectIds.map(()=>'?').join(','); fieldScopeParts.push(`scope_filter.project_id IN (${placeholders})`); bindings.push(...projectIds); }
    if (versionId) { fieldScopeParts.push(`scope_filter.version_id=?`); bindings.push(versionId); }
    if (environmentIds.length) { const placeholders=environmentIds.map(()=>'?').join(','); fieldScopeParts.push(`scope_filter.environment_id IN (${placeholders})`); bindings.push(...environmentIds); }
    if (fieldScopeParts.length>1) where.push(`EXISTS (SELECT 1 FROM field_scopes scope_filter WHERE ${fieldScopeParts.join(' AND ')})`);
    if (lifecycleStatus) { where.push(`${filteredLifecycle.sql}=?`); bindings.push(...filteredLifecycle.bindings,lifecycleStatus); }
    const condition=where.join(' AND ');
    const [fieldRows,totalRow]=await Promise.all([
        db.prepare(`SELECT f.id,f.code,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,${selectedLifecycle.sql} AS lifecycleStatus,'' AS lifecycleNote,f.source_kind AS sourceKind,
        t.id AS tableId,t.name AS tableName,t.code AS tableCode,t.comment AS tableComment,m.name AS moduleName,
        group_concat(DISTINCT p.name) AS projectNames,group_concat(DISTINCT e.name) AS environmentNames,count(DISTINCT fs.environment_id) AS scopeCount
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id LEFT JOIN catalog_modules m ON m.id=t.module_id
        LEFT JOIN field_scopes fs ON fs.field_id=f.id LEFT JOIN catalog_projects p ON p.id=fs.project_id LEFT JOIN catalog_environments e ON e.id=fs.environment_id
        WHERE ${condition} GROUP BY f.id ORDER BY CASE WHEN lower(t.name || '.' || f.name)=? THEN 0 WHEN lower(f.code)=? THEN 1 ELSE 2 END,t.name,f.ordinal,f.name LIMIT ? OFFSET ?`).bind(...selectedLifecycle.bindings,...bindings,query,query,limit,offset).all(),
      db.prepare(`SELECT count(*) AS count FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE ${condition}`).bind(...bindings).first<{count:number}>(),
    ]);
    const ids=fieldRows.results.map(row=>String((row as Record<string,unknown>).id));
    const placeholders=ids.map(()=>'?').join(',');
    const scopeRows=ids.length?await db.prepare(`SELECT fs.field_id AS fieldId,fs.project_id AS projectId,fs.version_id AS versionId,fs.environment_id AS environmentId,fs.state,fs.origin,
      csr.revision_id AS revisionId,fr.revision,fr.data_type AS revisionDataType,fr.nullable AS revisionNullable,fr.default_value AS revisionDefaultValue,fr.comment AS revisionComment,fr.extra AS revisionExtra,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote
      FROM field_scopes fs LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
      LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id LEFT JOIN catalog_object_lifecycles l ON l.entity='field' AND l.object_id=fs.field_id AND l.project_id=fs.project_id WHERE fs.field_id IN (${placeholders})`).bind(...ids).all():{results:[]};
    const total=Number(totalRow?.count??0);
    return Response.json({ fields:fieldRows.results,scopes:scopeRows.results,total,offset,hasMore:offset+fieldRows.results.length<total });
  }

  if (mode === 'table') {
    const tableId=clean(url.searchParams.get('tableId'));
    const [table,fields,scopeRows,fieldScopeRows,indexRows,indexScopeRows,constraintRows,constraintScopeRows]=await Promise.all([
      db.prepare(`SELECT t.id,t.code,t.name,t.comment,t.lifecycle_status AS lifecycleStatus,t.lifecycle_note AS lifecycleNote,t.module_id AS moduleId,m.name AS moduleName,count(DISTINCT f.id) AS fieldCount
        FROM catalog_tables t LEFT JOIN catalog_modules m ON m.id=t.module_id LEFT JOIN catalog_fields f ON f.table_id=t.id WHERE t.id=? GROUP BY t.id`).bind(tableId).first(),
      db.prepare(`SELECT f.id,f.code,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,f.lifecycle_status AS lifecycleStatus,f.lifecycle_note AS lifecycleNote,f.source_kind AS sourceKind,
        t.id AS tableId,t.name AS tableName,t.code AS tableCode,m.name AS moduleName,count(DISTINCT fs.environment_id) AS scopeCount
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id LEFT JOIN catalog_modules m ON m.id=t.module_id LEFT JOIN field_scopes fs ON fs.field_id=f.id
        WHERE f.table_id=? GROUP BY f.id ORDER BY f.ordinal,f.name`).bind(tableId).all(),
      db.prepare(`SELECT s.table_id AS tableId,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.state,s.origin,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote FROM table_scopes s LEFT JOIN catalog_object_lifecycles l ON l.entity='table' AND l.object_id=s.table_id AND l.project_id=s.project_id WHERE s.table_id=?`).bind(tableId).all(),
      db.prepare(`SELECT fs.field_id AS fieldId,fs.project_id AS projectId,fs.version_id AS versionId,fs.environment_id AS environmentId,fs.state,fs.origin,
        csr.revision_id AS revisionId,csr.resolution_kind AS resolutionKind,csr.review_status AS reviewStatus,csr.resolution_note AS resolutionNote,
        fr.revision,fr.data_type AS revisionDataType,fr.nullable AS revisionNullable,fr.default_value AS revisionDefaultValue,fr.comment AS revisionComment,fr.extra AS revisionExtra,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote
        FROM field_scopes fs JOIN catalog_fields f ON f.id=fs.field_id LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id LEFT JOIN catalog_object_lifecycles l ON l.entity='field' AND l.object_id=fs.field_id AND l.project_id=fs.project_id WHERE f.table_id=?`).bind(tableId).all(),
      db.prepare(`SELECT id,table_id AS tableId,name,kind,columns_json AS columnsJson,lifecycle_status AS lifecycleStatus,lifecycle_note AS lifecycleNote,source_kind AS sourceKind,import_batch_id AS importBatchId,created_at AS createdAt FROM catalog_indexes WHERE table_id=? ORDER BY name`).bind(tableId).all(),
      db.prepare(`SELECT s.index_id AS indexId,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.state,s.origin,s.import_batch_id AS importBatchId,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote FROM catalog_index_scopes s LEFT JOIN catalog_object_lifecycles l ON l.entity='index' AND l.object_id=s.index_id AND l.project_id=s.project_id WHERE s.index_id IN (SELECT id FROM catalog_indexes WHERE table_id=?)`).bind(tableId).all(),
      db.prepare(`SELECT id,table_id AS tableId,name,kind,definition,lifecycle_status AS lifecycleStatus,lifecycle_note AS lifecycleNote,source_kind AS sourceKind,import_batch_id AS importBatchId,created_at AS createdAt FROM catalog_constraints WHERE table_id=? ORDER BY name`).bind(tableId).all(),
      db.prepare(`SELECT s.constraint_id AS constraintId,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.state,s.origin,s.import_batch_id AS importBatchId,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote FROM catalog_constraint_scopes s LEFT JOIN catalog_object_lifecycles l ON l.entity='constraint' AND l.object_id=s.constraint_id AND l.project_id=s.project_id WHERE s.constraint_id IN (SELECT id FROM catalog_constraints WHERE table_id=?)`).bind(tableId).all(),
    ]);
    if (!table) return Response.json({ error:'数据表不存在。' },{ status:404 });
    return Response.json({ table,fields:fields.results,tableScopes:scopeRows.results,fieldScopes:fieldScopeRows.results,indexes:indexRows.results,indexScopes:indexScopeRows.results,constraints:constraintRows.results,constraintScopes:constraintScopeRows.results });
  }

  if (mode === 'import') {
    const importId=clean(url.searchParams.get('importId'));
    const [batch,items]=await Promise.all([
      db.prepare(`SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.source_path AS sourcePath,b.git_commit AS gitCommit,
        b.status,b.added_count AS addedCount,b.duplicate_count AS duplicateCount,b.modified_count AS modifiedCount,b.removed_count AS removedCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,
        b.raw_sql AS rawSql,b.project_id AS projectId,b.version_id AS versionId,b.module_id AS moduleId,p.name AS projectName,v.name AS versionName,
        m.name AS moduleName,r.repository,r.branch AS repositoryBranch,v.git_ref AS gitRef,
        group_concat(be.environment_id,'|||') AS environmentIds,group_concat(e.name,'|||') AS environmentNames
        FROM import_batches b JOIN catalog_projects p ON p.id=b.project_id JOIN catalog_versions v ON v.id=b.version_id
        LEFT JOIN catalog_modules m ON m.id=b.module_id LEFT JOIN repository_sources r ON r.id=v.repository_id
        LEFT JOIN import_batch_environments be ON be.batch_id=b.id LEFT JOIN catalog_environments e ON e.id=be.environment_id
        WHERE b.id=? GROUP BY b.id`).bind(importId).first(),
      db.prepare(`SELECT ii.id,ii.statement_no AS statementNo,ii.action,ii.table_name AS tableName,ii.column_name AS columnName,ii.result,ii.message,
        (SELECT group_concat(DISTINCT csr.resolution_kind) FROM catalog_field_scope_revisions csr WHERE csr.import_item_id=ii.id) AS resolutionKind,
        (SELECT group_concat(DISTINCT csr.review_status) FROM catalog_field_scope_revisions csr WHERE csr.import_item_id=ii.id) AS reviewStatus
        FROM import_items ii WHERE ii.batch_id=? ORDER BY ii.statement_no,ii.id`).bind(importId).all(),
    ]);
    if (!batch) return Response.json({ error:'SQL 记录不存在。' },{ status:404 });
    return Response.json({ batch,items:items.results });
  }

  if (mode === 'environment') {
    const environmentId=clean(url.searchParams.get('environmentId'));
    const environment=await db.prepare(`SELECT e.id,e.project_id AS projectId,e.version_id AS versionId,e.code,e.name,e.stage,
      e.sort_order AS sortOrder,p.name AS projectName,p.parent_id AS parentId,v.name AS versionName
      FROM catalog_environments e JOIN catalog_projects p ON p.id=e.project_id LEFT JOIN catalog_versions v ON v.id=e.version_id
      WHERE e.id=? AND e.archived=0`).bind(environmentId).first<{id:string;projectId:string;versionId:string|null;parentId:string|null}>();
    if (!environment) return Response.json({ error:'环境不存在。' },{ status:404 });
    const parentId=environment.parentId||environment.projectId;
    const [coverage,missingRows,historyRows]=await Promise.all([
      db.prepare(`WITH expected AS (
          SELECT fs.field_id,fs.version_id,max(fr.revision) AS expected_revision
          FROM field_scopes fs JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
          JOIN catalog_field_revisions fr ON fr.id=csr.revision_id JOIN catalog_fields ef ON ef.id=fs.field_id JOIN catalog_tables et ON et.id=ef.table_id
          WHERE (fs.project_id=? OR fs.project_id=?) AND fs.version_id=?
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=et.id AND l.project_id=? LIMIT 1),et.lifecycle_status,'active')='active'
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=ef.id AND l.project_id=? LIMIT 1),ef.lifecycle_status,'active')='active'
          GROUP BY fs.field_id,fs.version_id
        ), actual AS (
          SELECT fs.field_id,fs.version_id,max(fr.revision) AS actual_revision
          FROM field_scopes fs LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
          LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id
          WHERE fs.environment_id=? GROUP BY fs.field_id,fs.version_id
        ) SELECT (SELECT count(*) FROM expected) AS expectedCount,
          (SELECT count(*) FROM expected ex JOIN actual ac ON ac.field_id=ex.field_id AND ac.version_id=ex.version_id WHERE ac.actual_revision=ex.expected_revision) AS presentCount,
          (SELECT count(DISTINCT s.table_id) FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id WHERE (s.project_id=? OR s.project_id=?) AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active') AS expectedTableCount,
          (SELECT count(DISTINCT s.table_id) FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id WHERE s.environment_id=? AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active') AS presentTableCount`).bind(environment.projectId,parentId,environment.versionId??'',environment.projectId,environment.projectId,environment.id,environment.projectId,parentId,environment.projectId,environment.id,environment.projectId).first(),
      db.prepare(`WITH expected AS (
          SELECT fs.field_id,fs.version_id,max(fr.revision) AS expected_revision
          FROM field_scopes fs JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
          JOIN catalog_field_revisions fr ON fr.id=csr.revision_id JOIN catalog_fields ef ON ef.id=fs.field_id JOIN catalog_tables et ON et.id=ef.table_id
          WHERE (fs.project_id=? OR fs.project_id=?) AND fs.version_id=?
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=et.id AND l.project_id=? LIMIT 1),et.lifecycle_status,'active')='active'
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=ef.id AND l.project_id=? LIMIT 1),ef.lifecycle_status,'active')='active'
          GROUP BY fs.field_id,fs.version_id
        )
        SELECT f.id,f.code,f.name,f.data_type AS dataType,f.comment,t.name AS tableName
        FROM expected ex JOIN catalog_fields f ON f.id=ex.field_id JOIN catalog_tables t ON t.id=f.table_id
        LEFT JOIN field_scopes fs ON fs.field_id=ex.field_id AND fs.version_id=ex.version_id AND fs.environment_id=?
        LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
        LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id
        WHERE fs.field_id IS NULL OR coalesce(fr.revision,0)<>ex.expected_revision ORDER BY t.name,f.ordinal,f.name LIMIT 80`).bind(environment.projectId,parentId,environment.versionId??'',environment.projectId,environment.projectId,environment.id).all(),
      db.prepare(`SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.source_path AS sourcePath,b.git_commit AS gitCommit,
        b.status,b.added_count AS addedCount,b.duplicate_count AS duplicateCount,b.modified_count AS modifiedCount,b.removed_count AS removedCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,
        b.project_id AS projectId,b.version_id AS versionId,b.module_id AS moduleId,p.name AS projectName,v.name AS versionName,m.name AS moduleName
        FROM import_batch_environments be JOIN import_batches b ON b.id=be.batch_id JOIN catalog_projects p ON p.id=b.project_id
        JOIN catalog_versions v ON v.id=b.version_id LEFT JOIN catalog_modules m ON m.id=b.module_id
        WHERE be.environment_id=? ORDER BY b.created_at DESC LIMIT 30`).bind(environment.id).all(),
    ]);
    return Response.json({ environment,coverage,missing:missingRows.results,imports:historyRows.results });
  }

  if (mode === 'release') {
    const projectId=clean(url.searchParams.get('projectId'));
    const requestedLifecycle=clean(url.searchParams.get('lifecycleStatus'));
    // Release is about executable rollout changes, not the initial snapshot
    // used to seed an environment.  The legacy batches are recognised as
    // pure CREATE/add-only snapshots; new baseline imports already create no
    // catalog_changes at all.
    const lifecycleFilter=['active','deprecated','removed'].includes(requestedLifecycle)?requestedLifecycle:'active';
    const rows=await db.prepare(`WITH baseline_batches AS (
      SELECT b.id FROM import_batches b
      WHERE lower(coalesce(b.raw_sql,'')) LIKE '%create table%'
        AND NOT EXISTS (SELECT 1 FROM import_items bi WHERE bi.batch_id=b.id AND (lower(bi.action)<>'add' OR bi.result='conflict'))
    ), effective AS (
      SELECT c.*,
        coalesce(
          (SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=c.field_id AND l.project_id=c.project_id LIMIT 1),
          (SELECT l.status FROM catalog_object_lifecycles l JOIN catalog_tables lt ON lt.id=l.object_id WHERE l.entity='table' AND lower(lt.name)=lower(c.table_name) AND l.project_id=c.project_id LIMIT 1),
          f.lifecycle_status,t.lifecycle_status,'active'
        ) AS lifecycleStatus
      FROM catalog_changes c
      LEFT JOIN catalog_fields f ON f.id=c.field_id
      LEFT JOIN catalog_tables t ON lower(t.name)=lower(c.table_name)
      WHERE c.import_batch_id IS NULL OR c.import_batch_id NOT IN (SELECT id FROM baseline_batches)
    ), scoped AS (
      SELECT cs.change_id,cs.environment_id,
        CASE WHEN cs.status='pending' AND c.field_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM field_scopes fs WHERE fs.field_id=c.field_id AND fs.project_id=c.project_id AND fs.version_id=c.version_id AND fs.environment_id=cs.environment_id AND fs.state='present'
        ) THEN 'verified' ELSE cs.status END AS status
      FROM catalog_change_scopes cs JOIN effective c ON c.id=cs.change_id
    ) SELECT c.id,c.code,c.name,c.action,c.table_name AS tableName,c.field_name AS fieldName,c.field_id AS fieldId,
      c.project_id AS projectId,c.version_id AS versionId,c.source_kind AS sourceKind,c.source_path AS sourcePath,c.git_commit AS gitCommit,
      c.sql_text AS sqlText,c.status,c.lifecycleStatus,c.created_at AS createdAt,p.name AS projectName,v.name AS versionName,
      count(cs.environment_id) AS environmentCount,
      sum(CASE WHEN cs.status='pending' THEN 1 ELSE 0 END) AS pendingCount,
      sum(CASE WHEN cs.status='executed' THEN 1 ELSE 0 END) AS executedCount,
      sum(CASE WHEN cs.status='verified' THEN 1 ELSE 0 END) AS verifiedCount,
      sum(CASE WHEN cs.status='failed' THEN 1 ELSE 0 END) AS failedCount,
      group_concat(CASE WHEN cs.status='pending' THEN e.name END,'|||') AS pendingEnvironments,
      group_concat(e.name,'|||') AS environmentNames,group_concat(e.id,'|||') AS environmentIds,group_concat(cs.status,'|||') AS environmentStatuses
      FROM effective c JOIN catalog_projects p ON p.id=c.project_id JOIN catalog_versions v ON v.id=c.version_id
      LEFT JOIN scoped cs ON cs.change_id=c.id LEFT JOIN catalog_environments e ON e.id=cs.environment_id
      WHERE (?='' OR c.project_id=?) AND (?='' OR c.lifecycleStatus=?) GROUP BY c.id ORDER BY CASE WHEN sum(CASE WHEN cs.status='pending' THEN 1 ELSE 0 END)>0 THEN 0 ELSE 1 END,c.created_at DESC LIMIT 200`).bind(projectId,projectId,lifecycleFilter,lifecycleFilter).all();
    const summary=await db.prepare(`WITH baseline_batches AS (
      SELECT b.id FROM import_batches b
      WHERE lower(coalesce(b.raw_sql,'')) LIKE '%create table%'
        AND NOT EXISTS (SELECT 1 FROM import_items bi WHERE bi.batch_id=b.id AND (lower(bi.action)<>'add' OR bi.result='conflict'))
    ), effective AS (
      SELECT c.*,coalesce(
        (SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=c.field_id AND l.project_id=c.project_id LIMIT 1),
        (SELECT l.status FROM catalog_object_lifecycles l JOIN catalog_tables lt ON lt.id=l.object_id WHERE l.entity='table' AND lower(lt.name)=lower(c.table_name) AND l.project_id=c.project_id LIMIT 1),
        f.lifecycle_status,t.lifecycle_status,'active') AS lifecycleStatus
      FROM catalog_changes c LEFT JOIN catalog_fields f ON f.id=c.field_id LEFT JOIN catalog_tables t ON lower(t.name)=lower(c.table_name)
      WHERE c.import_batch_id IS NULL OR c.import_batch_id NOT IN (SELECT id FROM baseline_batches)
    ), scoped AS (
      SELECT cs.change_id,cs.environment_id,
        CASE WHEN cs.status='pending' AND c.field_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM field_scopes fs WHERE fs.field_id=c.field_id AND fs.project_id=c.project_id AND fs.version_id=c.version_id AND fs.environment_id=cs.environment_id AND fs.state='present'
        ) THEN 'verified' ELSE cs.status END AS status
      FROM catalog_change_scopes cs JOIN effective c ON c.id=cs.change_id
    ) SELECT count(DISTINCT c.id) AS changes,
      sum(CASE WHEN cs.status='pending' THEN 1 ELSE 0 END) AS pending,
      sum(CASE WHEN cs.status='executed' THEN 1 ELSE 0 END) AS executed,
      sum(CASE WHEN cs.status='verified' THEN 1 ELSE 0 END) AS verified,
      sum(CASE WHEN cs.status='failed' THEN 1 ELSE 0 END) AS failed
      FROM effective c LEFT JOIN scoped cs ON cs.change_id=c.id WHERE (?='' OR c.project_id=?) AND (?='' OR c.lifecycleStatus=?)`).bind(projectId,projectId,lifecycleFilter,lifecycleFilter).first();
    return Response.json({changes:rows.results,summary});
  }

  if (mode === 'project') {
    const projectId=clean(url.searchParams.get('projectId'));
    const project=await db.prepare(`SELECT id,parent_id AS parentId FROM catalog_projects WHERE id=? AND archived=0`).bind(projectId).first<{id:string;parentId:string|null}>();
    if (!project) return Response.json({ error:'项目不存在。' },{ status:404 });
    const parentId=project.parentId||project.id;
    const [differenceRows,historyRows,coverageRows]=await Promise.all([
      db.prepare(`WITH expected AS (
          SELECT fs.field_id,fs.version_id,max(fr.revision) AS expected_revision
          FROM field_scopes fs JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
          JOIN catalog_field_revisions fr ON fr.id=csr.revision_id JOIN catalog_fields ef ON ef.id=fs.field_id JOIN catalog_tables et ON et.id=ef.table_id
          WHERE (fs.project_id=? OR fs.project_id=?)
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=et.id AND l.project_id=? LIMIT 1),et.lifecycle_status,'active')='active'
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=ef.id AND l.project_id=? LIMIT 1),ef.lifecycle_status,'active')='active'
          GROUP BY fs.field_id,fs.version_id
        ), version_envs AS (
          SELECT v.id AS version_id,v.name AS version_name,e.id AS environment_id,e.name AS environment_name
          FROM catalog_versions v JOIN catalog_environments e ON e.project_id=v.project_id AND (e.version_id=v.id OR e.version_id IS NULL)
          WHERE v.project_id=? AND e.archived=0
        ), matrix AS (
          SELECT ex.field_id,ex.expected_revision,ve.version_id,ve.version_name,ve.environment_id,ve.environment_name,fr.revision AS actual_revision
          FROM expected ex JOIN version_envs ve ON ve.version_id=ex.version_id
          LEFT JOIN field_scopes fs ON fs.field_id=ex.field_id AND fs.project_id=? AND fs.version_id=ve.version_id AND fs.environment_id=ve.environment_id
          LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
          LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id
        )
        SELECT f.id,f.code,f.name,f.data_type AS dataType,f.comment,t.name AS tableName,m.version_id AS versionId,m.version_name AS versionName,
          count(*) AS totalCount,sum(CASE WHEN m.actual_revision=m.expected_revision THEN 1 ELSE 0 END) AS presentCount,
          group_concat(CASE WHEN m.actual_revision IS NULL OR m.actual_revision<>m.expected_revision THEN m.environment_name END,'|||') AS missingEnvironments
        FROM matrix m JOIN catalog_fields f ON f.id=m.field_id JOIN catalog_tables t ON t.id=f.table_id
        GROUP BY f.id,m.version_id HAVING sum(CASE WHEN m.actual_revision=m.expected_revision THEN 1 ELSE 0 END)<count(*)
        ORDER BY (count(*)-sum(CASE WHEN m.actual_revision=m.expected_revision THEN 1 ELSE 0 END)) DESC,t.name,f.ordinal LIMIT 100`).bind(project.id,parentId,project.id,project.id,project.id,project.id).all(),
      db.prepare(`SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.source_path AS sourcePath,b.git_commit AS gitCommit,b.status,b.added_count AS addedCount,
        b.duplicate_count AS duplicateCount,b.modified_count AS modifiedCount,b.removed_count AS removedCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,
        b.project_id AS projectId,b.version_id AS versionId,b.module_id AS moduleId,v.name AS versionName,m.name AS moduleName,
        group_concat(e.name,' · ') AS environmentNames
        FROM import_batches b JOIN catalog_versions v ON v.id=b.version_id
        LEFT JOIN catalog_modules m ON m.id=b.module_id LEFT JOIN import_batch_environments be ON be.batch_id=b.id LEFT JOIN catalog_environments e ON e.id=be.environment_id
        WHERE b.project_id=? GROUP BY b.id ORDER BY b.created_at DESC LIMIT 50`).bind(project.id).all(),
      db.prepare(`WITH expected AS (
          SELECT fs.field_id,fs.version_id,max(fr.revision) AS expected_revision
          FROM field_scopes fs
          JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
          JOIN catalog_field_revisions fr ON fr.id=csr.revision_id
          JOIN catalog_fields ef ON ef.id=fs.field_id JOIN catalog_tables et ON et.id=ef.table_id
          WHERE (fs.project_id=? OR fs.project_id=?)
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=et.id AND l.project_id=? LIMIT 1),et.lifecycle_status,'active')='active'
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=ef.id AND l.project_id=? LIMIT 1),ef.lifecycle_status,'active')='active'
          GROUP BY fs.field_id,fs.version_id
        ), version_envs AS (
          SELECT v.id AS version_id,e.id AS environment_id,e.name AS environment_name
          FROM catalog_versions v JOIN catalog_environments e ON e.project_id=v.project_id AND (e.version_id=v.id OR e.version_id IS NULL)
          WHERE v.project_id=? AND e.archived=0
        ), matrix AS (
          SELECT ve.environment_id,ve.environment_name,ex.field_id,ex.expected_revision,fr.revision AS actual_revision
          FROM expected ex JOIN version_envs ve ON ve.version_id=ex.version_id
          LEFT JOIN field_scopes fs ON fs.field_id=ex.field_id AND fs.project_id=? AND fs.version_id=ve.version_id AND fs.environment_id=ve.environment_id AND fs.state='present'
          LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
          LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id
        )
        SELECT environment_id AS environmentId,environment_name AS environmentName,count(*) AS expectedCount,
          sum(CASE WHEN actual_revision=expected_revision THEN 1 ELSE 0 END) AS presentCount
        FROM matrix GROUP BY environment_id,environment_name ORDER BY environment_name`).bind(project.id,parentId,project.id,project.id,project.id,project.id).all(),
    ]);
    return Response.json({ differences:differenceRows.results,imports:historyRows.results,coverage:coverageRows.results });
  }

  const [projects,environments,versions,modules,tables,tableSummary,fieldSummary,imports,repositories] = await db.batch([
    db.prepare(`SELECT p.id,p.code,p.name,p.kind,p.parent_id AS parentId,p.icon,p.description,p.anchor_version_id AS anchorVersionId,p.anchor_environment_id AS anchorEnvironmentId,
      count(DISTINCT e.id) AS environmentCount,count(DISTINCT v.id) AS versionCount,count(DISTINCT ats.table_id) AS tableCount,count(DISTINCT afs.field_id) AS fieldCount
      FROM catalog_projects p LEFT JOIN catalog_environments e ON e.project_id=p.id AND e.archived=0
      LEFT JOIN catalog_versions v ON v.project_id=p.id
      LEFT JOIN (SELECT s.project_id,s.table_id FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id WHERE coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=s.project_id LIMIT 1),t.lifecycle_status,'active')='active') ats ON ats.project_id=p.id
      LEFT JOIN (SELECT s.project_id,s.field_id FROM field_scopes s JOIN catalog_fields f ON f.id=s.field_id JOIN catalog_tables t ON t.id=f.table_id WHERE coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=s.project_id LIMIT 1),t.lifecycle_status,'active')='active' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=f.id AND l.project_id=s.project_id LIMIT 1),f.lifecycle_status,'active')='active') afs ON afs.project_id=p.id
      WHERE p.archived=0 GROUP BY p.id ORDER BY CASE p.kind WHEN 'platform' THEN 0 ELSE 1 END,p.name`),
    db.prepare(`SELECT e.id,e.project_id AS projectId,e.version_id AS versionId,e.code,e.name,e.stage,e.sort_order AS sortOrder,
      p.name AS projectName,v.name AS versionName,count(DISTINCT ats.table_id) AS tableCount,count(DISTINCT afs.field_id) AS fieldCount
      FROM catalog_environments e JOIN catalog_projects p ON p.id=e.project_id LEFT JOIN catalog_versions v ON v.id=e.version_id
      LEFT JOIN (SELECT s.environment_id,s.version_id,s.table_id FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id WHERE coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=s.project_id LIMIT 1),t.lifecycle_status,'active')='active') ats ON ats.environment_id=e.id AND ats.version_id=e.version_id
      LEFT JOIN (SELECT s.environment_id,s.version_id,s.field_id FROM field_scopes s JOIN catalog_fields f ON f.id=s.field_id JOIN catalog_tables t ON t.id=f.table_id WHERE coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=s.project_id LIMIT 1),t.lifecycle_status,'active')='active' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=f.id AND l.project_id=s.project_id LIMIT 1),f.lifecycle_status,'active')='active') afs ON afs.environment_id=e.id AND afs.version_id=e.version_id
      WHERE e.archived=0 GROUP BY e.id ORDER BY p.kind DESC,p.name,e.sort_order,e.name`),
    db.prepare(`SELECT v.id,v.project_id AS projectId,v.name,v.source_version AS sourceVersion,v.repository_id AS repositoryId,
      v.git_ref AS gitRef,v.git_commit AS gitCommit,v.status,p.name AS projectName,r.name AS repositoryName,r.repository
      FROM catalog_versions v JOIN catalog_projects p ON p.id=v.project_id LEFT JOIN repository_sources r ON r.id=v.repository_id
      ORDER BY p.kind DESC,p.name,v.created_at DESC`),
    db.prepare(`SELECT m.id,m.code,m.name,m.description,count(DISTINCT t.id) AS tableCount,count(DISTINCT pm.project_id) AS projectCount
      FROM catalog_modules m LEFT JOIN catalog_tables t ON t.module_id=m.id LEFT JOIN catalog_project_modules pm ON pm.module_id=m.id
      GROUP BY m.id ORDER BY m.name`),
    db.prepare(`SELECT t.id,t.code,t.name,t.comment,coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id ORDER BY CASE l.status WHEN 'removed' THEN 3 WHEN 'deprecated' THEN 2 ELSE 1 END DESC LIMIT 1),t.lifecycle_status,'active') AS lifecycleStatus,t.lifecycle_note AS lifecycleNote,t.module_id AS moduleId,m.name AS moduleName,count(DISTINCT f.id) AS fieldCount,count(DISTINCT ts.environment_id) AS scopeCount
      FROM catalog_tables t LEFT JOIN catalog_modules m ON m.id=t.module_id LEFT JOIN catalog_fields f ON f.table_id=t.id LEFT JOIN table_scopes ts ON ts.table_id=t.id
      GROUP BY t.id ORDER BY t.name`),
    db.prepare(`SELECT count(*) AS count FROM catalog_tables`),
    db.prepare(`SELECT count(*) AS count FROM catalog_fields`),
    db.prepare(`SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.source_path AS sourcePath,b.git_commit AS gitCommit,
      b.status,b.added_count AS addedCount,b.duplicate_count AS duplicateCount,b.modified_count AS modifiedCount,b.removed_count AS removedCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,
      b.project_id AS projectId,b.version_id AS versionId,b.module_id AS moduleId,p.name AS projectName,v.name AS versionName,m.name AS moduleName,
      group_concat(e.name,' · ') AS environmentNames
      FROM import_batches b JOIN catalog_projects p ON p.id=b.project_id JOIN catalog_versions v ON v.id=b.version_id
      LEFT JOIN catalog_modules m ON m.id=b.module_id LEFT JOIN import_batch_environments be ON be.batch_id=b.id LEFT JOIN catalog_environments e ON e.id=be.environment_id
      GROUP BY b.id ORDER BY b.created_at DESC LIMIT 30`),
    db.prepare(`SELECT r.id,r.name,r.repository,r.branch,r.path_pattern AS pathPattern,r.project_id AS projectId,r.last_commit AS lastCommit,r.enabled
      FROM repository_sources r ORDER BY r.created_at DESC`),
  ]);
  return Response.json({ projects:projects.results,environments:environments.results,versions:versions.results,modules:modules.results,
    tables:tables.results,fields:[],scopes:[],tableTotal:Number((tableSummary.results[0] as {count?:number}|undefined)?.count??0),fieldTotal:Number((fieldSummary.results[0] as {count?:number}|undefined)?.count??0),imports:imports.results,repositories:repositories.results });
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
    const icon = clean(payload.icon) || (kind==='platform'?'server':'package');
    const code = (clean(payload.code) || projectCode(name)).toUpperCase();
    const anchorVersionId=clean(payload.anchorVersionId)||null;
    const anchorEnvironmentId=clean(payload.anchorEnvironmentId)||null;
    if (!name) return Response.json({ error:'请填写项目名称。' },{ status:400 });
    try {
      if (anchorVersionId) {
        const version=await db.prepare(`SELECT id FROM catalog_versions WHERE id=? AND project_id=?`).bind(anchorVersionId,recordId||clean(payload.id)||'').first();
        if (!version && recordId) return Response.json({ error:'锚定版本必须属于当前项目。' },{ status:400 });
      }
      if (anchorEnvironmentId) {
        const environment=await db.prepare(`SELECT id,version_id AS versionId FROM catalog_environments WHERE id=? AND project_id=?`).bind(anchorEnvironmentId,recordId||clean(payload.id)||'').first<{id:string;versionId:string|null}>();
        if (!environment && recordId) return Response.json({ error:'锚定环境必须属于当前项目。' },{ status:400 });
        if (environment && anchorVersionId && environment.versionId && environment.versionId!==anchorVersionId) return Response.json({ error:'锚定环境必须属于所选锚定版本。' },{ status:400 });
      }
      if (recordId) await db.prepare(`UPDATE catalog_projects SET code=?,name=?,kind=?,parent_id=?,icon=?,description=?,anchor_version_id=?,anchor_environment_id=? WHERE id=?`).bind(code,name,kind,clean(payload.parentId)||null,icon,clean(payload.description),anchorVersionId,anchorEnvironmentId,recordId).run();
      else await db.prepare(`INSERT INTO catalog_projects (id,code,name,kind,parent_id,icon,description,anchor_version_id,anchor_environment_id,archived,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)`).bind(id(),code,name,kind,clean(payload.parentId)||null,icon,clean(payload.description),anchorVersionId,anchorEnvironmentId,now()).run();
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
      if (recordId) {
        const existing=await db.prepare(`SELECT project_id AS projectId FROM catalog_versions WHERE id=?`).bind(recordId).first<{projectId:string}>();
        if (!existing) return Response.json({ error:'版本不存在。' },{ status:404 });
        if (existing.projectId!==projectId) return Response.json({ error:'已有版本不能移动到其他项目。' },{ status:400 });
      }
      if (recordId) await db.prepare(`UPDATE catalog_versions SET project_id=?,name=?,source_version=?,repository_id=?,git_ref=?,git_commit=?,status=? WHERE id=?`).bind(projectId,name,clean(payload.sourceVersion)||null,clean(payload.repositoryId)||null,clean(payload.gitRef)||null,clean(payload.gitCommit)||null,clean(payload.status)||'active',recordId).run();
      else await db.prepare(`INSERT INTO catalog_versions (id,project_id,name,source_version,repository_id,git_ref,git_commit,status,created_at) VALUES (?,?,?,?,?,?,?,'active',?)`).bind(id(),projectId,name,clean(payload.sourceVersion)||null,clean(payload.repositoryId)||null,clean(payload.gitRef)||null,clean(payload.gitCommit)||null,now()).run();
      return Response.json({ ok:true });
    } catch { return Response.json({ error:'这个项目已经存在同名版本。' },{ status:409 }); }
  }

  if (action === 'environment.save') {
    const recordId=clean(payload.id),projectId=clean(payload.projectId),versionId=clean(payload.versionId),name=clean(payload.name),code=(clean(payload.code)||projectCode(name)).toLowerCase();
    if (!projectId||!name) return Response.json({ error:'请选择项目并填写环境名称。' },{ status:400 });
    try {
      if (versionId) {
        const version=await db.prepare(`SELECT id FROM catalog_versions WHERE id=? AND project_id=?`).bind(versionId,projectId).first();
        if (!version) return Response.json({ error:'所选版本不属于当前项目。' },{ status:400 });
      }
      if (recordId) {
        const existing=await db.prepare(`SELECT project_id AS projectId,version_id AS versionId FROM catalog_environments WHERE id=?`).bind(recordId).first<{projectId:string;versionId:string|null}>();
        if (!existing) return Response.json({ error:'环境不存在。' },{ status:404 });
        if (existing.projectId!==projectId) return Response.json({ error:'已有环境不能移动到其他项目。' },{ status:400 });
        if ((existing.versionId??'')!==versionId) {
          const used=await db.prepare(`SELECT 1 AS found FROM table_scopes WHERE environment_id=? UNION ALL SELECT 1 FROM field_scopes WHERE environment_id=? UNION ALL SELECT 1 FROM import_batch_environments WHERE environment_id=? LIMIT 1`).bind(recordId,recordId,recordId).first();
          if (used) return Response.json({ error:'已有结构或导入记录的环境不能直接更换版本。' },{ status:400 });
        }
        await db.prepare(`UPDATE catalog_environments SET project_id=?,version_id=?,code=?,name=?,stage=?,sort_order=? WHERE id=?`).bind(projectId,versionId||null,code,name,clean(payload.stage)||'custom',Number(payload.sortOrder)||0,recordId).run();
      }
      else await db.prepare(`INSERT INTO catalog_environments VALUES (?,?,?,?,?,?,?,?,?)`).bind(id(),projectId,versionId||null,code,name,clean(payload.stage)||'custom',Number(payload.sortOrder)||0,0,now()).run();
      return Response.json({ ok:true });
    } catch { return Response.json({ error:'这个项目已经存在同名环境编码。' },{ status:409 }); }
  }

  if (action === 'table.mapping.save') {
    const recordId=clean(payload.id),projectId=clean(payload.projectId),physicalName=clean(payload.physicalName).toLowerCase(),logicalName=clean(payload.logicalName).toLowerCase();
    if (!projectId||!physicalName||!logicalName) return Response.json({ error:'请填写项目、物理表名和逻辑表名。' },{ status:400 });
    const project=await db.prepare(`SELECT id FROM catalog_projects WHERE id=? AND archived=0`).bind(projectId).first();
    if (!project) return Response.json({ error:'项目不存在。' },{ status:404 });
    try {
      if (recordId) await db.prepare(`UPDATE catalog_table_mappings SET project_id=?,logical_name=?,physical_name=?,note=? WHERE id=?`).bind(projectId,logicalName,physicalName,clean(payload.note),recordId).run();
      else await db.prepare(`INSERT INTO catalog_table_mappings (id,project_id,logical_name,physical_name,note,created_at) VALUES (?,?,?,?,?,?)`).bind(id(),projectId,logicalName,physicalName,clean(payload.note),now()).run();
      return Response.json({ ok:true });
    } catch { return Response.json({ error:'该项目下的物理表名已经存在映射。' },{ status:409 }); }
  }

  if (action === 'table.mapping.delete') {
    const recordId=clean(payload.id); if (!recordId) return Response.json({ error:'映射无效。' },{ status:400 });
    await db.prepare(`DELETE FROM catalog_table_mappings WHERE id=?`).bind(recordId).run();
    return Response.json({ ok:true });
  }

  if (action === 'table.mapping.list') {
    const projectId=clean(payload.projectId);
    const rows=await db.prepare(`SELECT id,project_id AS projectId,logical_name AS logicalName,physical_name AS physicalName,note,created_at AS createdAt FROM catalog_table_mappings WHERE (?='' OR project_id=?) ORDER BY physical_name`).bind(projectId,projectId).all();
    return Response.json({ ok:true,mappings:rows.results });
  }

  if (action === 'table.save') {
    const recordId=clean(payload.id),name=clean(payload.name).toLowerCase();
    const projectId=clean(payload.projectId),versionId=clean(payload.versionId);
    const environmentIds=[...new Set(Array.isArray(payload.environmentIds)?payload.environmentIds.map(clean).filter(Boolean):[])];
    if (!name) return Response.json({ error:'请填写表名。' },{ status:400 });
    if (projectId||versionId||environmentIds.length) {
      if (!projectId||!versionId||!environmentIds.length) return Response.json({ error:'请完整选择项目、版本和环境。' },{ status:400 });
      const scopeError=await validateScopeSelection(db,projectId,versionId,environmentIds);
      if (scopeError) return Response.json({ error:scopeError },{ status:400 });
    }
    const codes = new Set((await db.prepare(`SELECT code FROM catalog_tables`).all<{code:string}>()).results.map((item)=>item.code));
    const code=(clean(payload.code)||tableCode(name,codes)).toUpperCase();
    try {
      const tableId=recordId||id();
      const lifecycleInput=clean(payload.lifecycleStatus);
      const lifecycleStatus=['active','deprecated','removed'].includes(lifecycleInput)?lifecycleInput:null;
      const lifecycleNote=payload.lifecycleNote===undefined?null:clean(payload.lifecycleNote);
      if (recordId) await db.prepare(`UPDATE catalog_tables SET code=?,name=?,comment=?,module_id=?,lifecycle_status=coalesce(?,lifecycle_status),lifecycle_note=coalesce(?,lifecycle_note) WHERE id=?`).bind(code,name,clean(payload.comment),clean(payload.moduleId)||null,lifecycleStatus,lifecycleNote,recordId).run();
      else await db.prepare(`INSERT INTO catalog_tables (id,code,name,comment,module_id,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,NULL,?,'active','')`).bind(tableId,code,name,clean(payload.comment),clean(payload.moduleId)||null,now()).run();
      if (projectId&&versionId&&environmentIds.length) {
        if (recordId) await db.prepare(`DELETE FROM table_scopes WHERE table_id=? AND project_id=? AND version_id=?`).bind(tableId,projectId,versionId).run();
        await runChunked(db,environmentIds.map((environmentId)=>db.prepare(`INSERT OR IGNORE INTO table_scopes VALUES (?,?,?,?, 'present','manual',NULL,?)`).bind(tableId,projectId,versionId,environmentId,now())));
      }
      return Response.json({ ok:true,code });
    } catch { return Response.json({ error:'表名或表编码已经存在。' },{ status:409 }); }
  }

  if (action === 'field.save') {
    const recordId=clean(payload.id),tableId=clean(payload.tableId),name=clean(payload.name).toLowerCase(),dataType=clean(payload.dataType).toLowerCase();
    const projectId=clean(payload.projectId),versionId=clean(payload.versionId);
    const environmentIds=[...new Set(Array.isArray(payload.environmentIds)?payload.environmentIds.map(clean).filter(Boolean):[])];
    if (!tableId||!name||!dataType) return Response.json({ error:'请选择表，并填写字段名和类型。' },{ status:400 });
    if (projectId||versionId||environmentIds.length) {
      if (!projectId||!versionId||!environmentIds.length) return Response.json({ error:'请完整选择项目、版本和环境。' },{ status:400 });
      const scopeError=await validateScopeSelection(db,projectId,versionId,environmentIds);
      if (scopeError) return Response.json({ error:scopeError },{ status:400 });
    }
    const table=await db.prepare(`SELECT code FROM catalog_tables WHERE id=?`).bind(tableId).first<{code:string}>();
    if (!table) return Response.json({ error:'所选数据表不存在。' },{ status:400 });
    const codes=new Set((await db.prepare(`SELECT code FROM catalog_fields`).all<{code:string}>()).results.map((item)=>item.code));
    const code=recordId?clean(payload.code):fieldCode(table.code,codes);
    try {
      const fieldId=recordId||id();
      const nextRevision=recordId?Number((await db.prepare(`SELECT coalesce(max(revision),0)+1 AS next FROM catalog_field_revisions WHERE field_id=?`).bind(fieldId).first<{next:number}>())?.next??1):1;
      const revisionId=`${fieldId}:r${nextRevision}`;
      const fingerprint=fieldFingerprint({tableName:clean(table.code),columnName:name,dataType,nullable:payload.nullable!==false,defaultValue:clean(payload.defaultValue)||null,comment:clean(payload.comment),extra:clean(payload.extra)});
      const lifecycleInput=clean(payload.lifecycleStatus);
      const lifecycleStatus=['active','deprecated','removed'].includes(lifecycleInput)?lifecycleInput:null;
      const lifecycleNote=payload.lifecycleNote===undefined?null:clean(payload.lifecycleNote);
      if (recordId) await db.prepare(`UPDATE catalog_fields SET table_id=?,name=?,data_type=?,nullable=?,default_value=?,comment=?,extra=?,lifecycle_status=coalesce(?,lifecycle_status),lifecycle_note=coalesce(?,lifecycle_note) WHERE id=?`).bind(tableId,name,dataType,payload.nullable===false?0:1,clean(payload.defaultValue)||null,clean(payload.comment),clean(payload.extra),lifecycleStatus,lifecycleNote,recordId).run();
      else await db.prepare(`INSERT INTO catalog_fields (id,table_id,code,name,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?,0,'manual',NULL,?,'active','')`).bind(fieldId,tableId,code,name,dataType,payload.nullable===false?0:1,clean(payload.defaultValue)||null,clean(payload.comment),clean(payload.extra),now()).run();
      await db.prepare(`INSERT OR IGNORE INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,'manual',NULL,?,?)`).bind(revisionId,fieldId,nextRevision,dataType,payload.nullable===false?0:1,clean(payload.defaultValue)||null,clean(payload.comment),clean(payload.extra),0,fingerprint,now()).run();
      if (projectId&&versionId&&environmentIds.length) {
        if (recordId) await db.batch([
          db.prepare(`DELETE FROM catalog_field_scope_revisions WHERE field_id=? AND version_id=? AND environment_id IN (SELECT id FROM catalog_environments WHERE project_id=?)`).bind(fieldId,versionId,projectId),
          db.prepare(`DELETE FROM field_scopes WHERE field_id=? AND project_id=? AND version_id=?`).bind(fieldId,projectId,versionId),
        ]);
        await runChunked(db,environmentIds.flatMap((environmentId)=>[
          db.prepare(`INSERT OR IGNORE INTO table_scopes VALUES (?,?,?,?, 'present','manual',NULL,?)`).bind(tableId,projectId,versionId,environmentId,now()),
          db.prepare(`INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present','manual',NULL,?)`).bind(fieldId,projectId,versionId,environmentId,now()),
          db.prepare(`INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) VALUES (?,?,?,?,?)`).bind(fieldId,versionId,environmentId,revisionId,now()),
        ]));
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
          db.prepare(`UPDATE catalog_projects SET anchor_version_id=NULL,anchor_environment_id=CASE WHEN anchor_environment_id IN (SELECT id FROM catalog_environments WHERE version_id=?) THEN NULL ELSE anchor_environment_id END WHERE anchor_version_id=? OR anchor_environment_id IN (SELECT id FROM catalog_environments WHERE version_id=?)`).bind(recordId,recordId,recordId),
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
          db.prepare(`DELETE FROM catalog_object_lifecycles WHERE (entity='table' AND object_id=?) OR (entity='field' AND object_id IN (SELECT id FROM catalog_fields WHERE table_id=?)) OR (entity='index' AND object_id IN (SELECT id FROM catalog_indexes WHERE table_id=?)) OR (entity='constraint' AND object_id IN (SELECT id FROM catalog_constraints WHERE table_id=?))`).bind(recordId,recordId,recordId,recordId),
          db.prepare(`DELETE FROM catalog_tables WHERE id=?`).bind(recordId),
        ]);
      } else if (entity==='field') {
        await db.batch([
          db.prepare(`UPDATE import_items SET field_id=NULL WHERE field_id=?`).bind(recordId),
          db.prepare(`DELETE FROM catalog_object_lifecycles WHERE entity='field' AND object_id=?`).bind(recordId),
          db.prepare(`DELETE FROM catalog_fields WHERE id=?`).bind(recordId),
        ]);
      } else if (entity==='repository') {
        await db.batch([
          db.prepare(`UPDATE catalog_versions SET repository_id=NULL WHERE repository_id=?`).bind(recordId),
          db.prepare(`DELETE FROM repository_sources WHERE id=?`).bind(recordId),
        ]);
      } else if (entity==='environment') {
        await db.batch([
          db.prepare(`UPDATE catalog_projects SET anchor_environment_id=NULL WHERE anchor_environment_id=?`).bind(recordId),
          db.prepare(`DELETE FROM catalog_environments WHERE id=?`).bind(recordId),
        ]);
      } else await db.prepare(`DELETE FROM ${allowed[entity]} WHERE id=?`).bind(recordId).run();
      const remaining = await db.prepare(`SELECT id FROM ${allowed[entity]} WHERE id=?`).bind(recordId).first();
      if (remaining) return Response.json({ error:'删除没有生效，请重试。' },{ status:409 });
      return Response.json({ ok:true });
    }
    catch { return Response.json({ error:'该对象仍被其他数据引用，暂时不能删除。' },{ status:409 }); }
  }

  if (action === 'lifecycle.set') {
    const entity=clean(payload.entity),recordId=clean(payload.id),projectId=clean(payload.projectId),status=clean(payload.status),note=clean(payload.note);
    const scopes:Record<string,{table:string;key:string}>={table:{table:'table_scopes',key:'table_id'},field:{table:'field_scopes',key:'field_id'},index:{table:'catalog_index_scopes',key:'index_id'},constraint:{table:'catalog_constraint_scopes',key:'constraint_id'}};
    if (!scopes[entity]||!recordId||!projectId||!['active','deprecated','removed'].includes(status)) return Response.json({ error:'请选择一个项目后再更新生命周期状态。' },{ status:400 });
    const scope=scopes[entity];
    const target=await db.prepare(`SELECT 1 AS found FROM ${scope.table} WHERE ${scope.key}=? AND project_id=? LIMIT 1`).bind(recordId,projectId).first();
    if (!target) return Response.json({ error:'该对象不属于所选项目。' },{ status:404 });
    const upsert=(targetEntity:string,objectId:string)=>db.prepare(`INSERT INTO catalog_object_lifecycles (entity,object_id,project_id,status,note,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(entity,object_id,project_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at`).bind(targetEntity,objectId,projectId,status,note,now());
    if (entity==='table') {
      const [fields,indexes,constraints]=await Promise.all([
        db.prepare(`SELECT DISTINCT f.id FROM catalog_fields f JOIN field_scopes s ON s.field_id=f.id WHERE f.table_id=? AND s.project_id=?`).bind(recordId,projectId).all<{id:string}>(),
        db.prepare(`SELECT DISTINCT i.id FROM catalog_indexes i JOIN catalog_index_scopes s ON s.index_id=i.id WHERE i.table_id=? AND s.project_id=?`).bind(recordId,projectId).all<{id:string}>(),
        db.prepare(`SELECT DISTINCT c.id FROM catalog_constraints c JOIN catalog_constraint_scopes s ON s.constraint_id=c.id WHERE c.table_id=? AND s.project_id=?`).bind(recordId,projectId).all<{id:string}>(),
      ]);
      await runChunked(db,[upsert('table',recordId),...fields.results.map((item)=>upsert('field',item.id)),...indexes.results.map((item)=>upsert('index',item.id)),...constraints.results.map((item)=>upsert('constraint',item.id))]);
    } else {
      await upsert(entity,recordId).run();
    }
    return Response.json({ ok:true,status,projectId,cascaded:entity==='table' });
  }

  if (action === 'repository.save') {
    const recordId=clean(payload.id);
    const name=clean(payload.name),repository=clean(payload.repository),branch=clean(payload.branch)||'main',pathPattern=clean(payload.pathPattern)||'sql/**/*.sql';
    if (!name||!repository) return Response.json({ error:'请填写来源名称和 GitHub 仓库。' },{ status:400 });
    if (recordId) await db.prepare(`UPDATE repository_sources SET name=?,repository=?,branch=?,path_pattern=?,project_id=? WHERE id=?`).bind(name,repository,branch,pathPattern,clean(payload.projectId)||null,recordId).run();
    else await db.prepare(`INSERT INTO repository_sources VALUES (?,?,?,?,?,?,NULL,1,?)`).bind(id(),name,repository,branch,pathPattern,clean(payload.projectId)||null,now()).run();
    return Response.json({ ok:true });
  }

  if (action === 'import.rename') {
    const importId=clean(payload.id),name=clean(payload.name);
    if (!importId||!name) return Response.json({ error:'请填写 SQL 记录名称。' },{ status:400 });
    const updated=await db.prepare(`UPDATE import_batches SET name=? WHERE id=?`).bind(name,importId).run();
    if (!updated.meta.changes) return Response.json({ error:'SQL 记录不存在。' },{ status:404 });
    return Response.json({ ok:true });
  }

  if (action === 'change.scopeStatus') {
    const changeId=clean(payload.changeId),environmentId=clean(payload.environmentId),status=clean(payload.status);
    if (!changeId||!environmentId||!['pending','executed','verified','failed','waived'].includes(status)) return Response.json({ error:'变更状态无效。' },{ status:400 });
    const exists=await db.prepare(`SELECT change_id FROM catalog_change_scopes WHERE change_id=? AND environment_id=?`).bind(changeId,environmentId).first();
    if (!exists) return Response.json({ error:'这条变更没有登记到该环境。' },{ status:404 });
    const timestamp=status==='verified'?now():null;
    const executed=status==='executed'||status==='verified'?now():null;
    await db.prepare(`UPDATE catalog_change_scopes SET status=?,executed_at=coalesce(?,executed_at),verified_at=coalesce(?,verified_at),note=? WHERE change_id=? AND environment_id=?`).bind(status,executed,timestamp,clean(payload.note),changeId,environmentId).run();
    const change=await db.prepare(`SELECT import_batch_id AS importBatchId,sql_text AS sqlText,source_kind AS sourceKind,source_path AS sourcePath,git_commit AS gitCommit,project_id AS projectId,version_id AS versionId FROM catalog_changes WHERE id=?`).bind(changeId).first<{importBatchId:string|null;sqlText:string;sourceKind:string;sourcePath:string|null;gitCommit:string|null;projectId:string;versionId:string}>();
    if (change?.importBatchId) await db.prepare(`UPDATE catalog_sql_executions SET status=?,started_at=CASE WHEN ? IN ('executed','verified') THEN coalesce(started_at,?) ELSE started_at END,finished_at=CASE WHEN ? IN ('verified','failed','waived') THEN coalesce(finished_at,?) ELSE finished_at END,note=? WHERE import_batch_id=? AND environment_id=?`).bind(status,status,executed??now(),status,now(),clean(payload.note),change.importBatchId,environmentId).run();
    return Response.json({ ok:true });
  }

  if (action === 'schema.history') {
    const kind=clean(payload.kind),recordId=clean(payload.id);
    if (!['table','field'].includes(kind)||!recordId) return Response.json({ error:'请选择要查看历史的数据表或字段。' },{ status:400 });
    const focus=kind==='table'
      ?await db.prepare(`SELECT t.id,t.name AS tableName,NULL AS columnName,t.code,t.created_at AS createdAt,t.import_batch_id AS importBatchId FROM catalog_tables t WHERE t.id=?`).bind(recordId).first<{id:string;tableName:string;columnName:null;code:string;createdAt:string;importBatchId:string|null}>()
      :await db.prepare(`SELECT f.id,t.name AS tableName,f.name AS columnName,f.code,f.created_at AS createdAt,f.import_batch_id AS importBatchId FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE f.id=?`).bind(recordId).first<{id:string;tableName:string;columnName:string;code:string;createdAt:string;importBatchId:string|null}>();
    if (!focus) return Response.json({ error:'要查看的对象不存在。' },{ status:404 });
    const revisionFilter=kind==='table'?'f.table_id=?':'f.id=?';
    const revisions=(await db.prepare(`SELECT fr.id,'revision' AS kind,fr.revision,f.code,f.name AS columnName,t.name AS tableName,
      fr.data_type AS dataType,fr.nullable,fr.default_value AS defaultValue,fr.comment,fr.extra,fr.source_kind AS sourceKind,
      ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,fr.created_at AS createdAt
      FROM catalog_field_revisions fr JOIN catalog_fields f ON f.id=fr.field_id JOIN catalog_tables t ON t.id=f.table_id
      LEFT JOIN import_batches ib ON ib.id=fr.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id
      LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id
      WHERE ${revisionFilter} GROUP BY fr.id ORDER BY fr.created_at DESC,fr.revision DESC`).bind(recordId).all()).results;
    const removedFilter=kind==='table'?'ii.table_name=?':'ii.field_id=?';
    const removedValue=kind==='table'?focus.tableName:recordId;
    const removals=(await db.prepare(`SELECT ii.id,'removed' AS kind,0 AS revision,NULL AS code,ii.column_name AS columnName,ii.table_name AS tableName,
      NULL AS dataType,1 AS nullable,NULL AS defaultValue,'' AS comment,'' AS extra,ib.source_kind AS sourceKind,ii.message,
      ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,ib.created_at AS createdAt
      FROM import_items ii JOIN import_batches ib ON ib.id=ii.batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id
      LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id
      WHERE ${removedFilter} AND ii.result IN ('removed','scope_removed') GROUP BY ii.id ORDER BY ib.created_at DESC`).bind(removedValue).all()).results;
    const structural=(kind==='table'?(await db.prepare(`SELECT i.id,'index' AS kind,0 AS revision,NULL AS code,NULL AS columnName,t.name AS tableName,i.kind AS dataType,1 AS nullable,i.columns_json AS defaultValue,'' AS comment,i.name AS extra,i.source_kind AS sourceKind,ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,i.created_at AS createdAt FROM catalog_indexes i JOIN catalog_tables t ON t.id=i.table_id LEFT JOIN import_batches ib ON ib.id=i.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id WHERE i.table_id=? GROUP BY i.id`).bind(recordId).all()).results:[]).concat(kind==='table'?(await db.prepare(`SELECT c.id,'constraint' AS kind,0 AS revision,NULL AS code,NULL AS columnName,t.name AS tableName,c.kind AS dataType,1 AS nullable,c.definition AS defaultValue,'' AS comment,c.name AS extra,c.source_kind AS sourceKind,ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,c.created_at AS createdAt FROM catalog_constraints c JOIN catalog_tables t ON t.id=c.table_id LEFT JOIN import_batches ib ON ib.id=c.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id WHERE c.table_id=? GROUP BY c.id`).bind(recordId).all()).results:[]);
    const revisionsStructural=kind==='table'?(await db.prepare(`SELECT r.id,'index_revision' AS kind,r.revision,NULL AS code,NULL AS columnName,t.name AS tableName,r.kind AS dataType,1 AS nullable,r.columns_json AS defaultValue,'' AS comment,i.name AS extra,r.source_kind AS sourceKind,ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,r.created_at AS createdAt FROM catalog_index_revisions r JOIN catalog_indexes i ON i.id=r.index_id JOIN catalog_tables t ON t.id=i.table_id LEFT JOIN import_batches ib ON ib.id=r.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id WHERE i.table_id=? GROUP BY r.id`).bind(recordId).all()).results:[];
    const constraintRevisions=kind==='table'?(await db.prepare(`SELECT r.id,'constraint_revision' AS kind,r.revision,NULL AS code,NULL AS columnName,t.name AS tableName,r.kind AS dataType,1 AS nullable,r.definition AS defaultValue,'' AS comment,c.name AS extra,r.source_kind AS sourceKind,ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,r.created_at AS createdAt FROM catalog_constraint_revisions r JOIN catalog_constraints c ON c.id=r.constraint_id JOIN catalog_tables t ON t.id=c.table_id LEFT JOIN import_batches ib ON ib.id=r.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id WHERE c.table_id=? GROUP BY r.id`).bind(recordId).all()).results:[];
    const tableEvent=kind==='table'?[{id:`${focus.id}:created`,kind:'table_created',revision:0,code:focus.code,columnName:null,tableName:focus.tableName,dataType:null,nullable:1,defaultValue:null,comment:'',extra:'',sourceKind:focus.importBatchId?'import':'manual',batchName:null,batchCode:null,projectName:null,versionName:null,environmentNames:null,createdAt:focus.createdAt}]:[];
    const events=[...tableEvent,...revisions,...removals,...structural,...revisionsStructural,...constraintRevisions].sort((left,right)=>String((right as {createdAt:string}).createdAt).localeCompare(String((left as {createdAt:string}).createdAt)));
    return Response.json({ok:true,focus:{kind,id:focus.id,code:focus.code,tableName:focus.tableName,columnName:focus.columnName},events});
  }

  if (action === 'sql.history') {
    const projectId=clean(payload.projectId),versionId=clean(payload.versionId),environmentId=clean(payload.environmentId),batchId=clean(payload.importBatchId);
    const clauses:string[]=[];const binds:string[]=[];
    if (projectId) { clauses.push('x.project_id=?'); binds.push(projectId); }
    if (versionId) { clauses.push('x.version_id=?'); binds.push(versionId); }
    if (environmentId) { clauses.push('x.environment_id=?'); binds.push(environmentId); }
    if (batchId) { clauses.push('x.import_batch_id=?'); binds.push(batchId); }
    const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
    const rows=await db.prepare(`SELECT x.id,x.import_batch_id AS importBatchId,x.project_id AS projectId,x.version_id AS versionId,x.environment_id AS environmentId,x.status,x.sql_text AS sqlText,x.source_kind AS sourceKind,x.source_path AS sourcePath,x.git_commit AS gitCommit,x.started_at AS startedAt,x.finished_at AS finishedAt,x.note,x.created_at AS createdAt,b.name AS batchName,b.code AS batchCode,p.name AS projectName,v.name AS versionName,e.name AS environmentName FROM catalog_sql_executions x JOIN import_batches b ON b.id=x.import_batch_id JOIN catalog_projects p ON p.id=x.project_id JOIN catalog_versions v ON v.id=x.version_id JOIN catalog_environments e ON e.id=x.environment_id ${where} ORDER BY x.created_at DESC LIMIT 200`).bind(...binds).all();
    return Response.json({ok:true,executions:rows.results});
  }

  if (action === 'sql.register') {
    const projectId=clean(payload.projectId),versionId=clean(payload.versionId),sqlText=clean(payload.sqlText),name=clean(payload.name)||'锚点同步 SQL';
    const anchorEnvironmentId=clean(payload.anchorEnvironmentId);
    const environmentIds=Array.isArray(payload.environmentIds)?payload.environmentIds.map(clean).filter(Boolean):[];
    if (!projectId||!versionId||!sqlText||!anchorEnvironmentId||!environmentIds.length) return Response.json({ error:'请提供项目、版本、锚定环境、SQL，并至少选择一个环境。' },{ status:400 });
    const project=await db.prepare(`SELECT id FROM catalog_projects WHERE id=? AND archived=0`).bind(projectId).first<{id:string}>();
    const version=await db.prepare(`SELECT id FROM catalog_versions WHERE id=? AND project_id=?`).bind(versionId,projectId).first<{id:string}>();
    if (!project||!version) return Response.json({ error:'项目或版本不存在。' },{ status:404 });
    const placeholders=environmentIds.map(()=>'?').join(',');
    const envRows=(await db.prepare(`SELECT id,version_id AS versionId FROM catalog_environments WHERE project_id=? AND id IN (${placeholders}) AND archived=0`).bind(projectId,...environmentIds).all<{id:string;versionId:string|null}>()).results;
    const validIds=envRows.map((row)=>row.id);
    if (!validIds.includes(anchorEnvironmentId)||validIds.length!==new Set(environmentIds).size) return Response.json({ error:'所选环境必须属于当前项目，且包含锚定环境。' },{ status:400 });
    const batchId=id(),batchCode=`SYNC-${new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10).replaceAll('-','')}-${batchId.slice(0,8).toUpperCase()}`;
    const createdAt=now();
    const statements:D1PreparedStatement[]=[db.prepare(`INSERT INTO import_batches (id,code,name,source_kind,file_name,source_path,git_commit,fingerprint,raw_sql,project_id,version_id,module_id,status,added_count,duplicate_count,modified_count,removed_count,conflict_count,created_at,reverted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,'active',0,0,0,0,0,?,NULL)`).bind(batchId,batchCode,name,'generated',null,null,null,await hash(`${projectId}|${versionId}|${sqlText}|${createdAt}`),sqlText,projectId,versionId,createdAt)];
    envRows.forEach((environment)=>{
      const environmentId=environment.id;
      const executionVersionId=environment.versionId||versionId;
      statements.push(db.prepare(`INSERT INTO import_batch_environments (batch_id,environment_id) VALUES (?,?)`).bind(batchId,environmentId));
      statements.push(db.prepare(`INSERT INTO catalog_sql_executions (id,import_batch_id,project_id,version_id,environment_id,status,sql_text,source_kind,source_path,git_commit,created_at,started_at,finished_at,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id(),batchId,projectId,executionVersionId,environmentId,environmentId===anchorEnvironmentId?'executed':'registered',sqlText,'generated',null,null,createdAt,environmentId===anchorEnvironmentId?createdAt:null,environmentId===anchorEnvironmentId?createdAt:null,environmentId===anchorEnvironmentId?'已确认在锚定环境执行':'等待在该环境执行'));
    });
    await runChunked(db,statements);
    return Response.json({ok:true,batchId,batchCode,registered:validIds.length});
  }

  if (action === 'scope.compare') {
    type CompareTarget={projectId:string;versionId:string;environmentId:string};
    type CompareField={id:string;code:string;name:string;tableName:string;dataType:string;nullable:number;defaultValue:string|null;comment:string;extra:string;resolutionKind:string;reviewStatus:string};
    const readTarget=(value:unknown):CompareTarget=>{
      const target=value&&typeof value==='object'?value as Record<string,unknown>:{};
      return {projectId:clean(target.projectId),versionId:clean(target.versionId),environmentId:clean(target.environmentId)};
    };
    const base=readTarget(payload.base),target=readTarget(payload.target);const tableId=clean(payload.tableId),fieldId=clean(payload.fieldId);
    if (!base.projectId||!base.versionId||!base.environmentId||!target.projectId||!target.versionId||!target.environmentId) return Response.json({ error:'请选择完整的基准项目、版本、环境和目标项目、版本、环境。' },{ status:400 });
    const [baseScopeError,targetScopeError]=await Promise.all([
      validateScopeSelection(db,base.projectId,base.versionId,[base.environmentId]),
      validateScopeSelection(db,target.projectId,target.versionId,[target.environmentId]),
    ]);
    if (baseScopeError||targetScopeError) return Response.json({ error:baseScopeError||targetScopeError },{ status:400 });
    const focusSql=fieldId?' AND f.id=?':tableId?' AND f.table_id=?':'';const focusValue=fieldId||tableId;
    const readFields=async(scope:CompareTarget)=>(await db.prepare(`SELECT f.id,f.code,f.name,t.name AS tableName,
      CASE WHEN fr.id IS NOT NULL THEN fr.data_type ELSE f.data_type END AS dataType,
      CASE WHEN fr.id IS NOT NULL THEN fr.nullable ELSE f.nullable END AS nullable,
      CASE WHEN fr.id IS NOT NULL THEN fr.default_value ELSE f.default_value END AS defaultValue,
      CASE WHEN fr.id IS NOT NULL THEN fr.comment ELSE f.comment END AS comment,
      CASE WHEN fr.id IS NOT NULL THEN fr.extra ELSE f.extra END AS extra,
      coalesce(csr.resolution_kind,'same') AS resolutionKind,coalesce(csr.review_status,'confirmed') AS reviewStatus
      FROM field_scopes fs JOIN catalog_fields f ON f.id=fs.field_id JOIN catalog_tables t ON t.id=f.table_id
      LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
      LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id
      WHERE fs.project_id=? AND fs.version_id=? AND fs.environment_id=? AND fs.state='present'
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=f.id AND l.project_id=? LIMIT 1),f.lifecycle_status,'active')='active'${focusSql}
      ORDER BY t.name,f.ordinal,f.name`).bind(scope.projectId,scope.versionId,scope.environmentId,scope.projectId,scope.projectId,...(focusValue?[focusValue]:[])).all<CompareField>()).results;
    const [baseFields,targetFields]=await Promise.all([readFields(base),readFields(target)]);
    const readTablePresence=async(scope:CompareTarget)=>{
      if (!tableId) return null;
      const row=await db.prepare(`SELECT 1 AS present FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id
        WHERE s.table_id=? AND s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present'
          AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'
        LIMIT 1`).bind(tableId,scope.projectId,scope.versionId,scope.environmentId,scope.projectId).first<{present:number}>();
      return Boolean(row?.present);
    };
    const [baseTablePresent,targetTablePresent]=await Promise.all([readTablePresence(base),readTablePresence(target)]);
    const readIndexes=async(scope:CompareTarget)=>tableId?(await db.prepare(`SELECT i.id,i.name,i.kind,i.columns_json AS columnsJson
      FROM catalog_index_scopes s JOIN catalog_indexes i ON i.id=s.index_id JOIN catalog_tables t ON t.id=i.table_id
      WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND i.table_id=?
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='index' AND l.object_id=i.id AND l.project_id=? LIMIT 1),i.lifecycle_status,'active')='active'
      ORDER BY i.name`).bind(scope.projectId,scope.versionId,scope.environmentId,tableId,scope.projectId,scope.projectId).all<{id:string;name:string;kind:string;columnsJson:string}>()).results:[];
    const readConstraints=async(scope:CompareTarget)=>tableId?(await db.prepare(`SELECT c.id,c.name,c.kind,c.definition
      FROM catalog_constraint_scopes s JOIN catalog_constraints c ON c.id=s.constraint_id JOIN catalog_tables t ON t.id=c.table_id
      WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND c.table_id=?
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='constraint' AND l.object_id=c.id AND l.project_id=? LIMIT 1),c.lifecycle_status,'active')='active'
      ORDER BY c.name`).bind(scope.projectId,scope.versionId,scope.environmentId,tableId,scope.projectId,scope.projectId).all<{id:string;name:string;kind:string;definition:string}>()).results:[];
    const [baseIndexes,targetIndexes,baseConstraints,targetConstraints]=await Promise.all([readIndexes(base),readIndexes(target),readConstraints(base),readConstraints(target)]);
    const baseIndexMap=new Map(baseIndexes.map((item)=>[item.name.toLowerCase(),item]));const targetIndexMap=new Map(targetIndexes.map((item)=>[item.name.toLowerCase(),item]));
    const indexItems=[...new Set([...baseIndexMap.keys(),...targetIndexMap.keys()])].sort().map((indexKey)=>{const left=baseIndexMap.get(indexKey),right=targetIndexMap.get(indexKey);if(!left&&right)return {name:right.name,kind:right.kind,columnsJson:right.columnsJson,result:'added'};if(left&&!right)return {name:left.name,kind:left.kind,columnsJson:left.columnsJson,result:'removed'};const changed=left?.kind!==right?.kind||left?.columnsJson!==right?.columnsJson;return {name:right?.name??left?.name??indexKey,kind:right?.kind??left?.kind??'index',columnsJson:right?.columnsJson??left?.columnsJson??'[]',result:changed?'modified':'unchanged'};});
    const baseConstraintMap=new Map(baseConstraints.map((item)=>[item.name.toLowerCase(),item]));const targetConstraintMap=new Map(targetConstraints.map((item)=>[item.name.toLowerCase(),item]));
    const constraintItems=[...new Set([...baseConstraintMap.keys(),...targetConstraintMap.keys()])].sort().map((constraintKey)=>{const left=baseConstraintMap.get(constraintKey),right=targetConstraintMap.get(constraintKey);if(!left&&right)return {name:right.name,kind:right.kind,definition:right.definition,result:'added'};if(left&&!right)return {name:left.name,kind:left.kind,definition:left.definition,result:'removed'};const changed=left?.kind!==right?.kind||left?.definition!==right?.definition;return {name:right?.name??left?.name??constraintKey,kind:right?.kind??left?.kind??'constraint',definition:right?.definition??left?.definition??'',result:changed?'modified':'unchanged'};});
    const key=(field:CompareField,scope:CompareTarget)=>`${field.tableName.toLowerCase()}.${field.name.toLowerCase()}${field.resolutionKind==='separate'?`::${scope.projectId}.${scope.versionId}.${scope.environmentId}`:''}`;
    const baseMap=new Map(baseFields.map(field=>[key(field,base),field]));
    const targetMap=new Map(targetFields.map(field=>[key(field,target),field]));
    const keys=[...new Set([...baseMap.keys(),...targetMap.keys()])].sort();
    const definition=(field:CompareField)=>`${field.dataType}${field.nullable?' NULL':' NOT NULL'}${field.defaultValue!==null?` DEFAULT ${field.defaultValue}`:''}${field.comment?` COMMENT ${field.comment}`:''}${field.extra?` ${field.extra}`:''}`;
    const items=keys.map(fieldKey=>{
      const before=baseMap.get(fieldKey),after=targetMap.get(fieldKey);
      if (!before&&after) return {tableName:after.tableName,columnName:after.name,fieldCode:after.code,result:'added',before:null,after:definition(after),changes:[after.resolutionKind==='separate'?'目标范围将它登记为独立逻辑字段':'目标范围新增该字段'],resolutionKind:after.resolutionKind,reviewStatus:after.reviewStatus};
      if (before&&!after) return {tableName:before.tableName,columnName:before.name,fieldCode:before.code,result:'removed',before:definition(before),after:null,changes:[before.resolutionKind==='separate'?'基准范围将它登记为独立逻辑字段':'目标范围没有该字段'],resolutionKind:before.resolutionKind,reviewStatus:before.reviewStatus};
      const left=before as CompareField,right=after as CompareField;const changes:string[]=[];
      if (left.dataType.toLowerCase()!==right.dataType.toLowerCase()) changes.push(`类型：${left.dataType} → ${right.dataType}`);
      if (Boolean(left.nullable)!==Boolean(right.nullable)) changes.push(`可空：${left.nullable?'是':'否'} → ${right.nullable?'是':'否'}`);
      if ((left.defaultValue??null)!==(right.defaultValue??null)) changes.push(`默认值：${left.defaultValue??'—'} → ${right.defaultValue??'—'}`);
      if ((left.comment??'')!==(right.comment??'')) changes.push(`注释：${left.comment||'—'} → ${right.comment||'—'}`);
      if ((left.extra??'')!==(right.extra??'')) changes.push(`属性：${left.extra||'—'} → ${right.extra||'—'}`);
      return {tableName:right.tableName,columnName:right.name,fieldCode:right.code,result:changes.length?'modified':'unchanged',before:definition(left),after:definition(right),changes,resolutionKind:right.resolutionKind,reviewStatus:right.reviewStatus};
    });
    const summary=items.reduce((result,item)=>({...result,[item.result]:(result[item.result]??0)+1}),{} as Record<string,number>);
    return Response.json({ok:true,items,summary,baseCount:baseFields.length,targetCount:targetFields.length,baseTablePresent,targetTablePresent,indexItems,constraintItems});
  }

  if (action === 'import.conflict.resolve') {
    type ConflictRow={id:string;batchId:string;statementNo:number;tableName:string;columnName:string;fieldId:string|null;rawSql:string;projectId:string;versionId:string;sourceKind:string};
    type ExistingField={id:string;name:string;tableName:string;dataType:string;nullable:number;defaultValue:string|null;comment:string;extra:string;ordinal:number};
    const batchId=clean(payload.batchId),itemId=clean(payload.itemId),resolution=clean(payload.resolution);
    const metadataOnly=payload.metadataOnly===true;
    if (!batchId||!['same','variant','separate'].includes(resolution)|| (metadataOnly&&resolution!=='same')) return Response.json({error:'请选择要处理的冲突和处理方式。'},{status:400});
    const rows=(await db.prepare(`SELECT ii.id,ii.batch_id AS batchId,ii.statement_no AS statementNo,ii.table_name AS tableName,ii.column_name AS columnName,ii.field_id AS fieldId,
      b.raw_sql AS rawSql,b.project_id AS projectId,b.version_id AS versionId,b.source_kind AS sourceKind
      FROM import_items ii JOIN import_batches b ON b.id=ii.batch_id
      WHERE ii.batch_id=? AND ii.result='conflict' AND (?='' OR ii.id=?) ORDER BY ii.statement_no,ii.id`).bind(batchId,itemId,itemId).all<ConflictRow>()).results;
    if (!rows.length) return Response.json({error:'没有找到可处理的冲突。'},{status:404});
    const parsed=parseMysqlSql(rows[0].rawSql);
    const environments=(await db.prepare(`SELECT environment_id AS environmentId FROM import_batch_environments WHERE batch_id=?`).bind(batchId).all<{environmentId:string}>()).results;
    if (!environments.length) return Response.json({error:'这次导入没有关联环境。'},{status:400});
    const statements:D1PreparedStatement[]=[];
    let resolved=0,duplicates=0,modified=0;
    for (const row of rows) {
      if (!row.fieldId) continue;
      const incoming=parsed.fields.find((field)=>field.statementNo===row.statementNo&&field.tableName.toLowerCase()===row.tableName.toLowerCase()&&field.columnName.toLowerCase()===row.columnName.toLowerCase());
      const existing=await db.prepare(`SELECT f.id,f.name,t.name AS tableName,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,f.ordinal
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE f.id=?`).bind(row.fieldId).first<ExistingField>();
      if (!incoming||!existing) continue;
      const structuralMatch=existing.dataType.toLowerCase()===incoming.dataType.toLowerCase()&&Boolean(existing.nullable)===incoming.nullable&&(existing.defaultValue??null)===(incoming.defaultValue??null)&&(existing.extra??'').trim()===(incoming.extra??'').trim();
      const onlyDescriptionDiff=structuralMatch&&(existing.comment??'').trim()!==(incoming.comment??'').trim();
      if (metadataOnly&&!onlyDescriptionDiff) continue;
      let revisionId='';
      if (resolution==='same') {
        const scopedRevision=await db.prepare(`SELECT csr.revision_id AS revisionId FROM catalog_field_scope_revisions csr JOIN field_scopes fs ON fs.field_id=csr.field_id AND fs.version_id=csr.version_id AND fs.environment_id=csr.environment_id
          WHERE csr.field_id=? AND fs.project_id=? AND fs.version_id=? ORDER BY csr.updated_at DESC LIMIT 1`).bind(existing.id,row.projectId,row.versionId).first<{revisionId:string}>();
        const latestRevision=scopedRevision??await db.prepare(`SELECT id AS revisionId FROM catalog_field_revisions WHERE field_id=? ORDER BY revision DESC LIMIT 1`).bind(existing.id).first<{revisionId:string}>();
        revisionId=latestRevision?.revisionId??'';
      } else {
        const fingerprint=fieldFingerprint(incoming);
        const matchingRevision=await db.prepare(`SELECT id AS revisionId FROM catalog_field_revisions WHERE field_id=? AND fingerprint=? ORDER BY revision DESC LIMIT 1`).bind(existing.id,fingerprint).first<{revisionId:string}>();
        if (matchingRevision) revisionId=matchingRevision.revisionId;
        else {
          const nextRevision=Number((await db.prepare(`SELECT coalesce(max(revision),0)+1 AS next FROM catalog_field_revisions WHERE field_id=?`).bind(existing.id).first<{next:number}>())?.next??1);
          revisionId=`${existing.id}:r${nextRevision}`;
          statements.push(db.prepare(`INSERT INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(revisionId,existing.id,nextRevision,incoming.dataType,incoming.nullable?1:0,incoming.defaultValue,incoming.comment,incoming.extra,incoming.ordinal,row.sourceKind,batchId,fingerprint,now()));
        }
      }
      if (!revisionId) continue;
      const reviewStatus=resolution==='variant'?'pending':'confirmed';
      const note=resolution==='same'?'已视为同一字段并采用已有定义。':resolution==='variant'?'已保留当前环境定义，等待人工核对。':'已保留当前环境定义，并标记为独立逻辑字段。';
      environments.forEach(({environmentId})=>{
        statements.push(db.prepare(`INSERT OR REPLACE INTO field_scopes (field_id,project_id,version_id,environment_id,state,origin,import_batch_id,created_at) VALUES (?,?,?,?, 'present',?,?,?)`).bind(existing.id,row.projectId,row.versionId,environmentId,'conflict-resolution',batchId,now()));
        statements.push(db.prepare(`INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,resolution_kind,review_status,resolution_note,import_item_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(existing.id,row.versionId,environmentId,revisionId,resolution,reviewStatus,note,row.id,now()));
      });
      statements.push(db.prepare(`UPDATE import_items SET result=?,message=? WHERE id=?`).bind(resolution==='same'?'duplicate':'modified',note,row.id));
      resolved+=1;
      if (resolution==='same') duplicates+=1; else modified+=1;
    }
    if (!resolved) return Response.json({error:metadataOnly?'没有仅说明不同的冲突。':'冲突无法自动匹配原始字段。'},{status:400});
    statements.push(db.prepare(`UPDATE import_batches SET conflict_count=max(conflict_count-?,0),duplicate_count=duplicate_count+?,modified_count=modified_count+? WHERE id=?`).bind(resolved,duplicates,modified,batchId));
    await runChunked(db,statements);
    return Response.json({ok:true,resolved,resolution,metadataOnly});
  }

  if (action === 'import.preview') {
    const sql=clean(payload.sql),projectId=clean(payload.projectId),versionId=clean(payload.versionId);
    const environmentIds=[...new Set(Array.isArray(payload.environmentIds)?payload.environmentIds.map(clean).filter(Boolean):[])];
    if (!sql||!projectId||!versionId||!environmentIds.length) return Response.json({ error:'请提供 SQL，并选择项目、版本和至少一个环境。' },{ status:400 });
    const scopeError=await validateScopeSelection(db,projectId,versionId,environmentIds);
    if (scopeError) return Response.json({ error:scopeError },{ status:400 });
    const parsed=parseMysqlSql(sql);
    if (!parsed.fields.length) return Response.json({ error:'没有识别到字段定义。',warnings:parsed.warnings },{ status:400 });
    if (parsed.warnings.length) return Response.json({ error:`有 ${parsed.warnings.length} 处 SQL 无法安全识别。${parsed.warnings[0]}`,warnings:parsed.warnings },{ status:400 });
    const mappingRows=await db.prepare(`SELECT physical_name AS physicalName,logical_name AS logicalName FROM catalog_table_mappings WHERE project_id=?`).bind(projectId).all<{physicalName:string;logicalName:string}>();
    const mappings=new Map(mappingRows.results.map((row)=>[row.physicalName.toLowerCase(),row.logicalName.toLowerCase()]));
    const resolveTable=(name:string)=>mappings.get(name.toLowerCase())??name;
    const normalizedParsed={...parsed,tables:parsed.tables.map((table)=>({...table,name:resolveTable(table.name)})),fields:parsed.fields.map((field)=>({...field,tableName:resolveTable(field.tableName)})),indexes:parsed.indexes.map((item)=>({...item,tableName:resolveTable(item.tableName)})),constraints:parsed.constraints.map((item)=>({...item,tableName:resolveTable(item.tableName)}))};
    const existingRows=await db.prepare(`SELECT f.id,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,t.name AS tableName
      FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id`).all<{id:string;name:string;dataType:string;nullable:number;defaultValue:string|null;comment:string;extra:string;tableName:string}>();
    const existingMap=new Map(existingRows.results.map((field)=>[`${field.tableName.toLowerCase()}.${field.name.toLowerCase()}`,field]));
    const scopePlaceholders=environmentIds.map(()=>'?').join(',');
    const scopedRows=await db.prepare(`SELECT DISTINCT field_id AS fieldId FROM field_scopes WHERE project_id=? AND version_id=? AND environment_id IN (${scopePlaceholders})`).bind(projectId,versionId,...environmentIds).all<{fieldId:string}>();
    const scopedFieldIds=new Set(scopedRows.results.map((item)=>item.fieldId));
    const createTables=new Set(normalizedParsed.tables.map((table)=>table.name.toLowerCase()));
    const incomingByTable=new Map<string,Set<string>>();
    normalizedParsed.fields.forEach((field)=>{
      if (!createTables.has(field.tableName)) return;
      const names=incomingByTable.get(field.tableName)??new Set<string>();
      names.add(field.columnName.toLowerCase()); incomingByTable.set(field.tableName,names);
    });
    const items:{tableName:string;columnName:string;result:string;before:string|null;after:string|null;changes:string[]}[]=[];
    const definition=(field:{dataType:string;nullable:boolean|number;defaultValue:string|null;comment:string;extra:string})=>`${field.dataType}${field.nullable?' NULL':' NOT NULL'}${field.defaultValue!==null?` DEFAULT ${field.defaultValue}`:''}${field.comment?` COMMENT ${field.comment}`:''}${field.extra?` ${field.extra}`:''}`;
    for (const field of normalizedParsed.fields) {
      const key=`${field.tableName}.${(field.previousName||field.columnName).toLowerCase()}`;
      const existing=existingMap.get(key);
      if (field.action==='drop') {
        items.push({tableName:field.tableName,columnName:field.columnName,result:existing?'removed':'unchanged',before:existing?definition(existing):null,after:null,changes:existing?['字段将从所选环境移除']:[]});
        continue;
      }
      if (!existing) {
        items.push({tableName:field.tableName,columnName:field.columnName,result:(field.action==='modify'||field.action==='change')?'conflict':'added',before:null,after:definition(field),changes:(field.action==='modify'||field.action==='change')?['要修改的原字段不存在']:['新增字段']});
        continue;
      }
      const changes:string[]=[];
      if (existing.name.toLowerCase()!==field.columnName.toLowerCase()) changes.push(`名称：${existing.name} → ${field.columnName}`);
      if (existing.dataType.toLowerCase()!==field.dataType.toLowerCase()) changes.push(`类型：${existing.dataType} → ${field.dataType}`);
      if (Boolean(existing.nullable)!==field.nullable) changes.push(`可空：${Boolean(existing.nullable)?'是':'否'} → ${field.nullable?'是':'否'}`);
      if ((existing.defaultValue??null)!==(field.defaultValue??null)) changes.push(`默认值：${existing.defaultValue??'—'} → ${field.defaultValue??'—'}`);
      if ((existing.comment??'')!==(field.comment??'')) changes.push(`注释：${existing.comment||'—'} → ${field.comment||'—'}`);
      if ((existing.extra??'')!==(field.extra??'')) changes.push(`属性：${existing.extra||'—'} → ${field.extra||'—'}`);
      if (!scopedFieldIds.has(existing.id)&&createTables.has(field.tableName)) {
        items.push({tableName:field.tableName,columnName:field.columnName,result:changes.length?'conflict':'added',before:changes.length?definition(existing):null,after:definition(field),changes:changes.length?changes:['字段将登记到所选环境']});
        continue;
      }
      const createSnapshot=createTables.has(field.tableName);
      const result=!changes.length?'unchanged':createSnapshot||field.action==='modify'||field.action==='change'?'modified':'conflict';
      items.push({tableName:field.tableName,columnName:field.columnName,result,before:definition(existing),after:definition(field),changes});
    }
    for (const table of normalizedParsed.tables) {
      const incoming=incomingByTable.get(table.name)??new Set<string>();
      existingRows.results.filter((field)=>field.tableName.toLowerCase()===table.name&&scopedFieldIds.has(field.id)&&!incoming.has(field.name.toLowerCase())).forEach((field)=>items.push({tableName:table.name,columnName:field.name,result:'removed',before:definition(field),after:null,changes:['建表语句中不存在该字段']}));
    }
    const summary=items.reduce((result,item)=>({...result,[item.result]:(result[item.result]??0)+1}),{} as Record<string,number>);
    return Response.json({ok:true,items,summary,warnings:parsed.warnings});
  }

  if (action === 'import.sql') {
    const sql=clean(payload.sql),projectId=clean(payload.projectId),versionId=clean(payload.versionId),moduleId=clean(payload.moduleId)||null;
    const historical=payload.historical===true;
    const lifecycleStatus=historical?'deprecated':'active';
    const lifecycleNote=historical?'历史结构导入':'';
    const sourcePath=clean(payload.sourcePath)||null,gitCommit=clean(payload.gitCommit)||null;
    const environmentIds=[...new Set(Array.isArray(payload.environmentIds)?payload.environmentIds.map(clean).filter(Boolean):[])];
    const sourceKind=['paste','upload','github'].includes(clean(payload.sourceKind))?clean(payload.sourceKind):'paste';
    if (!sql||!projectId||!versionId||!environmentIds.length) return Response.json({ error:'请提供 SQL，并选择项目、版本和至少一个环境。' },{ status:400 });
    const scopeError=await validateScopeSelection(db,projectId,versionId,environmentIds);
    if (scopeError) return Response.json({ error:scopeError },{ status:400 });
    let parsed=parseMysqlSql(sql);
    if (!parsed.fields.length) return Response.json({ error:'没有识别到字段定义。',warnings:parsed.warnings },{ status:400 });
    if (parsed.warnings.length) return Response.json({ error:`有 ${parsed.warnings.length} 处 SQL 无法安全识别，未写入任何数据。${parsed.warnings[0]}`,warnings:parsed.warnings },{ status:400 });
    // Resolve physical names to project-scoped logical identities before any
    // comparison.  This keeps a renamed table from looking like a drop plus
    // a brand-new table in another environment.
    const mappingRows=await db.prepare(`SELECT physical_name AS physicalName,logical_name AS logicalName FROM catalog_table_mappings WHERE project_id=?`).bind(projectId).all<{physicalName:string;logicalName:string}>();
    if (mappingRows.results.length) {
      const mappings=new Map(mappingRows.results.map((row)=>[row.physicalName.toLowerCase(),row.logicalName.toLowerCase()]));
      const resolve=(name:string)=>mappings.get(name.toLowerCase())??name;
      parsed={
        ...parsed,
        tables:parsed.tables.map((table)=>({...table,name:resolve(table.name)})),
        fields:parsed.fields.map((field)=>({...field,tableName:resolve(field.tableName)})),
        indexes:parsed.indexes.map((item)=>({...item,tableName:resolve(item.tableName)})),
        constraints:parsed.constraints.map((item)=>({...item,tableName:resolve(item.tableName)})),
      };
    }
    const fingerprint=await hash(`${projectId}|${versionId}|${environmentIds.sort().join(',')}|${sql.replace(/\s+/g,' ').trim()}`);
    const existingBatch=await db.prepare(`SELECT id,code FROM import_batches WHERE fingerprint=? AND status='active'`).bind(fingerprint).first<{id:string;code:string}>();
    if (existingBatch) return Response.json({ ok:true,duplicateBatch:true,batchCode:existingBatch.code,warnings:parsed.warnings });

    const [tableRows,fieldRows,revisionRows,indexRows,constraintRows,indexRevisionRows,constraintRevisionRows]=await Promise.all([
      db.prepare(`SELECT id,code,name,comment,module_id AS moduleId FROM catalog_tables`).all<{id:string;code:string;name:string;comment:string;moduleId:string|null}>(),
      db.prepare(`SELECT f.id,f.code,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,f.ordinal,t.name AS tableName,t.id AS tableId FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id`).all<{id:string;code:string;name:string;dataType:string;nullable:number;defaultValue:string|null;comment:string;extra:string;ordinal:number;tableName:string;tableId:string}>(),
      db.prepare(`SELECT field_id AS fieldId,max(revision) AS revision FROM catalog_field_revisions GROUP BY field_id`).all<{fieldId:string;revision:number}>(),
      db.prepare(`SELECT id,table_id AS tableId,name,kind,columns_json AS columnsJson FROM catalog_indexes`).all<{id:string;tableId:string;name:string;kind:string;columnsJson:string}>(),
      db.prepare(`SELECT id,table_id AS tableId,name,kind,definition FROM catalog_constraints`).all<{id:string;tableId:string;name:string;kind:string;definition:string}>(),
      db.prepare(`SELECT index_id AS indexId,max(revision) AS revision FROM catalog_index_revisions GROUP BY index_id`).all<{indexId:string;revision:number}>(),
      db.prepare(`SELECT constraint_id AS constraintId,max(revision) AS revision FROM catalog_constraint_revisions GROUP BY constraint_id`).all<{constraintId:string;revision:number}>(),
    ]);
    const tableMap=new Map(tableRows.results.map((item)=>[item.name.toLowerCase(),item]));
    const parsedTableMap=new Map(parsed.tables.map((item)=>[item.name,item]));
    const createTableNames=new Set(parsed.tables.map((item)=>item.name));
    const fieldMap=new Map(fieldRows.results.map((item)=>[`${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`,item]));
    const revisionMap=new Map(revisionRows.results.map((item)=>[item.fieldId,Number(item.revision)||0]));
    const tableCodes=new Set(tableRows.results.map((item)=>item.code)); const fieldCodes=new Set(fieldRows.results.map((item)=>item.code));
    const rolloutRows=await db.prepare(`SELECT id FROM catalog_environments WHERE project_id=? AND archived=0 AND (version_id=? OR version_id IS NULL)`).bind(projectId,versionId).all<{id:string}>();
    const rolloutEnvironmentIds=rolloutRows.results.map((item)=>item.id);
    const scopePlaceholders=environmentIds.map(()=>'?').join(',');
    const selectedScopeRows=await db.prepare(`SELECT DISTINCT field_id AS fieldId FROM field_scopes WHERE project_id=? AND version_id=? AND environment_id IN (${scopePlaceholders})`).bind(projectId,versionId,...environmentIds).all<{fieldId:string}>();
    const selectedScopeFieldIds=new Set(selectedScopeRows.results.map((item)=>item.fieldId));
    // A pure CREATE import is a snapshot of what already exists in the selected
    // environment. It may update that environment's revision, but it never
    // creates rollout work for the other environments.
    const createSnapshot=parsed.tables.length>0 && parsed.fields.every((field)=>field.action==='add') && parsed.indexes.every((index)=>index.action==='add') && parsed.constraints.every((constraint)=>constraint.action==='add');
    const indexMap=new Map(indexRows.results.map((item)=>[`${item.tableId}.${item.name.toLowerCase()}`,item]));
    const constraintMap=new Map(constraintRows.results.map((item)=>[`${item.tableId}.${item.name.toLowerCase()}`,item]));
    const indexRevisionMap=new Map(indexRevisionRows.results.map((item)=>[item.indexId,Number(item.revision)||0]));
    const constraintRevisionMap=new Map(constraintRevisionRows.results.map((item)=>[item.constraintId,Number(item.revision)||0]));
    const batchDate=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10).replaceAll('-','');
    const batchId=id(),batchCode=`IMP-${batchDate}-${batchId.slice(0,8).toUpperCase()}`;
    const statements:D1PreparedStatement[]=[];
    const registeredTableScopes=new Set<string>();
    const lifecycleTargets={table:new Set<string>(),field:new Set<string>(),index:new Set<string>(),constraint:new Set<string>()};
    let added=0,duplicates=0,modified=0,removed=0,conflicts=0,changeIndex=0;

    const markImportedFieldScopesVerified=(fieldId:string)=>{
      // If an environment is imported again (for example, a second initial
      // snapshot), close any stale pending marker for the same field. The
      // import itself is the evidence that this environment now has the
      // registered structure.
      environmentIds.forEach((environmentId)=>{
        const timestamp=now();
        statements.push(db.prepare(`UPDATE catalog_change_scopes SET status='verified',executed_at=coalesce(executed_at,?),verified_at=coalesce(verified_at,?),note=? WHERE environment_id=? AND status='pending' AND change_id IN (SELECT id FROM catalog_changes WHERE field_id=? AND project_id=? AND version_id=?)`).bind(timestamp,timestamp,'已从导入快照确认该环境结构存在。',environmentId,fieldId,projectId,versionId));
        statements.push(db.prepare(`UPDATE catalog_sql_executions SET status='verified',started_at=coalesce(started_at,?),finished_at=coalesce(finished_at,?),note=? WHERE environment_id=? AND status='registered' AND import_batch_id IN (SELECT import_batch_id FROM catalog_changes WHERE field_id=? AND project_id=? AND version_id=?)`).bind(timestamp,timestamp,'已从导入快照确认该环境结构存在。',environmentId,fieldId,projectId,versionId));
      });
    };

    const addChange=(parsedField:ParsedField,fieldId:string|null,status:string)=>{
      // Every CREATE TABLE statement is an observed snapshot. Only explicit
      // ALTER-style field changes are rollout work.
      if (createTableNames.has(parsedField.tableName) || status==='duplicate'||status==='skipped') return;
      const changeId=id();
      // change code must be globally unique, not only unique inside one batch.
      // The batch id is generated once per import and avoids collisions when
      // multiple imports happen on the same day (or a batch counter is reused).
      const changeCode=`CHG-${batchId}-${String(changeIndex+1).padStart(3,'0')}`;
      changeIndex+=1;
      statements.push(db.prepare(`INSERT INTO catalog_changes (id,code,name,action,table_name,field_name,field_id,project_id,version_id,source_kind,source_path,git_commit,sql_text,import_batch_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(changeId,changeCode,clean(payload.name)||changeCode,parsedField.action,parsedField.tableName,parsedField.columnName,fieldId,projectId,versionId,sourceKind,sourcePath,gitCommit,`${parsedField.action.toUpperCase()} ${parsedField.tableName}.${parsedField.columnName}`,batchId,status==='conflict'?'conflict':'planned',now()));
      rolloutEnvironmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR IGNORE INTO catalog_change_scopes (change_id,environment_id,status) VALUES (?,?,?)`).bind(changeId,environmentId,environmentIds.includes(environmentId)?'verified':'pending')));
    };

    for (const parsedField of parsed.fields) {
      let table=tableMap.get(parsedField.tableName);
      if (!table) {
        const created={ id:id(),code:tableCode(parsedField.tableName,tableCodes),name:parsedField.tableName,comment:parsedTableMap.get(parsedField.tableName)?.comment??'',moduleId };
        statements.push(db.prepare(`INSERT INTO catalog_tables (id,code,name,comment,module_id,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?)`).bind(created.id,created.code,created.name,created.comment,moduleId,batchId,now(),lifecycleStatus,lifecycleNote));
        table=created; tableMap.set(created.name,created);
      } else {
        const tableComment=parsedTableMap.get(parsedField.tableName)?.comment;
        if (tableComment&&!table.comment) { statements.push(db.prepare(`UPDATE catalog_tables SET comment=? WHERE id=?`).bind(tableComment,table.id)); table.comment=tableComment; }
        if (historical) statements.push(db.prepare(`UPDATE catalog_tables SET lifecycle_status=?,lifecycle_note=? WHERE id=?`).bind(lifecycleStatus,lifecycleNote,table.id));
      }
      if (!registeredTableScopes.has(table.id)) {
        environmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR IGNORE INTO table_scopes VALUES (?,?,?,?, 'present',?,?,?)`).bind(table.id,projectId,versionId,environmentId,sourceKind,batchId,now())));
        registeredTableScopes.add(table.id);
      }
      if (historical) lifecycleTargets.table.add(table.id);
      const key=`${parsedField.tableName}.${(parsedField.previousName||parsedField.columnName).toLowerCase()}`;
      const existing=fieldMap.get(key);
      if (parsedField.action==='drop') {
        if (!existing) { duplicates+=1; statements.push(importItem(db,batchId,parsedField,null,'skipped','字段不存在，无需删除。')); continue; }
        const placeholders=environmentIds.map(()=>'?').join(',');
        const priorScopes=await db.prepare(`SELECT field_id AS fieldId,project_id AS projectId,version_id AS versionId,environment_id AS environmentId,state,origin,import_batch_id AS importBatchId,created_at AS createdAt FROM field_scopes WHERE field_id=? AND version_id=? AND environment_id IN (${placeholders})`).bind(existing.id,versionId,...environmentIds).all();
        environmentIds.forEach((environmentId)=>statements.push(db.prepare(`DELETE FROM field_scopes WHERE field_id=? AND version_id=? AND environment_id=?`).bind(existing.id,versionId,environmentId),db.prepare(`DELETE FROM catalog_field_scope_revisions WHERE field_id=? AND version_id=? AND environment_id=?`).bind(existing.id,versionId,environmentId)));
        statements.push(importItem(db,batchId,parsedField,existing.id,'removed','已从所选环境删除字段登记。',{field:existing,scopes:priorScopes.results}));
        addChange(parsedField,existing.id,'removed');
        removed+=1;continue;
      }
      const incomingFingerprint=fieldFingerprint(parsedField);
      if (existing) {
        const selectedInScope=selectedScopeFieldIds.has(existing.id);
        const existingFingerprint=fieldFingerprint({ tableName:parsedField.tableName,columnName:existing.name,dataType:existing.dataType,nullable:Boolean(existing.nullable),defaultValue:existing.defaultValue,comment:existing.comment,extra:existing.extra });
        // A CREATE snapshot should only revise a field that already exists in
        // the selected project/version/environment scope. A shared canonical
        // field from another scope is merely registered here, not rewritten.
        if (parsedField.action==='modify'||parsedField.action==='change'||(createTableNames.has(parsedField.tableName)&&selectedInScope&&incomingFingerprint!==existingFingerprint)) {
          const targetKey=`${parsedField.tableName}.${parsedField.columnName.toLowerCase()}`;
          const renamedConflict=parsedField.action==='change'&&targetKey!==key&&fieldMap.has(targetKey);
          if (renamedConflict) { conflicts+=1;statements.push(importItem(db,batchId,parsedField,existing.id,'conflict','目标字段名已经存在，未执行重命名。'));continue; }
          if (historical) lifecycleTargets.field.add(existing.id);
          const nextRevision=(revisionMap.get(existing.id)??0)+1;
          const revisionId=`${existing.id}:r${nextRevision}`;
          const incomingDefinition={tableName:parsedField.tableName,columnName:parsedField.columnName,dataType:parsedField.dataType,nullable:parsedField.nullable,defaultValue:parsedField.defaultValue,comment:parsedField.comment,extra:parsedField.extra};
          statements.push(db.prepare(`UPDATE catalog_fields SET name=?,data_type=?,nullable=?,default_value=?,comment=?,extra=?,ordinal=?,source_kind=?,lifecycle_status=?,lifecycle_note=? WHERE id=?`).bind(parsedField.columnName.toLowerCase(),parsedField.dataType,parsedField.nullable?1:0,parsedField.defaultValue,parsedField.comment,parsedField.extra,parsedField.ordinal,sourceKind,lifecycleStatus,lifecycleNote,existing.id));
          statements.push(db.prepare(`INSERT INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(revisionId,existing.id,nextRevision,parsedField.dataType,parsedField.nullable?1:0,parsedField.defaultValue,parsedField.comment,parsedField.extra,parsedField.ordinal,sourceKind,batchId,fieldFingerprint(incomingDefinition),now()));
          environmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`).bind(existing.id,projectId,versionId,environmentId,sourceKind,batchId,now()),db.prepare(`INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) VALUES (?,?,?,?,?)`).bind(existing.id,versionId,environmentId,revisionId,now())));
          revisionMap.set(existing.id,nextRevision);
          statements.push(importItem(db,batchId,parsedField,existing.id,'modified',parsedField.action==='change'?'已更新字段名称和定义，并登记到所选环境。':createTableNames.has(parsedField.tableName)?'已根据建表语句同步字段定义，并登记到所选环境。':'已更新字段定义，并登记到所选环境。',{field:existing}));
          addChange(parsedField,existing.id,'modified');
          fieldMap.delete(key);
          fieldMap.set(targetKey,{...existing,name:parsedField.columnName.toLowerCase(),dataType:parsedField.dataType,nullable:parsedField.nullable?1:0,defaultValue:parsedField.defaultValue,comment:parsedField.comment,extra:parsedField.extra,ordinal:parsedField.ordinal});
          modified+=1;continue;
        }
        if (incomingFingerprint!==existingFingerprint) {
          conflicts+=1; statements.push(importItem(db,batchId,parsedField,existing.id,'conflict','同名字段的定义不同，请选择合并、保留环境差异或标记为独立逻辑字段。',{field:existing})); continue;
        }
        const addsEnvironmentScope=!selectedInScope;
        if (historical) lifecycleTargets.field.add(existing.id);
        if (addsEnvironmentScope) added+=1; else duplicates+=1;
        if (historical) statements.push(db.prepare(`UPDATE catalog_fields SET lifecycle_status=?,lifecycle_note=? WHERE id=?`).bind(lifecycleStatus,lifecycleNote,existing.id));
        const currentRevisionId=`${existing.id}:r${revisionMap.get(existing.id)??1}`;
        environmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`).bind(existing.id,projectId,versionId,environmentId,sourceKind,batchId,now()),db.prepare(`INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) VALUES (?,?,?,?,?)`).bind(existing.id,versionId,environmentId,currentRevisionId,now())));
        markImportedFieldScopesVerified(existing.id);
        statements.push(importItem(db,batchId,parsedField,existing.id,addsEnvironmentScope?'added':'duplicate',addsEnvironmentScope?'字段定义已存在，已补充到所选环境。':'字段已存在，仅补充缺少的环境关系。'));
        selectedScopeFieldIds.add(existing.id); continue;
      }
      if (parsedField.action==='modify'||parsedField.action==='change') {
        conflicts+=1;statements.push(importItem(db,batchId,parsedField,null,'conflict','要修改的原字段不存在，未创建新字段。'));continue;
      }
      const fieldId=id(),code=fieldCode(table.code,fieldCodes);
      if (historical) lifecycleTargets.field.add(fieldId);
      const revisionId=`${fieldId}:r1`;
      statements.push(db.prepare(`INSERT INTO catalog_fields (id,table_id,code,name,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(fieldId,table.id,code,parsedField.columnName.toLowerCase(),parsedField.dataType,parsedField.nullable?1:0,parsedField.defaultValue,parsedField.comment,parsedField.extra,parsedField.ordinal,sourceKind,batchId,now(),lifecycleStatus,lifecycleNote));
      statements.push(db.prepare(`INSERT INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(revisionId,fieldId,1,parsedField.dataType,parsedField.nullable?1:0,parsedField.defaultValue,parsedField.comment,parsedField.extra,parsedField.ordinal,sourceKind,batchId,fieldFingerprint(parsedField),now()));
      environmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`).bind(fieldId,projectId,versionId,environmentId,sourceKind,batchId,now()),db.prepare(`INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) VALUES (?,?,?,?,?)`).bind(fieldId,versionId,environmentId,revisionId,now())));
      statements.push(importItem(db,batchId,parsedField,fieldId,'added','新增字段并应用到所选环境。'));
      addChange(parsedField,fieldId,'added');
      fieldMap.set(`${parsedField.tableName}.${parsedField.columnName.toLowerCase()}`,{id:fieldId,code,name:parsedField.columnName,dataType:parsedField.dataType,nullable:parsedField.nullable?1:0,defaultValue:parsedField.defaultValue,comment:parsedField.comment,extra:parsedField.extra,ordinal:parsedField.ordinal,tableName:parsedField.tableName,tableId:table.id});
      added+=1;
    }
    for (const table of parsed.tables) {
      const incomingNames=new Set(parsed.fields.filter((field)=>field.tableName===table.name&&field.action!=='drop').map((field)=>field.columnName.toLowerCase()));
      for (const existing of fieldRows.results.filter((field)=>field.tableName.toLowerCase()===table.name&&!incomingNames.has(field.name.toLowerCase())&&selectedScopeFieldIds.has(field.id))) {
        const synthetic:ParsedField={action:'drop',tableName:table.name,columnName:existing.name,dataType:'',nullable:true,defaultValue:null,comment:'',extra:'',ordinal:existing.ordinal,statementNo:0};
        const placeholders=environmentIds.map(()=>'?').join(',');
        const priorScopes=await db.prepare(`SELECT field_id AS fieldId,project_id AS projectId,version_id AS versionId,environment_id AS environmentId,state,origin,import_batch_id AS importBatchId,created_at AS createdAt FROM field_scopes WHERE field_id=? AND project_id=? AND version_id=? AND environment_id IN (${placeholders})`).bind(existing.id,projectId,versionId,...environmentIds).all();
        environmentIds.forEach((environmentId)=>statements.push(db.prepare(`DELETE FROM field_scopes WHERE field_id=? AND project_id=? AND version_id=? AND environment_id=?`).bind(existing.id,projectId,versionId,environmentId),db.prepare(`DELETE FROM catalog_field_scope_revisions WHERE field_id=? AND version_id=? AND environment_id=?`).bind(existing.id,versionId,environmentId)));
        statements.push(importItem(db,batchId,synthetic,existing.id,'removed','建表语句中没有该字段，已从所选环境移除字段登记。',{field:existing,scopes:priorScopes.results}));
        addChange(synthetic,existing.id,'removed');
        removed+=1;
      }
    }
    for (const parsedIndex of parsed.indexes) {
      const table=tableMap.get(parsedIndex.tableName);
      if (!table) { conflicts+=1; continue; }
      const key=`${table.id}.${parsedIndex.name.toLowerCase()}`;
      const existing=indexMap.get(key);
      if (parsedIndex.action==='drop') {
        if (existing) {
          environmentIds.forEach((environmentId)=>statements.push(db.prepare(`DELETE FROM catalog_index_scopes WHERE index_id=? AND version_id=? AND environment_id=?`).bind(existing.id,versionId,environmentId)));
          indexMap.delete(key);
        } else duplicates+=1;
        continue;
      }
      const columnsJson=JSON.stringify(parsedIndex.columns);
      const indexId=existing?.id??id();
      if (historical) lifecycleTargets.index.add(indexId);
      if (!existing) statements.push(db.prepare(`INSERT INTO catalog_indexes (id,table_id,name,kind,columns_json,source_kind,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(indexId,table.id,parsedIndex.name,parsedIndex.kind,columnsJson,sourceKind,batchId,now(),lifecycleStatus,lifecycleNote));
      else if (existing.kind!==parsedIndex.kind||existing.columnsJson!==columnsJson||historical) statements.push(db.prepare(`UPDATE catalog_indexes SET kind=?,columns_json=?,source_kind=?,import_batch_id=?,lifecycle_status=?,lifecycle_note=? WHERE id=?`).bind(parsedIndex.kind,columnsJson,sourceKind,batchId,lifecycleStatus,lifecycleNote,existing.id));
      const nextIndexRevision=(indexRevisionMap.get(indexId)??0)+1;
      statements.push(db.prepare(`INSERT INTO catalog_index_revisions (id,index_id,revision,kind,columns_json,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(`${indexId}:r${nextIndexRevision}`,indexId,nextIndexRevision,parsedIndex.kind,columnsJson,sourceKind,batchId,`${parsedIndex.kind}|${columnsJson}`,now()));
      indexRevisionMap.set(indexId,nextIndexRevision);
      environmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR REPLACE INTO catalog_index_scopes VALUES (?,?,?,?, 'present',?,?,?)`).bind(indexId,projectId,versionId,environmentId,sourceKind,batchId,now())));
      indexMap.set(key,{id:indexId,tableId:table.id,name:parsedIndex.name,kind:parsedIndex.kind,columnsJson});
    }
    for (const parsedConstraint of parsed.constraints) {
      const table=tableMap.get(parsedConstraint.tableName); if (!table) { conflicts+=1; continue; }
      const key=`${table.id}.${parsedConstraint.name.toLowerCase()}`; const existing=constraintMap.get(key);
      if (parsedConstraint.action==='drop') { if (existing) environmentIds.forEach((environmentId)=>statements.push(db.prepare(`DELETE FROM catalog_constraint_scopes WHERE constraint_id=? AND version_id=? AND environment_id=?`).bind(existing.id,versionId,environmentId))); else duplicates+=1; continue; }
      const constraintId=existing?.id??id();
      if (historical) lifecycleTargets.constraint.add(constraintId);
      if (!existing) statements.push(db.prepare(`INSERT INTO catalog_constraints (id,table_id,name,kind,definition,source_kind,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(constraintId,table.id,parsedConstraint.name,parsedConstraint.kind,parsedConstraint.definition,sourceKind,batchId,now(),lifecycleStatus,lifecycleNote));
      else if (existing.definition!==parsedConstraint.definition||historical) statements.push(db.prepare(`UPDATE catalog_constraints SET kind=?,definition=?,source_kind=?,import_batch_id=?,lifecycle_status=?,lifecycle_note=? WHERE id=?`).bind(parsedConstraint.kind,parsedConstraint.definition,sourceKind,batchId,lifecycleStatus,lifecycleNote,existing.id));
      const nextConstraintRevision=(constraintRevisionMap.get(constraintId)??0)+1;
      statements.push(db.prepare(`INSERT INTO catalog_constraint_revisions (id,constraint_id,revision,kind,definition,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(`${constraintId}:r${nextConstraintRevision}`,constraintId,nextConstraintRevision,parsedConstraint.kind,parsedConstraint.definition,sourceKind,batchId,`${parsedConstraint.kind}|${parsedConstraint.definition}`,now()));
      constraintRevisionMap.set(constraintId,nextConstraintRevision);
      environmentIds.forEach((environmentId)=>statements.push(db.prepare(`INSERT OR REPLACE INTO catalog_constraint_scopes VALUES (?,?,?,?, 'present',?,?,?)`).bind(constraintId,projectId,versionId,environmentId,sourceKind,batchId,now())));
      constraintMap.set(key,{id:constraintId,tableId:table.id,name:parsedConstraint.name,kind:parsedConstraint.kind,definition:parsedConstraint.definition});
    }
    if (historical) {
      (Object.entries(lifecycleTargets) as [string,Set<string>][]).forEach(([entity,objectIds]) => {
        objectIds.forEach((objectId) => statements.push(db.prepare(`INSERT INTO catalog_object_lifecycles (entity,object_id,project_id,status,note,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(entity,object_id,project_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at`).bind(entity,objectId,projectId,lifecycleStatus,lifecycleNote,now())));
      });
    }
    statements.unshift(db.prepare(`INSERT INTO import_batches (id,code,name,source_kind,file_name,source_path,git_commit,fingerprint,raw_sql,project_id,version_id,module_id,status,added_count,duplicate_count,modified_count,removed_count,conflict_count,created_at,reverted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,NULL)`).bind(batchId,batchCode,clean(payload.name)||clean(payload.fileName)||'SQL 导入',sourceKind,clean(payload.fileName)||null,sourcePath,gitCommit,fingerprint,sql,projectId,versionId,moduleId,added,duplicates,modified,removed,conflicts,now()));
    statements.splice(1,0,...environmentIds.map((environmentId)=>db.prepare(`INSERT OR IGNORE INTO import_batch_environments (batch_id,environment_id) VALUES (?,?)`).bind(batchId,environmentId)));
    statements.splice(1+environmentIds.length,0,...environmentIds.map((environmentId)=>db.prepare(`INSERT INTO catalog_sql_executions (id,import_batch_id,project_id,version_id,environment_id,status,sql_text,source_kind,source_path,git_commit,created_at,started_at,finished_at,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id(),batchId,projectId,versionId,environmentId,createSnapshot?'verified':'registered',sql,sourceKind,sourcePath,gitCommit,now(),createSnapshot?now():null,createSnapshot?now():null,createSnapshot?'初始化快照已确认该环境结构存在。':'等待在该环境执行')));
    await runChunked(db,statements);
    return Response.json({ ok:true,batchCode,added,duplicates,modified,removed,conflicts,warnings:parsed.warnings });
  }

  if (action === 'import.revert') {
    const batchId=clean(payload.id); if (!batchId) return Response.json({ error:'导入批次无效。' },{ status:400 });
    const batch=await db.prepare(`SELECT version_id AS versionId FROM import_batches WHERE id=? AND status='active'`).bind(batchId).first<{versionId:string}>();
    if (!batch) return Response.json({ error:'导入记录不存在或已经撤销。' },{ status:404 });
    const batchEnvironments=(await db.prepare(`SELECT environment_id AS environmentId FROM import_batch_environments WHERE batch_id=?`).bind(batchId).all<{environmentId:string}>()).results;
    const fields=(await db.prepare(`SELECT id FROM catalog_fields WHERE import_batch_id=?`).bind(batchId).all<{id:string}>()).results;
    const items=(await db.prepare(`SELECT action,table_name AS tableName,column_name AS columnName,field_id AS fieldId,result,fingerprint,before_snapshot AS beforeSnapshot FROM import_items WHERE batch_id=? ORDER BY statement_no DESC,id DESC`).bind(batchId).all<{action:string;tableName:string;columnName:string;fieldId:string|null;result:string;fingerprint:string;beforeSnapshot:string|null}>()).results;
    await db.batch([
      db.prepare(`DELETE FROM catalog_field_scope_revisions WHERE EXISTS (SELECT 1 FROM field_scopes fs WHERE fs.field_id=catalog_field_scope_revisions.field_id AND fs.version_id=catalog_field_scope_revisions.version_id AND fs.environment_id=catalog_field_scope_revisions.environment_id AND fs.import_batch_id=?)`).bind(batchId),
      db.prepare(`DELETE FROM field_scopes WHERE import_batch_id=?`).bind(batchId),
      db.prepare(`DELETE FROM table_scopes WHERE import_batch_id=?`).bind(batchId),
    ]);
    let skipped=0;
    for (const item of items) {
      if (!item.beforeSnapshot) continue;
      const snapshot=JSON.parse(item.beforeSnapshot) as {field?:{id:string;name:string;dataType:string;nullable:number;defaultValue:string|null;comment:string;extra:string;ordinal:number};scopes?:{fieldId:string;projectId:string;versionId:string;environmentId:string;state:string;origin:string;importBatchId:string|null;createdAt:string}[]};
      if (item.result==='modified'&&snapshot.field&&item.fieldId) {
        const current=await db.prepare(`SELECT f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,t.name AS tableName FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE f.id=?`).bind(item.fieldId).first<{name:string;dataType:string;nullable:number;defaultValue:string|null;comment:string;extra:string;tableName:string}>();
        const currentFingerprint=current?fieldFingerprint({tableName:current.tableName,columnName:current.name,dataType:current.dataType,nullable:Boolean(current.nullable),defaultValue:current.defaultValue,comment:current.comment,extra:current.extra}):'';
        if (currentFingerprint===item.fingerprint) {
          await db.prepare(`UPDATE catalog_fields SET name=?,data_type=?,nullable=?,default_value=?,comment=?,extra=?,ordinal=? WHERE id=?`).bind(snapshot.field.name,snapshot.field.dataType,snapshot.field.nullable,snapshot.field.defaultValue,snapshot.field.comment,snapshot.field.extra,snapshot.field.ordinal,item.fieldId).run();
          const nextRevision=Number((await db.prepare(`SELECT coalesce(max(revision),0)+1 AS next FROM catalog_field_revisions WHERE field_id=?`).bind(item.fieldId).first<{next:number}>())?.next??1);
          const revisionId=`${item.fieldId}:r${nextRevision}`;
          await db.prepare(`INSERT INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,'revert',NULL,?,?)`).bind(revisionId,item.fieldId,nextRevision,snapshot.field.dataType,snapshot.field.nullable,snapshot.field.defaultValue,snapshot.field.comment,snapshot.field.extra,snapshot.field.ordinal,fieldFingerprint({tableName:current?.tableName??'',columnName:snapshot.field.name,dataType:snapshot.field.dataType,nullable:Boolean(snapshot.field.nullable),defaultValue:snapshot.field.defaultValue,comment:snapshot.field.comment,extra:snapshot.field.extra}),now()).run();
          await runChunked(db,batchEnvironments.map((environment)=>db.prepare(`INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) SELECT fs.field_id,fs.version_id,fs.environment_id,?,? FROM field_scopes fs WHERE fs.field_id=? AND fs.version_id=? AND fs.environment_id=?`).bind(revisionId,now(),item.fieldId,batch.versionId,environment.environmentId)));
        }
        else skipped+=1;
      }
      if (item.result==='removed'&&snapshot.scopes?.length) {
        await runChunked(db,snapshot.scopes.map((scope)=>db.prepare(`INSERT OR REPLACE INTO field_scopes (field_id,project_id,version_id,environment_id,state,origin,import_batch_id,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(scope.fieldId,scope.projectId,scope.versionId,scope.environmentId,scope.state,scope.origin,scope.importBatchId,scope.createdAt)));
      }
    }
    const statements:D1PreparedStatement[]=[];
    fields.forEach((field)=>statements.push(db.prepare(`DELETE FROM catalog_fields WHERE id=? AND NOT EXISTS (SELECT 1 FROM field_scopes WHERE field_id=?)`).bind(field.id,field.id)));
    statements.push(db.prepare(`DELETE FROM catalog_tables WHERE import_batch_id=? AND NOT EXISTS (SELECT 1 FROM catalog_fields WHERE table_id=catalog_tables.id)`).bind(batchId));
    statements.push(db.prepare(`DELETE FROM catalog_changes WHERE import_batch_id=?`).bind(batchId));
    statements.push(db.prepare(`UPDATE catalog_sql_executions SET status='waived',finished_at=coalesce(finished_at,?),note='对应导入记录已撤销。' WHERE import_batch_id=?`).bind(now(),batchId));
    statements.push(db.prepare(`UPDATE import_batches SET status='reverted',reverted_at=? WHERE id=?`).bind(now(),batchId));
    await runChunked(db,statements); return Response.json({ ok:true,skipped });
  }

  if (action === 'catalog.reset') {
    await db.batch([db.prepare(`DELETE FROM catalog_change_scopes`),db.prepare(`DELETE FROM catalog_changes`),db.prepare(`DELETE FROM catalog_sql_executions`),db.prepare(`DELETE FROM catalog_field_scope_revisions`),db.prepare(`DELETE FROM catalog_field_revisions`),db.prepare(`DELETE FROM catalog_index_revisions`),db.prepare(`DELETE FROM catalog_index_scopes`),db.prepare(`DELETE FROM catalog_constraint_revisions`),db.prepare(`DELETE FROM catalog_constraint_scopes`),db.prepare(`DELETE FROM field_scopes`),db.prepare(`DELETE FROM table_scopes`),db.prepare(`DELETE FROM import_items`),db.prepare(`DELETE FROM import_batch_environments`),db.prepare(`DELETE FROM import_batches`),db.prepare(`DELETE FROM catalog_constraints`),db.prepare(`DELETE FROM catalog_indexes`),db.prepare(`DELETE FROM catalog_fields`),db.prepare(`DELETE FROM catalog_tables`)]);
    return Response.json({ ok:true });
  }

  return Response.json({ error:'未知操作。' },{ status:400 });
}

function importItem(db:D1Database,batchId:string,field:ParsedField,fieldId:string|null,result:string,message:string,beforeSnapshot?:unknown) {
  return db.prepare(`INSERT INTO import_items (id,batch_id,statement_no,action,table_name,column_name,field_id,result,message,fingerprint,before_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id(),batchId,field.statementNo,field.action,field.tableName,field.columnName,fieldId,result,message,fieldFingerprint(field),beforeSnapshot===undefined?null:JSON.stringify(beforeSnapshot));
}
