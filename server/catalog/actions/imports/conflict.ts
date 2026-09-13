import { clean, now, runChunked } from "@/server/catalog/shared";
import { fieldFingerprint, parseMysqlSql } from "@/app/lib/mysql-parser";
import type { CatalogActionContext } from "@/server/catalog/actions/context";

/** 保存字段冲突的人工决议，并维护对应范围修订。 */
export async function handleImportConflictAction({
  action,
  payload,
  db,
}: CatalogActionContext): Promise<Response | null> {
  if (action === "import.conflict.resolve") {
    type ConflictRow = {
      id: string;
      batchId: string;
      statementNo: number;
      tableName: string;
      columnName: string;
      fieldId: string | null;
      rawSql: string;
      projectId: string;
      versionId: string;
      sourceKind: string;
    };
    type ExistingField = {
      id: string;
      name: string;
      tableName: string;
      dataType: string;
      nullable: number;
      defaultValue: string | null;
      comment: string;
      extra: string;
      ordinal: number;
    };
    const batchId = clean(payload.batchId),
      itemId = clean(payload.itemId),
      resolution = clean(payload.resolution);
    const metadataOnly = payload.metadataOnly === true;
    if (
      !batchId ||
      !["same", "variant", "separate"].includes(resolution) ||
      (metadataOnly && resolution !== "same")
    )
      return Response.json(
        { error: "请选择要处理的冲突和处理方式。" },
        { status: 400 },
      );
    const rows = (
      await db
        .prepare(
          `SELECT ii.id,ii.batch_id AS batchId,ii.statement_no AS statementNo,ii.table_name AS tableName,ii.column_name AS columnName,ii.field_id AS fieldId,
      b.raw_sql AS rawSql,b.project_id AS projectId,b.version_id AS versionId,b.source_kind AS sourceKind
      FROM import_items ii JOIN import_batches b ON b.id=ii.batch_id
      WHERE ii.batch_id=? AND ii.result='conflict' AND (?='' OR ii.id=?) ORDER BY ii.statement_no,ii.id`,
        )
        .bind(batchId, itemId, itemId)
        .all<ConflictRow>()
    ).results;
    if (!rows.length)
      return Response.json(
        { error: "没有找到可处理的冲突。" },
        { status: 404 },
      );
    const parsed = parseMysqlSql(rows[0].rawSql);
    const environments = (
      await db
        .prepare(
          `SELECT environment_id AS environmentId FROM import_batch_environments WHERE batch_id=?`,
        )
        .bind(batchId)
        .all<{ environmentId: string }>()
    ).results;
    if (!environments.length)
      return Response.json(
        { error: "这次导入没有关联环境。" },
        { status: 400 },
      );
    const statements: D1PreparedStatement[] = [];
    let resolved = 0,
      duplicates = 0,
      modified = 0;
    for (const row of rows) {
      if (!row.fieldId) continue;
      const incoming = parsed.fields.find(
        (field) =>
          field.statementNo === row.statementNo &&
          field.tableName.toLowerCase() === row.tableName.toLowerCase() &&
          field.columnName.toLowerCase() === row.columnName.toLowerCase(),
      );
      const existing = await db
        .prepare(
          `SELECT f.id,f.name,t.name AS tableName,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,f.ordinal
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE f.id=?`,
        )
        .bind(row.fieldId)
        .first<ExistingField>();
      if (!incoming || !existing) continue;
      const structuralMatch =
        existing.dataType.toLowerCase() === incoming.dataType.toLowerCase() &&
        Boolean(existing.nullable) === incoming.nullable &&
        (existing.defaultValue ?? null) === (incoming.defaultValue ?? null) &&
        (existing.extra ?? "").trim() === (incoming.extra ?? "").trim();
      const onlyDescriptionDiff =
        structuralMatch &&
        (existing.comment ?? "").trim() !== (incoming.comment ?? "").trim();
      if (metadataOnly && !onlyDescriptionDiff) continue;
      let revisionId = "";
      if (resolution === "same") {
        const scopedRevision = await db
          .prepare(
            `SELECT csr.revision_id AS revisionId FROM catalog_field_scope_revisions csr JOIN field_scopes fs ON fs.field_id=csr.field_id AND fs.version_id=csr.version_id AND fs.environment_id=csr.environment_id
          WHERE csr.field_id=? AND fs.project_id=? AND fs.version_id=? ORDER BY csr.updated_at DESC LIMIT 1`,
          )
          .bind(existing.id, row.projectId, row.versionId)
          .first<{ revisionId: string }>();
        const latestRevision =
          scopedRevision ??
          (await db
            .prepare(
              `SELECT id AS revisionId FROM catalog_field_revisions WHERE field_id=? ORDER BY revision DESC LIMIT 1`,
            )
            .bind(existing.id)
            .first<{ revisionId: string }>());
        revisionId = latestRevision?.revisionId ?? "";
      } else {
        const fingerprint = fieldFingerprint(incoming);
        const matchingRevision = await db
          .prepare(
            `SELECT id AS revisionId FROM catalog_field_revisions WHERE field_id=? AND fingerprint=? ORDER BY revision DESC LIMIT 1`,
          )
          .bind(existing.id, fingerprint)
          .first<{ revisionId: string }>();
        if (matchingRevision) revisionId = matchingRevision.revisionId;
        else {
          const nextRevision = Number(
            (
              await db
                .prepare(
                  `SELECT coalesce(max(revision),0)+1 AS next FROM catalog_field_revisions WHERE field_id=?`,
                )
                .bind(existing.id)
                .first<{ next: number }>()
            )?.next ?? 1,
          );
          revisionId = `${existing.id}:r${nextRevision}`;
          statements.push(
            db
              .prepare(
                `INSERT INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              )
              .bind(
                revisionId,
                existing.id,
                nextRevision,
                incoming.dataType,
                incoming.nullable ? 1 : 0,
                incoming.defaultValue,
                incoming.comment,
                incoming.extra,
                incoming.ordinal,
                row.sourceKind,
                batchId,
                fingerprint,
                now(),
              ),
          );
        }
      }
      if (!revisionId) continue;
      const reviewStatus = resolution === "variant" ? "pending" : "confirmed";
      const note =
        resolution === "same"
          ? "已视为同一字段并采用已有定义。"
          : resolution === "variant"
            ? "已保留当前环境定义，等待人工核对。"
            : "已保留当前环境定义，并标记为独立逻辑字段。";
      environments.forEach(({ environmentId }) => {
        statements.push(
          db
            .prepare(
              `INSERT OR REPLACE INTO field_scopes (field_id,project_id,version_id,environment_id,state,origin,import_batch_id,created_at) VALUES (?,?,?,?, 'present',?,?,?)`,
            )
            .bind(
              existing.id,
              row.projectId,
              row.versionId,
              environmentId,
              "conflict-resolution",
              batchId,
              now(),
            ),
        );
        statements.push(
          db
            .prepare(
              `INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,resolution_kind,review_status,resolution_note,import_item_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              existing.id,
              row.versionId,
              environmentId,
              revisionId,
              resolution,
              reviewStatus,
              note,
              row.id,
              now(),
            ),
        );
      });
      statements.push(
        db
          .prepare(`UPDATE import_items SET result=?,message=? WHERE id=?`)
          .bind(resolution === "same" ? "duplicate" : "modified", note, row.id),
      );
      resolved += 1;
      if (resolution === "same") duplicates += 1;
      else modified += 1;
    }
    if (!resolved)
      return Response.json(
        {
          error: metadataOnly
            ? "没有仅说明不同的冲突。"
            : "冲突无法自动匹配原始字段。",
        },
        { status: 400 },
      );
    statements.push(
      db
        .prepare(
          `UPDATE import_batches SET conflict_count=max(conflict_count-?,0),duplicate_count=duplicate_count+?,modified_count=modified_count+? WHERE id=?`,
        )
        .bind(resolved, duplicates, modified, batchId),
    );
    await runChunked(db, statements);
    return Response.json({ ok: true, resolved, resolution, metadataOnly });
  }

  return null;
}
