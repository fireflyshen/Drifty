import { ensureDatabase } from "@/db/runtime";
import { clean, csv, fieldDefinition, indexDefinition, lifecycleExpression, sqlIdentifier } from "@/server/catalog/shared";
import { latestSnapshotObjects } from "@/server/catalog/snapshots";

/**
 * 目录读取接口实现。
 *
 * GET 根据 mode 分派基础目录、生命周期、锚点差异、结构搜索、表详情、导入详情、
 * 环境详情、发布批次和项目详情等只读查询。HTTP 入口只负责请求适配，查询结果保持
 * 与既有 /api/catalog 契约兼容。
 */
export async function GET(request: Request) {
  const db = await ensureDatabase();
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "base";

  if (mode === "lifecycle") {
    const [tables, fields, indexes, constraints] = await Promise.all([
      db
        .prepare(
          `SELECT id,'table' AS entity,name,NULL AS tableName,
        coalesce(lifecycle_status,'active') AS lifecycleStatus,coalesce(lifecycle_note,'') AS lifecycleNote
        FROM catalog_tables ORDER BY name`,
        )
        .all(),
      db
        .prepare(
          `SELECT f.id,'field' AS entity,f.name,t.name AS tableName,
        coalesce(f.lifecycle_status,'active') AS lifecycleStatus,coalesce(f.lifecycle_note,'') AS lifecycleNote
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id ORDER BY t.name,f.ordinal,f.name`,
        )
        .all(),
      db
        .prepare(
          `SELECT i.id,'index' AS entity,i.name,t.name AS tableName,
        coalesce(i.lifecycle_status,'active') AS lifecycleStatus,coalesce(i.lifecycle_note,'') AS lifecycleNote
        FROM catalog_indexes i JOIN catalog_tables t ON t.id=i.table_id ORDER BY t.name,i.name`,
        )
        .all(),
      db
        .prepare(
          `SELECT c.id,'constraint' AS entity,c.name,t.name AS tableName,
        coalesce(c.lifecycle_status,'active') AS lifecycleStatus,coalesce(c.lifecycle_note,'') AS lifecycleNote
        FROM catalog_constraints c JOIN catalog_tables t ON t.id=c.table_id ORDER BY t.name,c.name`,
        )
        .all(),
    ]);
    const objects = [
      ...tables.results,
      ...fields.results,
      ...indexes.results,
      ...constraints.results,
    ];
    return Response.json({ objects });
  }

  if (mode === "snapshots") {
    const projectId = clean(url.searchParams.get("projectId"));
    const environmentId = clean(url.searchParams.get("environmentId"));
    const clauses: string[] = [];
    const bindings: string[] = [];
    if (projectId) {
      clauses.push("s.project_id=?");
      bindings.push(projectId);
    }
    if (environmentId) {
      clauses.push("s.environment_id=?");
      bindings.push(environmentId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await db
      .prepare(
        `SELECT s.id,s.code,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.import_batch_id AS importBatchId,s.fingerprint,s.source_kind AS sourceKind,s.captured_at AS capturedAt,p.name AS projectName,v.name AS versionName,e.name AS environmentName,count(o.object_key) AS objectCount FROM catalog_snapshots s JOIN catalog_projects p ON p.id=s.project_id JOIN catalog_versions v ON v.id=s.version_id JOIN catalog_environments e ON e.id=s.environment_id LEFT JOIN catalog_snapshot_objects o ON o.snapshot_id=s.id ${where} GROUP BY s.id ORDER BY s.captured_at DESC LIMIT 100`,
      )
      .bind(...bindings)
      .all();
    return Response.json({ snapshots: rows.results });
  }

  if (mode === "anchor") {
    const projectId = clean(url.searchParams.get("projectId"));
    if (!projectId)
      return Response.json({ error: "请选择项目。" }, { status: 400 });
    const project = await db
      .prepare(
        `SELECT p.id,p.anchor_version_id AS anchorVersionId,p.anchor_environment_id AS anchorEnvironmentId,
      av.name AS anchorVersionName,ae.name AS anchorEnvironmentName,ae.version_id AS anchorEnvironmentVersionId
      FROM catalog_projects p LEFT JOIN catalog_versions av ON av.id=p.anchor_version_id
      LEFT JOIN catalog_environments ae ON ae.id=p.anchor_environment_id WHERE p.id=? AND p.archived=0`,
      )
      .bind(projectId)
      .first<{
        id: string;
        anchorVersionId: string | null;
        anchorEnvironmentId: string | null;
        anchorVersionName: string | null;
        anchorEnvironmentName: string | null;
        anchorEnvironmentVersionId: string | null;
      }>();
    if (!project?.anchorVersionId || !project.anchorEnvironmentId)
      return Response.json(
        { error: "请先为项目设置锚定版本和锚定环境。" },
        { status: 400 },
      );
    const targetVersionId =
      clean(url.searchParams.get("versionId")) || project.anchorVersionId;
    const targetEnvironmentId =
      clean(url.searchParams.get("environmentId")) ||
      project.anchorEnvironmentId;
    const target = await db
      .prepare(
        `SELECT v.id AS versionId,v.name AS versionName,e.id AS environmentId,e.name AS environmentName
      FROM catalog_versions v JOIN catalog_environments e ON e.project_id=v.project_id AND e.id=?
      WHERE v.id=? AND v.project_id=?`,
      )
      .bind(targetEnvironmentId, targetVersionId, projectId)
      .first<{
        versionId: string;
        versionName: string;
        environmentId: string;
        environmentName: string;
      }>();
    if (!target)
      return Response.json(
        { error: "目标版本或环境不属于当前项目。" },
        { status: 400 },
      );
    type ScopeTarget = { versionId: string; environmentId: string };
    const anchor: ScopeTarget = {
      versionId: project.anchorVersionId,
      environmentId: project.anchorEnvironmentId,
    };
    const [anchorSnapshot, targetSnapshot] = await Promise.all([
      latestSnapshotObjects(db, { projectId, ...anchor }),
      latestSnapshotObjects(db, {
        projectId,
        versionId: target.versionId,
        environmentId: target.environmentId,
      }),
    ]);
    type AnchorField = {
      id: string;
      name: string;
      tableName: string;
      dataType: string;
      nullable: number;
      defaultValue: string | null;
      comment: string;
      extra: string;
    };
    const snapshotFields = (
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshot?.rows
        .filter((row) => row.entity === "field")
        .map((row) => {
          try {
            const value = JSON.parse(row.definitionJson) as {
              name: string;
              tableName: string;
              dataType: string;
              nullable: boolean;
              defaultValue: string | null;
              comment: string;
              extra: string;
            };
            return {
              id: row.objectId ?? row.objectKey,
              ...value,
              nullable: value.nullable ? 1 : 0,
            };
          } catch {
            return null;
          }
        })
        .filter((item): item is AnchorField => Boolean(item)) ?? null;
    const readFields = async (
      scope: ScopeTarget,
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshotFields(snapshot) ??
      (
        await db
          .prepare(
            `SELECT f.id,f.name,t.name AS tableName,
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
        AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=f.id AND l.project_id=? LIMIT 1),f.lifecycle_status,'active')='active'`,
          )
          .bind(
            projectId,
            scope.versionId,
            scope.environmentId,
            projectId,
            projectId,
          )
          .all<AnchorField>()
      ).results;
    const snapshotIndexes = (
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshot?.rows
        .filter((row) => row.entity === "index")
        .map((row) => {
          try {
            return {
              id: row.objectId ?? row.objectKey,
              ...(JSON.parse(row.definitionJson) as {
                name: string;
                kind: string;
                columnsJson: string;
                tableName: string;
              }),
            };
          } catch {
            return null;
          }
        })
        .filter(
          (
            item,
          ): item is {
            id: string;
            name: string;
            kind: string;
            columnsJson: string;
            tableName: string;
          } => Boolean(item),
        ) ?? null;
    const readIndexes = async (
      scope: ScopeTarget,
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshotIndexes(snapshot) ??
      (
        await db
          .prepare(
            `SELECT i.id,i.name,i.kind,i.columns_json AS columnsJson,t.name AS tableName FROM catalog_index_scopes s JOIN catalog_indexes i ON i.id=s.index_id JOIN catalog_tables t ON t.id=i.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='index' AND l.object_id=i.id AND l.project_id=? LIMIT 1),i.lifecycle_status,'active')='active'`,
          )
          .bind(
            projectId,
            scope.versionId,
            scope.environmentId,
            projectId,
            projectId,
          )
          .all<{
            id: string;
            name: string;
            kind: string;
            columnsJson: string;
            tableName: string;
          }>()
      ).results;
    const snapshotConstraints = (
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshot?.rows
        .filter((row) => row.entity === "constraint")
        .map((row) => {
          try {
            return {
              id: row.objectId ?? row.objectKey,
              ...(JSON.parse(row.definitionJson) as {
                name: string;
                kind: string;
                definition: string;
                tableName: string;
              }),
            };
          } catch {
            return null;
          }
        })
        .filter(
          (
            item,
          ): item is {
            id: string;
            name: string;
            kind: string;
            definition: string;
            tableName: string;
          } => Boolean(item),
        ) ?? null;
    const readConstraints = async (
      scope: ScopeTarget,
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshotConstraints(snapshot) ??
      (
        await db
          .prepare(
            `SELECT c.id,c.name,c.kind,c.definition,t.name AS tableName FROM catalog_constraint_scopes s JOIN catalog_constraints c ON c.id=s.constraint_id JOIN catalog_tables t ON t.id=c.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='constraint' AND l.object_id=c.id AND l.project_id=? LIMIT 1),c.lifecycle_status,'active')='active'`,
          )
          .bind(
            projectId,
            scope.versionId,
            scope.environmentId,
            projectId,
            projectId,
          )
          .all<{
            id: string;
            name: string;
            kind: string;
            definition: string;
            tableName: string;
          }>()
      ).results;
    const readTables = async (
      scope: ScopeTarget,
      snapshot: Awaited<ReturnType<typeof latestSnapshotObjects>>,
    ) =>
      snapshot
        ? snapshot.rows
            .filter((row) => row.entity === "table")
            .map((row) => row.objectKey)
        : (
            await db
              .prepare(
                `SELECT DISTINCT t.name FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id WHERE s.project_id=? AND s.version_id=? AND s.environment_id=? AND s.state='present' AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active'`,
              )
              .bind(projectId, scope.versionId, scope.environmentId, projectId)
              .all<{ name: string }>()
          ).results.map((item) => item.name.toLowerCase());
    const [
      anchorFields,
      targetFields,
      anchorIndexes,
      targetIndexes,
      anchorConstraints,
      targetConstraints,
      anchorTables,
      targetTables,
      executions,
    ] = await Promise.all([
      readFields(anchor, anchorSnapshot),
      readFields(target, targetSnapshot),
      readIndexes(anchor, anchorSnapshot),
      readIndexes(target, targetSnapshot),
      readConstraints(anchor, anchorSnapshot),
      readConstraints(target, targetSnapshot),
      readTables(anchor, anchorSnapshot),
      readTables(target, targetSnapshot),
      db
        .prepare(
          `SELECT x.id,x.status,x.environment_id AS environmentId,e.name AS environmentName,v.name AS versionName,x.created_at AS createdAt,x.sql_text AS sqlText FROM catalog_sql_executions x JOIN catalog_environments e ON e.id=x.environment_id JOIN catalog_versions v ON v.id=x.version_id WHERE x.project_id=? ORDER BY x.created_at DESC LIMIT 200`,
        )
        .bind(projectId)
        .all<{
          id: string;
          status: string;
          environmentId: string;
          environmentName: string;
          versionName: string;
          createdAt: string;
          sqlText: string;
        }>(),
    ]);
    const fieldKey = (item: { tableName: string; name: string }) =>
      `${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`;
    const anchorFieldMap = new Map(
        anchorFields.map((item) => [fieldKey(item), item]),
      ),
      targetFieldMap = new Map(
        targetFields.map((item) => [fieldKey(item), item]),
      );
    const fieldItems = [
      ...new Set([...anchorFieldMap.keys(), ...targetFieldMap.keys()]),
    ]
      .sort()
      .map((key) => {
        const left = anchorFieldMap.get(key),
          right = targetFieldMap.get(key);
        if (left && !right)
          return {
            tableName: left.tableName,
            columnName: left.name,
            result: "added" as const,
            before: fieldDefinition(left),
            after: null,
            changes: ["锚点存在，目标环境缺少"],
          };
        if (!left && right)
          return {
            tableName: right.tableName,
            columnName: right.name,
            result: "removed" as const,
            before: null,
            after: fieldDefinition(right),
            changes: ["目标环境存在，锚点已没有（保留，不自动删除）"],
          };
        const changes: string[] = [];
        if (left!.dataType !== right!.dataType)
          changes.push(`类型：${left!.dataType} → ${right!.dataType}`);
        if (Boolean(left!.nullable) !== Boolean(right!.nullable))
          changes.push(
            `可空：${left!.nullable ? "是" : "否"} → ${right!.nullable ? "是" : "否"}`,
          );
        if ((left!.defaultValue ?? null) !== (right!.defaultValue ?? null))
          changes.push(
            `默认值：${left!.defaultValue ?? "—"} → ${right!.defaultValue ?? "—"}`,
          );
        if (left!.comment !== right!.comment)
          changes.push(
            `注释：${left!.comment || "—"} → ${right!.comment || "—"}`,
          );
        if (left!.extra !== right!.extra)
          changes.push(`属性：${left!.extra || "—"} → ${right!.extra || "—"}`);
        return {
          tableName: right!.tableName,
          columnName: right!.name,
          result: changes.length
            ? ("modified" as const)
            : ("modified" as const),
          before: fieldDefinition(left!),
          after: fieldDefinition(right!),
          changes,
        };
      })
      .filter((item) => item.result !== "modified" || item.changes.length);
    const indexKey = (item: { tableName: string; name: string }) =>
      `${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`;
    const anchorIndexMap = new Map(
        anchorIndexes.map((item) => [indexKey(item), item]),
      ),
      targetIndexMap = new Map(
        targetIndexes.map((item) => [indexKey(item), item]),
      );
    const indexItems = [
      ...new Set([...anchorIndexMap.keys(), ...targetIndexMap.keys()]),
    ]
      .sort()
      .map((key) => {
        const left = anchorIndexMap.get(key),
          right = targetIndexMap.get(key);
        if (left && !right)
          return {
            tableName: left.tableName,
            columnName: left.name,
            result: "added" as const,
            before: `${left.kind} (${left.columnsJson})`,
            after: null,
            changes: ["锚点存在，目标环境缺少"],
          };
        if (!left && right)
          return {
            tableName: right.tableName,
            columnName: right.name,
            result: "removed" as const,
            before: null,
            after: `${right.kind} (${right.columnsJson})`,
            changes: ["目标环境存在，锚点已没有（保留，不自动删除）"],
          };
        const changed =
          left!.kind !== right!.kind ||
          left!.columnsJson !== right!.columnsJson;
        return {
          tableName: right!.tableName,
          columnName: right!.name,
          result: changed ? ("modified" as const) : ("modified" as const),
          before: `${left!.kind} (${left!.columnsJson})`,
          after: `${right!.kind} (${right!.columnsJson})`,
          changes: changed ? ["索引定义不同"] : [],
        };
      })
      .filter((item) => item.result !== "modified" || item.changes.length);
    const constraintKey = (item: { tableName: string; name: string }) =>
      `${item.tableName.toLowerCase()}.${item.name.toLowerCase()}`;
    const anchorConstraintMap = new Map(
        anchorConstraints.map((item) => [constraintKey(item), item]),
      ),
      targetConstraintMap = new Map(
        targetConstraints.map((item) => [constraintKey(item), item]),
      );
    const constraintItems = [
      ...new Set([
        ...anchorConstraintMap.keys(),
        ...targetConstraintMap.keys(),
      ]),
    ]
      .sort()
      .map((key) => {
        const left = anchorConstraintMap.get(key),
          right = targetConstraintMap.get(key);
        if (left && !right)
          return {
            tableName: left.tableName,
            columnName: left.name,
            result: "added" as const,
            before: left.definition,
            after: null,
            changes: ["锚点存在，目标环境缺少"],
          };
        if (!left && right)
          return {
            tableName: right.tableName,
            columnName: right.name,
            result: "removed" as const,
            before: null,
            after: right.definition,
            changes: ["目标环境存在，锚点已没有（保留，不自动删除）"],
          };
        const changed = left!.definition !== right!.definition;
        return {
          tableName: right!.tableName,
          columnName: right!.name,
          result: changed ? ("modified" as const) : ("modified" as const),
          before: left!.definition,
          after: right!.definition,
          changes: changed ? ["约束定义不同"] : [],
        };
      })
      .filter((item) => item.result !== "modified" || item.changes.length);
    const tableSet = new Set(anchorTables),
      targetTableSet = new Set(targetTables);
    const tableItems = [...new Set([...anchorTables, ...targetTables])]
      .sort()
      .filter((name) => tableSet.has(name) !== targetTableSet.has(name))
      .map((tableName) => ({
        tableName,
        result: tableSet.has(tableName)
          ? ("added" as const)
          : ("removed" as const),
      }));
    const sql: string[] = [];
    const anchorFieldsByTable = (tableName: string) =>
      anchorFields
        .filter((item) => item.tableName.toLowerCase() === tableName)
        .map((item) => `${sqlIdentifier(item.name)} ${fieldDefinition(item)}`);
    for (const tableName of tableItems
      .filter((item) => item.result === "added")
      .map((item) => item.tableName)) {
      const definitions = anchorFieldsByTable(tableName);
      const indexes = anchorIndexes
        .filter((item) => item.tableName.toLowerCase() === tableName)
        .map((item) => indexDefinition(item).replace(/^ADD /, ""));
      sql.push(
        `CREATE TABLE IF NOT EXISTS ${sqlIdentifier(tableName)} (\n  ${[...definitions, ...indexes].join(",\n  ")}\n);`,
      );
    }
    for (const item of fieldItems.filter(
      (item) => item.result === "added" || item.result === "modified",
    ))
      if (
        !tableItems.some(
          (table) =>
            table.tableName === item.tableName && table.result === "added",
        )
      )
        sql.push(
          `ALTER TABLE ${sqlIdentifier(item.tableName)} ${item.result === "added" ? "ADD COLUMN" : "MODIFY COLUMN"} ${sqlIdentifier(item.columnName ?? "")} ${item.result === "added" ? (item.before ?? "") : (item.before ?? "")};`,
        );
    for (const item of indexItems.filter(
      (item) => item.result === "added" || item.result === "modified",
    ))
      if (
        !tableItems.some(
          (table) =>
            table.tableName === item.tableName && table.result === "added",
        )
      ) {
        const anchorIndex = anchorIndexMap.get(
          `${item.tableName.toLowerCase()}.${item.columnName?.toLowerCase()}`,
        );
        if (anchorIndex) {
          if (item.result === "modified")
            sql.push(
              `ALTER TABLE ${sqlIdentifier(item.tableName)} ${anchorIndex.kind === "primary" ? "DROP PRIMARY KEY" : `DROP INDEX ${sqlIdentifier(anchorIndex.name)}`};`,
            );
          sql.push(
            `ALTER TABLE ${sqlIdentifier(item.tableName)} ${indexDefinition(anchorIndex)};`,
          );
        }
      }
    for (const item of constraintItems.filter(
      (item) => item.result === "added" || item.result === "modified",
    ))
      if (
        !tableItems.some(
          (table) =>
            table.tableName === item.tableName && table.result === "added",
        )
      ) {
        const constraint = anchorConstraintMap.get(
          `${item.tableName.toLowerCase()}.${item.columnName?.toLowerCase()}`,
        );
        if (constraint) {
          if (item.result === "modified")
            sql.push(
              `ALTER TABLE ${sqlIdentifier(item.tableName)} ${constraint.kind === "foreign" ? "DROP FOREIGN KEY" : "DROP CHECK"} ${sqlIdentifier(constraint.name)};`,
            );
          sql.push(
            `ALTER TABLE ${sqlIdentifier(item.tableName)} ADD ${constraint.definition.toUpperCase().startsWith("CONSTRAINT") ? constraint.definition : `CONSTRAINT ${sqlIdentifier(constraint.name)} ${constraint.definition}`};`,
          );
        }
      }
    return Response.json({
      ok: true,
      anchor: {
        versionId: anchor.versionId,
        environmentId: anchor.environmentId,
        versionName: project.anchorVersionName,
        environmentName: project.anchorEnvironmentName,
        snapshotCode: anchorSnapshot?.snapshot.code ?? null,
      },
      target: {
        ...target,
        snapshotCode: targetSnapshot?.snapshot.code ?? null,
      },
      tableItems,
      fieldItems,
      indexItems,
      constraintItems,
      sql: sql.join("\n"),
      executions: executions.results,
    });
  }

  if (mode === "search") {
    const query = clean(url.searchParams.get("q")).toLowerCase();
    const projectIds = csv(url.searchParams.get("projectId"));
    const versionId = clean(url.searchParams.get("versionId"));
    const environmentIds = csv(url.searchParams.get("environmentId"));
    // An environment identifies its owning project.  Use that context when
    // the user searches without explicitly selecting a project, so project
    // lifecycle overrides remain isolated and deterministic.
    const scopedProjectIds = projectIds.length
      ? projectIds
      : environmentIds.length
        ? (
            await db
              .prepare(
                `SELECT DISTINCT project_id AS projectId FROM catalog_environments WHERE id IN (${environmentIds.map(() => "?").join(",")})`,
              )
              .bind(...environmentIds)
              .all<{ projectId: string }>()
          ).results.map((row) => row.projectId)
        : [];
    const lifecycleStatus = ["active", "deprecated", "removed"].includes(
      clean(url.searchParams.get("lifecycleStatus")),
    )
      ? clean(url.searchParams.get("lifecycleStatus"))
      : "";
    const requestedEntity = clean(url.searchParams.get("entity"));
    const entity = ["table", "field", "index", "constraint"].includes(
      requestedEntity,
    )
      ? requestedEntity
      : "field";
    const limit = Math.min(
      40,
      Math.max(1, Number(url.searchParams.get("limit")) || 20),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    if (!query && !projectIds.length && !versionId && !environmentIds.length)
      return Response.json(
        entity === "table"
          ? { tables: [], tableScopes: [], total: 0, offset, hasMore: false }
          : entity === "field"
            ? { fields: [], scopes: [], total: 0, offset, hasMore: false }
            : { items: [], total: 0, offset, hasMore: false },
      );
    if (entity === "table") {
      const pattern = `%${query}%`;
      const conditions = [
        `(lower(t.code) LIKE ? OR lower(t.name) LIKE ? OR lower(t.comment) LIKE ? OR lower(coalesce(m.name,'')) LIKE ?)`,
      ];
      const scopeBindings: unknown[] = [pattern, pattern, pattern, pattern];
      const selectedLifecycle = lifecycleExpression(
        "table",
        "t.id",
        scopedProjectIds,
      );
      const filteredLifecycle = lifecycleExpression(
        "table",
        "t.id",
        scopedProjectIds,
      );
      const tableScopeParts: string[] = [`scope_filter.table_id=t.id`];
      if (projectIds.length) {
        const placeholders = projectIds.map(() => "?").join(",");
        tableScopeParts.push(`scope_filter.project_id IN (${placeholders})`);
        scopeBindings.push(...projectIds);
      }
      if (versionId) {
        tableScopeParts.push(`scope_filter.version_id=?`);
        scopeBindings.push(versionId);
      }
      if (environmentIds.length) {
        const placeholders = environmentIds.map(() => "?").join(",");
        tableScopeParts.push(
          `scope_filter.environment_id IN (${placeholders})`,
        );
        scopeBindings.push(...environmentIds);
      }
      if (tableScopeParts.length > 1)
        conditions.push(
          `EXISTS (SELECT 1 FROM table_scopes scope_filter WHERE ${tableScopeParts.join(" AND ")})`,
        );
      if (lifecycleStatus) {
        conditions.push(`${filteredLifecycle.sql}=?`);
        scopeBindings.push(...filteredLifecycle.bindings, lifecycleStatus);
      }
      const condition = conditions.join(" AND ");
      const [tableRows, totalRow] = await Promise.all([
        db
          .prepare(
            `SELECT t.id,t.code,t.name,t.comment,${selectedLifecycle.sql} AS lifecycleStatus,'' AS lifecycleNote,t.module_id AS moduleId,m.name AS moduleName,count(DISTINCT f.id) AS fieldCount,
          group_concat(DISTINCT p.name) AS projectNames,group_concat(DISTINCT e.name) AS environmentNames,count(DISTINCT ts.environment_id) AS scopeCount
          FROM catalog_tables t LEFT JOIN catalog_modules m ON m.id=t.module_id LEFT JOIN catalog_fields f ON f.table_id=t.id
          LEFT JOIN table_scopes ts ON ts.table_id=t.id LEFT JOIN catalog_projects p ON p.id=ts.project_id LEFT JOIN catalog_environments e ON e.id=ts.environment_id
          WHERE ${condition} GROUP BY t.id ORDER BY CASE WHEN lower(t.name)=? THEN 0 WHEN lower(t.code)=? THEN 1 ELSE 2 END,t.name LIMIT ? OFFSET ?`,
          )
          .bind(
            ...selectedLifecycle.bindings,
            ...scopeBindings,
            query,
            query,
            limit,
            offset,
          )
          .all(),
        db
          .prepare(
            `SELECT count(*) AS count FROM catalog_tables t LEFT JOIN catalog_modules m ON m.id=t.module_id WHERE ${condition}`,
          )
          .bind(...scopeBindings)
          .first<{ count: number }>(),
      ]);
      const ids = tableRows.results.map((row) =>
        String((row as Record<string, unknown>).id),
      );
      const placeholders = ids.map(() => "?").join(",");
      const scopeRows = ids.length
        ? await db
            .prepare(
              `SELECT s.table_id AS tableId,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.state,s.origin,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote FROM table_scopes s LEFT JOIN catalog_object_lifecycles l ON l.entity='table' AND l.object_id=s.table_id AND l.project_id=s.project_id WHERE s.table_id IN (${placeholders})`,
            )
            .bind(...ids)
            .all()
        : { results: [] };
      const total = Number(totalRow?.count ?? 0);
      return Response.json({
        tables: tableRows.results,
        tableScopes: scopeRows.results,
        total,
        offset,
        hasMore: offset + tableRows.results.length < total,
      });
    }
    if (entity === "index" || entity === "constraint") {
      const tableName =
        entity === "index" ? "catalog_indexes" : "catalog_constraints";
      const conditionParts = [
        entity === "index"
          ? "(lower(i.name) LIKE ? OR lower(t.name) LIKE ? OR lower(i.kind) LIKE ? OR lower(i.columns_json) LIKE ?)"
          : "(lower(c.name) LIKE ? OR lower(t.name) LIKE ? OR lower(c.kind) LIKE ? OR lower(c.definition) LIKE ?)",
      ];
      const pattern = `%${query}%`;
      const objectBindings: unknown[] = [pattern, pattern, pattern, pattern];
      const scopeTable =
        entity === "index"
          ? "catalog_index_scopes"
          : "catalog_constraint_scopes";
      const scopeKey = entity === "index" ? "index_id" : "constraint_id";
      const alias = entity === "index" ? "i" : "c";
      const selectedLifecycle = lifecycleExpression(
        entity,
        `${alias}.id`,
        scopedProjectIds,
      );
      const filteredLifecycle = lifecycleExpression(
        entity,
        `${alias}.id`,
        scopedProjectIds,
      );
      const objectScopeParts: string[] = [
        `scope_filter.${scopeKey}=${entity === "index" ? "i" : "c"}.id`,
      ];
      if (projectIds.length) {
        const placeholders = projectIds.map(() => "?").join(",");
        objectScopeParts.push(`scope_filter.project_id IN (${placeholders})`);
        objectBindings.push(...projectIds);
      }
      if (versionId) {
        objectScopeParts.push(`scope_filter.version_id=?`);
        objectBindings.push(versionId);
      }
      if (environmentIds.length) {
        const placeholders = environmentIds.map(() => "?").join(",");
        objectScopeParts.push(
          `scope_filter.environment_id IN (${placeholders})`,
        );
        objectBindings.push(...environmentIds);
      }
      if (objectScopeParts.length > 1)
        conditionParts.push(
          `EXISTS (SELECT 1 FROM ${scopeTable} scope_filter WHERE ${objectScopeParts.join(" AND ")})`,
        );
      if (lifecycleStatus) {
        conditionParts.push(`${filteredLifecycle.sql}=?`);
        objectBindings.push(...filteredLifecycle.bindings, lifecycleStatus);
      }
      const condition = conditionParts.join(" AND ");
      const [rows, totalRow] = await Promise.all([
        db
          .prepare(
            `SELECT ${entity === "index" ? `i.id,i.name,i.kind,i.columns_json AS columnsJson,${selectedLifecycle.sql} AS lifecycleStatus,'' AS lifecycleNote,t.id AS tableId,t.name AS tableName` : `c.id,c.name,c.kind,c.definition,${selectedLifecycle.sql} AS lifecycleStatus,'' AS lifecycleNote,t.id AS tableId,t.name AS tableName`} FROM ${tableName} ${alias} JOIN catalog_tables t ON t.id=${alias}.table_id WHERE ${condition} ORDER BY t.name,${alias}.name LIMIT ? OFFSET ?`,
          )
          .bind(...selectedLifecycle.bindings, ...objectBindings, limit, offset)
          .all(),
        db
          .prepare(
            `SELECT count(*) AS count FROM ${tableName} ${entity === "index" ? "i" : "c"} JOIN catalog_tables t ON t.id=${entity === "index" ? "i.table_id" : "c.table_id"} WHERE ${condition}`,
          )
          .bind(...objectBindings)
          .first<{ count: number }>(),
      ]);
      const total = Number(totalRow?.count ?? 0);
      return Response.json({
        items: rows.results,
        total,
        offset,
        hasMore: offset + rows.results.length < total,
      });
    }
    const where: string[] = [
      `(lower(f.code) LIKE ? OR lower(t.name || '.' || f.name) LIKE ? OR lower(f.comment) LIKE ? OR lower(t.comment) LIKE ?)`,
    ];
    const bindings: unknown[] = [
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
    ];
    const selectedLifecycle = lifecycleExpression(
      "field",
      "f.id",
      scopedProjectIds,
    );
    const filteredLifecycle = lifecycleExpression(
      "field",
      "f.id",
      scopedProjectIds,
    );
    const fieldScopeParts: string[] = [`scope_filter.field_id=f.id`];
    if (projectIds.length) {
      const placeholders = projectIds.map(() => "?").join(",");
      fieldScopeParts.push(`scope_filter.project_id IN (${placeholders})`);
      bindings.push(...projectIds);
    }
    if (versionId) {
      fieldScopeParts.push(`scope_filter.version_id=?`);
      bindings.push(versionId);
    }
    if (environmentIds.length) {
      const placeholders = environmentIds.map(() => "?").join(",");
      fieldScopeParts.push(`scope_filter.environment_id IN (${placeholders})`);
      bindings.push(...environmentIds);
    }
    if (fieldScopeParts.length > 1)
      where.push(
        `EXISTS (SELECT 1 FROM field_scopes scope_filter WHERE ${fieldScopeParts.join(" AND ")})`,
      );
    if (lifecycleStatus) {
      where.push(`${filteredLifecycle.sql}=?`);
      bindings.push(...filteredLifecycle.bindings, lifecycleStatus);
    }
    const condition = where.join(" AND ");
    const [fieldRows, totalRow] = await Promise.all([
      db
        .prepare(
          `SELECT f.id,f.code,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,${selectedLifecycle.sql} AS lifecycleStatus,'' AS lifecycleNote,f.source_kind AS sourceKind,
        t.id AS tableId,t.name AS tableName,t.code AS tableCode,t.comment AS tableComment,m.name AS moduleName,
        group_concat(DISTINCT p.name) AS projectNames,group_concat(DISTINCT e.name) AS environmentNames,count(DISTINCT fs.environment_id) AS scopeCount
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id LEFT JOIN catalog_modules m ON m.id=t.module_id
        LEFT JOIN field_scopes fs ON fs.field_id=f.id LEFT JOIN catalog_projects p ON p.id=fs.project_id LEFT JOIN catalog_environments e ON e.id=fs.environment_id
        WHERE ${condition} GROUP BY f.id ORDER BY CASE WHEN lower(t.name || '.' || f.name)=? THEN 0 WHEN lower(f.code)=? THEN 1 ELSE 2 END,t.name,f.ordinal,f.name LIMIT ? OFFSET ?`,
        )
        .bind(
          ...selectedLifecycle.bindings,
          ...bindings,
          query,
          query,
          limit,
          offset,
        )
        .all(),
      db
        .prepare(
          `SELECT count(*) AS count FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id WHERE ${condition}`,
        )
        .bind(...bindings)
        .first<{ count: number }>(),
    ]);
    const ids = fieldRows.results.map((row) =>
      String((row as Record<string, unknown>).id),
    );
    const placeholders = ids.map(() => "?").join(",");
    const scopeRows = ids.length
      ? await db
          .prepare(
            `SELECT fs.field_id AS fieldId,fs.project_id AS projectId,fs.version_id AS versionId,fs.environment_id AS environmentId,fs.state,fs.origin,
      csr.revision_id AS revisionId,fr.revision,fr.data_type AS revisionDataType,fr.nullable AS revisionNullable,fr.default_value AS revisionDefaultValue,fr.comment AS revisionComment,fr.extra AS revisionExtra,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote
      FROM field_scopes fs LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
      LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id LEFT JOIN catalog_object_lifecycles l ON l.entity='field' AND l.object_id=fs.field_id AND l.project_id=fs.project_id WHERE fs.field_id IN (${placeholders})`,
          )
          .bind(...ids)
          .all()
      : { results: [] };
    const total = Number(totalRow?.count ?? 0);
    return Response.json({
      fields: fieldRows.results,
      scopes: scopeRows.results,
      total,
      offset,
      hasMore: offset + fieldRows.results.length < total,
    });
  }

  if (mode === "table") {
    const tableId = clean(url.searchParams.get("tableId"));
    const [
      table,
      fields,
      scopeRows,
      fieldScopeRows,
      indexRows,
      indexScopeRows,
      constraintRows,
      constraintScopeRows,
    ] = await Promise.all([
      db
        .prepare(
          `SELECT t.id,t.code,t.name,t.comment,t.lifecycle_status AS lifecycleStatus,t.lifecycle_note AS lifecycleNote,t.module_id AS moduleId,m.name AS moduleName,count(DISTINCT f.id) AS fieldCount
        FROM catalog_tables t LEFT JOIN catalog_modules m ON m.id=t.module_id LEFT JOIN catalog_fields f ON f.table_id=t.id WHERE t.id=? GROUP BY t.id`,
        )
        .bind(tableId)
        .first(),
      db
        .prepare(
          `SELECT f.id,f.code,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,f.lifecycle_status AS lifecycleStatus,f.lifecycle_note AS lifecycleNote,f.source_kind AS sourceKind,
        t.id AS tableId,t.name AS tableName,t.code AS tableCode,m.name AS moduleName,count(DISTINCT fs.environment_id) AS scopeCount
        FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id LEFT JOIN catalog_modules m ON m.id=t.module_id LEFT JOIN field_scopes fs ON fs.field_id=f.id
        WHERE f.table_id=? GROUP BY f.id ORDER BY f.ordinal,f.name`,
        )
        .bind(tableId)
        .all(),
      db
        .prepare(
          `SELECT s.table_id AS tableId,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.state,s.origin,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote FROM table_scopes s LEFT JOIN catalog_object_lifecycles l ON l.entity='table' AND l.object_id=s.table_id AND l.project_id=s.project_id WHERE s.table_id=?`,
        )
        .bind(tableId)
        .all(),
      db
        .prepare(
          `SELECT fs.field_id AS fieldId,fs.project_id AS projectId,fs.version_id AS versionId,fs.environment_id AS environmentId,fs.state,fs.origin,
        csr.revision_id AS revisionId,csr.resolution_kind AS resolutionKind,csr.review_status AS reviewStatus,csr.resolution_note AS resolutionNote,
        fr.revision,fr.data_type AS revisionDataType,fr.nullable AS revisionNullable,fr.default_value AS revisionDefaultValue,fr.comment AS revisionComment,fr.extra AS revisionExtra,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote
        FROM field_scopes fs JOIN catalog_fields f ON f.id=fs.field_id LEFT JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id LEFT JOIN catalog_field_revisions fr ON fr.id=csr.revision_id LEFT JOIN catalog_object_lifecycles l ON l.entity='field' AND l.object_id=fs.field_id AND l.project_id=fs.project_id WHERE f.table_id=?`,
        )
        .bind(tableId)
        .all(),
      db
        .prepare(
          `SELECT id,table_id AS tableId,name,kind,columns_json AS columnsJson,lifecycle_status AS lifecycleStatus,lifecycle_note AS lifecycleNote,source_kind AS sourceKind,import_batch_id AS importBatchId,created_at AS createdAt FROM catalog_indexes WHERE table_id=? ORDER BY name`,
        )
        .bind(tableId)
        .all(),
      db
        .prepare(
          `SELECT s.index_id AS indexId,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.state,s.origin,s.import_batch_id AS importBatchId,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote FROM catalog_index_scopes s LEFT JOIN catalog_object_lifecycles l ON l.entity='index' AND l.object_id=s.index_id AND l.project_id=s.project_id WHERE s.index_id IN (SELECT id FROM catalog_indexes WHERE table_id=?)`,
        )
        .bind(tableId)
        .all(),
      db
        .prepare(
          `SELECT id,table_id AS tableId,name,kind,definition,lifecycle_status AS lifecycleStatus,lifecycle_note AS lifecycleNote,source_kind AS sourceKind,import_batch_id AS importBatchId,created_at AS createdAt FROM catalog_constraints WHERE table_id=? ORDER BY name`,
        )
        .bind(tableId)
        .all(),
      db
        .prepare(
          `SELECT s.constraint_id AS constraintId,s.project_id AS projectId,s.version_id AS versionId,s.environment_id AS environmentId,s.state,s.origin,s.import_batch_id AS importBatchId,coalesce(l.status,'active') AS lifecycleStatus,coalesce(l.note,'') AS lifecycleNote FROM catalog_constraint_scopes s LEFT JOIN catalog_object_lifecycles l ON l.entity='constraint' AND l.object_id=s.constraint_id AND l.project_id=s.project_id WHERE s.constraint_id IN (SELECT id FROM catalog_constraints WHERE table_id=?)`,
        )
        .bind(tableId)
        .all(),
    ]);
    if (!table)
      return Response.json({ error: "数据表不存在。" }, { status: 404 });
    return Response.json({
      table,
      fields: fields.results,
      tableScopes: scopeRows.results,
      fieldScopes: fieldScopeRows.results,
      indexes: indexRows.results,
      indexScopes: indexScopeRows.results,
      constraints: constraintRows.results,
      constraintScopes: constraintScopeRows.results,
    });
  }

  if (mode === "import") {
    const importId = clean(url.searchParams.get("importId"));
    const [batch, items] = await Promise.all([
      db
        .prepare(
          `SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.source_path AS sourcePath,b.git_commit AS gitCommit,b.import_mode AS importMode,
        b.status,b.added_count AS addedCount,b.duplicate_count AS duplicateCount,b.modified_count AS modifiedCount,b.removed_count AS removedCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,
        b.raw_sql AS rawSql,b.project_id AS projectId,b.version_id AS versionId,b.module_id AS moduleId,p.name AS projectName,v.name AS versionName,
        m.name AS moduleName,r.repository,r.branch AS repositoryBranch,v.git_ref AS gitRef,
        group_concat(be.environment_id,'|||') AS environmentIds,group_concat(e.name,'|||') AS environmentNames
        FROM import_batches b JOIN catalog_projects p ON p.id=b.project_id JOIN catalog_versions v ON v.id=b.version_id
        LEFT JOIN catalog_modules m ON m.id=b.module_id LEFT JOIN repository_sources r ON r.id=v.repository_id
        LEFT JOIN import_batch_environments be ON be.batch_id=b.id LEFT JOIN catalog_environments e ON e.id=be.environment_id
        WHERE b.id=? GROUP BY b.id`,
        )
        .bind(importId)
        .first(),
      db
        .prepare(
          `SELECT ii.id,ii.statement_no AS statementNo,ii.action,ii.table_name AS tableName,ii.column_name AS columnName,ii.result,ii.message,
        (SELECT group_concat(DISTINCT csr.resolution_kind) FROM catalog_field_scope_revisions csr WHERE csr.import_item_id=ii.id) AS resolutionKind,
        (SELECT group_concat(DISTINCT csr.review_status) FROM catalog_field_scope_revisions csr WHERE csr.import_item_id=ii.id) AS reviewStatus
        FROM import_items ii WHERE ii.batch_id=? ORDER BY ii.statement_no,ii.id`,
        )
        .bind(importId)
        .all(),
    ]);
    if (!batch)
      return Response.json({ error: "SQL 记录不存在。" }, { status: 404 });
    return Response.json({ batch, items: items.results });
  }

  if (mode === "environment") {
    const environmentId = clean(url.searchParams.get("environmentId"));
    const environment = await db
      .prepare(
        `SELECT e.id,e.project_id AS projectId,e.version_id AS versionId,e.code,e.name,e.stage,
      e.sort_order AS sortOrder,p.name AS projectName,p.parent_id AS parentId,v.name AS versionName
      FROM catalog_environments e JOIN catalog_projects p ON p.id=e.project_id LEFT JOIN catalog_versions v ON v.id=e.version_id
      WHERE e.id=? AND e.archived=0`,
      )
      .bind(environmentId)
      .first<{
        id: string;
        projectId: string;
        versionId: string | null;
        parentId: string | null;
      }>();
    if (!environment)
      return Response.json({ error: "环境不存在。" }, { status: 404 });
    const parentId = environment.parentId || environment.projectId;
    const [coverage, missingRows, historyRows] = await Promise.all([
      db
        .prepare(
          `WITH expected AS (
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
          (SELECT count(DISTINCT s.table_id) FROM table_scopes s JOIN catalog_tables t ON t.id=s.table_id WHERE s.environment_id=? AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=t.id AND l.project_id=? LIMIT 1),t.lifecycle_status,'active')='active') AS presentTableCount`,
        )
        .bind(
          environment.projectId,
          parentId,
          environment.versionId ?? "",
          environment.projectId,
          environment.projectId,
          environment.id,
          environment.projectId,
          parentId,
          environment.projectId,
          environment.id,
          environment.projectId,
        )
        .first(),
      db
        .prepare(
          `WITH expected AS (
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
        WHERE fs.field_id IS NULL OR coalesce(fr.revision,0)<>ex.expected_revision ORDER BY t.name,f.ordinal,f.name LIMIT 80`,
        )
        .bind(
          environment.projectId,
          parentId,
          environment.versionId ?? "",
          environment.projectId,
          environment.projectId,
          environment.id,
        )
        .all(),
      db
        .prepare(
          `SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.source_path AS sourcePath,b.git_commit AS gitCommit,
        b.status,b.added_count AS addedCount,b.duplicate_count AS duplicateCount,b.modified_count AS modifiedCount,b.removed_count AS removedCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,
        b.project_id AS projectId,b.version_id AS versionId,b.module_id AS moduleId,p.name AS projectName,v.name AS versionName,m.name AS moduleName
        FROM import_batch_environments be JOIN import_batches b ON b.id=be.batch_id JOIN catalog_projects p ON p.id=b.project_id
        JOIN catalog_versions v ON v.id=b.version_id LEFT JOIN catalog_modules m ON m.id=b.module_id
        WHERE be.environment_id=? ORDER BY b.created_at DESC LIMIT 30`,
        )
        .bind(environment.id)
        .all(),
    ]);
    return Response.json({
      environment,
      coverage,
      missing: missingRows.results,
      imports: historyRows.results,
    });
  }

  if (mode === "release") {
    const projectId = clean(url.searchParams.get("projectId"));
    const batchId = clean(url.searchParams.get("batchId"));
    const limit = Math.min(
      5000,
      Math.max(1, Number(url.searchParams.get("limit")) || 200),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const requestedLifecycle = clean(url.searchParams.get("lifecycleStatus"));
    // Release is about executable rollout changes, not the initial snapshot
    // used to seed an environment.  The legacy batches are recognised as
    // pure CREATE/add-only snapshots; new baseline imports already create no
    // catalog_changes at all.
    const lifecycleFilter = ["active", "deprecated", "removed"].includes(
      requestedLifecycle,
    )
      ? requestedLifecycle
      : "active";
    const rows = await db
      .prepare(
        `WITH effective AS (
      SELECT c.*,
        coalesce(
          (SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=c.field_id AND l.project_id=c.project_id LIMIT 1),
          (SELECT l.status FROM catalog_object_lifecycles l JOIN catalog_tables lt ON lt.id=l.object_id WHERE l.entity='table' AND lower(lt.name)=lower(c.table_name) AND l.project_id=c.project_id LIMIT 1),
          f.lifecycle_status,t.lifecycle_status,'active'
        ) AS lifecycleStatus
      FROM catalog_changes c
      LEFT JOIN import_batches b ON b.id=c.import_batch_id
      LEFT JOIN catalog_fields f ON f.id=c.field_id
      LEFT JOIN catalog_tables t ON lower(t.name)=lower(c.table_name)
      WHERE c.import_batch_id IS NULL OR coalesce(b.import_mode,'executed')<>'snapshot'
    ), scoped AS (
      SELECT cs.change_id,cs.environment_id,cs.status
      FROM catalog_change_scopes cs JOIN effective c ON c.id=cs.change_id
    ) SELECT c.id,c.code,c.name,c.action,c.table_name AS tableName,c.field_name AS fieldName,c.field_id AS fieldId,
      c.import_batch_id AS importBatchId,coalesce(b.name,c.name) AS batchName,
      CASE WHEN c.import_batch_id IS NULL THEN 1 ELSE (SELECT count(*) FROM catalog_changes bc WHERE bc.import_batch_id=c.import_batch_id) END AS batchTotal,
      c.project_id AS projectId,c.version_id AS versionId,c.source_kind AS sourceKind,c.source_path AS sourcePath,c.git_commit AS gitCommit,
      c.sql_text AS sqlText,c.status,c.lifecycleStatus,c.created_at AS createdAt,p.name AS projectName,v.name AS versionName,
      count(cs.environment_id) AS environmentCount,
      sum(CASE WHEN cs.status='pending' THEN 1 ELSE 0 END) AS pendingCount,
      sum(CASE WHEN cs.status='executed' THEN 1 ELSE 0 END) AS executedCount,
      sum(CASE WHEN cs.status='verified' THEN 1 ELSE 0 END) AS verifiedCount,
      sum(CASE WHEN cs.status='failed' THEN 1 ELSE 0 END) AS failedCount,
      group_concat(CASE WHEN cs.status='pending' THEN e.name END,'|||') AS pendingEnvironments,
      group_concat(e.name,'|||') AS environmentNames,group_concat(e.id,'|||') AS environmentIds,group_concat(cs.status,'|||') AS environmentStatuses
      FROM effective c LEFT JOIN import_batches b ON b.id=c.import_batch_id JOIN catalog_projects p ON p.id=c.project_id JOIN catalog_versions v ON v.id=c.version_id
      LEFT JOIN scoped cs ON cs.change_id=c.id LEFT JOIN catalog_environments e ON e.id=cs.environment_id
      WHERE (?='' OR c.project_id=?) AND (?='' OR c.lifecycleStatus=?) AND (?='' OR c.import_batch_id=?)
      GROUP BY c.id ORDER BY CASE WHEN sum(CASE WHEN cs.status='pending' THEN 1 ELSE 0 END)>0 THEN 0 ELSE 1 END,c.created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(
        projectId,
        projectId,
        lifecycleFilter,
        lifecycleFilter,
        batchId,
        batchId,
        limit,
        offset,
      )
      .all();
    const summary = await db
      .prepare(
        `WITH effective AS (
      SELECT c.*,coalesce(
        (SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=c.field_id AND l.project_id=c.project_id LIMIT 1),
        (SELECT l.status FROM catalog_object_lifecycles l JOIN catalog_tables lt ON lt.id=l.object_id WHERE l.entity='table' AND lower(lt.name)=lower(c.table_name) AND l.project_id=c.project_id LIMIT 1),
        f.lifecycle_status,t.lifecycle_status,'active') AS lifecycleStatus
      FROM catalog_changes c LEFT JOIN import_batches b ON b.id=c.import_batch_id LEFT JOIN catalog_fields f ON f.id=c.field_id LEFT JOIN catalog_tables t ON lower(t.name)=lower(c.table_name)
      WHERE c.import_batch_id IS NULL OR coalesce(b.import_mode,'executed')<>'snapshot'
    ), scoped AS (
      SELECT cs.change_id,cs.environment_id,cs.status
      FROM catalog_change_scopes cs JOIN effective c ON c.id=cs.change_id
    ) SELECT count(DISTINCT c.id) AS changes,
      sum(CASE WHEN cs.status='pending' THEN 1 ELSE 0 END) AS pending,
      sum(CASE WHEN cs.status='executed' THEN 1 ELSE 0 END) AS executed,
      sum(CASE WHEN cs.status='verified' THEN 1 ELSE 0 END) AS verified,
      sum(CASE WHEN cs.status='failed' THEN 1 ELSE 0 END) AS failed
      FROM effective c LEFT JOIN scoped cs ON cs.change_id=c.id WHERE (?='' OR c.project_id=?) AND (?='' OR c.lifecycleStatus=?)`,
      )
      .bind(projectId, projectId, lifecycleFilter, lifecycleFilter)
      .first();
    return Response.json({ changes: rows.results, summary });
  }

  if (mode === "project") {
    const projectId = clean(url.searchParams.get("projectId"));
    const project = await db
      .prepare(
        `SELECT id,parent_id AS parentId FROM catalog_projects WHERE id=? AND archived=0`,
      )
      .bind(projectId)
      .first<{ id: string; parentId: string | null }>();
    if (!project)
      return Response.json({ error: "项目不存在。" }, { status: 404 });
    const parentId = project.parentId || project.id;
    const [differenceRows, historyRows, coverageRows] = await Promise.all([
      db
        .prepare(
          `WITH expected AS (
          SELECT fs.field_id,fs.version_id,max(fr.revision) AS expected_revision
          FROM field_scopes fs JOIN catalog_field_scope_revisions csr ON csr.field_id=fs.field_id AND csr.version_id=fs.version_id AND csr.environment_id=fs.environment_id
          JOIN catalog_field_revisions fr ON fr.id=csr.revision_id JOIN catalog_fields ef ON ef.id=fs.field_id JOIN catalog_tables et ON et.id=ef.table_id
          WHERE (fs.project_id=? OR fs.project_id=?)
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='table' AND l.object_id=et.id AND l.project_id=? LIMIT 1),et.lifecycle_status,'active')='active'
            AND coalesce((SELECT l.status FROM catalog_object_lifecycles l WHERE l.entity='field' AND l.object_id=ef.id AND l.project_id=? LIMIT 1),ef.lifecycle_status,'active')='active'
          GROUP BY fs.field_id,fs.version_id
        ), version_envs AS (
          SELECT v.id AS version_id,v.name AS version_name,e.id AS environment_id,e.name AS environment_name
          FROM catalog_versions v JOIN catalog_environments e ON e.project_id=v.project_id
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
        ORDER BY (count(*)-sum(CASE WHEN m.actual_revision=m.expected_revision THEN 1 ELSE 0 END)) DESC,t.name,f.ordinal LIMIT 100`,
        )
        .bind(
          project.id,
          parentId,
          project.id,
          project.id,
          project.id,
          project.id,
        )
        .all(),
      db
        .prepare(
          `SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.source_path AS sourcePath,b.git_commit AS gitCommit,b.import_mode AS importMode,b.status,b.added_count AS addedCount,
        b.duplicate_count AS duplicateCount,b.modified_count AS modifiedCount,b.removed_count AS removedCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,
        b.project_id AS projectId,b.version_id AS versionId,b.module_id AS moduleId,v.name AS versionName,m.name AS moduleName,
        group_concat(e.name,' · ') AS environmentNames
        FROM import_batches b JOIN catalog_versions v ON v.id=b.version_id
        LEFT JOIN catalog_modules m ON m.id=b.module_id LEFT JOIN import_batch_environments be ON be.batch_id=b.id LEFT JOIN catalog_environments e ON e.id=be.environment_id
        WHERE b.project_id=? GROUP BY b.id ORDER BY b.created_at DESC LIMIT 50`,
        )
        .bind(project.id)
        .all(),
      db
        .prepare(
          `WITH expected AS (
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
          FROM catalog_versions v JOIN catalog_environments e ON e.project_id=v.project_id
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
        FROM matrix GROUP BY environment_id,environment_name ORDER BY environment_name`,
        )
        .bind(
          project.id,
          parentId,
          project.id,
          project.id,
          project.id,
          project.id,
        )
        .all(),
    ]);
    return Response.json({
      differences: differenceRows.results,
      imports: historyRows.results,
      coverage: coverageRows.results,
    });
  }

  const [
    projects,
    environments,
    versions,
    modules,
    tables,
    tableSummary,
    fieldSummary,
    imports,
    repositories,
  ] = await db.batch([
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
    db.prepare(`SELECT b.id,b.code,b.name,b.source_kind AS sourceKind,b.file_name AS fileName,b.source_path AS sourcePath,b.git_commit AS gitCommit,b.import_mode AS importMode,
      b.status,b.added_count AS addedCount,b.duplicate_count AS duplicateCount,b.modified_count AS modifiedCount,b.removed_count AS removedCount,b.conflict_count AS conflictCount,b.created_at AS createdAt,
      b.project_id AS projectId,b.version_id AS versionId,b.module_id AS moduleId,p.name AS projectName,v.name AS versionName,m.name AS moduleName,
      group_concat(e.name,' · ') AS environmentNames
      FROM import_batches b JOIN catalog_projects p ON p.id=b.project_id JOIN catalog_versions v ON v.id=b.version_id
      LEFT JOIN catalog_modules m ON m.id=b.module_id LEFT JOIN import_batch_environments be ON be.batch_id=b.id LEFT JOIN catalog_environments e ON e.id=be.environment_id
      GROUP BY b.id ORDER BY b.created_at DESC LIMIT 30`),
    db.prepare(`SELECT r.id,r.name,r.repository,r.branch,r.path_pattern AS pathPattern,r.project_id AS projectId,r.last_commit AS lastCommit,r.enabled
      FROM repository_sources r ORDER BY r.created_at DESC`),
  ]);
  return Response.json({
    projects: projects.results,
    environments: environments.results,
    versions: versions.results,
    modules: modules.results,
    tables: tables.results,
    fields: [],
    scopes: [],
    tableTotal: Number(
      (tableSummary.results[0] as { count?: number } | undefined)?.count ?? 0,
    ),
    fieldTotal: Number(
      (fieldSummary.results[0] as { count?: number } | undefined)?.count ?? 0,
    ),
    imports: imports.results,
    repositories: repositories.results,
  });
}
