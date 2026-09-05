CREATE TABLE `catalog_constraint_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`constraint_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`definition` text NOT NULL,
	`source_kind` text NOT NULL,
	`import_batch_id` text,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`constraint_id`) REFERENCES `catalog_constraints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_constraint_revisions_constraint_revision` ON `catalog_constraint_revisions` (`constraint_id`,`revision`);--> statement-breakpoint
CREATE TABLE `catalog_constraint_scopes` (
	`constraint_id` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`state` text DEFAULT 'present' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`constraint_id`, `version_id`, `environment_id`),
	FOREIGN KEY (`constraint_id`) REFERENCES `catalog_constraints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `catalog_constraints` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`definition` text NOT NULL,
	`lifecycle_status` text DEFAULT 'active' NOT NULL,
	`lifecycle_note` text DEFAULT '' NOT NULL,
	`source_kind` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `catalog_tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_constraints_table_name` ON `catalog_constraints` (`table_id`,`name`);--> statement-breakpoint
CREATE TABLE `catalog_index_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`index_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`columns_json` text NOT NULL,
	`source_kind` text NOT NULL,
	`import_batch_id` text,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`index_id`) REFERENCES `catalog_indexes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_index_revisions_index_revision` ON `catalog_index_revisions` (`index_id`,`revision`);--> statement-breakpoint
CREATE TABLE `catalog_index_scopes` (
	`index_id` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`state` text DEFAULT 'present' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`index_id`, `version_id`, `environment_id`),
	FOREIGN KEY (`index_id`) REFERENCES `catalog_indexes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_index_scopes_environment` ON `catalog_index_scopes` (`environment_id`);--> statement-breakpoint
CREATE TABLE `catalog_indexes` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'index' NOT NULL,
	`columns_json` text NOT NULL,
	`lifecycle_status` text DEFAULT 'active' NOT NULL,
	`lifecycle_note` text DEFAULT '' NOT NULL,
	`source_kind` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `catalog_tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_indexes_table_name` ON `catalog_indexes` (`table_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_catalog_indexes_table` ON `catalog_indexes` (`table_id`);--> statement-breakpoint
CREATE TABLE `catalog_snapshot_objects` (
	`snapshot_id` text NOT NULL,
	`entity` text NOT NULL,
	`object_key` text NOT NULL,
	`object_id` text,
	`revision_id` text,
	`fingerprint` text NOT NULL,
	`definition_json` text NOT NULL,
	PRIMARY KEY(`snapshot_id`, `entity`, `object_key`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `catalog_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_snapshot_objects_key` ON `catalog_snapshot_objects` (`entity`,`object_key`);--> statement-breakpoint
CREATE TABLE `catalog_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`import_batch_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`source_kind` text NOT NULL,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_snapshots_code_unique` ON `catalog_snapshots` (`code`);--> statement-breakpoint
CREATE INDEX `idx_catalog_snapshots_scope` ON `catalog_snapshots` (`project_id`,`version_id`,`environment_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `catalog_sql_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`import_batch_id` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`status` text DEFAULT 'registered' NOT NULL,
	`sql_text` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_path` text,
	`git_commit` text,
	`started_at` text,
	`finished_at` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_sql_executions_scope` ON `catalog_sql_executions` (`project_id`,`version_id`,`environment_id`);--> statement-breakpoint
CREATE TABLE `catalog_table_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`logical_name` text NOT NULL,
	`physical_name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_table_mappings_project_physical` ON `catalog_table_mappings` (`project_id`,`physical_name`);--> statement-breakpoint
CREATE INDEX `idx_catalog_table_mappings_project` ON `catalog_table_mappings` (`project_id`);--> statement-breakpoint
ALTER TABLE `catalog_fields` ADD `lifecycle_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_fields` ADD `lifecycle_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_projects` ADD `anchor_version_id` text;--> statement-breakpoint
ALTER TABLE `catalog_projects` ADD `anchor_environment_id` text;--> statement-breakpoint
ALTER TABLE `catalog_tables` ADD `lifecycle_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_tables` ADD `lifecycle_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `import_mode` text DEFAULT 'snapshot' NOT NULL;
