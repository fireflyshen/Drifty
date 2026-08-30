# Drifty 🌿

Drifty 是一个轻量的数据库结构登记工具，用来追踪字段在不同项目、版本和环境中的实际状态。

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

## 批量导出 `mes_` 表结构

项目提供了一个只读 Python 脚本：它只查询 `information_schema` 和 `SHOW CREATE TABLE`，不会执行 `INSERT`、`UPDATE`、`DELETE` 或任何建表/改表语句。

先创建一个项目专用的 Python 虚拟环境并安装依赖（不会修改系统 Python）：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install mysql-connector-python
```

然后运行（密码会安全地在终端输入，不会出现在命令历史中）：

```bash
python scripts/export_mes_schema.py --host 127.0.0.1 --port 3306 --user readonly --database your_db --out mes_schema.sql
```

脚本默认只导出表名以 `mes_` 开头的真实数据表，并按表名排序生成一个 SQL 文件；也可以用 `--prefix` 更换前缀。建议使用只拥有元数据读取权限的 MySQL 账号。生成的 `mes_schema.sql` 可直接在 Drifty「导入」页面上传，选择目标项目、版本和环境后查看差异。
