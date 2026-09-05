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
  await request('environment.save',{projectId,versionId,name:'对照环境',code:'smoke-peer',stage:'development',sortOrder:20});
  const smokeEnvironments=(await catalog()).environments.filter(environment=>environment.projectId===projectId);
  const environmentId=smokeEnvironments.find(environment=>environment.code==='smoke').id;
  const peerEnvironmentId=smokeEnvironments.find(environment=>environment.code==='smoke-peer').id;

  const snapshotSql=`
    CREATE TABLE drifty_smoke_customer (id bigint NOT NULL, name varchar(80));
    CREATE TABLE drifty_smoke_order (id bigint NOT NULL, customer_id bigint NOT NULL);
  `;
  const created=await request('import.sql',{name:'开发环境快照',sql:snapshotSql,importMode:'snapshot',sourceKind:'paste',projectId,versionId,environmentIds:[environmentId]});
  assert.equal(created.added,4);
  const peerSnapshotSql=`
    CREATE TABLE drifty_smoke_customer (id bigint NOT NULL, name varchar(80) COMMENT 'peer');
    CREATE TABLE drifty_smoke_order (id bigint NOT NULL, customer_id bigint NOT NULL);
  `;
  const peerPreview=await request('import.preview',{sql:peerSnapshotSql,importMode:'snapshot',projectId,versionId,environmentIds:[peerEnvironmentId]});
  assert.equal(Number(peerPreview.summary.conflict??0),0);
  assert.equal(Number(peerPreview.summary.modified??0),1);
  const createdPeer=await request('import.sql',{name:'测试环境快照',sql:peerSnapshotSql,importMode:'snapshot',sourceKind:'paste',projectId,versionId,environmentIds:[peerEnvironmentId]});
  assert.equal(createdPeer.added,3);
  assert.equal(createdPeer.conflicts,0);
  assert.equal(createdPeer.modified,1);
  assert.notEqual(created.batchCode,createdPeer.batchCode);
  const releaseAfterSnapshots=await fetch(`${origin}/api/catalog?mode=release&projectId=${projectId}`).then(response=>response.json());
  assert.equal(releaseAfterSnapshots.changes.length,0);
  const snapshotHistory=await request('sql.history',{projectId});
  assert.equal(snapshotHistory.executions.length,2);
  assert.equal(snapshotHistory.executions.every(execution=>execution.status==='verified'),true);
  const snapshots=await fetch(`${origin}/api/catalog?mode=snapshots&projectId=${projectId}`).then(response=>response.json());
  assert.equal(snapshots.snapshots.length,2);
  const tableSearchBeforeChanges=await fetch(`${origin}/api/catalog?mode=search&entity=table&q=drifty_smoke_customer&projectId=${projectId}&limit=20`).then(response=>response.json());
  const customerTableBeforeChanges=tableSearchBeforeChanges.tables.find(table=>table.name==='drifty_smoke_customer');
  const snapshotDiff=await request('scope.compare',{base:{projectId,versionId,environmentId},target:{projectId,versionId,environmentId:peerEnvironmentId},tableId:customerTableBeforeChanges.id});
  assert.equal(snapshotDiff.items.some(item=>item.columnName==='name'&&item.result==='modified'),true);

  const added=await request('import.sql',{name:'添加字段',sql:'ALTER TABLE drifty_smoke_customer ADD COLUMN region varchar(40);',importMode:'executed',sourceKind:'paste',projectId,versionId,environmentIds:[environmentId]});
  assert.equal(added.added,1);
  const releaseAfterAlter=await fetch(`${origin}/api/catalog?mode=release&projectId=${projectId}`).then(response=>response.json());
  assert.equal(releaseAfterAlter.changes.length,1);
  assert.equal(releaseAfterAlter.changes[0].pendingCount,1);
  assert.equal(releaseAfterAlter.changes[0].executedCount,1);
  const verifiedSnapshot=await request('import.sql',{name:'开发环境复核快照',sql:'CREATE TABLE drifty_smoke_customer (id bigint NOT NULL, name varchar(80), region varchar(40));',importMode:'snapshot',sourceKind:'paste',projectId,versionId,environmentIds:[environmentId]});
  assert.equal(verifiedSnapshot.verifiedChanges,1);
  const releaseAfterVerification=await fetch(`${origin}/api/catalog?mode=release&projectId=${projectId}`).then(response=>response.json());
  assert.equal(releaseAfterVerification.changes[0].verifiedCount,1);
  assert.equal(releaseAfterVerification.changes[0].pendingCount,1);
  const projectInsight=await fetch(`${origin}/api/catalog?mode=project&projectId=${projectId}`).then(response=>response.json());
  const peerCoverage=projectInsight.coverage.find(item=>item.environmentId===peerEnvironmentId);
  assert.equal(Number(peerCoverage.expectedCount)-Number(peerCoverage.presentCount),1);
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
  const historyAfterRevert=await request('sql.history',{projectId});
  assert.equal(historyAfterRevert.executions.find(execution=>execution.importBatchId===imports.find(batch=>batch.code===modified.batchCode).id).status,'waived');
  console.log(JSON.stringify({created,createdPeer,releaseAfterSnapshots:releaseAfterSnapshots.changes.length,releaseAfterAlter:releaseAfterAlter.changes.length,coverageGap:Number(peerCoverage.expectedCount)-Number(peerCoverage.presentCount),added,modified,changed,removed,search:{total:first.total,page1:first.fields.length,page2:second.fields.length,tables:tableSearch.total},revert:'ok'}));
} finally {
  if(projectId)await request('entity.delete',{entity:'project',id:projectId});
}
