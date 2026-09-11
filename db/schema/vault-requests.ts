import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { VaultSetupRequest } from "@shared/vault/schema";
import { workspaces } from "./workspaces";

export const vaultSetupRequests = pgTable(
  "vault_setup_requests",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    sessionId: text("session_id").notNull(),
    callId: text("call_id").notNull(),
    hookToken: text("hook_token").notNull(),
    request: jsonb("request").$type<VaultSetupRequest>().notNull(),
    status: text("status", {
      enum: ["pending", "ready", "delivered", "cancelled"],
    })
      .notNull()
      .default("pending"),
    credentialId: text("credential_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vault_setup_requests_call_idx").on(
      table.sessionId,
      table.callId
    ),
    index("vault_setup_requests_status_idx").on(table.status),
  ]
);
