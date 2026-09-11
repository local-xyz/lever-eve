import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, vaultSetupRequests } from "@db";
import { ensureScope } from "./scope";
import type { AccessScope } from "@shared/identity/access-scope";
import {
  parseLoginVaultPayload,
  type VaultCreateItem,
  type VaultSetupRequest,
} from "@shared/vault/schema";

export async function registerVaultRequest(
  scope: AccessScope,
  input: {
    sessionId: string;
    callId: string;
    hookToken: string;
    request: VaultSetupRequest;
  }
) {
  await ensureScope(scope);
  await db
    .insert(vaultSetupRequests)
    .values({
      ...scope,
      ...input,
      id: randomUUID(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(vaultSetupRequests)
    .where(
      and(
        eq(vaultSetupRequests.sessionId, input.sessionId),
        eq(vaultSetupRequests.callId, input.callId),
        eq(vaultSetupRequests.userId, scope.userId),
        eq(vaultSetupRequests.workspaceId, scope.workspaceId)
      )
    );
  if (!row) throw new Error("Vault request could not be registered.");
  return { id: row.id };
}

export function assertVaultRequestMatches(
  request: VaultSetupRequest,
  input: VaultCreateItem
) {
  if (request.kind !== input.kind)
    throw new Error("Save the credential type requested by this link.");
  if (request.kind === "login") {
    const login = parseLoginVaultPayload(input.secret);
    if (
      !login ||
      !("origin" in login) ||
      login.origin !== request.origin ||
      login.identifier.type !== request.identifierType
    )
      throw new Error(
        "This login does not match the website and sign-in method requested."
      );
  }
}

export async function listReadyVaultRequests() {
  return db
    .select({
      id: vaultSetupRequests.id,
      hookToken: vaultSetupRequests.hookToken,
      credentialId: vaultSetupRequests.credentialId,
      kind: vaultSetupRequests.request,
    })
    .from(vaultSetupRequests)
    .where(
      and(
        eq(vaultSetupRequests.status, "ready"),
        gt(vaultSetupRequests.expiresAt, new Date())
      )
    )
    .limit(25);
}

export async function finishVaultRequest(
  id: string,
  status: "delivered" | "cancelled"
) {
  await db
    .update(vaultSetupRequests)
    .set({ status })
    .where(
      and(eq(vaultSetupRequests.id, id), eq(vaultSetupRequests.status, "ready"))
    );
}

export async function closeVaultRequest(id: string) {
  await db
    .update(vaultSetupRequests)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(vaultSetupRequests.id, id),
        eq(vaultSetupRequests.status, "pending")
      )
    );
}
