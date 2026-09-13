# Drifty 架构与职责

本文是代码导航和维护边界说明。新增功能时应先找到负责该业务的模块，再在模块内部扩展；不要把业务逻辑重新堆回 `app/page.tsx` 或 API 路由。

本文逐项记录模块级业务函数；组件内部的事件回调和某个 action 分支内的局部查询函数属于其外层函数实现，不单独形成公共职责。

## 1. 系统定位

Drifty 是运行在 Cloudflare Workers + D1 上的单体全栈应用，用于登记和比较项目、版本、环境中的 MySQL 表、字段、索引与约束。

```text
浏览器
  -> app/page.tsx                 客户端状态与工作区编排
     -> features/catalog          目录领域界面与数据契约
        -> /api/catalog           稳定 HTTP 契约
           -> server/catalog      查询、命令、快照和导入服务
              -> db/runtime.ts    D1 连接与本地兼容初始化
                 -> Cloudflare D1
```

系统保持一个部署单元，不拆微服务。这里的模块化目标是隔离变化、缩小文件和明确所有权，不增加部署复杂度。

## 2. 依赖规则

1. `app` 只做框架入口和页面编排。
2. `features/catalog` 可以依赖 `components/ui`，不能直接访问 D1。
3. `app/api/catalog/route.ts` 只转发 HTTP 入口，不能加入业务分支。
4. `server/catalog/actions` 负责写命令，`read-route.ts` 负责读模型。
5. `server/catalog/snapshots.ts` 是快照事实源，导入处理器不能复制快照算法。
6. `db/schema.ts` 与 `drizzle` 管理持久化结构；自动生成的 snapshot JSON 不手工拆分。

## 3. 模块职责

| 模块 | 职责 | 不负责 |
|---|---|---|
| `app/page.tsx` | 客户端状态、工作区切换、弹窗编排、调用目录 API | 具体业务视图、SQL、D1 |
| `features/catalog/model/types.ts` | 前端目录数据契约 | 请求与渲染 |
| `features/catalog/presentation.tsx` | 文案、格式化、图标和小型通用业务控件 | 工作区数据加载 |
| `features/catalog/components/explorer.tsx` | 表、字段、索引、约束查询与详情 | 导入与发布 |
| `features/catalog/components/projects.tsx` | 项目、版本、环境、锚点和覆盖率 | SQL 解析 |
| `features/catalog/components/imports.tsx` | 导入配置、预览、差异和批次详情 | 服务端落库 |
| `features/catalog/components/history.tsx` | 结构历史与范围比较界面 | 修改目录 |
| `features/catalog/components/releases.tsx` | 发布包及环境执行状态 | 生成结构快照 |
| `features/catalog/components/lifecycle-workspace.tsx` | 对象生命周期检索与更新 | 删除对象历史 |
| `features/catalog/components/settings.tsx` | 语言、主题和重置入口 | 执行重置 |
| `components/ui/*` | shadcn/Radix 基础视觉控件 | 目录业务规则 |
| `app/api/catalog/route.ts` | 导出稳定的 GET/POST 入口 | 查询和命令实现 |
| `server/catalog/read-route.ts` | 按 mode 构建目录只读响应 | 写操作 |
| `server/catalog/write-route.ts` | 解析写请求并依次分派 action | action 的业务细节 |
| `server/catalog/actions/context.ts` | action、payload、D1 的共享上下文类型 | 业务处理 |
| `server/catalog/actions/management.ts` | 主数据、生命周期、来源和状态命令 | 导入、结构比较 |
| `server/catalog/actions/history.ts` | 结构历史、SQL 历史/登记、范围比较 | 正式导入 |
| `server/catalog/actions/imports.ts` | 导入命令的二级分派 | 具体导入算法 |
| `server/catalog/actions/imports/conflict.ts` | 保存冲突决议 | SQL 预览 |
| `server/catalog/actions/imports/preview.ts` | 只读解析并生成导入预览 | 写目录 |
| `server/catalog/actions/imports/execute.ts` | 正式导入、修订、范围、快照和发布记录 | 回滚 |
| `server/catalog/actions/imports/maintenance.ts` | 批次回滚和结构重置 | 正常导入 |
| `server/catalog/shared.ts` | 参数、编码、SQL 展示和 D1 批处理工具 | 保存业务实体 |
| `server/catalog/snapshots.ts` | 保存/读取环境快照并核验变更 | UI 与 HTTP |
| `app/lib/mysql-parser.ts` | 将 MySQL DDL 解析为结构化对象并生成字段指纹 | D1 写入 |
| `db/runtime.ts` | 获取 D1、初始化表、兼容旧库、填充演示数据 | 目录查询 |
| `db/schema.ts` | Drizzle 表结构声明 | 运行时业务逻辑 |
| `app/api/registry/route.ts` | 旧版 registry 兼容 API | 新目录主流程 |

## 4. 前端函数职责

### app/page.tsx

- `Home`：客户端应用壳。持有跨工作区共享状态，加载基础目录数据，统一处理新增、编辑、删除、导入和详情导航，并把能力传给 feature 组件。

### explorer.tsx

- `DetailSurface`：统一侧栏、居中弹窗和全屏详情容器。
- `SchemaExplorerView`：切换表、字段、索引、约束视图。
- `ObjectExplorerView`：查询与分页展示索引或约束。
- `ScopeCoverage`：展示对象在项目、版本、环境中的覆盖情况。
- `TableExplorerView`：查询、筛选、分页展示表。
- `ExplorerView`：查询、筛选、分页展示字段。
- `TableDetail`：展示表定义、字段、索引、约束和范围。
- `FieldDetail`：展示字段定义、范围修订和生命周期。

### projects.tsx

- `ProjectsWorkspace`：展示平台/项目列表与汇总信息。
- `ProjectDetail`：展示项目、版本、环境、差异、导入和锚点配置。
- `AnchorSyncPanel`：比较锚点与目标范围并登记执行记录。
- `EnvironmentDetail`：展示环境覆盖率、缺失字段和导入记录。

### imports.tsx

- `ImportDetail`：展示导入批次和明细，提供回滚入口。
- `ImportWorkspace`：组织文件、模式、项目、版本和环境选择。
- `SchemaDiffViewer`：按表、字段、索引、约束渲染差异。
- `ImportPreviewDialog`：提交前展示预览并收集确认。

### history.tsx / releases.tsx

- `SchemaHistoryViewer`：渲染表或字段的修订时间线。
- `ScopeCompareDialog`：比较两个范围中的结构。
- `ReleaseWorkspace`：加载并按批次聚合发布变更。
- `ReleaseGroupDetail`：展示发布包中的变更和环境状态。

### lifecycle-workspace.tsx / settings.tsx

- `LifecycleWorkspace`：搜索、过滤并更新对象生命周期。
- `SettingsView`：展示语言、主题和结构重置入口。

### presentation.tsx

- `number`：规范化 API 数值。
- `formatDate`：按语言格式化 UTC 时间。
- `importResultLabel`：转换导入结果文案。
- `DriftyLogo`：产品标识。
- `ProjectIcon` / `ProjectIconPicker`：展示与选择项目图标。
- `PrimaryNav`：工作区主导航。
- `LanguageSwitcher`：语言切换。
- `CreateMenu`：上下文相关的新建菜单。
- `ScopePicker`：项目、版本、环境组合选择。
- `ProjectPicker`：单项目选择。
- `EnvironmentSummary`：压缩展示环境名称。
- `ProjectLifecycleControl` / `LifecycleMenu`：生命周期展示与操作。
- `SelectField`：把原生 option 适配到统一选择器。
- `SearchSelect`：可搜索选择器。
- `IconButton`：带提示和状态的图标按钮。
- `EntityMenu`：实体编辑/删除菜单。
- `Field`：表单字段布局。
- `Empty`：空状态。
- `ModalActions`：弹窗底部操作。
- `modalTitle`：生成实体弹窗标题。

## 5. 服务端函数职责

### HTTP 与命令分派

- `read-route.GET`：根据 `mode` 生成基础目录、生命周期、锚点、搜索、详情、发布和项目信息。
- `write-route.POST`：解析请求并将 action 依次交给命令处理器。
- `handleManagementAction`：处理项目、模块、版本、环境、表、字段、生命周期和来源。
- `handleHistoryAction`：处理结构历史、SQL 登记和范围比较。
- `handleImportAction`：分派导入命令。
- `handleImportConflictAction`：保存同名字段的决议。
- `handleImportPreviewAction`：只读生成导入预览。
- `handleImportExecutionAction`：正式落库并生成修订、范围、快照与发布信息。
- `handleImportMaintenanceAction`：回滚批次或重置目录。
- `importItem`：构造一条导入明细写入语句。

### 快照

- `captureEnvironmentSnapshot`：把指定项目/版本/环境的完整结构保存为不可变快照。
- `latestSnapshotObjects`：读取指定范围最新快照及对象。
- `verifyChangesAgainstSnapshot`：比较字段、索引、约束指纹并把匹配变更标为 verified。

### 通用工具

- `clean` / `csv`：规范化单值和逗号列表参数。
- `now` / `id` / `hash`：生成时间、UUID 和 SHA-256 指纹。
- `lifecycleExpression`：生成项目范围内生命周期聚合表达式。
- `projectCode` / `tableCode` / `fieldCode`：生成业务编码。
- `sqlIdentifier` / `sqlLiteral` / `sqlDefault`：转义 MySQL 展示 SQL。
- `fieldDefinition` / `indexDefinition`：生成字段和索引定义片段。
- `runChunked`：按 50 条分块执行 D1 batch。
- `validateScopeSelection`：校验版本和环境属于指定项目。

### 解析与数据库

- `splitTopLevel`：按顶层分隔符切分，忽略括号内分隔符。
- `splitStatements`：切分多条 MySQL DDL。
- `unquote`：移除标识符引号。
- `parseDefinition`：解析一条字段定义。
- `parseMysqlSql`：解析 CREATE/ALTER、索引和约束。
- `fieldFingerprint`：为字段事实生成稳定指纹。
- `getD1`：取得 Cloudflare D1 binding。
- `ensureDatabase`：初始化表、执行兼容补列并写入种子数据。
- `getDb`：创建带 schema 的 Drizzle 客户端。
- `cn`：合并 Tailwind class。
- `PWARegister`：在浏览器注册 service worker。

## 6. 基础 UI 函数约定

`components/ui` 中的函数均为相应 HTML/Radix 控件的薄封装。函数名就是控件职责：

- Dialog、Sheet、AlertDialog：Root、Trigger、Portal、Overlay、Content、Header、Footer、Title、Description、Action/Cancel。
- DropdownMenu：Root、Trigger、Content、Group、Item、CheckboxItem、RadioGroup/Item、Label、Separator、Shortcut、Sub。
- Select：Root、Group、Value、Trigger、Content、Label、Item、Separator、ScrollUp/DownButton。
- Card：Card、Header、Title、Description、Action、Content、Footer。
- Tabs：Tabs、TabsList、TabsTrigger、TabsContent。
- Button、Badge、Input、Textarea、Switch、Separator、Tooltip：对应的单一基础控件。

基础 UI 层只能处理样式、可访问性和控件行为，不允许读取目录 API 或出现项目/版本/环境业务规则。

## 7. 规模约束

- 框架入口建议不超过 300 行；当前 `Home` 仍是下一阶段需要抽取 controller hook 的重点。
- 单个 feature 文件目标不超过 2,000 行；超过后按独立用例继续拆分。
- HTTP adapter 不写业务分支。
- 新增 action 必须进入明确的 handler，并同步更新本文。
- 生成文件按工具管理，不用人工拆行数。

## 8. 验证

结构调整后至少运行：

```bash
npm exec tsc -- --noEmit
npm test
npm run lint
npm run build
node scripts/catalog-smoke.mjs
```
