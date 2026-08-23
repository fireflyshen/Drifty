# Drifty 🌿

Drifty 是一个轻量的数据库结构登记工具，用来追踪字段在不同项目、版本和环境中的实际状态。

## 能做什么

- 🔎 快速查询表、字段及其覆盖范围
- 🧩 管理项目、模块、版本和环境
- 📥 解析 MySQL `CREATE TABLE` 与 `ALTER TABLE` SQL
- 🕰️ 记录 SQL 变更历史，并识别重复字段
- 🌗 支持浅色 / 深色主题和中英文界面
- ☁️ 使用 Cloudflare Workers + D1 运行

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

