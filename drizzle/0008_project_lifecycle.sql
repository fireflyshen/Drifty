CREATE TABLE `catalog_object_lifecycles` (
	`entity` text NOT NULL,
	`object_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`entity`, `object_id`, `project_id`),
	FOREIGN KEY (`project_id`) REFERENCES `catalog_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_object_lifecycles_project` ON `catalog_object_lifecycles` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_catalog_object_lifecycles_object` ON `catalog_object_lifecycles` (`entity`,`object_id`);
