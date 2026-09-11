import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte, lt, ne, or } from "drizzle-orm";
import type { z } from "zod";
import {
  enrichmentNotesSchema,
  enrichmentConnectionSchema,
} from "@shared/connection-enrichment/schema";
import { db, connectionEnrichments } from "@db";
import type { AccessScope } from "@shared/identity/access-scope";
import { ensureScope } from "./scope";

function owned(scope: AccessScope, connector?: string) {
  return and(
    eq(connectionEnrichments.workspaceId, scope.workspaceId),
    eq(connectionEnrichments.userId, scope.userId),
    connector ? eq(connectionEnrichments.connector, connector) : undefined
  );
}

export async function queueConnectionEnrichment(
  scope: AccessScope,
  input: z.infer<typeof enrichmentConnectionSchema>
) {
  const { connector, sourceLabel, account } =
    enrichmentConnectionSchema.parse(input);
  await ensureScope(scope);
  await db
    .insert(connectionEnrichments)
    .values({ ...scope, connector, sourceLabel, account, status: "pending" })
    .onConflictDoUpdate({
      target: [
        connectionEnrichments.workspaceId,
        connectionEnrichments.userId,
        connectionEnrichments.connector,
      ],
      set: {
        account,
        sourceLabel,
        status: "pending",
        attempts: 0,
        notes: [],
        leaseToken: null,
        availableAt: new Date(),
        updatedAt: new Date(),
      },
      setWhere: or(
        ne(connectionEnrichments.account, account),
        inArray(connectionEnrichments.status, ["failed", "cancelled"])
      ),
    });
}

export async function claimConnectionEnrichment(connectors: readonly string[]) {
  if (connectors.length === 0) return null;
  await db
    .update(connectionEnrichments)
    .set({ status: "failed", leaseToken: null })
    .where(
      and(
        eq(connectionEnrichments.status, "running"),
        eq(connectionEnrichments.attempts, 5),
        lte(connectionEnrichments.availableAt, new Date())
      )
    );
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(connectionEnrichments)
      .where(
        and(
          inArray(connectionEnrichments.status, ["pending", "running"]),
          inArray(connectionEnrichments.connector, [...connectors]),
          lte(connectionEnrichments.availableAt, new Date()),
          lt(connectionEnrichments.attempts, 5)
        )
      )
      .orderBy(connectionEnrichments.availableAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    const [claimed] = await tx
      .update(connectionEnrichments)
      .set({
        status: "running",
        attempts: row.attempts + 1,
        leaseToken: randomUUID(),
        availableAt: new Date(Date.now() + 5 * 60_000),
      })
      .where(owned(row, row.connector))
      .returning();
    return claimed ?? null;
  });
}

export async function finishConnectionEnrichment(
  claim: NonNullable<Awaited<ReturnType<typeof claimConnectionEnrichment>>>,
  notes: z.infer<typeof enrichmentNotesSchema> | null
) {
  if (!claim.leaseToken) throw new Error("Missing connection enrichment lease");
  await db
    .update(connectionEnrichments)
    .set(
      notes === null
        ? {
            status: claim.attempts >= 5 ? "failed" : "pending",
            leaseToken: null,
            availableAt: new Date(Date.now() + 2 ** claim.attempts * 60_000),
            updatedAt: new Date(),
          }
        : {
            status: "complete",
            notes: enrichmentNotesSchema.parse(notes),
            leaseToken: null,
            updatedAt: new Date(),
          }
    )
    .where(
      and(
        owned(claim, claim.connector),
        eq(connectionEnrichments.leaseToken, claim.leaseToken),
        eq(connectionEnrichments.status, "running")
      )
    );
}

export async function readPendingConnectionEnrichments(scope: AccessScope) {
  const rows = await db
    .select({
      connector: connectionEnrichments.connector,
      sourceLabel: connectionEnrichments.sourceLabel,
      notes: connectionEnrichments.notes,
      updatedAt: connectionEnrichments.updatedAt,
    })
    .from(connectionEnrichments)
    .where(and(owned(scope), eq(connectionEnrichments.status, "complete")))
    .orderBy(connectionEnrichments.connector);
  return rows.map((row) => ({
    connector: row.connector,
    sourceLabel: row.sourceLabel,
    notes: enrichmentNotesSchema.parse(row.notes),
    updatedAt: row.updatedAt,
  }));
}

export async function acknowledgeConnectionEnrichment(
  scope: AccessScope,
  connector: string,
  updatedAt: Date
) {
  await db
    .update(connectionEnrichments)
    .set({ notes: [] })
    .where(
      and(
        owned(scope, connector),
        eq(connectionEnrichments.status, "complete"),
        eq(connectionEnrichments.updatedAt, updatedAt)
      )
    );
}

export async function clearConnectionEnrichment(
  scope: AccessScope,
  connector: string,
  status: "cancelled" | "forgotten"
) {
  await db
    .update(connectionEnrichments)
    .set({ status, notes: [], leaseToken: null, updatedAt: new Date() })
    .where(
      status === "cancelled"
        ? and(
            owned(scope, connector),
            ne(connectionEnrichments.status, "forgotten")
          )
        : owned(scope, connector)
    );
}
