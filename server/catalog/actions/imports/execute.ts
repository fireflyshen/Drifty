import { clean, fieldCode, hash, id, now, runChunked, tableCode, validateScopeSelection } from "@/server/catalog/shared";
import { fieldFingerprint, parseMysqlSql } from "@/app/lib/mysql-parser";
import type { ParsedField } from "@/app/lib/mysql-parser";
import { captureEnvironmentSnapshot, verifyChangesAgainstSnapshot } from "@/server/catalog/snapshots";
import type { CatalogActionContext } from "@/server/catalog/actions/context";

/** 执行正式导入：维护表/字段/索引/约束、范围、修订、快照与发布变更。 */
export async function handleImportExecutionAction({
  action,
  payload,
  db,
}: CatalogActionContext): Promise<Response | null> {
  if (action === "import.sql") {
    const sql = clean(payload.sql),
      projectId = clean(payload.projectId),
      versionId = clean(payload.versionId),
      moduleId = clean(payload.moduleId) || null;
    const historical = payload.historical === true;
    const lifecycleStatus = historical ? "deprecated" : "active";
    const lifecycleNote = historical ? "历史结构导入" : "";
    const sourcePath = clean(payload.sourcePath) || null,
      gitCommit = clean(payload.gitCommit) || null;
    const environmentIds = [
      ...new Set(
        Array.isArray(payload.environmentIds)
          ? payload.environmentIds.map(clean).filter(Boolean)
          : [],
      ),
    ];
    const sourceKind = ["paste", "upload", "github"].includes(
      clean(payload.sourceKind),
    )
      ? clean(payload.sourceKind)
      : "paste";
    if (!sql || !projectId || !versionId || !environmentIds.length)
      return Response.json(
        { error: "请提供 SQL，并选择项目、版本和至少一个环境。" },
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
    let parsed = parseMysqlSql(sql);
    if (!parsed.fields.length)
      return Response.json(
        { error: "没有识别到字段定义。", warnings: parsed.warnings },
        { status: 400 },
      );
    if (parsed.warnings.length)
      return Response.json(
        {
          error: `有 ${parsed.warnings.length} 处 SQL 无法安全识别，未写入任何数据。${parsed.warnings[0]}`,
          warnings: parsed.warnings,
        },
        { status: 400 },
      );
    // Resolve physical names to project-scoped logical identities before any
    // comparison.  This keeps a renamed table from looking like a drop plus
    // a brand-new table in another environment.
    const mappingRows = await db
      .prepare(
        `SELECT physical_name AS physicalName,logical_name AS logicalName FROM catalog_table_mappings WHERE project_id=?`,
      )
      .bind(projectId)
      .all<{ physicalName: string; logicalName: string }>();
    if (mappingRows.results.length) {
      const mappings = new Map(
        mappingRows.results.map((row) => [
          row.physicalName.toLowerCase(),
          row.logicalName.toLowerCase(),
        ]),
      );
      const resolve = (name: string) =>
        mappings.get(name.toLowerCase()) ?? name;
      parsed = {
        ...parsed,
        tables: parsed.tables.map((table) => ({
          ...table,
          name: resolve(table.name),
        })),
        fields: parsed.fields.map((field) => ({
          ...field,
          tableName: resolve(field.tableName),
        })),
        indexes: parsed.indexes.map((item) => ({
          ...item,
          tableName: resolve(item.tableName),
        })),
        constraints: parsed.constraints.map((item) => ({
          ...item,
          tableName: resolve(item.tableName),
        })),
      };
    }
    const pureCreate =
      parsed.tables.length > 0 &&
      parsed.fields.every((field) => field.action === "add") &&
      parsed.indexes.every((item) => item.action === "add") &&
      parsed.constraints.every((item) => item.action === "add");
    const requestedMode = clean(payload.importMode);
    const importMode = ["snapshot", "change", "executed"].includes(
      requestedMode,
    )
      ? requestedMode
      : pureCreate
        ? "snapshot"
        : "executed";
    if (importMode === "snapshot" && !pureCreate)
      return Response.json(
        {
          error:
            "环境快照只接受完整 CREATE TABLE；ALTER SQL 请切换为变更计划或已执行记录。",
        },
        { status: 400 },
      );
    if (importMode === "snapshot" && environmentIds.length !== 1)
      return Response.json(
        {
          error: "一份环境快照只能对应一个环境。需要采集多个环境时请分别导入。",
        },
        { status: 400 },
      );
    if (importMode === "change" && pureCreate)
      return Response.json(
        { error: "CREATE TABLE 描述的是环境快照，不能登记成待发布变更。" },
        { status: 400 },
      );
    const fingerprint = await hash(
      `${importMode}|${projectId}|${versionId}|${environmentIds.sort().join(",")}|${sql.replace(/\s+/g, " ").trim()}`,
    );
    const existingBatch = await db
      .prepare(
        `SELECT id,code FROM import_batches WHERE fingerprint=? AND status='active'`,
      )
      .bind(fingerprint)
      .first<{ id: string; code: string }>();
    if (existingBatch)
      return Response.json({
        ok: true,
        duplicateBatch: true,
        batchCode: existingBatch.code,
        warnings: parsed.warnings,
      });

    // A planned change is intentionally non-mutating: it records executable
    // work for the selected environments, but does not pretend their schema
    // has already changed. Actual structure is updated only by an executed
    // record or by a later environment snapshot.
    if (importMode === "change") {
      const batchId = id();
      const stamp = now();
      const batchDate = new Date(Date.now() + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "");
      const batchCode = `CHS-${batchDate}-${batchId.slice(0, 8).toUpperCase()}`;
      const existingFields = (
        await db
          .prepare(
            `SELECT f.id,f.name,t.name AS tableName FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id`,
          )
          .all<{ id: string; name: string; tableName: string }>()
      ).results;
      const fieldMap = new Map(
        existingFields.map((field) => [
          `${field.tableName.toLowerCase()}.${field.name.toLowerCase()}`,
          field,
        ]),
      );
      const statements: D1PreparedStatement[] = [];
      let added = 0,
        modified = 0,
        removed = 0,
        conflicts = 0,
        changeIndex = 0;
      const addPlanned = (
        actionName: string,
        tableName: string,
        objectName: string,
        fieldId: string | null,
      ) => {
        const changeId = id();
        const code = `CHG-${batchId}-${String(++changeIndex).padStart(3, "0")}`;
        statements.push(
          db
            .prepare(
              `INSERT INTO catalog_changes (id,code,name,action,table_name,field_name,field_id,project_id,version_id,source_kind,source_path,git_commit,sql_text,import_batch_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              changeId,
              code,
              clean(payload.name) || batchCode,
              actionName,
              tableName,
              objectName,
              fieldId,
              projectId,
              versionId,
              sourceKind,
              sourcePath,
              gitCommit,
              sql,
              batchId,
              "planned",
              stamp,
            ),
        );
        environmentIds.forEach((environmentId) =>
          statements.push(
            db
              .prepare(
                `INSERT INTO catalog_change_scopes (change_id,environment_id,status) VALUES (?,?, 'pending')`,
              )
              .bind(changeId, environmentId),
          ),
        );
      };
      for (const field of parsed.fields) {
        const existing = fieldMap.get(
          `${field.tableName.toLowerCase()}.${(field.previousName || field.columnName).toLowerCase()}`,
        );
        if (
          (field.action === "modify" ||
            field.action === "change" ||
            field.action === "drop") &&
          !existing
        ) {
          conflicts += 1;
          statements.push(
            importItem(
              db,
              batchId,
              field,
              null,
              "conflict",
              "计划变更找不到原字段，请先核对目标环境或逻辑表映射。",
            ),
          );
          continue;
        }
        if (field.action === "add") added += 1;
        else if (field.action === "drop") removed += 1;
        else modified += 1;
        statements.push(
          importItem(
            db,
            batchId,
            field,
            existing?.id ?? null,
            "planned",
            "已登记为待发布变更，尚未修改任何环境结构。",
          ),
        );
        addPlanned(
          field.action,
          field.tableName,
          field.columnName,
          existing?.id ?? null,
        );
      }
      for (const index of parsed.indexes) {
        if (index.action === "drop") removed += 1;
        else added += 1;
        addPlanned(
          `${index.action}_index`,
          index.tableName,
          `索引 · ${index.name}`,
          null,
        );
      }
      for (const constraint of parsed.constraints) {
        if (constraint.action === "drop") removed += 1;
        else added += 1;
        addPlanned(
          `${constraint.action}_constraint`,
          constraint.tableName,
          `约束 · ${constraint.name}`,
          null,
        );
      }
      statements.unshift(
        db
          .prepare(
            `INSERT INTO import_batches (id,code,name,source_kind,file_name,source_path,git_commit,fingerprint,raw_sql,import_mode,project_id,version_id,module_id,status,added_count,duplicate_count,modified_count,removed_count,conflict_count,created_at,reverted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,0,?,?,?,?,NULL)`,
          )
          .bind(
            batchId,
            batchCode,
            clean(payload.name) || clean(payload.fileName) || "结构变更计划",
            sourceKind,
            clean(payload.fileName) || null,
            sourcePath,
            gitCommit,
            fingerprint,
            sql,
            importMode,
            projectId,
            versionId,
            moduleId,
            added,
            modified,
            removed,
            conflicts,
            stamp,
          ),
      );
      statements.splice(
        1,
        0,
        ...environmentIds.map((environmentId) =>
          db
            .prepare(
              `INSERT INTO import_batch_environments (batch_id,environment_id) VALUES (?,?)`,
            )
            .bind(batchId, environmentId),
        ),
      );
      statements.splice(
        1 + environmentIds.length,
        0,
        ...environmentIds.map((environmentId) =>
          db
            .prepare(
              `INSERT INTO catalog_sql_executions (id,import_batch_id,project_id,version_id,environment_id,status,sql_text,source_kind,source_path,git_commit,created_at,note) VALUES (?,?,?,?,?,'registered',?,?,?,?,?,'等待在该环境执行')`,
            )
            .bind(
              id(),
              batchId,
              projectId,
              versionId,
              environmentId,
              sql,
              sourceKind,
              sourcePath,
              gitCommit,
              stamp,
            ),
        ),
      );
      await runChunked(db, statements);
      return Response.json({
        ok: true,
        batchCode,
        importMode,
        added,
        duplicates: 0,
        modified,
        removed,
        conflicts,
        warnings: parsed.warnings,
      });
    }

    const [
      tableRows,
      fieldRows,
      revisionRows,
      indexRows,
      constraintRows,
      indexRevisionRows,
      constraintRevisionRows,
    ] = await Promise.all([
      db
        .prepare(
          `SELECT id,code,name,comment,module_id AS moduleId FROM catalog_tables`,
        )
        .all<{
          id: string;
          code: string;
          name: string;
          comment: string;
          moduleId: string | null;
        }>(),
      db
        .prepare(
          `SELECT f.id,f.code,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,f.ordinal,t.name AS tableName,t.id AS tableId FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id`,
        )
        .all<{
          id: string;
          code: string;
          name: string;
          dataType: string;
          nullable: number;
          defaultValue: string | null;
          comment: string;
          extra: string;
          ordinal: number;
          tableName: string;
          tableId: string;
        }>(),
      db
        .prepare(
          `SELECT field_id AS fieldId,max(revision) AS revision FROM catalog_field_revisions GROUP BY field_id`,
        )
        .all<{ fieldId: string; revision: number }>(),
      db
        .prepare(
          `SELECT id,table_id AS tableId,name,kind,columns_json AS columnsJson FROM catalog_indexes`,
        )
        .all<{
          id: string;
          tableId: string;
          name: string;
          kind: string;
          columnsJson: string;
        }>(),
      db
        .prepare(
          `SELECT id,table_id AS tableId,name,kind,definition FROM catalog_constraints`,
        )
        .all<{
          id: string;
          tableId: string;
          name: string;
          kind: string;
          definition: string;
        }>(),
      db
        .prepare(
          `SELECT index_id AS indexId,max(revision) AS revision FROM catalog_index_revisions GROUP BY index_id`,
        )
        .all<{ indexId: string; revision: number }>(),
      db
        .prepare(
          `SELECT constraint_id AS constraintId,max(revision) AS revision FROM catalog_constraint_revisions GROUP BY constraint_id`,
        )
        .all<{ constraintId: string; revision: number }>(),
    ]);
    const tableMap = new Map(
      tableRows.results.map((item) => [item.name.toLowerCase(), item]),
    );
    const parsedTableMap = new Map(
      parsed.tables.map((item) => [item.name, item]),
    );
    const createTableNames = new Set(
      parsed.tables.map((item) => item.name.toLowerCase()),
    );
    const fieldMap = new Map(
      fieldRows.results.map((item) => [
        `${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`,
        item,
      ]),
    );
    const revisionMap = new Map(
      revisionRows.results.map((item) => [
        item.fieldId,
        Number(item.revision) || 0,
      ]),
    );
    const tableCodes = new Set(tableRows.results.map((item) => item.code));
    const fieldCodes = new Set(fieldRows.results.map((item) => item.code));
    const rolloutRows = await db
      .prepare(
        `SELECT id FROM catalog_environments WHERE project_id=? AND archived=0`,
      )
      .bind(projectId)
      .all<{ id: string }>();
    const rolloutEnvironmentIds = rolloutRows.results.map((item) => item.id);
    const scopePlaceholders = environmentIds.map(() => "?").join(",");
    const selectedScopeRows = await db
      .prepare(
        `SELECT DISTINCT field_id AS fieldId FROM field_scopes WHERE project_id=? AND version_id=? AND environment_id IN (${scopePlaceholders})`,
      )
      .bind(projectId, versionId, ...environmentIds)
      .all<{ fieldId: string }>();
    const selectedScopeFieldIds = new Set(
      selectedScopeRows.results.map((item) => item.fieldId),
    );
    // A pure CREATE import is a snapshot of what already exists in the selected
    // environment. It may update that environment's revision, but it never
    // creates rollout work for the other environments.
    const createSnapshot = importMode === "snapshot";
    const indexMap = new Map(
      indexRows.results.map((item) => [
        `${item.tableId}.${item.name.toLowerCase()}`,
        item,
      ]),
    );
    const constraintMap = new Map(
      constraintRows.results.map((item) => [
        `${item.tableId}.${item.name.toLowerCase()}`,
        item,
      ]),
    );
    const indexRevisionMap = new Map(
      indexRevisionRows.results.map((item) => [
        item.indexId,
        Number(item.revision) || 0,
      ]),
    );
    const constraintRevisionMap = new Map(
      constraintRevisionRows.results.map((item) => [
        item.constraintId,
        Number(item.revision) || 0,
      ]),
    );
    const batchDate = new Date(Date.now() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    const batchId = id(),
      batchCode = `IMP-${batchDate}-${batchId.slice(0, 8).toUpperCase()}`;
    const statements: D1PreparedStatement[] = [];
    const registeredTableScopes = new Set<string>();
    const lifecycleTargets = {
      table: new Set<string>(),
      field: new Set<string>(),
      index: new Set<string>(),
      constraint: new Set<string>(),
    };
    let added = 0,
      duplicates = 0,
      modified = 0,
      removed = 0,
      conflicts = 0,
      changeIndex = 0;

    const markImportedFieldScopesVerified = (fieldId: string) => {
      // Presence alone is not proof that the planned revision was applied.
      // Verification is kept explicit until the captured fingerprint can be
      // matched against the target change revision.
      void fieldId;
    };

    const addChange = (
      parsedField: ParsedField,
      fieldId: string | null,
      status: string,
    ) => {
      // Every CREATE TABLE statement is an observed snapshot. Only explicit
      // ALTER-style field changes are rollout work.
      if (
        createTableNames.has(parsedField.tableName.toLowerCase()) ||
        status === "duplicate" ||
        status === "skipped"
      )
        return;
      const changeId = id();
      // change code must be globally unique, not only unique inside one batch.
      // The batch id is generated once per import and avoids collisions when
      // multiple imports happen on the same day (or a batch counter is reused).
      const changeCode = `CHG-${batchId}-${String(changeIndex + 1).padStart(3, "0")}`;
      changeIndex += 1;
      statements.push(
        db
          .prepare(
            `INSERT INTO catalog_changes (id,code,name,action,table_name,field_name,field_id,project_id,version_id,source_kind,source_path,git_commit,sql_text,import_batch_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            changeId,
            changeCode,
            clean(payload.name) || changeCode,
            parsedField.action,
            parsedField.tableName,
            parsedField.columnName,
            fieldId,
            projectId,
            versionId,
            sourceKind,
            sourcePath,
            gitCommit,
            sql,
            batchId,
            status === "conflict" ? "conflict" : "planned",
            now(),
          ),
      );
      rolloutEnvironmentIds.forEach((environmentId) =>
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO catalog_change_scopes (change_id,environment_id,status) VALUES (?,?,?)`,
            )
            .bind(
              changeId,
              environmentId,
              environmentIds.includes(environmentId) ? "executed" : "pending",
            ),
        ),
      );
    };

    for (const parsedField of parsed.fields) {
      let table = tableMap.get(parsedField.tableName);
      if (!table) {
        const created = {
          id: id(),
          code: tableCode(parsedField.tableName, tableCodes),
          name: parsedField.tableName,
          comment: parsedTableMap.get(parsedField.tableName)?.comment ?? "",
          moduleId,
        };
        statements.push(
          db
            .prepare(
              `INSERT INTO catalog_tables (id,code,name,comment,module_id,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              created.id,
              created.code,
              created.name,
              created.comment,
              moduleId,
              batchId,
              now(),
              lifecycleStatus,
              lifecycleNote,
            ),
        );
        table = created;
        tableMap.set(created.name, created);
      } else {
        const tableComment = parsedTableMap.get(parsedField.tableName)?.comment;
        if (tableComment && !table.comment) {
          statements.push(
            db
              .prepare(`UPDATE catalog_tables SET comment=? WHERE id=?`)
              .bind(tableComment, table.id),
          );
          table.comment = tableComment;
        }
        if (historical)
          statements.push(
            db
              .prepare(
                `UPDATE catalog_tables SET lifecycle_status=?,lifecycle_note=? WHERE id=?`,
              )
              .bind(lifecycleStatus, lifecycleNote, table.id),
          );
      }
      if (!registeredTableScopes.has(table.id)) {
        environmentIds.forEach((environmentId) =>
          statements.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO table_scopes VALUES (?,?,?,?, 'present',?,?,?)`,
              )
              .bind(
                table.id,
                projectId,
                versionId,
                environmentId,
                sourceKind,
                batchId,
                now(),
              ),
          ),
        );
        registeredTableScopes.add(table.id);
      }
      if (historical) lifecycleTargets.table.add(table.id);
      const key = `${parsedField.tableName}.${(parsedField.previousName || parsedField.columnName).toLowerCase()}`;
      const existing = fieldMap.get(key);
      if (parsedField.action === "drop") {
        if (!existing) {
          duplicates += 1;
          statements.push(
            importItem(
              db,
              batchId,
              parsedField,
              null,
              "skipped",
              "字段不存在，无需删除。",
            ),
          );
          continue;
        }
        const placeholders = environmentIds.map(() => "?").join(",");
        const priorScopes = await db
          .prepare(
            `SELECT field_id AS fieldId,project_id AS projectId,version_id AS versionId,environment_id AS environmentId,state,origin,import_batch_id AS importBatchId,created_at AS createdAt FROM field_scopes WHERE field_id=? AND version_id=? AND environment_id IN (${placeholders})`,
          )
          .bind(existing.id, versionId, ...environmentIds)
          .all();
        environmentIds.forEach((environmentId) =>
          statements.push(
            db
              .prepare(
                `DELETE FROM field_scopes WHERE field_id=? AND version_id=? AND environment_id=?`,
              )
              .bind(existing.id, versionId, environmentId),
            db
              .prepare(
                `DELETE FROM catalog_field_scope_revisions WHERE field_id=? AND version_id=? AND environment_id=?`,
              )
              .bind(existing.id, versionId, environmentId),
          ),
        );
        statements.push(
          importItem(
            db,
            batchId,
            parsedField,
            existing.id,
            "removed",
            "已从所选环境删除字段登记。",
            { field: existing, scopes: priorScopes.results },
          ),
        );
        addChange(parsedField, existing.id, "removed");
        removed += 1;
        continue;
      }
      const incomingFingerprint = fieldFingerprint(parsedField);
      if (existing) {
        const selectedInScope = selectedScopeFieldIds.has(existing.id);
        const existingFingerprint = fieldFingerprint({
          tableName: parsedField.tableName,
          columnName: existing.name,
          dataType: existing.dataType,
          nullable: Boolean(existing.nullable),
          defaultValue: existing.defaultValue,
          comment: existing.comment,
          extra: existing.extra,
        });
        if (createSnapshot) {
          const matchingRevision = await db
            .prepare(
              `SELECT id AS revisionId FROM catalog_field_revisions WHERE field_id=? AND fingerprint=? ORDER BY revision DESC LIMIT 1`,
            )
            .bind(existing.id, incomingFingerprint)
            .first<{ revisionId: string }>();
          let revisionId = matchingRevision?.revisionId ?? "";
          if (!revisionId) {
            const nextRevision = (revisionMap.get(existing.id) ?? 0) + 1;
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
                  parsedField.dataType,
                  parsedField.nullable ? 1 : 0,
                  parsedField.defaultValue,
                  parsedField.comment,
                  parsedField.extra,
                  parsedField.ordinal,
                  sourceKind,
                  batchId,
                  incomingFingerprint,
                  now(),
                ),
            );
            revisionMap.set(existing.id, nextRevision);
          }
          environmentIds.forEach((environmentId) =>
            statements.push(
              db
                .prepare(
                  `INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`,
                )
                .bind(
                  existing.id,
                  projectId,
                  versionId,
                  environmentId,
                  sourceKind,
                  batchId,
                  now(),
                ),
              db
                .prepare(
                  `INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,resolution_kind,review_status,resolution_note,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
                )
                .bind(
                  existing.id,
                  versionId,
                  environmentId,
                  revisionId,
                  incomingFingerprint === existingFingerprint
                    ? "same"
                    : "variant",
                  "confirmed",
                  incomingFingerprint === existingFingerprint
                    ? ""
                    : "该环境快照保存了不同的实际字段定义。",
                  now(),
                ),
            ),
          );
          markImportedFieldScopesVerified(existing.id);
          const result =
            incomingFingerprint !== existingFingerprint
              ? "modified"
              : selectedInScope
                ? "duplicate"
                : "added";
          if (result === "modified") modified += 1;
          else if (result === "added") added += 1;
          else duplicates += 1;
          statements.push(
            importItem(
              db,
              batchId,
              parsedField,
              existing.id,
              result,
              result === "modified"
                ? "发现环境结构差异，已作为该环境的实际修订保存。"
                : result === "added"
                  ? "字段定义相同，已登记到该环境。"
                  : "该环境中的字段定义没有变化。",
            ),
          );
          selectedScopeFieldIds.add(existing.id);
          continue;
        }
        // A CREATE snapshot should only revise a field that already exists in
        // the selected project/version/environment scope. A shared canonical
        // field from another scope is merely registered here, not rewritten.
        if (
          parsedField.action === "modify" ||
          parsedField.action === "change" ||
          (createTableNames.has(parsedField.tableName.toLowerCase()) &&
            selectedInScope &&
            incomingFingerprint !== existingFingerprint)
        ) {
          const targetKey = `${parsedField.tableName}.${parsedField.columnName.toLowerCase()}`;
          const renamedConflict =
            parsedField.action === "change" &&
            targetKey !== key &&
            fieldMap.has(targetKey);
          if (renamedConflict) {
            conflicts += 1;
            statements.push(
              importItem(
                db,
                batchId,
                parsedField,
                existing.id,
                "conflict",
                "目标字段名已经存在，未执行重命名。",
              ),
            );
            continue;
          }
          if (historical) lifecycleTargets.field.add(existing.id);
          const nextRevision = (revisionMap.get(existing.id) ?? 0) + 1;
          const revisionId = `${existing.id}:r${nextRevision}`;
          const incomingDefinition = {
            tableName: parsedField.tableName,
            columnName: parsedField.columnName,
            dataType: parsedField.dataType,
            nullable: parsedField.nullable,
            defaultValue: parsedField.defaultValue,
            comment: parsedField.comment,
            extra: parsedField.extra,
          };
          statements.push(
            db
              .prepare(
                `UPDATE catalog_fields SET name=?,data_type=?,nullable=?,default_value=?,comment=?,extra=?,ordinal=?,source_kind=?,lifecycle_status=?,lifecycle_note=? WHERE id=?`,
              )
              .bind(
                parsedField.columnName.toLowerCase(),
                parsedField.dataType,
                parsedField.nullable ? 1 : 0,
                parsedField.defaultValue,
                parsedField.comment,
                parsedField.extra,
                parsedField.ordinal,
                sourceKind,
                lifecycleStatus,
                lifecycleNote,
                existing.id,
              ),
          );
          statements.push(
            db
              .prepare(
                `INSERT INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              )
              .bind(
                revisionId,
                existing.id,
                nextRevision,
                parsedField.dataType,
                parsedField.nullable ? 1 : 0,
                parsedField.defaultValue,
                parsedField.comment,
                parsedField.extra,
                parsedField.ordinal,
                sourceKind,
                batchId,
                fieldFingerprint(incomingDefinition),
                now(),
              ),
          );
          environmentIds.forEach((environmentId) =>
            statements.push(
              db
                .prepare(
                  `INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`,
                )
                .bind(
                  existing.id,
                  projectId,
                  versionId,
                  environmentId,
                  sourceKind,
                  batchId,
                  now(),
                ),
              db
                .prepare(
                  `INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) VALUES (?,?,?,?,?)`,
                )
                .bind(existing.id, versionId, environmentId, revisionId, now()),
            ),
          );
          revisionMap.set(existing.id, nextRevision);
          statements.push(
            importItem(
              db,
              batchId,
              parsedField,
              existing.id,
              "modified",
              parsedField.action === "change"
                ? "已更新字段名称和定义，并登记到所选环境。"
                : createTableNames.has(parsedField.tableName.toLowerCase())
                  ? "已根据环境快照保存该环境的字段修订。"
                  : "已更新字段定义，并登记到所选环境。",
              { field: existing },
            ),
          );
          addChange(parsedField, existing.id, "modified");
          fieldMap.delete(key);
          fieldMap.set(targetKey, {
            ...existing,
            name: parsedField.columnName.toLowerCase(),
            dataType: parsedField.dataType,
            nullable: parsedField.nullable ? 1 : 0,
            defaultValue: parsedField.defaultValue,
            comment: parsedField.comment,
            extra: parsedField.extra,
            ordinal: parsedField.ordinal,
          });
          modified += 1;
          continue;
        }
        if (incomingFingerprint !== existingFingerprint) {
          conflicts += 1;
          statements.push(
            importItem(
              db,
              batchId,
              parsedField,
              existing.id,
              "conflict",
              "同名字段的定义不同，请选择合并、保留环境差异或标记为独立逻辑字段。",
              { field: existing },
            ),
          );
          continue;
        }
        const addsEnvironmentScope = !selectedInScope;
        if (historical) lifecycleTargets.field.add(existing.id);
        if (addsEnvironmentScope) added += 1;
        else duplicates += 1;
        if (historical)
          statements.push(
            db
              .prepare(
                `UPDATE catalog_fields SET lifecycle_status=?,lifecycle_note=? WHERE id=?`,
              )
              .bind(lifecycleStatus, lifecycleNote, existing.id),
          );
        const currentRevisionId = `${existing.id}:r${revisionMap.get(existing.id) ?? 1}`;
        environmentIds.forEach((environmentId) =>
          statements.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`,
              )
              .bind(
                existing.id,
                projectId,
                versionId,
                environmentId,
                sourceKind,
                batchId,
                now(),
              ),
            db
              .prepare(
                `INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) VALUES (?,?,?,?,?)`,
              )
              .bind(
                existing.id,
                versionId,
                environmentId,
                currentRevisionId,
                now(),
              ),
          ),
        );
        markImportedFieldScopesVerified(existing.id);
        statements.push(
          importItem(
            db,
            batchId,
            parsedField,
            existing.id,
            addsEnvironmentScope ? "added" : "duplicate",
            addsEnvironmentScope
              ? "字段定义已存在，已补充到所选环境。"
              : "字段已存在，仅补充缺少的环境关系。",
          ),
        );
        selectedScopeFieldIds.add(existing.id);
        continue;
      }
      if (parsedField.action === "modify" || parsedField.action === "change") {
        conflicts += 1;
        statements.push(
          importItem(
            db,
            batchId,
            parsedField,
            null,
            "conflict",
            "要修改的原字段不存在，未创建新字段。",
          ),
        );
        continue;
      }
      const fieldId = id(),
        code = fieldCode(table.code, fieldCodes);
      if (historical) lifecycleTargets.field.add(fieldId);
      const revisionId = `${fieldId}:r1`;
      statements.push(
        db
          .prepare(
            `INSERT INTO catalog_fields (id,table_id,code,name,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            fieldId,
            table.id,
            code,
            parsedField.columnName.toLowerCase(),
            parsedField.dataType,
            parsedField.nullable ? 1 : 0,
            parsedField.defaultValue,
            parsedField.comment,
            parsedField.extra,
            parsedField.ordinal,
            sourceKind,
            batchId,
            now(),
            lifecycleStatus,
            lifecycleNote,
          ),
      );
      statements.push(
        db
          .prepare(
            `INSERT INTO catalog_field_revisions (id,field_id,revision,data_type,nullable,default_value,comment,extra,ordinal,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            revisionId,
            fieldId,
            1,
            parsedField.dataType,
            parsedField.nullable ? 1 : 0,
            parsedField.defaultValue,
            parsedField.comment,
            parsedField.extra,
            parsedField.ordinal,
            sourceKind,
            batchId,
            fieldFingerprint(parsedField),
            now(),
          ),
      );
      environmentIds.forEach((environmentId) =>
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO field_scopes VALUES (?,?,?,?, 'present',?,?,?)`,
            )
            .bind(
              fieldId,
              projectId,
              versionId,
              environmentId,
              sourceKind,
              batchId,
              now(),
            ),
          db
            .prepare(
              `INSERT OR REPLACE INTO catalog_field_scope_revisions (field_id,version_id,environment_id,revision_id,updated_at) VALUES (?,?,?,?,?)`,
            )
            .bind(fieldId, versionId, environmentId, revisionId, now()),
        ),
      );
      statements.push(
        importItem(
          db,
          batchId,
          parsedField,
          fieldId,
          "added",
          "新增字段并应用到所选环境。",
        ),
      );
      addChange(parsedField, fieldId, "added");
      fieldMap.set(
        `${parsedField.tableName}.${parsedField.columnName.toLowerCase()}`,
        {
          id: fieldId,
          code,
          name: parsedField.columnName,
          dataType: parsedField.dataType,
          nullable: parsedField.nullable ? 1 : 0,
          defaultValue: parsedField.defaultValue,
          comment: parsedField.comment,
          extra: parsedField.extra,
          ordinal: parsedField.ordinal,
          tableName: parsedField.tableName,
          tableId: table.id,
        },
      );
      added += 1;
    }
    for (const table of parsed.tables) {
      const incomingNames = new Set(
        parsed.fields
          .filter(
            (field) =>
              field.tableName === table.name && field.action !== "drop",
          )
          .map((field) => field.columnName.toLowerCase()),
      );
      for (const existing of fieldRows.results.filter(
        (field) =>
          field.tableName.toLowerCase() === table.name &&
          !incomingNames.has(field.name.toLowerCase()) &&
          selectedScopeFieldIds.has(field.id),
      )) {
        const synthetic: ParsedField = {
          action: "drop",
          tableName: table.name,
          columnName: existing.name,
          dataType: "",
          nullable: true,
          defaultValue: null,
          comment: "",
          extra: "",
          ordinal: existing.ordinal,
          statementNo: 0,
        };
        const placeholders = environmentIds.map(() => "?").join(",");
        const priorScopes = await db
          .prepare(
            `SELECT field_id AS fieldId,project_id AS projectId,version_id AS versionId,environment_id AS environmentId,state,origin,import_batch_id AS importBatchId,created_at AS createdAt FROM field_scopes WHERE field_id=? AND project_id=? AND version_id=? AND environment_id IN (${placeholders})`,
          )
          .bind(existing.id, projectId, versionId, ...environmentIds)
          .all();
        environmentIds.forEach((environmentId) =>
          statements.push(
            db
              .prepare(
                `DELETE FROM field_scopes WHERE field_id=? AND project_id=? AND version_id=? AND environment_id=?`,
              )
              .bind(existing.id, projectId, versionId, environmentId),
            db
              .prepare(
                `DELETE FROM catalog_field_scope_revisions WHERE field_id=? AND version_id=? AND environment_id=?`,
              )
              .bind(existing.id, versionId, environmentId),
          ),
        );
        statements.push(
          importItem(
            db,
            batchId,
            synthetic,
            existing.id,
            "removed",
            "建表语句中没有该字段，已从所选环境移除字段登记。",
            { field: existing, scopes: priorScopes.results },
          ),
        );
        addChange(synthetic, existing.id, "removed");
        removed += 1;
      }
    }
    for (const parsedIndex of parsed.indexes) {
      const table = tableMap.get(parsedIndex.tableName);
      if (!table) {
        conflicts += 1;
        continue;
      }
      const key = `${table.id}.${parsedIndex.name.toLowerCase()}`;
      const existing = indexMap.get(key);
      if (parsedIndex.action === "drop") {
        if (existing) {
          environmentIds.forEach((environmentId) =>
            statements.push(
              db
                .prepare(
                  `DELETE FROM catalog_index_scopes WHERE index_id=? AND version_id=? AND environment_id=?`,
                )
                .bind(existing.id, versionId, environmentId),
            ),
          );
          indexMap.delete(key);
        } else duplicates += 1;
        continue;
      }
      const columnsJson = JSON.stringify(parsedIndex.columns);
      const indexId = existing?.id ?? id();
      if (historical) lifecycleTargets.index.add(indexId);
      if (!existing)
        statements.push(
          db
            .prepare(
              `INSERT INTO catalog_indexes (id,table_id,name,kind,columns_json,source_kind,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              indexId,
              table.id,
              parsedIndex.name,
              parsedIndex.kind,
              columnsJson,
              sourceKind,
              batchId,
              now(),
              lifecycleStatus,
              lifecycleNote,
            ),
        );
      else if (
        existing.kind !== parsedIndex.kind ||
        existing.columnsJson !== columnsJson ||
        historical
      )
        statements.push(
          db
            .prepare(
              `UPDATE catalog_indexes SET kind=?,columns_json=?,source_kind=?,import_batch_id=?,lifecycle_status=?,lifecycle_note=? WHERE id=?`,
            )
            .bind(
              parsedIndex.kind,
              columnsJson,
              sourceKind,
              batchId,
              lifecycleStatus,
              lifecycleNote,
              existing.id,
            ),
        );
      const nextIndexRevision = (indexRevisionMap.get(indexId) ?? 0) + 1;
      statements.push(
        db
          .prepare(
            `INSERT INTO catalog_index_revisions (id,index_id,revision,kind,columns_json,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            `${indexId}:r${nextIndexRevision}`,
            indexId,
            nextIndexRevision,
            parsedIndex.kind,
            columnsJson,
            sourceKind,
            batchId,
            `${parsedIndex.kind}|${columnsJson}`,
            now(),
          ),
      );
      indexRevisionMap.set(indexId, nextIndexRevision);
      environmentIds.forEach((environmentId) =>
        statements.push(
          db
            .prepare(
              `INSERT OR REPLACE INTO catalog_index_scopes VALUES (?,?,?,?, 'present',?,?,?)`,
            )
            .bind(
              indexId,
              projectId,
              versionId,
              environmentId,
              sourceKind,
              batchId,
              now(),
            ),
        ),
      );
      indexMap.set(key, {
        id: indexId,
        tableId: table.id,
        name: parsedIndex.name,
        kind: parsedIndex.kind,
        columnsJson,
      });
    }
    for (const parsedConstraint of parsed.constraints) {
      const table = tableMap.get(parsedConstraint.tableName);
      if (!table) {
        conflicts += 1;
        continue;
      }
      const key = `${table.id}.${parsedConstraint.name.toLowerCase()}`;
      const existing = constraintMap.get(key);
      if (parsedConstraint.action === "drop") {
        if (existing)
          environmentIds.forEach((environmentId) =>
            statements.push(
              db
                .prepare(
                  `DELETE FROM catalog_constraint_scopes WHERE constraint_id=? AND version_id=? AND environment_id=?`,
                )
                .bind(existing.id, versionId, environmentId),
            ),
          );
        else duplicates += 1;
        continue;
      }
      const constraintId = existing?.id ?? id();
      if (historical) lifecycleTargets.constraint.add(constraintId);
      if (!existing)
        statements.push(
          db
            .prepare(
              `INSERT INTO catalog_constraints (id,table_id,name,kind,definition,source_kind,import_batch_id,created_at,lifecycle_status,lifecycle_note) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              constraintId,
              table.id,
              parsedConstraint.name,
              parsedConstraint.kind,
              parsedConstraint.definition,
              sourceKind,
              batchId,
              now(),
              lifecycleStatus,
              lifecycleNote,
            ),
        );
      else if (
        existing.definition !== parsedConstraint.definition ||
        historical
      )
        statements.push(
          db
            .prepare(
              `UPDATE catalog_constraints SET kind=?,definition=?,source_kind=?,import_batch_id=?,lifecycle_status=?,lifecycle_note=? WHERE id=?`,
            )
            .bind(
              parsedConstraint.kind,
              parsedConstraint.definition,
              sourceKind,
              batchId,
              lifecycleStatus,
              lifecycleNote,
              existing.id,
            ),
        );
      const nextConstraintRevision =
        (constraintRevisionMap.get(constraintId) ?? 0) + 1;
      statements.push(
        db
          .prepare(
            `INSERT INTO catalog_constraint_revisions (id,constraint_id,revision,kind,definition,source_kind,import_batch_id,fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            `${constraintId}:r${nextConstraintRevision}`,
            constraintId,
            nextConstraintRevision,
            parsedConstraint.kind,
            parsedConstraint.definition,
            sourceKind,
            batchId,
            `${parsedConstraint.kind}|${parsedConstraint.definition}`,
            now(),
          ),
      );
      constraintRevisionMap.set(constraintId, nextConstraintRevision);
      environmentIds.forEach((environmentId) =>
        statements.push(
          db
            .prepare(
              `INSERT OR REPLACE INTO catalog_constraint_scopes VALUES (?,?,?,?, 'present',?,?,?)`,
            )
            .bind(
              constraintId,
              projectId,
              versionId,
              environmentId,
              sourceKind,
              batchId,
              now(),
            ),
        ),
      );
      constraintMap.set(key, {
        id: constraintId,
        tableId: table.id,
        name: parsedConstraint.name,
        kind: parsedConstraint.kind,
        definition: parsedConstraint.definition,
      });
    }
    if (historical) {
      (Object.entries(lifecycleTargets) as [string, Set<string>][]).forEach(
        ([entity, objectIds]) => {
          objectIds.forEach((objectId) =>
            statements.push(
              db
                .prepare(
                  `INSERT INTO catalog_object_lifecycles (entity,object_id,project_id,status,note,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(entity,object_id,project_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at`,
                )
                .bind(
                  entity,
                  objectId,
                  projectId,
                  lifecycleStatus,
                  lifecycleNote,
                  now(),
                ),
            ),
          );
        },
      );
    }
    statements.unshift(
      db
        .prepare(
          `INSERT INTO import_batches (id,code,name,source_kind,file_name,source_path,git_commit,fingerprint,raw_sql,import_mode,project_id,version_id,module_id,status,added_count,duplicate_count,modified_count,removed_count,conflict_count,created_at,reverted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,NULL)`,
        )
        .bind(
          batchId,
          batchCode,
          clean(payload.name) ||
            clean(payload.fileName) ||
            (createSnapshot ? "环境结构快照" : "已执行 SQL"),
          sourceKind,
          clean(payload.fileName) || null,
          sourcePath,
          gitCommit,
          fingerprint,
          sql,
          importMode,
          projectId,
          versionId,
          moduleId,
          added,
          duplicates,
          modified,
          removed,
          conflicts,
          now(),
        ),
    );
    statements.splice(
      1,
      0,
      ...environmentIds.map((environmentId) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO import_batch_environments (batch_id,environment_id) VALUES (?,?)`,
          )
          .bind(batchId, environmentId),
      ),
    );
    statements.splice(
      1 + environmentIds.length,
      0,
      ...environmentIds.map((environmentId) => {
        const stamp = now();
        const executionStatus = createSnapshot ? "verified" : "executed";
        return db
          .prepare(
            `INSERT INTO catalog_sql_executions (id,import_batch_id,project_id,version_id,environment_id,status,sql_text,source_kind,source_path,git_commit,created_at,started_at,finished_at,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            id(),
            batchId,
            projectId,
            versionId,
            environmentId,
            executionStatus,
            sql,
            sourceKind,
            sourcePath,
            gitCommit,
            stamp,
            stamp,
            createSnapshot ? stamp : null,
            createSnapshot
              ? "环境快照已采集并确认。"
              : "已登记为在该环境执行，等待结构快照验证。",
          );
      }),
    );
    await runChunked(db, statements);
    const snapshots = createSnapshot
      ? await Promise.all(
          environmentIds.map((environmentId) =>
            captureEnvironmentSnapshot(db, {
              projectId,
              versionId,
              environmentId,
              importBatchId: batchId,
              sourceKind,
            }),
          ),
        )
      : [];
    const verifiedChanges = createSnapshot
      ? (
          await Promise.all(
            environmentIds.map((environmentId) =>
              verifyChangesAgainstSnapshot(db, {
                projectId,
                versionId,
                environmentId,
              }),
            ),
          )
        ).reduce((sum, count) => sum + count, 0)
      : 0;
    return Response.json({
      ok: true,
      batchCode,
      importMode,
      snapshots,
      verifiedChanges,
      added,
      duplicates,
      modified,
      removed,
      conflicts,
      warnings: parsed.warnings,
    });
  }

  return null;
}

/** 生成单条导入明细写入语句，由执行处理器统一批量提交。 */
export function importItem(
  db: D1Database,
  batchId: string,
  field: ParsedField,
  fieldId: string | null,
  result: string,
  message: string,
  beforeSnapshot?: unknown,
) {
  return db
    .prepare(
      `INSERT INTO import_items (id,batch_id,statement_no,action,table_name,column_name,field_id,result,message,fingerprint,before_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id(),
      batchId,
      field.statementNo,
      field.action,
      field.tableName,
      field.columnName,
      fieldId,
      result,
      message,
      fieldFingerprint(field),
      beforeSnapshot === undefined ? null : JSON.stringify(beforeSnapshot),
    );
}
