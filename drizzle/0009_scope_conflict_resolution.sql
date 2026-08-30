ALTER TABLE `catalog_field_scope_revisions` ADD `resolution_kind` text DEFAULT 'same' NOT NULL;
--> statement-breakpoint
ALTER TABLE `catalog_field_scope_revisions` ADD `review_status` text DEFAULT 'confirmed' NOT NULL;
--> statement-breakpoint
ALTER TABLE `catalog_field_scope_revisions` ADD `resolution_note` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `catalog_field_scope_revisions` ADD `import_item_id` text;
