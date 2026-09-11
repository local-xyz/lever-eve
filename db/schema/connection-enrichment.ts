import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const connectionEnrichments = pgTable(
  "connection_enrichments",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    connector: text("connector").notNull().default("gmail"),
    sourceLabel: text("source_label").notNull().default("Gmail"),
    account: text("account").notNull(),
    status: text("status", {
      enum: [
        "pending",
        "running",
        "complete",
        "failed",
        "cancelled",
        "forgotten",
      ],
    }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: text("lease_token"),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: jsonb("notes").$type<unknown>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId, table.connector] }),
  ]
);
