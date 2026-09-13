/**
 * 目录服务端的无状态基础工具。
 *
 * 函数职责：
 * - clean/csv：规范化请求参数；now/id/hash：生成时间、标识和内容指纹。
 * - lifecycleExpression：生成项目范围内的生命周期 SQL 表达式。
 * - projectCode/tableCode/fieldCode：生成稳定、可读且不重复的业务编码。
 * - sqlIdentifier/sqlLiteral/sqlDefault：安全拼装 MySQL 展示 SQL。
 * - fieldDefinition/indexDefinition：把目录对象转换成 MySQL 定义片段。
 * - runChunked：按 D1 批处理上限分块执行。
 * - validateScopeSelection：验证版本与环境确实属于指定项目。
 */
export const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
export const csv = (value: unknown) =>
  clean(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export function lifecycleExpression(
  entity: string,
  objectExpression: string,
  projectIds: string[],
) {
  const owner = objectExpression.split(".")[0];
  // Project-level lifecycle is the source of truth for a scoped query.  With
  // no scope (the explicit “all projects” view), aggregate all overrides so
  // deprecated/removed objects do not leak into the default active view.
  const projectFilter = projectIds.length
    ? ` AND lifecycle.project_id IN (${projectIds.map(() => "?").join(",")})`
    : "";
  return {
    sql: `coalesce((SELECT lifecycle.status FROM catalog_object_lifecycles lifecycle WHERE lifecycle.entity='${entity}' AND lifecycle.object_id=${objectExpression}${projectFilter} ORDER BY CASE lifecycle.status WHEN 'removed' THEN 3 WHEN 'deprecated' THEN 2 ELSE 1 END DESC LIMIT 1),${owner}.lifecycle_status,'active')`,
    bindings: projectIds,
  };
}

export async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function projectCode(name: string) {
  const ascii = name
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const result =
    ascii.length > 1
      ? ascii.map((word) => word[0]).join("")
      : ascii[0]?.slice(0, 8);
  return (result || `P${Date.now().toString().slice(-5)}`).toUpperCase();
}

export function tableCode(name: string, used: Set<string>) {
  const words = name.split(/[_\-\s]+/).filter(Boolean);
  const base =
    (words.length > 1
      ? words.map((word) => word[0]).join("")
      : name.slice(0, 3)
    )
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase() || "TAB";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function fieldCode(tablePrefix: string, used: Set<string>) {
  let sequence = 1;
  let candidate = `${tablePrefix}-${String(sequence).padStart(3, "0")}`;
  while (used.has(candidate)) {
    sequence += 1;
    candidate = `${tablePrefix}-${String(sequence).padStart(3, "0")}`;
  }
  used.add(candidate);
  return candidate;
}

export function sqlIdentifier(value: string) {
  return `\`${value.replaceAll("`", "``")}\``;
}
export function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
export function sqlDefault(value: string) {
  const trimmed = value.trim();
  if (
    /^(NULL|CURRENT_TIMESTAMP(?:\(\))?|TRUE|FALSE)$/i.test(trimmed) ||
    /^-?\d+(?:\.\d+)?$/.test(trimmed)
  )
    return trimmed;
  return sqlLiteral(value);
}
export function fieldDefinition(field: {
  dataType: string;
  nullable: number | boolean;
  defaultValue: string | null;
  comment: string;
  extra: string;
}) {
  return `${field.dataType}${field.nullable ? " NULL" : " NOT NULL"}${field.defaultValue !== null ? ` DEFAULT ${sqlDefault(field.defaultValue)}` : ""}${field.comment ? ` COMMENT ${sqlLiteral(field.comment)}` : ""}${field.extra ? ` ${field.extra}` : ""}`;
}
export function indexDefinition(index: {
  kind: string;
  name: string;
  columnsJson: string;
}) {
  let columns: string[] = [];
  try {
    columns = JSON.parse(index.columnsJson) as string[];
  } catch {
    columns = [];
  }
  const list = columns.map(sqlIdentifier).join(", ");
  if (index.kind === "primary") return `ADD PRIMARY KEY (${list})`;
  if (index.kind === "unique")
    return `ADD UNIQUE KEY ${sqlIdentifier(index.name)} (${list})`;
  if (index.kind === "fulltext")
    return `ADD FULLTEXT KEY ${sqlIdentifier(index.name)} (${list})`;
  if (index.kind === "spatial")
    return `ADD SPATIAL KEY ${sqlIdentifier(index.name)} (${list})`;
  return `ADD KEY ${sqlIdentifier(index.name)} (${list})`;
}

export async function runChunked(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50)
    await db.batch(statements.slice(index, index + 50));
}

export async function validateScopeSelection(
  db: D1Database,
  projectId: string,
  versionId: string,
  environmentIds: string[],
) {
  const version = await db
    .prepare(`SELECT id FROM catalog_versions WHERE id=? AND project_id=?`)
    .bind(versionId, projectId)
    .first();
  if (!version) return "所选版本不属于当前项目。";
  const ids = [...new Set(environmentIds)];
  if (!ids.length) return "请至少选择一个环境。";
  const placeholders = ids.map(() => "?").join(",");
  const row = await db
    .prepare(
      `SELECT count(DISTINCT id) AS count FROM catalog_environments WHERE id IN (${placeholders}) AND project_id=? AND archived=0`,
    )
    .bind(...ids, projectId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0) === ids.length
    ? null
    : "所选环境与当前项目或版本不匹配。";
}

