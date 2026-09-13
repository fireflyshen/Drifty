import { clean, validateScopeSelection } from "@/server/catalog/shared";
import { parseMysqlSql } from "@/app/lib/mysql-parser";
import type { CatalogActionContext } from "@/server/catalog/actions/context";

/** 解析 SQL 并生成只读预览，不写入目录或发布记录。 */
export async function handleImportPreviewAction({
  action,
  payload,
  db,
}: CatalogActionContext): Promise<Response | null> {
  if (action === "import.preview") {
    const sql = clean(payload.sql),
      projectId = clean(payload.projectId),
      versionId = clean(payload.versionId);
    const environmentIds = [
      ...new Set(
        Array.isArray(payload.environmentIds)
          ? payload.environmentIds.map(clean).filter(Boolean)
          : [],
      ),
    ];
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
    const parsed = parseMysqlSql(sql);
    if (!parsed.fields.length)
      return Response.json(
        { error: "没有识别到字段定义。", warnings: parsed.warnings },
        { status: 400 },
      );
    if (parsed.warnings.length)
      return Response.json(
        {
          error: `有 ${parsed.warnings.length} 处 SQL 无法安全识别。${parsed.warnings[0]}`,
          warnings: parsed.warnings,
        },
        { status: 400 },
      );
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
    const mappingRows = await db
      .prepare(
        `SELECT physical_name AS physicalName,logical_name AS logicalName FROM catalog_table_mappings WHERE project_id=?`,
      )
      .bind(projectId)
      .all<{ physicalName: string; logicalName: string }>();
    const mappings = new Map(
      mappingRows.results.map((row) => [
        row.physicalName.toLowerCase(),
        row.logicalName.toLowerCase(),
      ]),
    );
    const resolveTable = (name: string) =>
      mappings.get(name.toLowerCase()) ?? name;
    const normalizedParsed = {
      ...parsed,
      tables: parsed.tables.map((table) => ({
        ...table,
        name: resolveTable(table.name),
      })),
      fields: parsed.fields.map((field) => ({
        ...field,
        tableName: resolveTable(field.tableName),
      })),
      indexes: parsed.indexes.map((item) => ({
        ...item,
        tableName: resolveTable(item.tableName),
      })),
      constraints: parsed.constraints.map((item) => ({
        ...item,
        tableName: resolveTable(item.tableName),
      })),
    };
    const existingRows = await db
      .prepare(
        `SELECT f.id,f.name,f.data_type AS dataType,f.nullable,f.default_value AS defaultValue,f.comment,f.extra,t.name AS tableName
      FROM catalog_fields f JOIN catalog_tables t ON t.id=f.table_id`,
      )
      .all<{
        id: string;
        name: string;
        dataType: string;
        nullable: number;
        defaultValue: string | null;
        comment: string;
        extra: string;
        tableName: string;
      }>();
    const existingMap = new Map(
      existingRows.results.map((field) => [
        `${field.tableName.toLowerCase()}.${field.name.toLowerCase()}`,
        field,
      ]),
    );
    const scopePlaceholders = environmentIds.map(() => "?").join(",");
    const scopedRows = await db
      .prepare(
        `SELECT DISTINCT field_id AS fieldId FROM field_scopes WHERE project_id=? AND version_id=? AND environment_id IN (${scopePlaceholders})`,
      )
      .bind(projectId, versionId, ...environmentIds)
      .all<{ fieldId: string }>();
    const scopedFieldIds = new Set(
      scopedRows.results.map((item) => item.fieldId),
    );
    const createTables = new Set(
      normalizedParsed.tables.map((table) => table.name.toLowerCase()),
    );
    const incomingByTable = new Map<string, Set<string>>();
    normalizedParsed.fields.forEach((field) => {
      if (!createTables.has(field.tableName.toLowerCase())) return;
      const names = incomingByTable.get(field.tableName) ?? new Set<string>();
      names.add(field.columnName.toLowerCase());
      incomingByTable.set(field.tableName, names);
    });
    const items: {
      tableName: string;
      columnName: string;
      result: string;
      before: string | null;
      after: string | null;
      changes: string[];
    }[] = [];
    const definition = (field: {
      dataType: string;
      nullable: boolean | number;
      defaultValue: string | null;
      comment: string;
      extra: string;
    }) =>
      `${field.dataType}${field.nullable ? " NULL" : " NOT NULL"}${field.defaultValue !== null ? ` DEFAULT ${field.defaultValue}` : ""}${field.comment ? ` COMMENT ${field.comment}` : ""}${field.extra ? ` ${field.extra}` : ""}`;
    for (const field of normalizedParsed.fields) {
      const key = `${field.tableName}.${(field.previousName || field.columnName).toLowerCase()}`;
      const existing = existingMap.get(key);
      if (field.action === "drop") {
        items.push({
          tableName: field.tableName,
          columnName: field.columnName,
          result: existing ? "removed" : "unchanged",
          before: existing ? definition(existing) : null,
          after: null,
          changes: existing ? ["字段将从所选环境移除"] : [],
        });
        continue;
      }
      if (!existing) {
        items.push({
          tableName: field.tableName,
          columnName: field.columnName,
          result:
            field.action === "modify" || field.action === "change"
              ? "conflict"
              : "added",
          before: null,
          after: definition(field),
          changes:
            field.action === "modify" || field.action === "change"
              ? ["要修改的原字段不存在"]
              : ["新增字段"],
        });
        continue;
      }
      const changes: string[] = [];
      if (existing.name.toLowerCase() !== field.columnName.toLowerCase())
        changes.push(`名称：${existing.name} → ${field.columnName}`);
      if (existing.dataType.toLowerCase() !== field.dataType.toLowerCase())
        changes.push(`类型：${existing.dataType} → ${field.dataType}`);
      if (Boolean(existing.nullable) !== field.nullable)
        changes.push(
          `可空：${Boolean(existing.nullable) ? "是" : "否"} → ${field.nullable ? "是" : "否"}`,
        );
      if ((existing.defaultValue ?? null) !== (field.defaultValue ?? null))
        changes.push(
          `默认值：${existing.defaultValue ?? "—"} → ${field.defaultValue ?? "—"}`,
        );
      if ((existing.comment ?? "") !== (field.comment ?? ""))
        changes.push(
          `注释：${existing.comment || "—"} → ${field.comment || "—"}`,
        );
      if ((existing.extra ?? "") !== (field.extra ?? ""))
        changes.push(`属性：${existing.extra || "—"} → ${field.extra || "—"}`);
      if (
        !scopedFieldIds.has(existing.id) &&
        createTables.has(field.tableName.toLowerCase())
      ) {
        items.push({
          tableName: field.tableName,
          columnName: field.columnName,
          result: changes.length ? "modified" : "added",
          before: changes.length ? definition(existing) : null,
          after: definition(field),
          changes: changes.length
            ? [...changes, "将作为该环境的实际修订保存"]
            : ["字段将登记到所选环境"],
        });
        continue;
      }
      const createSnapshot = createTables.has(field.tableName.toLowerCase());
      const result = !changes.length
        ? "unchanged"
        : createSnapshot ||
            field.action === "modify" ||
            field.action === "change"
          ? "modified"
          : "conflict";
      items.push({
        tableName: field.tableName,
        columnName: field.columnName,
        result,
        before: definition(existing),
        after: definition(field),
        changes,
      });
    }
    for (const table of normalizedParsed.tables) {
      const incoming = incomingByTable.get(table.name) ?? new Set<string>();
      existingRows.results
        .filter(
          (field) =>
            field.tableName.toLowerCase() === table.name &&
            scopedFieldIds.has(field.id) &&
            !incoming.has(field.name.toLowerCase()),
        )
        .forEach((field) =>
          items.push({
            tableName: table.name,
            columnName: field.name,
            result: "removed",
            before: definition(field),
            after: null,
            changes: ["建表语句中不存在该字段"],
          }),
        );
    }
    const summary = items.reduce(
      (result, item) => ({
        ...result,
        [item.result]: (result[item.result] ?? 0) + 1,
      }),
      {} as Record<string, number>,
    );
    return Response.json({
      ok: true,
      importMode,
      items,
      summary,
      warnings: parsed.warnings,
    });
  }

  return null;
}
