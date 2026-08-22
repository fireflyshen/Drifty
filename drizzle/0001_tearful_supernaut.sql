CREATE TABLE `catalog_environments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`stage` text DEFAULT 'custom' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_environments_project_code` ON `catalog_environments` (`project_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_catalog_environments_project` ON `catalog_environments` (`project_id`);--> statement-breakpoint
CREATE TABLE `catalog_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`data_type` text NOT NULL,
	`nullable` integer DEFAULT 1 NOT NULL,
	`default_value` text,
	`comment` text DEFAULT '' NOT NULL,
	`extra` text DEFAULT '' NOT NULL,
	`ordinal` integer DEFAULT 0 NOT NULL,
	`source_kind` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `catalog_tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_fields_code_unique` ON `catalog_fields` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_fields_table_name` ON `catalog_fields` (`table_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_catalog_fields_table` ON `catalog_fields` (`table_id`);--> statement-breakpoint
CREATE TABLE `catalog_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_modules_code_unique` ON `catalog_modules` (`code`);--> statement-breakpoint
CREATE TABLE `catalog_project_modules` (
	`project_id` text NOT NULL,
	`module_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `module_id`),
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `catalog_modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `catalog_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'project' NOT NULL,
	`parent_id` text,
	`description` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_projects_code_unique` ON `catalog_projects` (`code`);--> statement-breakpoint
CREATE TABLE `catalog_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`module_id` text,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `catalog_modules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_tables_code_unique` ON `catalog_tables` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_tables_name_unique` ON `catalog_tables` (`name`);--> statement-breakpoint
CREATE TABLE `catalog_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`source_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_versions_project_name` ON `catalog_versions` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `field_scopes` (
	`field_id` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`state` text DEFAULT 'present' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`field_id`, `version_id`, `environment_id`),
	FOREIGN KEY (`field_id`) REFERENCES `catalog_fields`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_field_scopes_environment` ON `field_scopes` (`environment_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`source_kind` text NOT NULL,
	`file_name` text,
	`fingerprint` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`module_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`added_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`conflict_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`reverted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`module_id`) REFERENCES `catalog_modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_code_unique` ON `import_batches` (`code`);--> statement-breakpoint
CREATE TABLE `import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`statement_no` integer NOT NULL,
	`action` text NOT NULL,
	`table_name` text NOT NULL,
	`column_name` text NOT NULL,
	`field_id` text,
	`result` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`fingerprint` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_import_items_batch` ON `import_items` (`batch_id`);--> statement-breakpoint
CREATE TABLE `repository_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repository` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`path_pattern` text NOT NULL,
	`project_id` text,
	`last_commit` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE no action
);
