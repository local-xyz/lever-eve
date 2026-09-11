import { after, NextResponse } from "next/server";
import { auth, gmail } from "@googleapis/gmail";
import { getToken } from "@vercel/connect";
import { getAuthSession } from "@db/services/auth/session";
import { queueConnectionEnrichment } from "@db/services/connection-enrichment";
import { accessScopeForUser } from "@shared/identity/access-scope";
import { googleWorkspaceTokenParams } from "@shared/google-workspace/connection";
import { env } from "@shared/environment";
import { postScheduledRunRoute } from "@shared/eve/request";

export async function GET(request: Request) {
  const session = await getAuthSession(request.headers);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const scope = accessScopeForUser(`better-auth:${session.user.id}`);
  try {
    const token = await getToken(
      env.GOOGLE_CONNECTOR_UID,
      googleWorkspaceTokenParams(scope.userId)
    );
    const oauth = new auth.OAuth2();
    oauth.setCredentials({ access_token: token });
    const { data } = await gmail({
      version: "v1",
      auth: oauth,
    }).users.getProfile(
      { userId: "me" },
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!data.emailAddress) throw new Error("Missing Gmail account");
    await queueConnectionEnrichment(scope, {
      connector: "gmail",
      sourceLabel: "Gmail",
      account: data.emailAddress.toLowerCase(),
    });
    after(async () => {
      try {
        await postScheduledRunRoute(
          "/eve/v1/internal/connection-enrichment/dispatch",
          {}
        );
      } catch {
        console.warn(
          "[connection-enrichment] Scan queued for scheduled dispatch."
        );
      }
    });
    return NextResponse.redirect(new URL("/?google=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/?google=unavailable", request.url));
  }
}
