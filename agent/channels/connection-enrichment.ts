import { defineChannel, POST } from "eve/channels";
import { localDev, routeAuth, vercelOidc } from "eve/channels/auth";
import { processConnectionEnrichment } from "@agent/lib/connection-enrichment";
async function dispatch(request: Request) {
  const auth = await routeAuth(request, [vercelOidc(), localDev()]);
  if (auth instanceof Response) return auth;
  await processConnectionEnrichment();
  return Response.json({ ok: true });
}
export default defineChannel({
  routes: [POST("/eve/v1/internal/connection-enrichment/dispatch", dispatch)],
});
