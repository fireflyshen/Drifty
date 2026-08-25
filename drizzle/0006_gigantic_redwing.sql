CREATE TABLE `table_scopes` (
	`table_id` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`state` text DEFAULT 'present' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`table_id`, `version_id`, `environment_id`),
	FOREIGN KEY (`table_id`) REFERENCES `catalog_tables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `catalog_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `catalog_environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_table_scopes_environment` ON `table_scopes` (`environment_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `table_scopes` (`table_id`,`project_id`,`version_id`,`environment_id`,`state`,`origin`,`import_batch_id`,`created_at`)
SELECT DISTINCT f.`table_id`,fs.`project_id`,fs.`version_id`,fs.`environment_id`,fs.`state`,fs.`origin`,fs.`import_batch_id`,fs.`created_at`
FROM `field_scopes` fs JOIN `catalog_fields` f ON f.`id`=fs.`field_id`;
