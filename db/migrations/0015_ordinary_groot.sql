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