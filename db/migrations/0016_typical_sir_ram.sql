ALTER TABLE "gmail_memories" RENAME TO "connection_enrichments";--> statement-breakpoint
ALTER TABLE "connection_enrichments" DROP CONSTRAINT "gmail_memories_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "connection_enrichments" DROP CONSTRAINT "gmail_memories_workspace_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "connection_enrichments" ADD COLUMN "connector" text DEFAULT 'gmail' NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_enrichments" ADD COLUMN "source_label" text DEFAULT 'Gmail' NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_enrichments" ADD CONSTRAINT "connection_enrichments_workspace_id_user_id_connector_pk" PRIMARY KEY("workspace_id","user_id","connector");--> statement-breakpoint
ALTER TABLE "connection_enrichments" ADD CONSTRAINT "connection_enrichments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
UPDATE connection_enrichments SET notes = (
 SELECT COALESCE(jsonb_agg(jsonb_set(note, '{sources}', (
   SELECT COALESCE(jsonb_agg((source - 'messageId') || jsonb_build_object('reference', COALESCE(source->'reference', source->'messageId'))), '[]'::jsonb)
   FROM jsonb_array_elements(note->'sources') AS source
 ))), '[]'::jsonb)
 FROM jsonb_array_elements(notes) AS note
);
