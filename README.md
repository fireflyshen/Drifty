# Drifty 🌿

Drifty 是一个轻量的数据库结构登记工具，用来追踪字段在不同项目、版本和环境中的实际状态。

代码分层、模块边界以及主要函数职责见 [架构与职责文档](docs/architecture.md)。

## 能做什么

- 🔎 快速查询表、字段及其覆盖范围
- 🧩 管理项目、模块、版本和环境
- 📥 解析 MySQL `CREATE TABLE` 与 `ALTER TABLE` SQL
- 🕰️ 记录 SQL 变更历史，并识别重复字段
- 🌗 支持浅色 / 深色主题和中英文界面
- ☁️ 使用 Cloudflare Workers + D1 运行

在首页「查结构」中还可以统一管理表、字段、索引和约束的生命周期：搜索对象后标记为「废弃」，需要时一键恢复。导入相关的模块、Git 来源和结构重置也集中在「导入」页。生命周期不会删除历史记录；导入建表快照时，SQL 中缺失的对象默认只进入差异提示，不会被自动标记，避免不完整文件误伤现有结构。

项目详情的「结构差异」里可以先在项目编辑中设置锚定版本和锚定环境，再选择任意目标版本 / 环境进行对比。系统会按表、字段、索引和约束列出新增、修改及目标多出的对象，并生成补齐 SQL；目标多出的对象只提示、不自动删除。确认 SQL 已在锚定环境执行后，点击「登记锚点已执行」，即可把同一条 SQL 记录到项目环境清单中，其他环境会显示为待执行。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。本地数据保存在项目的 `.wrangler` 目录中。

## 检查与构建

```bash
npm run lint
npm test
npm run build
```

## Cloudflare 自动部署 🚀

项目已包含生产环境的 Worker、D1 和迁移配置。将 GitHub 仓库连接到 Cloudflare Workers Builds 后，每次推送到 `main` 都会自动更新：

- 仓库：`fireflyshen/Drifty`
- 生产分支：`main`
- 构建命令：`npm ci && npm run build`
- 部署命令：`npm run deploy:cloudflare`

首次连接位置：Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository**。

手动发布时运行：

```bash
npm run build
npm run deploy:cloudflare
```

## 只读导出内网 MySQL 表结构

导入页可以直接复制或下载独立 Python 脚本及表清单模板。脚本只允许查询 `information_schema.TABLES` 和执行 `SHOW CREATE TABLE`，不会读取业务数据，也不会执行 DDL、DML、锁表或存储过程。

先创建一个项目专用的 Python 虚拟环境并安装依赖（不会修改系统 Python）：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install mysql-connector-python
```

然后运行（密码会安全地在终端输入，不会出现在命令历史中）：

```bash
python public/tools/export_mysql_schema.py \
  --host 127.0.0.1 \
  --port 3306 \
  --user schema_reader \
  --database your_db \
  --tables-file drifty-tables.txt \
  --out drifty-schema.sql
```

表清单一行一个表名，可先用 `--list-only` 离线检查。建议使用专门的只读账号；脚本自身还有查询白名单，其他 SQL 会在提交给驱动前被拒绝。生成的 `drifty-schema.sql` 可带回并在 Drifty「导入」页面以“采集快照”方式导入。完整说明见 [`docs/readonly-schema-export.md`](docs/readonly-schema-export.md)。旧的 `scripts/export_mes_schema.py` 入口仍兼容默认 `mes_` 前缀用法。
