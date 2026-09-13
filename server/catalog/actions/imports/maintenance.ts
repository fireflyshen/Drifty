import { clean, now, runChunked } from "@/server/catalog/shared";
import { fieldFingerprint } from "@/app/lib/mysql-parser";
import type { CatalogActionContext } from "@/server/catalog/actions/context";

/** 回滚导入批次，或在用户确认后清空结构目录数据。 */
export async function handleImportMaintenanceAction({
  action,
  payload,
  db,
}: CatalogActionContext): Promise<Response | null> {
  if (action === "import.revert") {
    const batchId = clean(payload.id);
    if (!batchId)
      return Response.json({ error: "导入批次无效。" }, { status: 400 });
    const batch = await db
      .prepare(
        `SELECT version_id AS versionId FROM import_batches WHERE id=? AND status='active'`,
      )
      .bind(batchId)
      .first<{ versionId: string }>();
    if (!batch)
      return Response.json(
        { error: "导入记录不存在或已经撤销。" },
        { status: 404 },
      );
    const batchEnvironments = (
      await db
        .prepare(
          `SELECT environment_id AS environmentId FROM import_batch_environments WHERE batch_id=?`,
        )
        .bind(batchId)
        .all<{ environmentId: string }>()
    ).results;
    const fields = (
      await db
        .prepare(`SELECT id FROM catalog_fields WHERE import_batch_id=?`)
        .bind(batchId)
        .all<{ id: string }>()
    ).results;
    const items = (
      await db
        .prepare(
          `SELECT action,table_name AS tableName,column_name AS columnName,field_id AS fieldId,result,fingerprint,before_snapshot AS beforeSnapshot FROM import_items WHERE batch_id=? ORDER BY statement_no DESC,id DESC`,
        )
        .bind(batchId)
        .all<{
          action: string;
          tableName: string;
          columnName: string;
          fieldId: string | null;
          result: string;
          fingerprint: string;
          beforeSnapshot: string | null;
        }>()
    ).results;
    await db.batch([
      db
        .prepare(
          `DELETE FROM catalog_field_scope_revisions WHERE EXISTS (SELECT 1 FROM field_scopes fs WHERE fs.field_id=catalog_field_scope_revisions.field_id AND fs.version_id=catalog_field_scope_revisions.version_id AND fs.environment_id=catalog_field_scope_revisions.environment_id AND fs.import_batch_id=?)`,
        )
        .bind(batchId),
      db
        .prepare(`DELETE FROM field_scopes WHERE import_batch_id=?`)
        .bind(batchId),
      db
        .prepare(`DELETE FROM table_scopes WHERE import_batch_id=?`)
        .bind(batchId),
    ]);
    let skipped = 0;
    for (const item of items) {
      if (!item.beforeSnapshot) continue;
      const snapshot = JSON.parse(item.beforeSnapshot) as {
        field?: {
          id: string;
          name: string;
          dataType: string;
          nullable: number;
          defaultValue: string | null;
          comment: string;
          extra: string;
          ordinal: number;
        };
        scopes?: {
          fieldId: string;
          projectId: string;
          versionId: string;
          environmentId: string;
          state: string;
          origin: string;
          importBatchId: string | null;
          createdAt: string;
        }[];
      };
      if (item.result === "modified" && snapshot.field && item.fieldId) {
        const current = await db
          .prepare(
            `SELECT f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,t.name AS tableName FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE f.id=?`,
          )
          .bind(item.fieldId)
          .first<{
            name: string;
            dataType: string;
            nullable: number;
            defaultValue: string | null;
            comment: string;
            extra: string;
            tableName: string;
          }>();
        const currentFingerprint = current
          ? fieldFingerprint({
              tableName: current.tableName,
              columnName: current.name,
              dataType: current.dataType,
              nullable: Boolean(current.nullable),
              defaultValue: current.defaultValue,
              comment: current.comment,
              extra: current.extra,
            })
          : "";
        if (currentFingerprint === item.fingerprint) {
          await db
            .prepare(
              `UPDATE catalog_fields SET name=?,data_type=?,nullable=?,default_value=?,comment=?,extra=?,ordinal=? WHERE id=?`,
            )
            .bind(
              snapshot.field.name,
              snapshot.field.dataType,
              snapshot.field.nullable,
              snapshot.field.defaultValue,
              snapshot.field.comment,
              snapshot.field.extra,
              snapshot.field.ordinal,
              item.fieldId,
            )
            .run();
          const nextRevision = Number(
            (
              await db
                .prepare(
                  `SELECT coalesce(max(revision),0)+1 AS next FROM catalog_field_revisions WHERE field_id=?`,
                )
                .bind(item.fieldId)
                .first<{ next: number }>()
            )?.next ?? 1,
          );
          const revisionId = `${item.fieldId}:r${nextRevision}`;
          await db
            .prepare(
              `INSERT INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,'revert',NULL,?,?)`,
            )
            .bind(
              revisionId,
              item.fieldId,
              nextRevision,
              snapshot.field.dataType,
              snapshot.field.nullable,
              snapshot.field.defaultValue,
              snapshot.field.comment,
              snapshot.field.extra,
              snapshot.field.ordinal,
              fieldFingerprint({
                tableName: current?.tableName ?? "",
                columnName: snapshot.field.name,
                dataType: snapshot.field.dataType,
                nullable: Boolean(snapshot.field.nullable),
                defaultValue: snapshot.field.defaultValue,
                comment: snapshot.field.comment,
                extra: snapshot.field.extra,
              }),
              now(),
            )
            .run();
          await runChunked(
            db,
            batchEnvironments.map((environment) =>
              db
                .prepare(
                  `INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) SELECT fs.field_id,fs.version_id,fs.environment_id,?,? FROM field_scopes fs WHERE fs.field_id=? AND fs.version_id=? AND fs.environment_id=?`,
                )
                .bind(
                  revisionId,
                  now(),
                  item.fieldId,
                  batch.versionId,
                  environment.environmentId,
                ),
            ),
          );
        } else skipped += 1;
      }
      if (item.result === "removed" && snapshot.scopes?.length) {
        await runChunked(
          db,
          snapshot.scopes.map((scope) =>
            db
              .prepare(
                `INSERT OR REPLACE INTO field_scopes (field_id,project_id,version_id,environment_id,state,origin,import_batch_id,created_at) VALUES (?,?,?,?,?,?,?,?)`,
              )
              .bind(
                scope.fieldId,
                scope.projectId,
                scope.versionId,
                scope.environmentId,
                scope.state,
                scope.origin,
                scope.importBatchId,
                scope.createdAt,
              ),
          ),
        );
      }
    }
    const statements: D1PreparedStatement[] = [];
    fields.forEach((field) =>
      statements.push(
        db
          .prepare(
            `DELETE FROM catalog_fields WHERE id=? AND NOT EXISTS (SELECT 1 FROM field_scopes WHERE field_id=?)`,
          )
          .bind(field.id, field.id),
      ),
    );
    statements.push(
      db
        .prepare(`DELETE FROM catalog_snapshots WHERE import_batch_id=?`)
        .bind(batchId),
    );
    statements.push(
      db
        .prepare(
          `DELETE FROM catalog_tables WHERE import_batch_id=? AND NOT EXISTS (SELECT 1 FROM catalog_fields WHERE table_id=catalog_tables.id)`,
        )
        .bind(batchId),
    );
    statements.push(
      db
        .prepare(`DELETE FROM catalog_changes WHERE import_batch_id=?`)
        .bind(batchId),
    );
    statements.push(
      db
        .prepare(
          `UPDATE catalog_sql_executions SET status='waived',finished_at=coalesce(finished_at,?),note='对应导入记录已撤销。' WHERE import_batch_id=?`,
        )
        .bind(now(), batchId),
    );
    statements.push(
      db
        .prepare(
          `UPDATE import_batches SET status='reverted',reverted_at=? WHERE id=?`,
        )
        .bind(now(), batchId),
    );
    await runChunked(db, statements);
    return Response.json({ ok: true, skipped });
  }

  if (action === "catalog.reset") {
    await db.batch([
      db.prepare(`DELETE FROM catalog_snapshot_objects`),
      db.prepare(`DELETE FROM catalog_snapshots`),
      db.prepare(`DELETE FROM catalog_change_scopes`),
      db.prepare(`DELETE FROM catalog_changes`),
      db.prepare(`DELETE FROM catalog_sql_executions`),
      db.prepare(`DELETE FROM catalog_field_scope_revisions`),
      db.prepare(`DELETE FROM catalog_field_revisions`),
      db.prepare(`DELETE FROM catalog_index_revisions`),
      db.prepare(`DELETE FROM catalog_index_scopes`),
      db.prepare(`DELETE FROM catalog_constraint_revisions`),
      db.prepare(`DELETE FROM catalog_constraint_scopes`),
      db.prepare(`DELETE FROM field_scopes`),
      db.prepare(`DELETE FROM table_scopes`),
      db.prepare(`DELETE FROM import_items`),
      db.prepare(`DELETE FROM import_batch_environments`),
      db.prepare(`DELETE FROM import_batches`),
      db.prepare(`DELETE FROM catalog_constraints`),
      db.prepare(`DELETE FROM catalog_indexes`),
      db.prepare(`DELETE FROM catalog_fields`),
      db.prepare(`DELETE FROM catalog_tables`),
    ]);
    return Response.json({ ok: true });
  }
  return null;
}
