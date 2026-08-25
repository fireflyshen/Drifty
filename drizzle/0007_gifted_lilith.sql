CREATE TABLE `catalog_change_scopes` (
	`change_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`executed_at` text,
	`verified_at` text,
	`note` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`change_id`, `environment_id`),
	FOREIGN KEY (`change_id`) REFERENCES `catalog_changes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_change_scopes_environment` ON `catalog_change_scopes` (`environment_id`);--> statement-breakpoint
CREATE TABLE `catalog_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`action` text NOT NULL,
	`table_name` text NOT NULL,
	`field_name` text NOT NULL,
	`field_id` text,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_path` text,
	`git_commit` text,
	`sql_text` text NOT NULL,
	`import_batch_id` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_changes_code_unique` ON `catalog_changes` (`code`);--> statement-breakpoint
CREATE INDEX `idx_catalog_changes_version` ON `catalog_changes` (`version_id`);--> statement-breakpoint
CREATE INDEX `idx_catalog_changes_field` ON `catalog_changes` (`field_id`);--> statement-breakpoint
CREATE TABLE `catalog_field_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`revision` integer NOT NULL,
	`data_type` text NOT NULL,
	`nullable` integer DEFAULT 1 NOT NULL,
	`default_value` text,
	`comment` text DEFAULT '' NOT NULL,
	`extra` text DEFAULT '' NOT NULL,
	`ordinal` integer DEFAULT 0 NOT NULL,
	`source_kind` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `catalog_fields`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_field_revisions_field_revision` ON `catalog_field_revisions` (`field_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_catalog_field_revisions_field` ON `catalog_field_revisions` (`field_id`);--> statement-breakpoint
CREATE TABLE `catalog_field_scope_revisions` (
	`field_id` text NOT NULL,
	`version_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`field_id`, `version_id`, `environment_id`),
	FOREIGN KEY (`field_id`) REFERENCES `catalog_fields`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `catalog_field_revisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_field_scope_revisions_revision` ON `catalog_field_scope_revisions` (`revision_id`);