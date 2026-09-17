# 内网 MySQL 表结构只读采集

Drifty 的导入页提供两份可带入内网的文件：

- `export_mysql_schema.py`：只读导出脚本。
- `drifty-tables.example.txt`：表清单模板。

脚本不连接 Drifty，也不会把数据库信息发送到网络。它只在执行机器本地连接 MySQL，并把 `CREATE TABLE` 写入本地 SQL 文件。

## 安全边界

脚本内置查询白名单，仅允许：

1. `SELECT TABLE_NAME FROM information_schema.TABLES ...`
2. `SHOW CREATE TABLE <配置表名>`

其他查询会在交给 MySQL 驱动前被拒绝。脚本不读取业务行、不执行任意 `SELECT`、DDL、DML、锁表或存储过程，也不调用 `commit()`。数据库名和表名只允许字母、数字、下划线和 `$`。

仍建议使用专门的只读账号，并只授予目标库必要的元数据读取权限。这形成数据库权限与脚本白名单两层保护。

## 内网执行

准备 Python 3，并在项目专用虚拟环境安装驱动：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install mysql-connector-python
```

复制表清单模板为 `drifty-tables.txt`，一行一个表名：

```text
customer
customer_address
sales_order
```

可先离线检查清单，不连接数据库：

```bash
python export_mysql_schema.py \
  --tables-file drifty-tables.txt \
  --list-only
```

执行只读导出。不要把密码写进命令；脚本会在终端中隐藏输入：

```bash
python export_mysql_schema.py \
  --host 10.0.0.8 \
  --port 3306 \
  --user schema_reader \
  --database your_db \
  --tables-file drifty-tables.txt \
  --out drifty-schema.sql
```

输出包括：

- `drifty-schema.sql`：可带回并导入 Drifty 的多条 `CREATE TABLE`。
- `drifty-schema.sql.missing.txt`：清单中不存在或无权读取的表。

回到 Drifty 后，在“导入”页选择“采集快照”，上传 `drifty-schema.sql`，选择项目、版本和环境，预览后保存。之后再次采集同一环境时，Drifty 会比较新快照并核验此前登记的执行记录。

## 兼容旧的前缀导出

仓库中的 `scripts/export_mes_schema.py` 仍可使用，未指定范围时保持原有 `mes_` 前缀行为。新的独立脚本也支持显式的 `--prefix mes_`，但生产采集更推荐使用表清单，范围更容易审计。
