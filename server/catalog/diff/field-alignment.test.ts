import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFieldAlignmentPlan,
  type AlignmentField,
} from "./field-alignment.ts";

const field = (
  name: string,
  overrides: Partial<AlignmentField> = {},
): AlignmentField => ({
  tableName: "customer",
  name,
  dataType: "varchar(80)",
  nullable: 1,
  defaultValue: null,
  comment: "",
  extra: "",
  ...overrides,
});

test("generates add, modify and drop SQL in safe review order", () => {
  const plan = buildFieldAlignmentPlan(
    [
      field("display_name", {
        nullable: 0,
        defaultValue: "unknown",
        comment: "显示名",
      }),
      field("created_at", {
        dataType: "timestamp",
        nullable: 0,
        defaultValue: "CURRENT_TIMESTAMP",
      }),
    ],
    [
      field("created_at", { dataType: "datetime", nullable: 1 }),
      field("legacy_code"),
    ],
  );

  assert.deepEqual(plan.summary, { added: 1, modified: 1, dropped: 1 });
  assert.deepEqual(
    plan.items.map((item) => [item.action, item.key, item.destructive]),
    [
      ["add", "add:customer.display_name", false],
      ["modify", "modify:customer.created_at", false],
      ["drop", "drop:customer.legacy_code", true],
    ],
  );
  assert.deepEqual(plan.items[1], {
    key: "modify:customer.created_at",
    action: "modify",
    tableName: "customer",
    columnName: "created_at",
    before: "datetime NULL",
    after: "timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP",
    sql: "ALTER TABLE `customer` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;",
    destructive: false,
  });
  assert.equal(
    plan.sql,
    [
      "ALTER TABLE `customer` ADD COLUMN `display_name` varchar(80) NOT NULL DEFAULT 'unknown' COMMENT '显示名';",
      "ALTER TABLE `customer` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;",
      "ALTER TABLE `customer` DROP COLUMN `legacy_code`;",
    ].join("\n"),
  );
});

test("treats data type casing and nullable number/boolean as equivalent", () => {
  const plan = buildFieldAlignmentPlan(
    [field("id", { dataType: "BIGINT", nullable: false })],
    [field("id", { dataType: "bigint", nullable: 0 })],
  );

  assert.deepEqual(plan.summary, { added: 0, modified: 0, dropped: 0 });
  assert.equal(plan.sql, "");
});

test("escapes table, column, default and comment values", () => {
  const plan = buildFieldAlignmentPlan(
    [
      field("nick`name", {
        tableName: "user`profile",
        defaultValue: "O'Reilly",
        comment: "用户's 昵称",
      }),
    ],
    [],
  );

  assert.equal(
    plan.sql,
    "ALTER TABLE `user``profile` ADD COLUMN `nick``name` varchar(80) NULL DEFAULT 'O''Reilly' COMMENT '用户''s 昵称';",
  );
});
