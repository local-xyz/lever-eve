import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("removes legacy strategies and wipes enrichment jobs without deleting unrelated data", async () => {
  const client = new PGlite();
  try {
    await client.exec(
      "CREATE TABLE workspaces(id text PRIMARY KEY); INSERT INTO workspaces VALUES ('alice'); BEGIN;"
    );
    // oxlint-disable eslint/no-await-in-loop -- Database migrations must execute in order.
    for (const migration of [
      "0015_ordinary_groot",
      "0016_typical_sir_ram",
      "0017_legal_goliath",
    ]) {
      await client.exec(
        await readFile(
          new URL(`../migrations/${migration}.sql`, import.meta.url),
          "utf8"
        )
      );
    }
    // oxlint-enable eslint/no-await-in-loop
    await client.exec(
      "INSERT INTO connection_enrichments(workspace_id,user_id,connector,source_label,account,status,lease_token,notes) VALUES ('alice','alice','gmail','Gmail','a@example.com','running','stale-lease','[]'),('alice','alice','calendar','Calendar','a@example.com','pending',null,'[]');"
    );
    await client.exec(
      await readFile(
        new URL("../migrations/0018_strange_fallen_one.sql", import.meta.url),
        "utf8"
      )
    );
    await client.exec("COMMIT");
    expect(
      (await client.query("SELECT * FROM connection_enrichments")).rows
    ).toEqual([]);
    expect(
      (await client.query("SELECT to_regclass('gmail_memories') AS legacy"))
        .rows
    ).toEqual([{ legacy: null }]);
    expect(
      (
        await client.query(
          "SELECT proname FROM pg_proc WHERE proname IN ('lever_sync_current_gmail','lever_sync_legacy_gmail','lever_enrichment_source_keys')"
        )
      ).rows
    ).toEqual([]);
    expect(
      (
        await client.query(
          "SELECT tgname FROM pg_trigger WHERE tgrelid='connection_enrichments'::regclass AND NOT tgisinternal"
        )
      ).rows
    ).toEqual([]);
    expect((await client.query("SELECT id FROM workspaces")).rows).toEqual([
      { id: "alice" },
    ]);
    expect(
      (
        await client.query(
          "UPDATE connection_enrichments SET status='complete' WHERE lease_token='stale-lease' RETURNING user_id"
        )
      ).rows
    ).toEqual([]);
    await client.exec(
      "INSERT INTO connection_enrichments(workspace_id,user_id,connector,source_label,account,status) VALUES ('alice','alice','gmail','Gmail','a@example.com','pending') ON CONFLICT(workspace_id,user_id,connector) DO UPDATE SET status='pending';"
    );
    expect(
      (await client.query("SELECT status FROM connection_enrichments")).rows
    ).toEqual([{ status: "pending" }]);
  } finally {
    await client.close();
  }
});
