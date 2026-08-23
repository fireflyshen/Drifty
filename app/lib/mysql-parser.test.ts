import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMysqlSql } from './mysql-parser.ts';

test('parses multiple CREATE TABLE statements in one import', () => {
  const result=parseMysqlSql(`
    CREATE TABLE customer (
      id bigint NOT NULL,
      name varchar(80) COMMENT '客户名称'
    ) COMMENT='客户';

    CREATE TABLE customer_address (
      id bigint NOT NULL,
      customer_id bigint NOT NULL
    ) COMMENT='客户地址';
  `);

  assert.deepEqual(result.tables.map((table)=>table.name),['customer','customer_address']);
  assert.equal(result.fields.length,4);
  assert.deepEqual(result.warnings,[]);
});

test('recognizes consecutive SHOW CREATE TABLE output without semicolons', () => {
  const result=parseMysqlSql(`
    CREATE TABLE alpha (
      id bigint NOT NULL
    ) ENGINE=InnoDB
    CREATE TABLE beta (
      id bigint NOT NULL
    ) ENGINE=InnoDB
  `);

  assert.deepEqual(result.tables.map((table)=>table.name),['alpha','beta']);
  assert.equal(result.fields.length,2);
});

test('parses ADD, MODIFY, CHANGE and DROP clauses', () => {
  const result=parseMysqlSql(`
    ALTER TABLE customer
      ADD COLUMN region varchar(40) COMMENT '区域',
      MODIFY COLUMN name varchar(120) NOT NULL,
      CHANGE COLUMN level credit_level varchar(50) DEFAULT 'A',
      DROP COLUMN IF EXISTS legacy_code;
  `);

  assert.deepEqual(result.fields.map((field)=>field.action),['add','modify','change','drop']);
  assert.equal(result.fields[2].previousName,'level');
  assert.equal(result.fields[2].columnName,'credit_level');
  assert.equal(result.fields[3].columnName,'legacy_code');
  assert.deepEqual(result.warnings,[]);
});

test('ignores common MySQL dump wrapper statements', () => {
  const result=parseMysqlSql(`
    SET NAMES utf8mb4;
    DROP TABLE IF EXISTS customer;
    CREATE TABLE customer (id bigint NOT NULL);
    LOCK TABLES customer WRITE;
    UNLOCK TABLES;
  `);
  assert.equal(result.fields.length,1);
  assert.deepEqual(result.warnings,[]);
});
