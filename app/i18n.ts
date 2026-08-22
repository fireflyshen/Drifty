export type Locale = 'zh' | 'en';

export const copy = {
  zh: {
    language: 'EN', languageLabel: 'Switch to English', subtitle: '数据库模型注册表', search: '搜索模型、字段、项目…', manifests: '项目清单', cloudSync: '云端同步', newChange: '新建变更', addField: '新增字段',
    workspace: '工作区', overview: '概览', registry: '模型注册表', changes: '变更登记', projects: '项目', healthy: '注册表正常', d1: 'Cloudflare D1',
    heroEyebrow: '数据库产品线', heroTitle: '让数据库差异保持可控。', heroCopy: '用公共核心、能力模块和项目清单管理数据库结构；在修改任何字段前，先看清影响范围。', browseRegistry: '浏览字段', viewManifests: '查看项目清单', heroAlt: 'Drifty 像素风数据库能力仓库',
    fields: '字段', fieldsHelp: '已登记的模型对象', modules: '模块', projectsMetric: '项目', openChanges: '待处理变更', core: '核心', features: '能力', needUpgrade: '需要升级', awaitingReview: '等待审核',
    registryTitle: '模型注册表', customer: 'Customer', viewAllFields: '查看全部字段', impactPreview: '影响预览', version: '版本', affectedProjects: '受影响项目', included: '已包含', openImpact: '打开影响分析', recentChanges: '最近变更', viewAll: '查看全部',
    registryEyebrow: '模型注册表', registryHeading: '数据库对象', registryCopy: '每个逻辑字段只有一个身份、一个归属模块和一份项目影响图。', allFields: '全部字段', records: '条记录', all: '全部',
    changesEyebrow: '迁移登记', changesHeading: '结构变更', changesCopy: '发布前先登记变更意图、迁移编号和准确的项目影响范围。',
    projectsEyebrow: '项目组成', projectsHeading: '项目清单', projectsCopy: '项目由 Core 和可复用 Feature 组合，而不是由长期 Git 分支复制出来。', capabilityModules: '能力模块', ownership: '共享的结构归属边界',
    object: '对象', type: '类型', source: '来源', projectsColumn: '项目', module: '模块', kind: '类别', fieldsColumn: '字段', current: '最新', upgrade: '需升级',
    noMatches: '没有符合条件的字段。', selectHint: '已选中', affected: '个受影响项目', fetchError: 'D1 暂时不可用。', dismiss: '关闭提示',
    addFieldTitle: '新增注册字段', addFieldCopy: '建立一个逻辑字段身份，并指定它的归属模块。', fieldCode: '字段编码', table: '表名', column: '字段名', dataType: '数据类型', businessMeaning: '业务含义', ownerModule: '归属模块', firstVersion: '首次版本',
    registerChangeTitle: '登记结构变更', registerChangeCopy: '登记迁移意图；Drifty 在此阶段不会执行 SQL。', changeCode: '变更编号', migration: '迁移版本', schemaField: '结构字段', summary: '变更说明', from: '变更前', to: '变更后', risk: '风险', cancel: '取消', saving: '保存中…', saveRecord: '保存', close: '关闭',
    fieldAdded: '字段已添加到注册表。', changeAdded: '变更已登记为草稿。', saveError: '保存失败，请检查填写内容。',
    low: '低', medium: '中', high: '高', draft: '草稿', review: '审核中', approved: '已通过', registered: '已登记',
  },
  en: {
    language: '中文', languageLabel: '切换到中文', subtitle: 'Schema registry', search: 'Search schemas, fields, projects…', manifests: 'Manifests', cloudSync: 'Cloud sync', newChange: 'New change', addField: 'Add field',
    workspace: 'Workspace', overview: 'Overview', registry: 'Schema registry', changes: 'Changes', projects: 'Projects', healthy: 'Registry healthy', d1: 'Cloudflare D1',
    heroEyebrow: 'DATABASE PRODUCT LINE', heroTitle: 'Keep database differences under control.', heroCopy: 'Compose schemas from a shared core, reusable capabilities and project manifests. See the full impact before changing a field.', browseRegistry: 'Browse fields', viewManifests: 'View manifests', heroAlt: 'Drifty pixel-art database capability archive',
    fields: 'Fields', fieldsHelp: 'Registered schema objects', modules: 'Modules', projectsMetric: 'Projects', openChanges: 'Open changes', core: 'core', features: 'features', needUpgrade: 'need updates', awaitingReview: 'awaiting review',
    registryTitle: 'Schema registry', customer: 'Customer', viewAllFields: 'View all fields', impactPreview: 'IMPACT PREVIEW', version: 'Version', affectedProjects: 'Affected projects', included: 'included', openImpact: 'Open impact analysis', recentChanges: 'Recent changes', viewAll: 'View all',
    registryEyebrow: 'SCHEMA REGISTRY', registryHeading: 'Database objects', registryCopy: 'Every logical field has one identity, owner module and project impact map.', allFields: 'All fields', records: 'records', all: 'All',
    changesEyebrow: 'MIGRATION REGISTRY', changesHeading: 'Changes', changesCopy: 'Register intent, migration identity and exact project impact before release.',
    projectsEyebrow: 'PROJECT COMPOSITION', projectsHeading: 'Project manifests', projectsCopy: 'Projects are compositions of Core and reusable Features—not long-lived Git branches.', capabilityModules: 'Capability modules', ownership: 'Shared ownership boundaries',
    object: 'Object', type: 'Type', source: 'Source', projectsColumn: 'Projects', module: 'Module', kind: 'Kind', fieldsColumn: 'Fields', current: 'Current', upgrade: 'Upgrade',
    noMatches: 'No fields match this view.', selectHint: 'Selected', affected: 'affected projects', fetchError: 'D1 is temporarily unavailable.', dismiss: 'Dismiss',
    addFieldTitle: 'Add registry field', addFieldCopy: 'Create one logical field identity and assign its owning module.', fieldCode: 'Field code', table: 'Table', column: 'Column', dataType: 'Data type', businessMeaning: 'Business meaning', ownerModule: 'Owning module', firstVersion: 'First version',
    registerChangeTitle: 'Register schema change', registerChangeCopy: 'Record migration intent. Drifty does not execute SQL in this phase.', changeCode: 'Change code', migration: 'Migration', schemaField: 'Schema field', summary: 'Summary', from: 'From', to: 'To', risk: 'Risk', cancel: 'Cancel', saving: 'Saving…', saveRecord: 'Save record', close: 'Close',
    fieldAdded: 'Field added to the registry.', changeAdded: 'Change registered as a draft.', saveError: 'Could not save this record. Check the form and try again.',
    low: 'Low', medium: 'Medium', high: 'High', draft: 'Draft', review: 'In review', approved: 'Approved', registered: 'registered',
  },
} as const;

export const moduleNames: Record<Locale, Record<string, string>> = {
  zh: { core: 'ERP 核心', 'customer-level': '客户等级', 'customer-region': '客户区域', 'customer-channel': '客户渠道' },
  en: { core: 'ERP Core', 'customer-level': 'Customer Level', 'customer-region': 'Customer Region', 'customer-channel': 'Customer Channel' },
};

export const fieldMeanings: Record<Locale, Record<string, string>> = {
  zh: { 'CUS-001': '客户主标识', 'CUS-002': '客户显示名称', 'CUS-003': '客户信用等级', 'CUS-004': '客户经营区域', 'CUS-005': '客户获取渠道' },
  en: { 'CUS-001': 'Customer primary identifier', 'CUS-002': 'Customer display name', 'CUS-003': 'Customer credit level', 'CUS-004': 'Customer operating region', 'CUS-005': 'Customer acquisition channel' },
};

export const changeTitles: Record<Locale, Record<string, string>> = {
  zh: { 'CR-2026-0182': '扩展客户等级字段长度', 'CR-2026-0179': '新增客户区域字段' },
  en: { 'CR-2026-0182': 'Customer level length', 'CR-2026-0179': 'Added customer region' },
};
