import { defineChannel, POST } from "eve/channels";
import { localDev, routeAuth, vercelOidc } from "eve/channels/auth";
import { resumeHook } from "workflow/api";
import {
  finishVaultRequest,
  listReadyVaultRequests,
} from "@db/services/vault-requests";

export default defineChannel({
  routes: [
    POST("/eve/v1/internal/vault/dispatch", async (request) => {
      const auth = await routeAuth(request, [vercelOidc(), localDev()]);
      if (auth instanceof Response) return auth;
      const pending = await listReadyVaultRequests();
      await Promise.all(
        pending.map(async (event) => {
          try {
            await resumeHook(event.hookToken, {
              credentialId: event.credentialId,
              kind: event.kind.kind,
            });
            await finishVaultRequest(event.id, "delivered");
          } catch (error) {
            if (error instanceof Error && error.name === "HookNotFoundError") {
              await finishVaultRequest(event.id, "cancelled");
            } else {
              // Leave the durable intent ready for the next schedule tick. Never log tokens.
              console.warn("[vault] Completion delivery will retry", {
                requestId: event.id,
              });
            }
          }
        })
      );
      return Response.json({ ok: true });
    }),
  ],
});
