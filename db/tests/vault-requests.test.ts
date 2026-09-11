import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, expect, it, vi } from "vitest";
import * as Database from "@db";
import * as schema from "@db/schema";
import { readFile } from "node:fs/promises";

let client: PGlite;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  await client.close();
});
it("binds saves to their owner and requirement and atomically queues one completion", async () => {
  client = new PGlite();
  await client.exec(
    "CREATE TABLE workspaces (id text PRIMARY KEY, created_at timestamptz DEFAULT now()); CREATE TABLE workspace_memberships (workspace_id text, user_id text, role text, created_at timestamptz, PRIMARY KEY(workspace_id,user_id)); CREATE TABLE vault_items (id text PRIMARY KEY, workspace_id text NOT NULL, kind text, label text NOT NULL, account text, created_at timestamptz, updated_at timestamptz); CREATE TABLE encrypted_secrets (workspace_id text, namespace text, id text, encrypted_value text, updated_at timestamptz, PRIMARY KEY(workspace_id,namespace,id));"
  );
  await client.exec(
    await readFile(
      new URL("../migrations/0014_woozy_scream.sql", import.meta.url),
      "utf8"
    )
  );
  vi.spyOn(Database, "db", "get").mockReturnValue(
    // SAFETY: PGlite implements the same Drizzle query builder used by these services.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Swap only the database driver for integration testing.
    drizzle(client, { schema }) as never
  );
  vi.spyOn(
    await import("@db/services/installation-secrets"),
    "getInstallationSecrets"
  ).mockResolvedValue({
    secretEncryptionKey: Buffer.alloc(32, 1).toString("base64"),
    betterAuthSecret: "test",
    version: 1,
  });
  const { registerVaultRequest, listReadyVaultRequests } =
    await import("@db/services/vault-requests");
  const { saveVaultItem } = await import("@db/services/vault");
  const alice = { workspaceId: "alice", userId: "alice" },
    bob = { workspaceId: "bob", userId: "bob" };
  const request = {
    target: "vault" as const,
    kind: "login" as const,
    label: "Example",
    origin: "https://example.com",
    identifierType: "email" as const,
  };
  const pending = await registerVaultRequest(alice, {
    sessionId: "session-a",
    callId: "call-a",
    hookToken: "private-hook",
    request,
  });
  expect(
    await registerVaultRequest(alice, {
      sessionId: "session-a",
      callId: "call-a",
      hookToken: "private-hook",
      request,
    })
  ).toEqual(pending);
  const input = {
    kind: "login" as const,
    label: "Example",
    account: "",
    setupRequestId: pending.id,
    secret: JSON.stringify({
      version: 2,
      kind: "login",
      origin: "https://example.com",
      identifier: { type: "email", value: "a@example.com" },
      authentication: { type: "password", password: "secret-never-return" },
    }),
  };
  await expect(saveVaultItem(bob, input)).rejects.toThrow("account");
  await expect(
    saveVaultItem(alice, {
      ...input,
      secret: input.secret.replace(
        "https://example.com",
        "https://wrong.example"
      ),
    })
  ).rejects.toThrow("match");
  const saved = await saveVaultItem(alice, input);
  expect(await saveVaultItem(alice, input)).toEqual(saved);
  const queued = await listReadyVaultRequests();
  expect(queued).toHaveLength(1);
  expect(JSON.stringify(queued)).not.toContain("secret-never-return");
  expect((await client.query("SELECT * FROM vault_items")).rows).toHaveLength(
    1
  );
  expect(
    (await client.query("SELECT * FROM encrypted_secrets")).rows
  ).toHaveLength(1);
  const { closeVaultRequest, finishVaultRequest } =
    await import("@db/services/vault-requests");
  const second = await registerVaultRequest(alice, {
    sessionId: "session-a",
    callId: "call-b",
    hookToken: "private-hook-b",
    request,
  });
  await closeVaultRequest(second.id);
  await expect(
    saveVaultItem(alice, { ...input, setupRequestId: second.id })
  ).rejects.toThrow("cancelled");
  const expired = await registerVaultRequest(alice, {
    sessionId: "session-a",
    callId: "call-c",
    hookToken: "private-hook-c",
    request,
  });
  await client.query(
    "UPDATE vault_setup_requests SET expires_at=now()-interval '1 day' WHERE id=$1",
    [expired.id]
  );
  await expect(
    saveVaultItem(alice, { ...input, setupRequestId: expired.id })
  ).rejects.toThrow("expired");
  await finishVaultRequest(pending.id, "delivered");
  expect(await listReadyVaultRequests()).toEqual([]);
  // A direct vault save stays independent of any pending task.
  await saveVaultItem(alice, { ...input, setupRequestId: undefined });
  expect(await listReadyVaultRequests()).toEqual([]);
  // A failure while inserting metadata rolls back the encrypted secret too.
  await client.exec(
    "ALTER TABLE vault_items ADD CONSTRAINT reject_bad_label CHECK (label <> 'bad')"
  );
  await expect(
    saveVaultItem(alice, { ...input, setupRequestId: undefined, label: "bad" })
  ).rejects.toThrow("Failed query");
  expect((await client.query("SELECT * FROM vault_items")).rows).toHaveLength(
    2
  );
  expect(
    (await client.query("SELECT * FROM encrypted_secrets")).rows
  ).toHaveLength(2);
});
