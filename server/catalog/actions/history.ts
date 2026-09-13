import { clean, hash, id, now, runChunked, validateScopeSelection } from "@/server/catalog/shared";
import { latestSnapshotObjects } from "@/server/catalog/snapshots";
import type { CatalogActionContext } from "@/server/catalog/actions/context";

/**
 * 处理历史、SQL 登记和范围比较命令。
 *
 * 负责 schema.history、sql.history、sql.register 与 scope.compare；
 * 没有命中本组 action 时返回 null，让上层继续分派。
 */
export async function handleHistoryAction({
  action,
  payload,
  db,
}: CatalogActionContext): Promise<Response | null> {
  if (action === "schema.history") {
    const kind = clean(payload.kind),
      recordId = clean(payload.id);
    if (!["table", "field"].includes(kind) || !recordId)
      return Response.json(
        { error: "请选择要查看历史的数据表或字段。" },
        { status: 400 },
      );
    const focus =
      kind === "table"
        ? await db
            .prepare(
              `SELECT t.id,t.name AS tableName,NULL AS columnName,t.code,t.created_at AS createdAt,t.import_batch_id AS importBatchId FROM catalog_tables t WHERE t.id=?`,
            )
            .bind(recordId)
            .first<{
              id: string;
              tableName: string;
              columnName: null;
              code: string;
              createdAt: string;
              importBatchId: string | null;
            }>()
        : await db
            .prepare(
              `SELECT f.id,t.name AS tableName,f.name AS columnName,f.code,f.created_at AS createdAt,f.import_batch_id AS importBatchId FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE f.id=?`,
            )
            .bind(recordId)
            .first<{
              id: string;
              tableName: string;
              columnName: string;
              code: string;
              createdAt: string;
              importBatchId: string | null;
            }>();
    if (!focus)
      return Response.json({ error: "要查看的对象不存在。" }, { status: 404 });
    const revisionFilter = kind === "table" ? "f.table_id=?" : "f.id=?";
    const revisions = (
      await db
        .prepare(
          `SELECT fr.id,'revision' AS kind,fr.revision,f.code,f.name AS columnName,t.name AS tableName,
      fr.data_type AS dataType,fr.nullable,fr.default_value AS defaultValue,fr.comment,fr.extra,fr.source_kind AS sourceKind,
      ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,fr.created_at AS createdAt
      FROM catalog_field_revisions fr JOIN catalog_fields f ON f.id=fr.field_id JOIN catalog_tables t ON t.id=f.table_id
      LEFT JOIN import_batches ib ON ib.id=fr.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id
      LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id
      WHERE ${revisionFilter} GROUP BY fr.id ORDER BY fr.created_at DESC,fr.revision DESC`,
        )
        .bind(recordId)
        .all()
    ).results;
    const removedFilter =
      kind === "table" ? "ii.table_name=?" : "ii.field_id=?";
    const removedValue = kind === "table" ? focus.tableName : recordId;
    const removals = (
      await db
        .prepare(
          `SELECT ii.id,'removed' AS kind,0 AS revision,NULL AS code,ii.column_name AS columnName,ii.table_name AS tableName,
      NULL AS dataType,1 AS nullable,NULL AS defaultValue,'' AS comment,'' AS extra,ib.source_kind AS sourceKind,ii.message,
      ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,ib.created_at AS createdAt
      FROM import_items ii JOIN import_batches ib ON ib.id=ii.batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id
      LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id
      WHERE ${removedFilter} AND ii.result IN ('removed','scope_removed') GROUP BY ii.id ORDER BY ib.created_at DESC`,
        )
        .bind(removedValue)
        .all()
    ).results;
    const structural = (
      kind === "table"
        ? (
            await db
              .prepare(
                `SELECT i.id,'index' AS kind,0 AS revision,NULL AS code,NULL AS columnName,t.name AS tableName,i.kind AS dataType,1 AS nullable,i.columns_json AS defaultValue,'' AS comment,i.name AS extra,i.source_kind AS sourceKind,ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,i.created_at AS createdAt FROM catalog_indexes i JOIN catalog_tables t ON t.id=i.table_id LEFT JOIN import_batches ib ON ib.id=i.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id WHERE i.table_id=? GROUP BY i.id`,
              )
              .bind(recordId)
              .all()
          ).results
        : []
    ).concat(
      kind === "table"
        ? (
            await db
              .prepare(
                `SELECT c.id,'constraint' AS kind,0 AS revision,NULL AS code,NULL AS columnName,t.name AS tableName,c.kind AS dataType,1 AS nullable,c.definition AS defaultValue,'' AS comment,c.name AS extra,c.source_kind AS sourceKind,ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,c.created_at AS createdAt FROM catalog_constraints c JOIN catalog_tables t ON t.id=c.table_id LEFT JOIN import_batches ib ON ib.id=c.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id WHERE c.table_id=? GROUP BY c.id`,
              )
              .bind(recordId)
              .all()
          ).results
        : [],
    );
    const revisionsStructural =
      kind === "table"
        ? (
            await db
              .prepare(
                `SELECT r.id,'index_revision' AS kind,r.revision,NULL AS code,NULL AS columnName,t.name AS tableName,r.kind AS dataType,1 AS nullable,r.columns_json AS defaultValue,'' AS comment,i.name AS extra,r.source_kind AS sourceKind,ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,r.created_at AS createdAt FROM catalog_index_revisions r JOIN catalog_indexes i ON i.id=r.index_id JOIN catalog_tables t ON t.id=i.table_id LEFT JOIN import_batches ib ON ib.id=r.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id WHERE i.table_id=? GROUP BY r.id`,
              )
              .bind(recordId)
              .all()
          ).results
        : [];
    const constraintRevisions =
      kind === "table"
        ? (
            await db
              .prepare(
                `SELECT r.id,'constraint_revision' AS kind,r.revision,NULL AS code,NULL AS columnName,t.name AS tableName,r.kind AS dataType,1 AS nullable,r.definition AS defaultValue,'' AS comment,c.name AS extra,r.source_kind AS sourceKind,ib.name AS batchName,ib.code AS batchCode,p.name AS projectName,v.name AS versionName,group_concat(e.name,'|||') AS environmentNames,r.created_at AS createdAt FROM catalog_constraint_revisions r JOIN catalog_constraints c ON c.id=r.constraint_id JOIN catalog_tables t ON t.id=c.table_id LEFT JOIN import_batches ib ON ib.id=r.import_batch_id LEFT JOIN catalog_projects p ON p.id=ib.project_id LEFT JOIN catalog_versions v ON v.id=ib.version_id LEFT JOIN import_batch_environments ibe ON ibe.batch_id=ib.id LEFT JOIN catalog_environments e ON e.id=ibe.environment_id WHERE c.table_id=? GROUP BY r.id`,
              )
              .bind(recordId)
              .all()
          ).results
        : [];
    const tableEvent =
      kind === "table"
        ? [
            {
              id: `${focus.id}:created`,
              kind: "table_created",
              revision: 0,
              code: focus.code,
              columnName: null,
              tableName: focus.tableName,
              dataType: null,
              nullable: 1,
              defaultValue: null,
              comment: "",
              extra: "",
              sourceKind: focus.importBatchId ? "import" : "manual",
              batchName: null,
              batchCode: null,
              projectName: null,
              versionName: null,
              environmentNames: null,
              createdAt: focus.createdAt,
            },
          ]
        : [];
    const events = [
      ...tableEvent,
      ...revisions,
      ...removals,
      ...structural,
      ...revisionsStructural,
      ...constraintRevisions,
    ].sort((left, right) =>
      String((right as { createdAt: string }).createdAt).localeCompare(
        String((left as { createdAt: string }).createdAt),
      ),
    );
    return Response.json({
      ok: true,
      focus: {
        kind,
        id: focus.id,
        code: focus.code,
        tableName: focus.tableName,
        columnName: focus.columnName,
      },
      events,
    });
  }

  if (action === "sql.history") {
    const projectId = clean(payload.projectId),
      versionId = clean(payload.versionId),
      environmentId = clean(payload.environmentId),
      batchId = clean(payload.importBatchId);
    const clauses: string[] = [];
    const binds: string[] = [];
    if (projectId) {
      clauses.push("x.project_id=?");
      binds.push(projectId);
    }
    if (versionId) {
      clauses.push("x.version_id=?");
      binds.push(versionId);
    }
    if (environmentId) {
      clauses.push("x.environment_id=?");
      binds.push(environmentId);
    }
    if (batchId) {
      clauses.push("x.import_batch_id=?");
      binds.push(batchId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await db
      .prepare(
        `SELECT x.id,x.import_batch_id AS importBatchId,x.project_id AS projectId,x.version_id AS versionId,x.environment_id AS environmentId,x.status,x.sql_text AS sqlText,x.source_kind AS sourceKind,x.source_path AS sourcePath,x.git_commit AS gitCommit,x.started_at AS startedAt,x.finished_at AS finishedAt,x.note,x.created_at AS createdAt,b.name AS batchName,b.code AS batchCode,p.name AS projectName,v.name AS versionName,e.name AS environmentName FROM catalog_sql_executions x JOIN import_batches b ON b.id=x.import_batch_id JOIN catalog_projects p ON p.id=x.project_id JOIN catalog_versions v ON v.id=x.version_id JOIN catalog_environments e ON e.id=x.environment_id ${where} ORDER BY x.created_at DESC LIMIT 200`,
      )
      .bind(...binds)
      .all();
    return Response.json({ ok: true, executions: rows.results });
  }

  if (action === "sql.register") {
    const projectId = clean(payload.projectId),
      versionId = clean(payload.versionId),
      sqlText = clean(payload.sqlText),
      name = clean(payload.name) || "锚点同步 SQL";
    const anchorEnvironmentId = clean(payload.anchorEnvironmentId);
    const environmentIds = Array.isArray(payload.environmentIds)
      ? payload.environmentIds.map(clean).filter(Boolean)
      : [];
    if (
      !projectId ||
      !versionId ||
      !sqlText ||
      !anchorEnvironmentId ||
      !environmentIds.length
    )
      return Response.json(
        { error: "请提供项目、版本、锚定环境、SQL，并至少选择一个环境。" },
        { status: 400 },
      );
    const project = await db
      .prepare(`SELECT id FROM catalog_projects WHERE id=? AND archived=0`)
      .bind(projectId)
      .first<{ id: string }>();
    const version = await db
      .prepare(`SELECT id FROM catalog_versions WHERE id=? AND project_id=?`)
      .bind(versionId, projectId)
      .first<{ id: string }>();
    if (!project || !version)
      return Response.json({ error: "项目或版本不存在。" }, { status: 404 });
    const placeholders = environmentIds.map(() => "?").join(",");
    const envRows = (
      await db
        .prepare(
          `SELECT id,version_id AS versionId FROM catalog_environments WHERE project_id=? AND id IN (${placeholders}) AND archived=0`,
        )
        .bind(projectId, ...environmentIds)
        .all<{ id: string; versionId: string | null }>()
    ).results;
    const validIds = envRows.map((row) => row.id);
    if (
      !validIds.includes(anchorEnvironmentId) ||
      validIds.length !== new Set(environmentIds).size
    )
      return Response.json(
        { error: "所选环境必须属于当前项目，且包含锚定环境。" },
        { status: 400 },
      );
    const batchId = id(),
      batchCode = `SYNC-${new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll("-", "")}-${batchId.slice(0, 8).toUpperCase()}`;
    const createdAt = now();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO import_batches (id,code,name,source_kind,file_name,source_path,git_commit,fingerprint,raw_sql,project_id,version_id,module_id,status,added_count,duplicate_count,modified_count,removed_count,conflict_count,created_at,reverted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,'active',0,0,0,0,0,?,NULL)`,
        )
        .bind(
          batchId,
          batchCode,
          name,
          "generated",
          null,
          null,
          null,
          await hash(`${projectId}|${versionId}|${sqlText}|${createdAt}`),
          sqlText,
          projectId,
          versionId,
          createdAt,
        ),
    ];
    envRows.forEach((environment) => {
      const environmentId = environment.id;
      const executionVersionId = environment.versionId || versionId;
      statements.push(
        db
          .prepare(
            `INSERT INTO import_batch_environments (batch_id,environment_id) VALUES (?,?)`,
          )
          .bind(batchId, environmentId),
      );
      statements.push(
        db
          .prepare(
            `INSERT INTO catalog_sql_executions (id,import_batch_id,project_id,version_id,environment_id,status,sql_text,source_kind,source_path,git_commit,created_at,started_at,finished_at,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            id(),
            batchId,
            projectId,
            executionVersionId,
            environmentId,
            environmentId === anchorEnvironmentId ? "executed" : "registered",
            sqlText,
            "generated",
            null,
            null,
            createdAt,
            environmentId === anchorEnvironmentId ? createdAt : null,
            environmentId === anchorEnvironmentId ? createdAt : null,
            environmentId === anchorEnvironmentId
              ? "已确认在锚定环境执行"
              : "等待在该环境执行",
          ),
      );
    });
    await runChunked(db, statements);
    return Response.json({
      ok: true,
      batchId,
      batchCode,
      registered: validIds.length,
    });
  }

  if (action === "scope.compare") {
    type CompareTarget = {
      projectId: string;
      versionId: string;
      environmentId: string;
    };
    type CompareField = {
      id: string;
      code: string;
      name: string;
      tableName: string;
      dataType: string;
      nullable: number;
      defaultValue: string | null;
      comment: string;
      extra: string;
      resolutionKind: string;
      reviewStatus: string;
    };
    const readTarget = (value: unknown): CompareTarget => {
      const target =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      return {
        projectId: clean(target.projectId),
        versionId: clean(target.versionId),
        environmentId: clean(target.environmentId),
      };
    };
    const base = readTarget(payload.base),
      target = readTarget(payload.target);
    const tableId = clean(payload.tableId),
      fieldId = clean(payload.fieldId);
    if (
      !base.projectId ||
      !base.versionId ||
      !base.environmentId ||
      !target.projectId ||
      !target.versionId ||
      !target.environmentId
    )
      return Response.json(
        { error: "请选择完整的基准项目、版本、环境和目标项目、版本、环境。" },
        { status: 400 },
      );
    const [baseScopeError, targetScopeError] = await Promise.all([
      validateScopeSelection(db, base.projectId, base.versionId, [
        base.environmentId,
      ]),
      validateScopeSelection(db, target.projectId, target.versionId, [
        target.environmentId,
      ]),
    ]);
    if (baseScopeError || targetScopeError)
      return Response.json(
        { error: baseScopeError || targetScopeError },
        { status: 400 },
      );
    const [baseSnapshot, targetSnapshot, focusTable] = await Promise.all([
      latestSnapshotObjects(db, base),
      latestSnapshotObjects(db, target),
      tableId
        ? db
            .prepare(`SELECT name FROM catalog_tables WHERE id=?`)
            .bind(tableId)
            .first<{ name: string }>()
        : Promise.resolve(null),
    ]);
    const focusSql = fieldId
      ? " AND f.id=?"
      : tableId
        ? " AND f.table_id=?"
        : "";
    const focusValue = fieldId || tableId;
    const snapshotFields = (
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshot?.rows
        .filter((row) => row.entity === "field")
        .flatMap((row) => {
          try {
            const field = {
              ...(JSON.parse(row.definitionJson) as Omit<
                CompareField,
                "id" | "resolutionKind" | "reviewStatus"
              >),
              id: row.objectId ?? row.objectKey,
              resolutionKind: "same",
              reviewStatus: "confirmed",
            } as CompareField;
            return (!fieldId || field.id === fieldId) &&
              (!tableId ||
                field.tableName.toLowerCase() ===
                  focusTable?.name.toLowerCase())
              ? [field]
              : [];
          } catch {
            return [];
          }
        }) ?? null;
    const readFields = async (
      scope: CompareTarget,
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshotFields(snapshot) ??
      (
        await db
          .prepare(
            `SELECT f.id,f.code,f.name,t.name AS tableName,
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
      ORDER BY t.name,f.ordinal,f.name`,
          )
          .bind(
            scope.projectId,
            scope.versionId,
            scope.environmentId,
            scope.projectId,
            scope.projectId,
            ...(focusValue ? [focusValue] : []),
          )
          .all<CompareField>()
      ).results;
    const [baseFields, targetFields] = await Promise.all([
      readFields(base, baseSnapshot),
      readFields(target, targetSnapshot),
    ]);
    const readTablePresence = async (
      scope: CompareTarget,
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) => {
      if (!tableId) return null;
      if (snapshot)
        return snapshot.rows.some(
          (row) =>
            row.entity === "table" &&
            (row.objectId === tableId ||
              row.objectKey === focusTable?.name.toLowerCase()),
        );
      const row = await db
        .prepare(
          `SELECT 1 AS present FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id
        WHERE s.table_id=? AND s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present'
          AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'
        LIMIT 1`,
        )
        .bind(
          tableId,
          scope.projectId,
          scope.versionId,
          scope.environmentId,
          scope.projectId,
        )
        .first<{ present: number }>();
      return Boolean(row?.present);
    };
    const [baseTablePresent, targetTablePresent] = await Promise.all([
      readTablePresence(base, baseSnapshot),
      readTablePresence(target, targetSnapshot),
    ]);
    const snapshotIndexes = (
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshot?.rows
        .filter((row) => row.entity === "index")
        .flatMap((row) => {
          try {
            const item = {
              id: row.objectId ?? row.objectKey,
              ...(JSON.parse(row.definitionJson) as {
                name: string;
                tableName: string;
                kind: string;
                columnsJson: string;
              }),
            };
            return !tableId ||
              item.tableName.toLowerCase() === focusTable?.name.toLowerCase()
              ? [item]
              : [];
          } catch {
            return [];
          }
        }) ?? null;
    const readIndexes = async (
      scope: CompareTarget,
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshotIndexes(snapshot) ??
      (tableId
        ? (
            await db
              .prepare(
                `SELECT i.id,i.name,i.kind,i.columns_json AS columnsJson
      FROM catalog_index_scopes s JOIN catalog_indexes i ON i.id=s.index_id JOIN catalog_tables t ON t.id=i.table_id
      WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND i.table_id=?
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='index' AND l.object_id=i.id AND l.project_id=? LIMIT 1),i.lifecycle_status,'active')='active'
      ORDER BY i.name`,
              )
              .bind(
                scope.projectId,
                scope.versionId,
                scope.environmentId,
                tableId,
                scope.projectId,
                scope.projectId,
              )
              .all<{
                id: string;
                name: string;
                kind: string;
                columnsJson: string;
              }>()
          ).results
        : []);
    const snapshotConstraints = (
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshot?.rows
        .filter((row) => row.entity === "constraint")
        .flatMap((row) => {
          try {
            const item = {
              id: row.objectId ?? row.objectKey,
              ...(JSON.parse(row.definitionJson) as {
                name: string;
                tableName: string;
                kind: string;
                definition: string;
              }),
            };
            return !tableId ||
              item.tableName.toLowerCase() === focusTable?.name.toLowerCase()
              ? [item]
              : [];
          } catch {
            return [];
          }
        }) ?? null;
    const readConstraints = async (
      scope: CompareTarget,
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshotConstraints(snapshot) ??
      (tableId
        ? (
            await db
              .prepare(
                `SELECT c.id,c.name,c.kind,c.definition
      FROM catalog_constraint_scopes s JOIN catalog_constraints c ON c.id=s.constraint_id JOIN catalog_tables t ON t.id=c.table_id
      WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND c.table_id=?
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='constraint' AND l.object_id=c.id AND l.project_id=? LIMIT 1),c.lifecycle_status,'active')='active'
      ORDER BY c.name`,
              )
              .bind(
                scope.projectId,
                scope.versionId,
                scope.environmentId,
                tableId,
                scope.projectId,
                scope.projectId,
              )
              .all<{
                id: string;
                name: string;
                kind: string;
                definition: string;
              }>()
          ).results
        : []);
    const [baseIndexes, targetIndexes, baseConstraints, targetConstraints] =
      await Promise.all([
        readIndexes(base, baseSnapshot),
        readIndexes(target, targetSnapshot),
        readConstraints(base, baseSnapshot),
        readConstraints(target, targetSnapshot),
      ]);
    const baseIndexMap = new Map(
      baseIndexes.map((item) => [item.name.toLowerCase(), item]),
    );
    const targetIndexMap = new Map(
      targetIndexes.map((item) => [item.name.toLowerCase(), item]),
    );
    const indexItems = [
      ...new Set([...baseIndexMap.keys(), ...targetIndexMap.keys()]),
    ]
      .sort()
      .map((indexKey) => {
        const left = baseIndexMap.get(indexKey),
          right = targetIndexMap.get(indexKey);
        if (!left && right)
          return {
            name: right.name,
            kind: right.kind,
            columnsJson: right.columnsJson,
            result: "added",
          };
        if (left && !right)
          return {
            name: left.name,
            kind: left.kind,
            columnsJson: left.columnsJson,
            result: "removed",
          };
        const changed =
          left?.kind !== right?.kind ||
          left?.columnsJson !== right?.columnsJson;
        return {
          name: right?.name ?? left?.name ?? indexKey,
          kind: right?.kind ?? left?.kind ?? "index",
          columnsJson: right?.columnsJson ?? left?.columnsJson ?? "[]",
          result: changed ? "modified" : "unchanged",
        };
      });
    const baseConstraintMap = new Map(
      baseConstraints.map((item) => [item.name.toLowerCase(), item]),
    );
    const targetConstraintMap = new Map(
      targetConstraints.map((item) => [item.name.toLowerCase(), item]),
    );
    const constraintItems = [
      ...new Set([...baseConstraintMap.keys(), ...targetConstraintMap.keys()]),
    ]
      .sort()
      .map((constraintKey) => {
        const left = baseConstraintMap.get(constraintKey),
          right = targetConstraintMap.get(constraintKey);
        if (!left && right)
          return {
            name: right.name,
            kind: right.kind,
            definition: right.definition,
            result: "added",
          };
        if (left && !right)
          return {
            name: left.name,
            kind: left.kind,
            definition: left.definition,
            result: "removed",
          };
        const changed =
          left?.kind !== right?.kind || left?.definition !== right?.definition;
        return {
          name: right?.name ?? left?.name ?? constraintKey,
          kind: right?.kind ?? left?.kind ?? "constraint",
          definition: right?.definition ?? left?.definition ?? "",
          result: changed ? "modified" : "unchanged",
        };
      });
    const key = (field: CompareField, scope: CompareTarget) =>
      `${field.tableName.toLowerCase()}.${field.name.toLowerCase()}${field.resolutionKind === "separate" ? `::${scope.projectId}.${scope.versionId}.${scope.environmentId}` : ""}`;
    const baseMap = new Map(
      baseFields.map((field) => [key(field, base), field]),
    );
    const targetMap = new Map(
      targetFields.map((field) => [key(field, target), field]),
    );
    const keys = [...new Set([...baseMap.keys(), ...targetMap.keys()])].sort();
    const definition = (field: CompareField) =>
      `${field.dataType}${field.nullable ? " NULL" : " NOT NULL"}${field.defaultValue !== null ? ` DEFAULT ${field.defaultValue}` : ""}${field.comment ? ` COMMENT ${field.comment}` : ""}${field.extra ? ` ${field.extra}` : ""}`;
    const items = keys.map((fieldKey) => {
      const before = baseMap.get(fieldKey),
        after = targetMap.get(fieldKey);
      if (!before && after)
        return {
          tableName: after.tableName,
          columnName: after.name,
          fieldCode: after.code,
          result: "added",
          before: null,
          after: definition(after),
          changes: [
            after.resolutionKind === "separate"
              ? "目标范围将它登记为独立逻辑字段"
              : "目标范围新增该字段",
          ],
          resolutionKind: after.resolutionKind,
          reviewStatus: after.reviewStatus,
        };
      if (before && !after)
        return {
          tableName: before.tableName,
          columnName: before.name,
          fieldCode: before.code,
          result: "removed",
          before: definition(before),
          after: null,
          changes: [
            before.resolutionKind === "separate"
              ? "基准范围将它登记为独立逻辑字段"
              : "目标范围没有该字段",
          ],
          resolutionKind: before.resolutionKind,
          reviewStatus: before.reviewStatus,
        };
      const left = before as CompareField,
        right = after as CompareField;
      const changes: string[] = [];
      if (left.dataType.toLowerCase() !== right.dataType.toLowerCase())
        changes.push(`类型：${left.dataType} → ${right.dataType}`);
      if (Boolean(left.nullable) !== Boolean(right.nullable))
        changes.push(
          `可空：${left.nullable ? "是" : "否"} → ${right.nullable ? "是" : "否"}`,
        );
      if ((left.defaultValue ?? null) !== (right.defaultValue ?? null))
        changes.push(
          `默认值：${left.defaultValue ?? "—"} → ${right.defaultValue ?? "—"}`,
        );
      if ((left.comment ?? "") !== (right.comment ?? ""))
        changes.push(`注释：${left.comment || "—"} → ${right.comment || "—"}`);
      if ((left.extra ?? "") !== (right.extra ?? ""))
        changes.push(`属性：${left.extra || "—"} → ${right.extra || "—"}`);
      return {
        tableName: right.tableName,
        columnName: right.name,
        fieldCode: right.code,
        result: changes.length ? "modified" : "unchanged",
        before: definition(left),
        after: definition(right),
        changes,
        resolutionKind: right.resolutionKind,
        reviewStatus: right.reviewStatus,
      };
    });
    const summary = items.reduce(
      (result, item) => ({
        ...result,
        [item.result]: (result[item.result] ?? 0) + 1,
      }),
      {} as Record<string, number>,
    );
    return Response.json({
      ok: true,
      items,
      summary,
      baseCount: baseFields.length,
      targetCount: targetFields.length,
      baseTablePresent,
      targetTablePresent,
      indexItems,
      constraintItems,
      baseSnapshot: baseSnapshot?.snapshot ?? null,
      targetSnapshot: targetSnapshot?.snapshot ?? null,
    });
  }

  return null;
}
