-- Intentional clean break: remove the legacy interface and all enrichment jobs.
DROP TRIGGER lever_current_gmail_sync ON connection_enrichments;
--> statement-breakpoint
DROP TRIGGER lever_legacy_gmail_sync ON gmail_memories;
--> statement-breakpoint
DROP FUNCTION lever_sync_current_gmail();
--> statement-breakpoint
DROP FUNCTION lever_sync_legacy_gmail();
--> statement-breakpoint
DROP FUNCTION lever_enrichment_source_keys(jsonb, text, text);
--> statement-breakpoint
DROP TABLE gmail_memories;
--> statement-breakpoint
TRUNCATE TABLE connection_enrichments;
