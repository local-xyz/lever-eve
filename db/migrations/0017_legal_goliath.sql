CREATE TABLE "gmail_memories" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"account" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_memories_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "gmail_memories" ADD CONSTRAINT "gmail_memories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Keep the Gmail-only interface writable for old deployments, including ON CONFLICT.
-- Preserve a single logical job/lease by synchronizing both interfaces transactionally.
LOCK TABLE connection_enrichments IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE FUNCTION lever_enrichment_source_keys(notes jsonb, old_key text, new_key text)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT COALESCE(jsonb_agg(jsonb_set(note, '{sources}', (
   SELECT COALESCE(jsonb_agg((source - old_key) || jsonb_build_object(new_key, COALESCE(source->new_key, source->old_key)) ORDER BY source_index), '[]'::jsonb)
   FROM jsonb_array_elements(note->'sources') WITH ORDINALITY AS sources(source, source_index)
 )) ORDER BY note_index), '[]'::jsonb)
 FROM jsonb_array_elements(notes) WITH ORDINALITY AS entries(note, note_index)
$$;
--> statement-breakpoint
INSERT INTO gmail_memories (workspace_id,user_id,account,status,attempts,lease_token,available_at,notes,updated_at)
SELECT workspace_id,user_id,account,status,attempts,lease_token,available_at,
 lever_enrichment_source_keys(notes,'reference','messageId'),updated_at
FROM connection_enrichments WHERE connector='gmail';
--> statement-breakpoint
CREATE FUNCTION lever_sync_legacy_gmail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
 IF TG_OP = 'DELETE' THEN
   DELETE FROM connection_enrichments WHERE workspace_id=OLD.workspace_id AND user_id=OLD.user_id AND connector='gmail';
 ELSE
   INSERT INTO connection_enrichments (workspace_id,user_id,connector,source_label,account,status,attempts,lease_token,available_at,notes,updated_at)
   VALUES (NEW.workspace_id,NEW.user_id,'gmail','Gmail',NEW.account,NEW.status,NEW.attempts,NEW.lease_token,NEW.available_at,lever_enrichment_source_keys(NEW.notes,'messageId','reference'),NEW.updated_at)
   ON CONFLICT (workspace_id,user_id,connector) DO UPDATE SET
   account=EXCLUDED.account,status=EXCLUDED.status,attempts=EXCLUDED.attempts,lease_token=EXCLUDED.lease_token,available_at=EXCLUDED.available_at,notes=EXCLUDED.notes,updated_at=EXCLUDED.updated_at;
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION lever_sync_current_gmail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
 IF TG_OP = 'DELETE' THEN
   IF OLD.connector='gmail' THEN
     DELETE FROM gmail_memories WHERE workspace_id=OLD.workspace_id AND user_id=OLD.user_id;
   END IF;
 ELSIF NEW.connector='gmail' THEN
   INSERT INTO gmail_memories (workspace_id,user_id,account,status,attempts,lease_token,available_at,notes,updated_at)
   VALUES (NEW.workspace_id,NEW.user_id,NEW.account,NEW.status,NEW.attempts,NEW.lease_token,NEW.available_at,lever_enrichment_source_keys(NEW.notes,'reference','messageId'),NEW.updated_at)
   ON CONFLICT (workspace_id,user_id) DO UPDATE SET
   account=EXCLUDED.account,status=EXCLUDED.status,attempts=EXCLUDED.attempts,lease_token=EXCLUDED.lease_token,available_at=EXCLUDED.available_at,notes=EXCLUDED.notes,updated_at=EXCLUDED.updated_at;
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER lever_legacy_gmail_sync AFTER INSERT OR UPDATE OR DELETE ON gmail_memories
 FOR EACH ROW EXECUTE FUNCTION lever_sync_legacy_gmail();
--> statement-breakpoint
CREATE TRIGGER lever_current_gmail_sync AFTER INSERT OR UPDATE OR DELETE ON connection_enrichments
 FOR EACH ROW EXECUTE FUNCTION lever_sync_current_gmail();
