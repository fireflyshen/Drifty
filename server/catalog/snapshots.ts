import { hash, id, now, runChunked } from "@/server/catalog/shared";
import { fieldFingerprint, parseMysqlSql } from "@/app/lib/mysql-parser";

/**
 * 环境结构快照服务。
 *
 * captureEnvironmentSnapshot 保存某个项目/版本/环境的不可变完整快照；
 * latestSnapshotObjects 读取该范围最新一次快照；
 * verifyChangesAgainstSnapshot 用对象指纹核验待执行或已执行变更，并更新环境状态。
 */
export type SnapshotObjectRow = {
  entity: string;
  objectKey: string;
  objectId: string | null;
  revisionId: string | null;
  fingerprint: string;
  definitionJson: string;
};

export async function captureEnvironmentSnapshot(
  db: D1Database,
  input: {
    projectId: string;
    versionId: string;
    environmentId: string;
    importBatchId: string;
    sourceKind: string;
  },
) {
  const [tables, fields, indexes, constraints] = await Promise.all([
    db
      .prepare(
        `SELECT t.id,t.name,t.code,t.comment FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' ORDER BY t.name`,
      )
      .bind(input.projectId, input.versionId, input.environmentId)
      .all<{ id: string; name: string; code: string; comment: string }>(),
    db
      .prepare(
        `SELECT f.id,f.code,f.name,t.name AS tableName,csr.revision_id AS revisionId,
      coalesce(fr.data_type,f.data_type) AS dataType,coalesce(fr.nullable,f.nullable) AS nullable,
      CASE WHEN fr.id IS NULL THEN f.default_value ELSE fr.default_value END AS defaultValue,
      coalesce(fr.comment,f.comment) AS comment,coalesce(fr.extra,f.extra) AS extra,coalesce(fr.ordinal,f.ordinal) AS ordinal
      FROM field_scopes s JOIN catalog_fields f ON f.id=s.field_id JOIN catalog_tables t ON t.id=f.table_id
      LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=s.field_id AND csr.version_id=s.version_id AND csr.environment_id=s.environment_id
      LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id
      WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' ORDER BY t.name,coalesce(fr.ordinal,f.ordinal),f.name`,
      )
      .bind(input.projectId, input.versionId, input.environmentId)
      .all<{
        id: string;
        code: string;
        name: string;
        tableName: string;
        revisionId: string | null;
        dataType: string;
        nullable: number;
        defaultValue: string | null;
        comment: string;
        extra: string;
        ordinal: number;
      }>(),
    db
      .prepare(
        `SELECT i.id,i.name,i.kind,i.columns_json AS columnsJson,t.name AS tableName FROM catalog_index_scopes s JOIN catalog_indexes i ON i.id=s.index_id JOIN catalog_tables t ON t.id=i.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' ORDER BY t.name,i.name`,
      )
      .bind(input.projectId, input.versionId, input.environmentId)
      .all<{
        id: string;
        name: string;
        kind: string;
        columnsJson: string;
        tableName: string;
      }>(),
    db
      .prepare(
        `SELECT c.id,c.name,c.kind,c.definition,t.name AS tableName FROM catalog_constraint_scopes s JOIN catalog_constraints c ON c.id=s.constraint_id JOIN catalog_tables t ON t.id=c.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' ORDER BY t.name,c.name`,
      )
      .bind(input.projectId, input.versionId, input.environmentId)
      .all<{
        id: string;
        name: string;
        kind: string;
        definition: string;
        tableName: string;
      }>(),
  ]);
  const objects: {
    entity: string;
    objectKey: string;
    objectId: string | null;
    revisionId: string | null;
    fingerprint: string;
    definitionJson: string;
  }[] = [];
  for (const table of tables.results) {
    const definition = {
      name: table.name,
      code: table.code,
      comment: table.comment,
    };
    objects.push({
      entity: "table",
      objectKey: table.name.toLowerCase(),
      objectId: table.id,
      revisionId: null,
      fingerprint: await hash(JSON.stringify(definition)),
      definitionJson: JSON.stringify(definition),
    });
  }
  for (const field of fields.results) {
    const definition = {
      code: field.code,
      name: field.name,
      tableName: field.tableName,
      dataType: field.dataType,
      nullable: Boolean(field.nullable),
      defaultValue: field.defaultValue,
      comment: field.comment,
      extra: field.extra,
      ordinal: field.ordinal,
    };
    objects.push({
      entity: "field",
      objectKey: `${field.tableName}.${field.name}`.toLowerCase(),
      objectId: field.id,
      revisionId: field.revisionId,
      fingerprint: fieldFingerprint({
        tableName: field.tableName,
        columnName: field.name,
        dataType: field.dataType,
        nullable: Boolean(field.nullable),
        defaultValue: field.defaultValue,
        comment: field.comment,
        extra: field.extra,
      }),
      definitionJson: JSON.stringify(definition),
    });
  }
  for (const index of indexes.results) {
    const definition = {
      name: index.name,
      tableName: index.tableName,
      kind: index.kind,
      columnsJson: index.columnsJson,
    };
    objects.push({
      entity: "index",
      objectKey: `${index.tableName}.${index.name}`.toLowerCase(),
      objectId: index.id,
      revisionId: null,
      fingerprint: `${index.kind}|${index.columnsJson}`,
      definitionJson: JSON.stringify(definition),
    });
  }
  for (const constraint of constraints.results) {
    const definition = {
      name: constraint.name,
      tableName: constraint.tableName,
      kind: constraint.kind,
      definition: constraint.definition,
    };
    objects.push({
      entity: "constraint",
      objectKey: `${constraint.tableName}.${constraint.name}`.toLowerCase(),
      objectId: constraint.id,
      revisionId: null,
      fingerprint: `${constraint.kind}|${constraint.definition}`,
      definitionJson: JSON.stringify(definition),
    });
  }
  const snapshotId = id();
  const stamp = now();
  const code = `SNP-${stamp.slice(0, 10).replaceAll("-", "")}-${snapshotId.slice(0, 8).toUpperCase()}`;
  const fingerprint = await hash(
    objects
      .map((item) => `${item.entity}|${item.objectKey}|${item.fingerprint}`)
      .sort()
      .join("\n"),
  );
  await runChunked(db, [
    db
      .prepare(
        `INSERT INTO catalog_snapshots (id,code,project_id,version_id,environment_id,import_batch_id,fingerprint,source_kind,captured_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        snapshotId,
        code,
        input.projectId,
        input.versionId,
        input.environmentId,
        input.importBatchId,
        fingerprint,
        input.sourceKind,
        stamp,
      ),
    ...objects.map((item) =>
      db
        .prepare(
          `INSERT INTO catalog_snapshot_objects (snapshot_id,entity,object_key,object_id,revision_id,fingerprint,definition_json) VALUES (?,?,?,?,?,?,?)`,
        )
        .bind(
          snapshotId,
          item.entity,
          item.objectKey,
          item.objectId,
          item.revisionId,
          item.fingerprint,
          item.definitionJson,
        ),
    ),
  ]);
  return { id: snapshotId, code, fingerprint, objectCount: objects.length };
}

export async function latestSnapshotObjects(
  db: D1Database,
  scope: { projectId: string; versionId: string; environmentId: string },
) {
  const snapshot = await db
    .prepare(
      `SELECT id,code,captured_at AS capturedAt FROM catalog_snapshots WHERE project_id=? AND version_id=? AND environment_id=? ORDER BY captured_at DESC LIMIT 1`,
    )
    .bind(scope.projectId, scope.versionId, scope.environmentId)
    .first<{ id: string; code: string; capturedAt: string }>();
  if (!snapshot) return null;
  const rows = (
    await db
      .prepare(
        `SELECT entity,object_key AS objectKey,object_id AS objectId,revision_id AS revisionId,fingerprint,definition_json AS definitionJson FROM catalog_snapshot_objects WHERE snapshot_id=? ORDER BY entity,object_key`,
      )
      .bind(snapshot.id)
      .all<SnapshotObjectRow>()
  ).results;
  return { snapshot, rows };
}

export async function verifyChangesAgainstSnapshot(
  db: D1Database,
  scope: { projectId: string; versionId: string; environmentId: string },
) {
  const snapshot = await latestSnapshotObjects(db, scope);
  if (!snapshot) return 0;
  const objects = new Map(
    snapshot.rows.map((row) => [`${row.entity}|${row.objectKey}`, row]),
  );
  const changes = (
    await db
      .prepare(
        `SELECT c.id,c.import_batch_id AS importBatchId,c.action,c.table_name AS tableName,c.field_name AS fieldName,c.sql_text AS sqlText
    FROM catalog_changes c JOIN catalog_change_scopes cs ON cs.change_id=c.id
    LEFT JOIN import_batches b ON b.id=c.import_batch_id
    WHERE c.project_id=? AND c.version_id=? AND cs.environment_id=? AND cs.status IN ('pending','executed')
      AND (c.import_batch_id IS NULL OR coalesce(b.import_mode,'executed')<>'snapshot')`,
      )
      .bind(scope.projectId, scope.versionId, scope.environmentId)
      .all<{
        id: string;
        importBatchId: string | null;
        action: string;
        tableName: string;
        fieldName: string;
        sqlText: string;
      }>()
  ).results;
  const parsedCache = new Map<string, ReturnType<typeof parseMysqlSql>>();
  const statements: D1PreparedStatement[] = [];
  const batchIds = new Set<string>();
  for (const change of changes) {
    const parsed =
      parsedCache.get(change.sqlText) ?? parseMysqlSql(change.sqlText);
    parsedCache.set(change.sqlText, parsed);
    const action = change.action.toLowerCase();
    const tableName = change.tableName.toLowerCase();
    let matches = false;
    if (action.endsWith("_index")) {
      const objectName = change.fieldName
        .replace(/^索引\s*·\s*/, "")
        .toLowerCase();
      const actual = objects.get(`index|${tableName}.${objectName}`);
      const expected = parsed.indexes.find(
        (item) =>
          item.tableName.toLowerCase() === tableName &&
          item.name.toLowerCase() === objectName,
      );
      matches = action.startsWith("drop")
        ? !actual
        : Boolean(
            actual &&
            expected &&
            actual.fingerprint ===
              `${expected.kind}|${JSON.stringify(expected.columns)}`,
          );
    } else if (action.endsWith("_constraint")) {
      const objectName = change.fieldName
        .replace(/^约束\s*·\s*/, "")
        .toLowerCase();
      const actual = objects.get(`constraint|${tableName}.${objectName}`);
      const expected = parsed.constraints.find(
        (item) =>
          item.tableName.toLowerCase() === tableName &&
          item.name.toLowerCase() === objectName,
      );
      matches = action.startsWith("drop")
        ? !actual
        : Boolean(
            actual &&
            expected &&
            actual.fingerprint === `${expected.kind}|${expected.definition}`,
          );
    } else {
      const fieldName = change.fieldName.toLowerCase();
      const actual = objects.get(`field|${tableName}.${fieldName}`);
      const expected = parsed.fields.find(
        (item) =>
          item.tableName.toLowerCase() === tableName &&
          item.columnName.toLowerCase() === fieldName,
      );
      matches =
        action === "drop"
          ? !actual
          : Boolean(
              actual &&
              expected &&
              actual.fingerprint === fieldFingerprint(expected),
            );
    }
    if (matches) {
      const stamp = now();
      statements.push(
        db
          .prepare(
            `UPDATE catalog_change_scopes SET status='verified',executed_at=coalesce(executed_at,?),verified_at=?,note='已由环境结构快照核验' WHERE change_id=? AND environment_id=?`,
          )
          .bind(stamp, stamp, change.id, scope.environmentId),
      );
      if (change.importBatchId) batchIds.add(change.importBatchId);
    }
  }
  if (statements.length) await runChunked(db, statements);
  for (const batchId of batchIds) {
    const unfinished = await db
      .prepare(
        `SELECT count(*) AS count FROM catalog_changes c JOIN catalog_change_scopes cs ON cs.change_id=c.id WHERE c.import_batch_id=? AND cs.environment_id=? AND cs.status NOT IN ('verified','waived')`,
      )
      .bind(batchId, scope.environmentId)
      .first<{ count: number }>();
    if (Number(unfinished?.count ?? 0) === 0)
      await db
        .prepare(
          `UPDATE catalog_sql_executions SET status='verified',finished_at=?,note='已由环境结构快照核验' WHERE import_batch_id=? AND environment_id=?`,
        )
        .bind(now(), batchId, scope.environmentId)
        .run();
  }
  return statements.length;
}
