CREATE TABLE "vault_setup_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"call_id" text NOT NULL,
	"hook_token" text NOT NULL,
	"request" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"credential_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_setup_requests" ADD CONSTRAINT "vault_setup_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vault_setup_requests_call_idx" ON "vault_setup_requests" USING btree ("session_id","call_id");--> statement-breakpoint
CREATE INDEX "vault_setup_requests_status_idx" ON "vault_setup_requests" USING btree ("status");