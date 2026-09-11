import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import * as Database from "@db";
import * as schema from "@db/schema";
let client: PGlite;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  await client.close();
});
it("deduplicates scans, fences stale workers, isolates users, and respects forgetting", async () => {
  client = new PGlite();
  await client.exec(
    "CREATE TABLE workspaces (id text PRIMARY KEY, created_at timestamptz DEFAULT now()); CREATE TABLE workspace_memberships (workspace_id text, user_id text, role text, created_at timestamptz, PRIMARY KEY(workspace_id,user_id));"
  );
  await client.exec(
    await readFile(
      new URL("../migrations/0015_ordinary_groot.sql", import.meta.url),
      "utf8"
    )
  );
  await client.exec(
    `INSERT INTO workspaces(id) VALUES ('legacy'); INSERT INTO gmail_memories(workspace_id,user_id,account,status,notes) VALUES ('legacy','legacy','legacy@example.com','complete','[{"category":"identity","fact":"Legacy fact","evidence":"observed","sources":[{"messageId":"old-message","date":"2026-09-01"}]}]'::jsonb);`
  );
  await client.exec(
    await readFile(
      new URL("../migrations/0016_typical_sir_ram.sql", import.meta.url),
      "utf8"
    )
  );
  vi.spyOn(Database, "db", "get").mockReturnValue(
    // SAFETY: PGlite implements the Drizzle operations used by this service.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- PGlite supports the service's Drizzle queries.
    drizzle(client, { schema }) as never
  );
  const service = await import("@db/services/connection-enrichment");
  expect(
    await service.readPendingConnectionEnrichments({
      workspaceId: "legacy",
      userId: "legacy",
    })
  ).toEqual([
    expect.objectContaining({
      connector: "gmail",
      sourceLabel: "Gmail",
      notes: [
        expect.objectContaining({
          sources: [{ reference: "old-message", date: "2026-09-01" }],
        }),
      ],
    }),
  ]);
  await client.exec(
    "DELETE FROM connection_enrichments WHERE user_id='legacy'"
  );
  const alice = { workspaceId: "alice", userId: "alice" },
    bob = { workspaceId: "bob", userId: "bob" };
  await service.queueConnectionEnrichment(alice, {
    connector: "gmail",
    sourceLabel: "Gmail",
    account: "alice@example.com",
  });
  await service.queueConnectionEnrichment(alice, {
    connector: "gmail",
    sourceLabel: "Gmail",
    account: "alice@example.com",
  });
  const first = await service.claimConnectionEnrichment(["gmail"]);
  expect(first?.attempts).toBe(1);
  if (!first) throw new Error("Missing claim");
  expect(await service.claimConnectionEnrichment(["gmail"])).toBeNull();
  const notes = [
    {
      category: "identity" as const,
      fact: "Name may be Alice",
      evidence: "inferred" as const,
      sources: [{ reference: "m1", date: "2026-09-01" }],
    },
  ];
  await service.finishConnectionEnrichment(first, null);
  expect(await service.claimConnectionEnrichment(["gmail"])).toBeNull();
  await client.exec(
    "UPDATE connection_enrichments SET available_at = now() - interval '1 minute'"
  );
  const second = await service.claimConnectionEnrichment(["gmail"]);
  if (!second) throw new Error("Missing retry");
  await service.finishConnectionEnrichment(first, notes);
  expect(
    (await service.readPendingConnectionEnrichments(alice))[0]?.notes ?? []
  ).toEqual([]);
  await service.finishConnectionEnrichment(second, notes);
  expect(
    (await service.readPendingConnectionEnrichments(alice))[0]?.notes ?? []
  ).toEqual(notes);
  expect(
    (await service.readPendingConnectionEnrichments(bob))[0]?.notes ?? []
  ).toEqual([]);
  await service.queueConnectionEnrichment(alice, {
    connector: "gmail",
    sourceLabel: "Gmail",
    account: "alice@example.com",
  });
  expect(await service.claimConnectionEnrichment(["gmail"])).toBeNull();
  await service.clearConnectionEnrichment(alice, "gmail", "forgotten");
  await service.clearConnectionEnrichment(alice, "gmail", "cancelled");
  await service.queueConnectionEnrichment(alice, {
    connector: "gmail",
    sourceLabel: "Gmail",
    account: "alice@example.com",
  });
  expect(
    (await service.readPendingConnectionEnrichments(alice))[0]?.notes ?? []
  ).toEqual([]);
  expect(await service.claimConnectionEnrichment(["gmail"])).toBeNull();
  await service.queueConnectionEnrichment(alice, {
    connector: "gmail",
    sourceLabel: "Gmail",
    account: "new@example.com",
  });
  const third = await service.claimConnectionEnrichment(["gmail"]);
  if (!third) throw new Error("Missing account change");
  await service.clearConnectionEnrichment(alice, "gmail", "cancelled");
  await service.finishConnectionEnrichment(third, notes);
  expect(
    (await service.readPendingConnectionEnrichments(alice))[0]?.notes ?? []
  ).toEqual([]);
  await service.queueConnectionEnrichment(alice, {
    connector: "calendar",
    sourceLabel: "Calendar",
    account: "new@example.com",
  });
  expect(await service.claimConnectionEnrichment(["gmail"])).toBeNull();
  const calendar = await service.claimConnectionEnrichment(["calendar"]);
  if (!calendar) throw new Error("Missing calendar claim");
  await service.finishConnectionEnrichment(calendar, notes);
  await service.clearConnectionEnrichment(alice, "gmail", "cancelled");
  const pending = await service.readPendingConnectionEnrichments(alice);
  expect(pending[0]?.connector).toBe("calendar");
  expect(pending[0]?.notes).toEqual(notes);
  await service.acknowledgeConnectionEnrichment(alice, "calendar", new Date(0));
  expect(
    (await service.readPendingConnectionEnrichments(alice))[0]?.notes
  ).toEqual(notes);
  if (!pending[0]) throw new Error("Missing pending result");
  await service.acknowledgeConnectionEnrichment(
    alice,
    "calendar",
    pending[0].updatedAt
  );
  expect(
    (await service.readPendingConnectionEnrichments(alice))[0]?.notes
  ).toEqual([]);
  await client.exec(
    "DELETE FROM connection_enrichments WHERE connector='calendar'"
  );
  await service.queueConnectionEnrichment(alice, {
    connector: "gmail",
    sourceLabel: "Gmail",
    account: "new@example.com",
  });
  await client.exec(
    "UPDATE connection_enrichments SET status='running', attempts=5, available_at=now()-interval '1 minute'"
  );
  expect(await service.claimConnectionEnrichment(["gmail"])).toBeNull();
  expect(
    (await client.query("SELECT status FROM connection_enrichments")).rows
  ).toEqual([{ status: "failed" }]);
});
