import { fieldDefinition, sqlIdentifier } from "../shared.ts";

export type AlignmentField = {
  tableName: string;
  name: string;
  dataType: string;
  nullable: number | boolean;
  defaultValue: string | null;
  comment: string;
  extra: string;
};

export type FieldAlignmentPlan = {
  sql: string;
  items: FieldAlignmentItem[];
  summary: {
    added: number;
    modified: number;
    dropped: number;
  };
};

export type FieldAlignmentItem = {
  key: string;
  action: "add" | "modify" | "drop";
  tableName: string;
  columnName: string;
  before: string | null;
  after: string | null;
  sql: string;
  destructive: boolean;
};

const fieldKey = (field: AlignmentField) =>
  `${field.tableName.toLowerCase()}.${field.name.toLowerCase()}`;

const sameDefinition = (base: AlignmentField, target: AlignmentField) =>
  base.dataType.toLowerCase() === target.dataType.toLowerCase() &&
  Boolean(base.nullable) === Boolean(target.nullable) &&
  (base.defaultValue ?? null) === (target.defaultValue ?? null) &&
  (base.comment ?? "") === (target.comment ?? "") &&
  (base.extra ?? "") === (target.extra ?? "");

/**
 * Generate MySQL DDL that makes target field definitions match the base.
 *
 * The plan is intentionally field-only: it never creates or drops tables,
 * indexes, or constraints. Target-only fields are emitted last as DROP COLUMN
 * statements so reviewers can spot the destructive part of the plan easily.
 */
export function buildFieldAlignmentPlan(
  baseFields: AlignmentField[],
  targetFields: AlignmentField[],
): FieldAlignmentPlan {
  const baseMap = new Map(baseFields.map((field) => [fieldKey(field), field]));
  const targetMap = new Map(
    targetFields.map((field) => [fieldKey(field), field]),
  );
  const additions: FieldAlignmentItem[] = [];
  const modifications: FieldAlignmentItem[] = [];
  const drops: FieldAlignmentItem[] = [];

  for (const key of [...new Set([...baseMap.keys(), ...targetMap.keys()])].sort()) {
    const base = baseMap.get(key);
    const target = targetMap.get(key);
    if (base && !target) {
      const definition = fieldDefinition(base);
      additions.push({
        key: `add:${key}`,
        action: "add",
        tableName: base.tableName,
        columnName: base.name,
        before: null,
        after: definition,
        sql: `ALTER TABLE ${sqlIdentifier(base.tableName)} ADD COLUMN ${sqlIdentifier(base.name)} ${definition};`,
        destructive: false,
      });
      continue;
    }
    if (!base && target) {
      drops.push({
        key: `drop:${key}`,
        action: "drop",
        tableName: target.tableName,
        columnName: target.name,
        before: fieldDefinition(target),
        after: null,
        sql: `ALTER TABLE ${sqlIdentifier(target.tableName)} DROP COLUMN ${sqlIdentifier(target.name)};`,
        destructive: true,
      });
      continue;
    }
    if (base && target && !sameDefinition(base, target)) {
      const definition = fieldDefinition(base);
      modifications.push({
        key: `modify:${key}`,
        action: "modify",
        tableName: base.tableName,
        columnName: base.name,
        before: fieldDefinition(target),
        after: definition,
        sql: `ALTER TABLE ${sqlIdentifier(base.tableName)} MODIFY COLUMN ${sqlIdentifier(base.name)} ${definition};`,
        destructive: false,
      });
    }
  }

  const items = [...additions, ...modifications, ...drops];
  return {
    sql: items.map((item) => item.sql).join("\n"),
    items,
    summary: {
      added: additions.length,
      modified: modifications.length,
      dropped: drops.length,
    },
  };
}
