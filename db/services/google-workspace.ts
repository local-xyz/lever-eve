import {
  getTokenResponse,
  NoValidTokenError,
  UserAuthorizationRequiredError,
} from "@vercel/connect";
import { z } from "zod";
import { env } from "@shared/environment";
import { googleWorkspaceTokenParams } from "@shared/google-workspace/connection";

interface GoogleWorkspaceConnection {
  readonly accountLabel: string | null;
  readonly state: "connected" | "disconnected" | "unavailable";
}

export async function readGoogleWorkspaceConnection(
  userId: string
): Promise<GoogleWorkspaceConnection> {
  try {
    const response = await getTokenResponse(
      env.GOOGLE_CONNECTOR_UID,
      googleWorkspaceTokenParams(userId),
      { forceRefresh: true }
    );
    const claims = z
      .object({ email: z.string().optional() })
      .safeParse(response.claims);
    return {
      accountLabel:
        response.name ?? (claims.success ? (claims.data.email ?? null) : null),
      state: "connected",
    };
  } catch (error) {
    if (
      error instanceof UserAuthorizationRequiredError ||
      error instanceof NoValidTokenError
    ) {
      return { accountLabel: null, state: "disconnected" };
    }
    return { accountLabel: null, state: "unavailable" };
  }
}
