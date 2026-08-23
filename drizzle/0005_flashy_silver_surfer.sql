ALTER TABLE `import_batches` ADD `modified_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `removed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_items` ADD `before_snapshot` text;