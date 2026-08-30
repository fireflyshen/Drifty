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

test('parses indexes from CREATE and ALTER TABLE', () => {
  const result=parseMysqlSql(`
    CREATE TABLE mes_order (
      id bigint NOT NULL,
      customer_id bigint,
      KEY idx_customer (customer_id),
      UNIQUE KEY uk_order_id (id)
    );
    ALTER TABLE mes_order ADD INDEX idx_customer_status (customer_id, id), DROP INDEX old_idx;
  `);
  assert.deepEqual(result.indexes.map((index)=>[index.action,index.name,index.kind,index.columns]),[
    ['add','idx_customer','index',['customer_id']],
    ['add','uk_order_id','unique',['id']],
    ['add','idx_customer_status','index',['customer_id','id']],
    ['drop','old_idx','index',[]],
  ]);
});

test('parses foreign key and check constraints', () => {
  const result=parseMysqlSql(`CREATE TABLE mes_order (id bigint, customer_id bigint, CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customer(id), CONSTRAINT ck_order_id CHECK (id > 0));`);
  assert.deepEqual(result.constraints.map((item)=>[item.kind,item.name]),[['foreign','fk_order_customer'],['check','ck_order_id']]);
});
