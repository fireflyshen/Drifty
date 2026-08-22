CREATE TABLE `migration_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`change_code` text NOT NULL,
	`field_id` text NOT NULL,
	`module_id` text NOT NULL,
	`migration_version` text NOT NULL,
	`title` text NOT NULL,
	`from_value` text NOT NULL,
	`to_value` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`risk` text DEFAULT 'medium' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `schema_fields`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `migration_changes_change_code_unique` ON `migration_changes` (`change_code`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`version` text NOT NULL,
	`description` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_slug_unique` ON `modules` (`slug`);--> statement-breakpoint
CREATE TABLE `project_modules` (
	`project_id` text NOT NULL,
	`module_id` text NOT NULL,
	`version` text NOT NULL,
	PRIMARY KEY(`project_id`, `module_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`core_version` text NOT NULL,
	`status` text DEFAULT 'current' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_code_unique` ON `projects` (`code`);--> statement-breakpoint
CREATE TABLE `schema_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`table_name` text NOT NULL,
	`column_name` text NOT NULL,
	`data_type` text NOT NULL,
	`business_meaning` text NOT NULL,
	`module_id` text NOT NULL,
	`first_version` text NOT NULL,
	`current_version` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schema_fields_code_unique` ON `schema_fields` (`code`);--> statement-breakpoint
CREATE INDEX `idx_schema_fields_module_id` ON `schema_fields` (`module_id`);--> statement-breakpoint
PRAGMA optimize;
