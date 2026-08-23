CREATE TABLE `import_batch_environments` (
	`batch_id` text NOT NULL,
	`environment_id` text NOT NULL,
	PRIMARY KEY(`batch_id`, `environment_id`),
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_import_batch_environments_environment` ON `import_batch_environments` (`environment_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `import_batch_environments` (`batch_id`,`environment_id`)
SELECT DISTINCT `import_batch_id`,`environment_id` FROM `field_scopes` WHERE `import_batch_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_projects` ADD `icon` text DEFAULT 'boxes' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_versions` ADD `repository_id` text;--> statement-breakpoint
ALTER TABLE `catalog_versions` ADD `git_ref` text;--> statement-breakpoint
ALTER TABLE `catalog_versions` ADD `git_commit` text;--> statement-breakpoint
CREATE INDEX `idx_catalog_versions_repository` ON `catalog_versions` (`repository_id`);--> statement-breakpoint
ALTER TABLE `import_batches` ADD `source_path` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `git_commit` text;
