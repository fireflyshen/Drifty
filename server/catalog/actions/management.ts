import { clean, fieldCode, id, now, projectCode, runChunked, tableCode, validateScopeSelection } from "@/server/catalog/shared";
import { fieldFingerprint } from "@/app/lib/mysql-parser";
import type { CatalogActionContext } from "@/server/catalog/actions/context";

/**
 * 处理目录主数据命令。
 *
 * 负责 project/module/version/environment、表映射、table/field、实体删除、
 * 生命周期、仓库来源、导入记录重命名和环境执行状态；不处理结构对比和 SQL 导入。
 */
export async function handleManagementAction({
  action,
  payload,
  db,
}: CatalogActionContext): Promise<Response | null> {
  if (action === "project.save") {
    const recordId = clean(payload.id);
    const name = clean(payload.name);
    const kind = clean(payload.kind) === "platform" ? "platform" : "project";
    const icon =
      clean(payload.icon) || (kind === "platform" ? "server" : "package");
    const code = (clean(payload.code) || projectCode(name)).toUpperCase();
    const anchorVersionId = clean(payload.anchorVersionId) || null;
    const anchorEnvironmentId = clean(payload.anchorEnvironmentId) || null;
    if (!name)
      return Response.json({ error: "请填写项目名称。" }, { status: 400 });
    try {
      if (anchorVersionId) {
        const version = await db
          .prepare(
            `SELECT id FROM catalog_versions WHERE id=? AND project_id=?`,
          )
          .bind(anchorVersionId, recordId || clean(payload.id) || "")
          .first();
        if (!version && recordId)
          return Response.json(
            { error: "锚定版本必须属于当前项目。" },
            { status: 400 },
          );
      }
      if (anchorEnvironmentId) {
        const environment = await db
          .prepare(
            `SELECT id,version_id AS versionId FROM catalog_environments WHERE id=? AND project_id=?`,
          )
          .bind(anchorEnvironmentId, recordId || clean(payload.id) || "")
          .first<{ id: string; versionId: string | null }>();
        if (!environment && recordId)
          return Response.json(
            { error: "锚定环境必须属于当前项目。" },
            { status: 400 },
          );
      }
      if (recordId)
        await db
          .prepare(
            `UPDATE catalog_projects SET code=?,name=?,kind=?,parent_id=?,icon=?,description=?,anchor_version_id=?,anchor_environment_id=? WHERE id=?`,
          )
          .bind(
            code,
            name,
            kind,
            clean(payload.parentId) || null,
            icon,
            clean(payload.description),
            anchorVersionId,
            anchorEnvironmentId,
            recordId,
          )
          .run();
      else
        await db
          .prepare(
            `INSERT INTO catalog_projects (id,code,name,kind,parent_id,icon,description,anchor_version_id,anchor_environment_id,archived,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
          )
          .bind(
            id(),
            code,
            name,
            kind,
            clean(payload.parentId) || null,
            icon,
            clean(payload.description),
            anchorVersionId,
            anchorEnvironmentId,
            now(),
          )
          .run();
      return Response.json({ ok: true });
    } catch {
      return Response.json({ error: "项目编码已经存在。" }, { status: 409 });
    }
  }

  if (action === "module.save") {
    const recordId = clean(payload.id);
    const name = clean(payload.name);
    const code = (clean(payload.code) || projectCode(name)).toUpperCase();
    if (!name)
      return Response.json({ error: "请填写模块名称。" }, { status: 400 });
    try {
      if (recordId)
        await db
          .prepare(
            `UPDATE catalog_modules SET code=?,name=?,description=? WHERE id=?`,
          )
          .bind(code, name, clean(payload.description), recordId)
          .run();
      else
        await db
          .prepare(`INSERT INTO catalog_modules VALUES (?,?,?,?,?)`)
          .bind(id(), code, name, clean(payload.description), now())
          .run();
      return Response.json({ ok: true });
    } catch {
      return Response.json({ error: "模块编码已经存在。" }, { status: 409 });
    }
  }

  if (action === "version.save") {
    const recordId = clean(payload.id),
      projectId = clean(payload.projectId),
      name = clean(payload.name);
    if (!projectId || !name)
      return Response.json(
        { error: "请选择项目并填写版本。" },
        { status: 400 },
      );
    try {
      if (recordId) {
        const existing = await db
          .prepare(
            `SELECT project_id AS projectId FROM catalog_versions WHERE id=?`,
          )
          .bind(recordId)
          .first<{ projectId: string }>();
        if (!existing)
          return Response.json({ error: "版本不存在。" }, { status: 404 });
        if (existing.projectId !== projectId)
          return Response.json(
            { error: "已有版本不能移动到其他项目。" },
            { status: 400 },
          );
      }
      if (recordId)
        await db
          .prepare(
            `UPDATE catalog_versions SET project_id=?,name=?,source_version=?,repository_id=?,git_ref=?,git_commit=?,status=? WHERE id=?`,
          )
          .bind(
            projectId,
            name,
            clean(payload.sourceVersion) || null,
            clean(payload.repositoryId) || null,
            clean(payload.gitRef) || null,
            clean(payload.gitCommit) || null,
            clean(payload.status) || "active",
            recordId,
          )
          .run();
      else
        await db
          .prepare(
            `INSERT INTO catalog_versions (id,project_id,name,source_version,repository_id,git_ref,git_commit,status,created_at) VALUES (?,?,?,?,?,?,?,'active',?)`,
          )
          .bind(
            id(),
            projectId,
            name,
            clean(payload.sourceVersion) || null,
            clean(payload.repositoryId) || null,
            clean(payload.gitRef) || null,
            clean(payload.gitCommit) || null,
            now(),
          )
          .run();
      return Response.json({ ok: true });
    } catch {
      return Response.json(
        { error: "这个项目已经存在同名版本。" },
        { status: 409 },
      );
    }
  }

  if (action === "environment.save") {
    const recordId = clean(payload.id),
      projectId = clean(payload.projectId),
      versionId = clean(payload.versionId),
      name = clean(payload.name),
      code = (clean(payload.code) || projectCode(name)).toLowerCase();
    if (!projectId || !name)
      return Response.json(
        { error: "请选择项目并填写环境名称。" },
        { status: 400 },
      );
    try {
      if (versionId) {
        const version = await db
          .prepare(
            `SELECT id FROM catalog_versions WHERE id=? AND project_id=?`,
          )
          .bind(versionId, projectId)
          .first();
        if (!version)
          return Response.json(
            { error: "所选版本不属于当前项目。" },
            { status: 400 },
          );
      }
      if (recordId) {
        const existing = await db
          .prepare(
            `SELECT project_id AS projectId,version_id AS versionId FROM catalog_environments WHERE id=?`,
          )
          .bind(recordId)
          .first<{ projectId: string; versionId: string | null }>();
        if (!existing)
          return Response.json({ error: "环境不存在。" }, { status: 404 });
        if (existing.projectId !== projectId)
          return Response.json(
            { error: "已有环境不能移动到其他项目。" },
            { status: 400 },
          );
        await db
          .prepare(
            `UPDATE catalog_environments SET project_id=?,version_id=?,code=?,name=?,stage=?,sort_order=? WHERE id=?`,
          )
          .bind(
            projectId,
            versionId || null,
            code,
            name,
            clean(payload.stage) || "custom",
            Number(payload.sortOrder) || 0,
            recordId,
          )
          .run();
      } else
        await db
          .prepare(
            `INSERT INTO catalog_environments VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            id(),
            projectId,
            versionId || null,
            code,
            name,
            clean(payload.stage) || "custom",
            Number(payload.sortOrder) || 0,
            0,
            now(),
          )
          .run();
      return Response.json({ ok: true });
    } catch {
      return Response.json(
        { error: "这个项目已经存在同名环境编码。" },
        { status: 409 },
      );
    }
  }

  if (action === "table.mapping.save") {
    const recordId = clean(payload.id),
      projectId = clean(payload.projectId),
      physicalName = clean(payload.physicalName).toLowerCase(),
      logicalName = clean(payload.logicalName).toLowerCase();
    if (!projectId || !physicalName || !logicalName)
      return Response.json(
        { error: "请填写项目、物理表名和逻辑表名。" },
        { status: 400 },
      );
    const project = await db
      .prepare(`SELECT id FROM catalog_projects WHERE id=? AND archived=0`)
      .bind(projectId)
      .first();
    if (!project)
      return Response.json({ error: "项目不存在。" }, { status: 404 });
    try {
      if (recordId)
        await db
          .prepare(
            `UPDATE catalog_table_mappings SET project_id=?,logical_name=?,physical_name=?,note=? WHERE id=?`,
          )
          .bind(
            projectId,
            logicalName,
            physicalName,
            clean(payload.note),
            recordId,
          )
          .run();
      else
        await db
          .prepare(
            `INSERT INTO catalog_table_mappings (id,project_id,logical_name,physical_name,note,created_at) VALUES (?,?,?,?,?,?)`,
          )
          .bind(
            id(),
            projectId,
            logicalName,
            physicalName,
            clean(payload.note),
            now(),
          )
          .run();
      return Response.json({ ok: true });
    } catch {
      return Response.json(
        { error: "该项目下的物理表名已经存在映射。" },
        { status: 409 },
      );
    }
  }

  if (action === "table.mapping.delete") {
    const recordId = clean(payload.id);
    if (!recordId)
      return Response.json({ error: "映射无效。" }, { status: 400 });
    await db
      .prepare(`DELETE FROM catalog_table_mappings WHERE id=?`)
      .bind(recordId)
      .run();
    return Response.json({ ok: true });
  }

  if (action === "table.mapping.list") {
    const projectId = clean(payload.projectId);
    const rows = await db
      .prepare(
        `SELECT id,project_id AS projectId,logical_name AS logicalName,physical_name AS physicalName,note,created_at AS createdAt FROM catalog_table_mappings WHERE (?='' OR project_id=?) ORDER BY physical_name`,
      )
      .bind(projectId, projectId)
      .all();
    return Response.json({ ok: true, mappings: rows.results });
  }

  if (action === "table.save") {
    const recordId = clean(payload.id),
      name = clean(payload.name).toLowerCase();
    const projectId = clean(payload.projectId),
      versionId = clean(payload.versionId);
    const environmentIds = [
      ...new Set(
        Array.isArray(payload.environmentIds)
          ? payload.environmentIds.map(clean).filter(Boolean)
          : [],
      ),
    ];
    if (!name) return Response.json({ error: "请填写表名。" }, { status: 400 });
    if (projectId || versionId || environmentIds.length) {
      if (!projectId || !versionId || !environmentIds.length)
        return Response.json(
          { error: "请完整选择项目、版本和环境。" },
          { status: 400 },
        );
      const scopeError = await validateScopeSelection(
        db,
        projectId,
        versionId,
        environmentIds,
      );
      if (scopeError)
        return Response.json({ error: scopeError }, { status: 400 });
    }
    const codes = new Set(
      (
        await db
          .prepare(`SELECT code FROM catalog_tables`)
          .all<{ code: string }>()
      ).results.map((item) => item.code),
    );
    const code = (clean(payload.code) || tableCode(name, codes)).toUpperCase();
    try {
      const tableId = recordId || id();
      const lifecycleInput = clean(payload.lifecycleStatus);
      const lifecycleStatus = ["active", "deprecated", "removed"].includes(
        lifecycleInput,
      )
        ? lifecycleInput
        : null;
      const lifecycleNote =
        payload.lifecycleNote === undefined
          ? null
          : clean(payload.lifecycleNote);
      if (recordId)
        await db
          .prepare(
            `UPDATE catalog_tables SET code=?,name=?,comment=?,module_id=?,lifecycle_status=coalesce(?,lifecycle_status),lifecycle_note=coalesce(?,lifecycle_note) WHERE id=?`,
          )
          .bind(
            code,
            name,
            clean(payload.comment),
            clean(payload.moduleId) || null,
            lifecycleStatus,
            lifecycleNote,
            recordId,
          )
          .run();
      else
        await db
          .prepare(
            `INSERT INTO catalog_tables (id,code,name,comment,module_id,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,NULL,?,'active','')`,
          )
          .bind(
            tableId,
            code,
            name,
            clean(payload.comment),
            clean(payload.moduleId) || null,
            now(),
          )
          .run();
      if (projectId && versionId && environmentIds.length) {
        if (recordId)
          await db
            .prepare(
              `DELETE FROM table_scopes WHERE table_id=? AND project_id=? AND version_id=?`,
            )
            .bind(tableId, projectId, versionId)
            .run();
        await runChunked(
          db,
          environmentIds.map((environmentId) =>
            db
              .prepare(
                `INSERT OR IGNORE INTO table_scopes VALUES (?,?,?,?, 'present','manual',NULL,?)`,
              )
              .bind(tableId, projectId, versionId, environmentId, now()),
          ),
        );
      }
      return Response.json({ ok: true, code });
    } catch {
      return Response.json(
        { error: "表名或表编码已经存在。" },
        { status: 409 },
      );
    }
  }

  if (action === "field.save") {
    const recordId = clean(payload.id),
      tableId = clean(payload.tableId),
      name = clean(payload.name).toLowerCase(),
      dataType = clean(payload.dataType).toLowerCase();
    const projectId = clean(payload.projectId),
      versionId = clean(payload.versionId);
    const environmentIds = [
      ...new Set(
        Array.isArray(payload.environmentIds)
          ? payload.environmentIds.map(clean).filter(Boolean)
          : [],
      ),
    ];
    if (!tableId || !name || !dataType)
      return Response.json(
        { error: "请选择表，并填写字段名和类型。" },
        { status: 400 },
      );
    if (projectId || versionId || environmentIds.length) {
      if (!projectId || !versionId || !environmentIds.length)
        return Response.json(
          { error: "请完整选择项目、版本和环境。" },
          { status: 400 },
        );
      const scopeError = await validateScopeSelection(
        db,
        projectId,
        versionId,
        environmentIds,
      );
      if (scopeError)
        return Response.json({ error: scopeError }, { status: 400 });
    }
    const table = await db
      .prepare(`SELECT code FROM catalog_tables WHERE id=?`)
      .bind(tableId)
      .first<{ code: string }>();
    if (!table)
      return Response.json({ error: "所选数据表不存在。" }, { status: 400 });
    const codes = new Set(
      (
        await db
          .prepare(`SELECT code FROM catalog_fields`)
          .all<{ code: string }>()
      ).results.map((item) => item.code),
    );
    const code = recordId ? clean(payload.code) : fieldCode(table.code, codes);
    try {
      const fieldId = recordId || id();
      const nextRevision = recordId
        ? Number(
            (
              await db
                .prepare(
                  `SELECT coalesce(max(revision),0)+1 AS next FROM catalog_field_revisions WHERE field_id=?`,
                )
                .bind(fieldId)
                .first<{ next: number }>()
            )?.next ?? 1,
          )
        : 1;
      const revisionId = `${fieldId}:r${nextRevision}`;
      const fingerprint = fieldFingerprint({
        tableName: clean(table.code),
        columnName: name,
        dataType,
        nullable: payload.nullable !== false,
        defaultValue: clean(payload.defaultValue) || null,
        comment: clean(payload.comment),
        extra: clean(payload.extra),
      });
      const lifecycleInput = clean(payload.lifecycleStatus);
      const lifecycleStatus = ["active", "deprecated", "removed"].includes(
        lifecycleInput,
      )
        ? lifecycleInput
        : null;
      const lifecycleNote =
        payload.lifecycleNote === undefined
          ? null
          : clean(payload.lifecycleNote);
      if (recordId)
        await db
          .prepare(
            `UPDATE catalog_fields SET table_id=?,name=?,data_type=?,nullable=?,default_value=?,comment=?,extra=?,lifecycle_status=coalesce(?,lifecycle_status),lifecycle_note=coalesce(?,lifecycle_note) WHERE id=?`,
          )
          .bind(
            tableId,
            name,
            dataType,
            payload.nullable === false ? 0 : 1,
            clean(payload.defaultValue) || null,
            clean(payload.comment),
            clean(payload.extra),
            lifecycleStatus,
            lifecycleNote,
            recordId,
          )
          .run();
      else
        await db
          .prepare(
            `INSERT INTO catalog_fields (id,table_id,code,name,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?,0,'manual',NULL,?,'active','')`,
          )
          .bind(
            fieldId,
            tableId,
            code,
            name,
            dataType,
            payload.nullable === false ? 0 : 1,
            clean(payload.defaultValue) || null,
            clean(payload.comment),
            clean(payload.extra),
            now(),
          )
          .run();
      await db
        .prepare(
          `INSERT OR IGNORE INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,'manual',NULL,?,?)`,
        )
        .bind(
          revisionId,
          fieldId,
          nextRevision,
          dataType,
          payload.nullable === false ? 0 : 1,
          clean(payload.defaultValue) || null,
          clean(payload.comment),
          clean(payload.extra),
          0,
          fingerprint,
          now(),
        )
        .run();
      if (projectId && versionId && environmentIds.length) {
        if (recordId)
          await db.batch([
            db
              .prepare(
                `DELETE FROM catalog_field_scope_revisions WHERE field_id=? AND version_id=? AND environment_id IN (SELECT id FROM catalog_environments WHERE project_id=?)`,
              )
              .bind(fieldId, versionId, projectId),
            db
              .prepare(
                `DELETE FROM field_scopes WHERE field_id=? AND project_id=? AND version_id=?`,
              )
              .bind(fieldId, projectId, versionId),
          ]);
        await runChunked(
          db,
          environmentIds.flatMap((environmentId) => [
            db
              .prepare(
                `INSERT OR IGNORE INTO table_scopes VALUES (?,?,?,?, 'present','manual',NULL,?)`,
              )
              .bind(tableId, projectId, versionId, environmentId, now()),
            db
              .prepare(
                `INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present','manual',NULL,?)`,
              )
              .bind(fieldId, projectId, versionId, environmentId, now()),
            db
              .prepare(
                `INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) VALUES (?,?,?,?,?)`,
              )
              .bind(fieldId, versionId, environmentId, revisionId, now()),
          ]),
        );
      }
      return Response.json({ ok: true, code });
    } catch {
      return Response.json(
        { error: "这张表中已经存在同名字段。" },
        { status: 409 },
      );
    }
  }

  if (action === "entity.delete") {
    const entity = clean(payload.entity),
      recordId = clean(payload.id);
    const allowed: Record<string, string> = {
      project: "catalog_projects",
      module: "catalog_modules",
      version: "catalog_versions",
      environment: "catalog_environments",
      table: "catalog_tables",
      field: "catalog_fields",
      repository: "repository_sources",
    };
    if (!allowed[entity] || !recordId)
      return Response.json({ error: "删除目标无效。" }, { status: 400 });
    const target = await db
      .prepare(`SELECT id FROM ${allowed[entity]} WHERE id=?`)
      .bind(recordId)
      .first();
    if (!target)
      return Response.json(
        { error: "该对象不存在或已经删除。" },
        { status: 404 },
      );
    try {
      if (entity === "project") {
        await db.batch([
          db
            .prepare(
              `DELETE FROM import_items WHERE batch_id IN (SELECT id FROM import_batches WHERE project_id=?)`,
            )
            .bind(recordId),
          db
            .prepare(
              `DELETE FROM catalog_fields WHERE import_batch_id IN (SELECT id FROM import_batches WHERE project_id=?) AND NOT EXISTS (SELECT 1 FROM field_scopes fs WHERE fs.field_id=catalog_fields.id AND fs.project_id<>?)`,
            )
            .bind(recordId, recordId),
          db
            .prepare(
              `DELETE FROM catalog_tables WHERE import_batch_id IN (SELECT id FROM import_batches WHERE project_id=?) AND NOT EXISTS (SELECT 1 FROM catalog_fields f WHERE f.table_id=catalog_tables.id)`,
            )
            .bind(recordId),
          db
            .prepare(
              `UPDATE catalog_fields SET import_batch_id=NULL WHERE import_batch_id IN (SELECT id FROM import_batches WHERE project_id=?)`,
            )
            .bind(recordId),
          db
            .prepare(
              `UPDATE catalog_tables SET import_batch_id=NULL WHERE import_batch_id IN (SELECT id FROM import_batches WHERE project_id=?)`,
            )
            .bind(recordId),
          db
            .prepare(`DELETE FROM import_batches WHERE project_id=?`)
            .bind(recordId),
          db
            .prepare(`DELETE FROM repository_sources WHERE project_id=?`)
            .bind(recordId),
          db
            .prepare(
              `UPDATE catalog_projects SET parent_id=NULL WHERE parent_id=?`,
            )
            .bind(recordId),
          db.prepare(`DELETE FROM catalog_projects WHERE id=?`).bind(recordId),
        ]);
      } else if (entity === "version") {
        await db.batch([
          db
            .prepare(
              `UPDATE catalog_projects SET anchor_version_id=NULL,anchor_environment_id=CASE WHEN anchor_environment_id IN (SELECT id FROM catalog_environments WHERE version_id=?) THEN NULL ELSE anchor_environment_id END WHERE anchor_version_id=? OR anchor_environment_id IN (SELECT id FROM catalog_environments WHERE version_id=?)`,
            )
            .bind(recordId, recordId, recordId),
          db
            .prepare(
              `DELETE FROM import_items WHERE batch_id IN (SELECT id FROM import_batches WHERE version_id=?)`,
            )
            .bind(recordId),
          db
            .prepare(
              `DELETE FROM catalog_fields WHERE import_batch_id IN (SELECT id FROM import_batches WHERE version_id=?) AND NOT EXISTS (SELECT 1 FROM field_scopes fs WHERE fs.field_id=catalog_fields.id AND fs.version_id<>?)`,
            )
            .bind(recordId, recordId),
          db
            .prepare(
              `DELETE FROM catalog_tables WHERE import_batch_id IN (SELECT id FROM import_batches WHERE version_id=?) AND NOT EXISTS (SELECT 1 FROM catalog_fields f WHERE f.table_id=catalog_tables.id)`,
            )
            .bind(recordId),
          db
            .prepare(
              `UPDATE catalog_fields SET import_batch_id=NULL WHERE import_batch_id IN (SELECT id FROM import_batches WHERE version_id=?)`,
            )
            .bind(recordId),
          db
            .prepare(
              `UPDATE catalog_tables SET import_batch_id=NULL WHERE import_batch_id IN (SELECT id FROM import_batches WHERE version_id=?)`,
            )
            .bind(recordId),
          db
            .prepare(`DELETE FROM import_batches WHERE version_id=?`)
            .bind(recordId),
          db.prepare(`DELETE FROM catalog_versions WHERE id=?`).bind(recordId),
        ]);
      } else if (entity === "module") {
        await db.batch([
          db
            .prepare(
              `UPDATE import_batches SET module_id=NULL WHERE module_id=?`,
            )
            .bind(recordId),
          db.prepare(`DELETE FROM catalog_modules WHERE id=?`).bind(recordId),
        ]);
      } else if (entity === "table") {
        await db.batch([
          db
            .prepare(
              `UPDATE import_items SET field_id=NULL WHERE field_id IN (SELECT id FROM catalog_fields WHERE table_id=?)`,
            )
            .bind(recordId),
          db
            .prepare(
              `DELETE FROM catalog_object_lifecycles WHERE (entity='table' AND object_id=?) OR (entity='field' AND object_id IN (SELECT id FROM catalog_fields WHERE table_id=?)) OR (entity='index' AND object_id IN (SELECT id FROM catalog_indexes WHERE table_id=?)) OR (entity='constraint' AND object_id IN (SELECT id FROM catalog_constraints WHERE table_id=?))`,
            )
            .bind(recordId, recordId, recordId, recordId),
          db.prepare(`DELETE FROM catalog_tables WHERE id=?`).bind(recordId),
        ]);
      } else if (entity === "field") {
        await db.batch([
          db
            .prepare(`UPDATE import_items SET field_id=NULL WHERE field_id=?`)
            .bind(recordId),
          db
            .prepare(
              `DELETE FROM catalog_object_lifecycles WHERE entity='field' AND object_id=?`,
            )
            .bind(recordId),
          db.prepare(`DELETE FROM catalog_fields WHERE id=?`).bind(recordId),
        ]);
      } else if (entity === "repository") {
        await db.batch([
          db
            .prepare(
              `UPDATE catalog_versions SET repository_id=NULL WHERE repository_id=?`,
            )
            .bind(recordId),
          db
            .prepare(`DELETE FROM repository_sources WHERE id=?`)
            .bind(recordId),
        ]);
      } else if (entity === "environment") {
        await db.batch([
          db
            .prepare(
              `UPDATE catalog_projects SET anchor_environment_id=NULL WHERE anchor_environment_id=?`,
            )
            .bind(recordId),
          db
            .prepare(`DELETE FROM catalog_environments WHERE id=?`)
            .bind(recordId),
        ]);
      } else
        await db
          .prepare(`DELETE FROM ${allowed[entity]} WHERE id=?`)
          .bind(recordId)
          .run();
      const remaining = await db
        .prepare(`SELECT id FROM ${allowed[entity]} WHERE id=?`)
        .bind(recordId)
        .first();
      if (remaining)
        return Response.json(
          { error: "删除没有生效，请重试。" },
          { status: 409 },
        );
      return Response.json({ ok: true });
    } catch {
      return Response.json(
        { error: "该对象仍被其他数据引用，暂时不能删除。" },
        { status: 409 },
      );
    }
  }

  if (action === "lifecycle.set") {
    const entity = clean(payload.entity),
      recordId = clean(payload.id),
      projectId = clean(payload.projectId),
      status = clean(payload.status),
      note = clean(payload.note);
    const scopes: Record<string, { table: string; key: string }> = {
      table: { table: "table_scopes", key: "table_id" },
      field: { table: "field_scopes", key: "field_id" },
      index: { table: "catalog_index_scopes", key: "index_id" },
      constraint: { table: "catalog_constraint_scopes", key: "constraint_id" },
    };
    if (
      !scopes[entity] ||
      !recordId ||
      !projectId ||
      !["active", "deprecated", "removed"].includes(status)
    )
      return Response.json(
        { error: "请选择一个项目后再更新生命周期状态。" },
        { status: 400 },
      );
    const scope = scopes[entity];
    const target = await db
      .prepare(
        `SELECT 1 AS found FROM ${scope.table} WHERE ${scope.key}=? AND project_id=? LIMIT 1`,
      )
      .bind(recordId, projectId)
      .first();
    if (!target)
      return Response.json(
        { error: "该对象不属于所选项目。" },
        { status: 404 },
      );
    const upsert = (targetEntity: string, objectId: string) =>
      db
        .prepare(
          `INSERT INTO catalog_object_lifecycles (entity,object_id,project_id,status,note,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(entity,object_id,project_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at`,
        )
        .bind(targetEntity, objectId, projectId, status, note, now());
    if (entity === "table") {
      const [fields, indexes, constraints] = await Promise.all([
        db
          .prepare(
            `SELECT DISTINCT f.id FROM catalog_fields f JOIN field_scopes s ON s.field_id=f.id WHERE f.table_id=? AND s.project_id=?`,
          )
          .bind(recordId, projectId)
          .all<{ id: string }>(),
        db
          .prepare(
            `SELECT DISTINCT i.id FROM catalog_indexes i JOIN catalog_index_scopes s ON s.index_id=i.id WHERE i.table_id=? AND s.project_id=?`,
          )
          .bind(recordId, projectId)
          .all<{ id: string }>(),
        db
          .prepare(
            `SELECT DISTINCT c.id FROM catalog_constraints c JOIN catalog_constraint_scopes s ON s.constraint_id=c.id WHERE c.table_id=? AND s.project_id=?`,
          )
          .bind(recordId, projectId)
          .all<{ id: string }>(),
      ]);
      await runChunked(db, [
        upsert("table", recordId),
        ...fields.results.map((item) => upsert("field", item.id)),
        ...indexes.results.map((item) => upsert("index", item.id)),
        ...constraints.results.map((item) => upsert("constraint", item.id)),
      ]);
    } else {
      await upsert(entity, recordId).run();
    }
    return Response.json({
      ok: true,
      status,
      projectId,
      cascaded: entity === "table",
    });
  }

  if (action === "repository.save") {
    const recordId = clean(payload.id);
    const name = clean(payload.name),
      repository = clean(payload.repository),
      branch = clean(payload.branch) || "main",
      pathPattern = clean(payload.pathPattern) || "sql/**/*.sql";
    if (!name || !repository)
      return Response.json(
        { error: "请填写来源名称和 GitHub 仓库。" },
        { status: 400 },
      );
    if (recordId)
      await db
        .prepare(
          `UPDATE repository_sources SET name=?,repository=?,branch=?,path_pattern=?,project_id=? WHERE id=?`,
        )
        .bind(
          name,
          repository,
          branch,
          pathPattern,
          clean(payload.projectId) || null,
          recordId,
        )
        .run();
    else
      await db
        .prepare(`INSERT INTO repository_sources VALUES (?,?,?,?,?,?,NULL,1,?)`)
        .bind(
          id(),
          name,
          repository,
          branch,
          pathPattern,
          clean(payload.projectId) || null,
          now(),
        )
        .run();
    return Response.json({ ok: true });
  }

  if (action === "import.rename") {
    const importId = clean(payload.id),
      name = clean(payload.name);
    if (!importId || !name)
      return Response.json({ error: "请填写 SQL 记录名称。" }, { status: 400 });
    const updated = await db
      .prepare(`UPDATE import_batches SET name=? WHERE id=?`)
      .bind(name, importId)
      .run();
    if (!updated.meta.changes)
      return Response.json({ error: "SQL 记录不存在。" }, { status: 404 });
    return Response.json({ ok: true });
  }

  if (action === "change.scopeStatus") {
    const changeId = clean(payload.changeId),
      environmentId = clean(payload.environmentId),
      status = clean(payload.status);
    if (
      !changeId ||
      !environmentId ||
      !["pending", "executed", "verified", "failed", "waived"].includes(status)
    )
      return Response.json({ error: "变更状态无效。" }, { status: 400 });
    const exists = await db
      .prepare(
        `SELECT change_id FROM catalog_change_scopes WHERE change_id=? AND environment_id=?`,
      )
      .bind(changeId, environmentId)
      .first();
    if (!exists)
      return Response.json(
        { error: "这条变更没有登记到该环境。" },
        { status: 404 },
      );
    const timestamp = status === "verified" ? now() : null;
    const executed =
      status === "executed" || status === "verified" ? now() : null;
    await db
      .prepare(
        `UPDATE catalog_change_scopes SET status=?,executed_at=coalesce(?,executed_at),verified_at=coalesce(?,verified_at),note=? WHERE change_id=? AND environment_id=?`,
      )
      .bind(
        status,
        executed,
        timestamp,
        clean(payload.note),
        changeId,
        environmentId,
      )
      .run();
    const change = await db
      .prepare(
        `SELECT import_batch_id AS importBatchId,sql_text AS sqlText,source_kind AS sourceKind,source_path AS sourcePath,git_commit AS gitCommit,project_id AS projectId,version_id AS versionId FROM catalog_changes WHERE id=?`,
      )
      .bind(changeId)
      .first<{
        importBatchId: string | null;
        sqlText: string;
        sourceKind: string;
        sourcePath: string | null;
        gitCommit: string | null;
        projectId: string;
        versionId: string;
      }>();
    if (change?.importBatchId)
      await db
        .prepare(
          `UPDATE catalog_sql_executions SET status=?,started_at=CASE WHEN ? IN ('executed','verified') THEN coalesce(started_at,?) ELSE started_at END,finished_at=CASE WHEN ? IN ('verified','failed','waived') THEN coalesce(finished_at,?) ELSE finished_at END,note=? WHERE import_batch_id=? AND environment_id=?`,
        )
        .bind(
          status,
          status,
          executed ?? now(),
          status,
          now(),
          clean(payload.note),
          change.importBatchId,
          environmentId,
        )
        .run();
    return Response.json({ ok: true });
  }

  return null;
}
