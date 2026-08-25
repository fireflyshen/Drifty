import assert from 'node:assert/strict';

const origin='http://localhost:3000';
const request=async(action,payload={})=>{
  const response=await fetch(`${origin}/api/catalog`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,payload})});
  const result=await response.json();
  if(!response.ok)throw new Error(`${action}: ${result.error??response.status}`);
  return result;
};
const catalog=async()=>fetch(`${origin}/api/catalog`).then(response=>response.json());

let projectId='';
try {
  await request('project.save',{name:'Drifty SQL Smoke',code:'DRIFTY_SQL_SMOKE',kind:'project',icon:'flask'});
  projectId=(await catalog()).projects.find(project=>project.code==='DRIFTY_SQL_SMOKE').id;
  await request('version.save',{projectId,name:'smoke-1'});
  const versionId=(await catalog()).versions.find(version=>version.projectId===projectId&&version.name==='smoke-1').id;
  await request('environment.save',{projectId,versionId,name:'验证环境',code:'smoke',stage:'testing',sortOrder:10});
  const environmentId=(await catalog()).environments.find(environment=>environment.projectId===projectId&&environment.code==='smoke').id;

  const created=await request('import.sql',{name:'多表建表',sql:`
    CREATE TABLE drifty_smoke_customer (id bigint NOT NULL, name varchar(80));
    CREATE TABLE drifty_smoke_order (id bigint NOT NULL, customer_id bigint NOT NULL);
  `,sourceKind:'paste',projectId,versionId,environmentIds:[environmentId]});
  assert.equal(created.added,4);

  const added=await request('import.sql',{name:'添加字段',sql:'ALTER TABLE drifty_smoke_customer ADD COLUMN region varchar(40);',sourceKind:'paste',projectId,versionId,environmentIds:[environmentId]});
  assert.equal(added.added,1);
  const modified=await request('import.sql',{name:'修改字段',sql:'ALTER TABLE drifty_smoke_customer MODIFY COLUMN name varchar(120) NOT NULL;',sourceKind:'paste',projectId,versionId,environmentIds:[environmentId]});
  assert.equal(modified.modified,1);
  const changed=await request('import.sql',{name:'重命名字段',sql:'ALTER TABLE drifty_smoke_customer CHANGE COLUMN region area varchar(50);',sourceKind:'paste',projectId,versionId,environmentIds:[environmentId]});
  assert.equal(changed.modified,1);
  const removed=await request('import.sql',{name:'删除字段',sql:'ALTER TABLE drifty_smoke_customer DROP COLUMN area;',sourceKind:'paste',projectId,versionId,environmentIds:[environmentId]});
  assert.equal(removed.removed,1);

  const first=await fetch(`${origin}/api/catalog?mode=search&q=drifty_smoke&projectId=${projectId}&limit=2&offset=0`).then(response=>response.json());
  assert.equal(first.fields.length,2);
  assert.equal(first.hasMore,true);
  const second=await fetch(`${origin}/api/catalog?mode=search&q=drifty_smoke&projectId=${projectId}&limit=2&offset=2`).then(response=>response.json());
  assert.ok(second.fields.length>=1);
  const tableSearch=await fetch(`${origin}/api/catalog?mode=search&entity=table&q=drifty_smoke&limit=20`).then(response=>response.json());
  assert.equal(tableSearch.total,2);
  assert.equal(tableSearch.tableScopes.filter(scope=>scope.environmentId===environmentId).length,2);
  const customerTable=tableSearch.tables.find(table=>table.name==='drifty_smoke_customer');
  const tableDetail=await fetch(`${origin}/api/catalog?mode=table&tableId=${customerTable.id}`).then(response=>response.json());
  assert.equal(tableDetail.tableScopes.some(scope=>scope.environmentId===environmentId),true);
  assert.ok(tableDetail.fields.length>=2);
  const imports=(await catalog()).imports;
  await request('import.revert',{id:imports.find(batch=>batch.code===removed.batchCode).id});
  const restoredArea=await fetch(`${origin}/api/catalog?mode=search&q=drifty_smoke_customer.area&environmentId=${environmentId}`).then(response=>response.json());
  assert.equal(restoredArea.total,1);
  await request('import.revert',{id:imports.find(batch=>batch.code===changed.batchCode).id});
  const restoredRegion=await fetch(`${origin}/api/catalog?mode=search&q=drifty_smoke_customer.region&environmentId=${environmentId}`).then(response=>response.json());
  assert.equal(restoredRegion.total,1);
  await request('import.revert',{id:imports.find(batch=>batch.code===modified.batchCode).id});
  const restoredName=await fetch(`${origin}/api/catalog?mode=search&q=drifty_smoke_customer.name&environmentId=${environmentId}`).then(response=>response.json());
  assert.equal(restoredName.fields[0].dataType,'varchar(80)');
  console.log(JSON.stringify({created,added,modified,changed,removed,search:{total:first.total,page1:first.fields.length,page2:second.fields.length,tables:tableSearch.total},revert:'ok'}));
} finally {
  if(projectId)await request('entity.delete',{entity:'project',id:projectId});
}
