import type { ToolContext } from "eve/tools";
import type { readGoogleWorkspaceConnection } from "@db/services/google-workspace";
import { describe, expect, it, vi } from "vitest";
const connection = vi.hoisted(() => ({
  read: vi.fn<typeof readGoogleWorkspaceConnection>(),
}));
vi.mock("@db/services/google-workspace", () => ({
  readGoogleWorkspaceConnection: connection.read,
}));
vi.mock("@shared/environment/origin", () => ({
  applicationOrigin: () => "https://lever-six.vercel.app",
}));
import productLinks from "@agent/tools/product-links";
import type { DynamicResolveContext } from "eve";
const context = {
  channel: { kind: "channel:linq" },
  messages: [],
  session: {
    id: "test",
    auth: {
      current: {
        authenticator: "linq-message",
        principalId: "user-1",
        principalType: "user",
        attributes: { workspaceId: "workspace-1" },
      },
      initiator: null,
    },
  },
} satisfies DynamicResolveContext;

describe("product links", () => {
  it("returns an actual Google connection link and status without credentials", async () => {
    connection.read.mockResolvedValue({
      state: "unavailable",
      accountLabel: null,
    });
    const tools = await productLinks.events["turn.started"]?.({}, context);
    if (!tools) throw new Error("Missing product links");
    const result = await tools.get_product_link.execute(
      {
        destination: "google",
      },
      toolContext("get_product_link")
    );
    expect(result).toEqual({
      url: "https://lever-six.vercel.app/#connections-heading",
      connection: { state: "unavailable", accountLabel: null },
      nativeLink: {
        kind: "link",
        url: "https://lever-six.vercel.app/#connections-heading",
      },
    });
    expect(connection.read).toHaveBeenCalledWith("user-1");
  });
  it("returns the correct personal information page", async () => {
    const tools = await productLinks.events["turn.started"]?.({}, context);
    if (!tools) throw new Error("Missing product links");
    expect(
      await tools.get_product_link.execute(
        { destination: "personal-info" },
        toolContext("get_product_link")
      )
    ).toEqual({
      url: "https://lever-six.vercel.app/personal-info",
      nativeLink: {
        kind: "link",
        url: "https://lever-six.vercel.app/personal-info",
      },
    });
  });
});

function toolContext(
  toolName: string,
  authenticator = "test",
  conversationChannel: "eve" | "linq" = "linq"
) {
  return {
    abortSignal: new AbortController().signal,
    callId: "call-schedule",
    async getSandbox() {
      throw new Error("Sandbox access is not expected.");
    },
    getSkill() {
      throw new Error("Skill access is not expected.");
    },
    async getToken() {
      throw new Error("Token access is not expected.");
    },
    requireAuth() {
      throw new Error("Connection authorization is not expected.");
    },
    session: {
      auth: {
        current: {
          attributes: {
            conversationChannel,
            conversationId: "linq:dm:chat-1",
            linqMessageId: "message-1",
            linqThreadId: "linq:dm:chat-1",
            workspaceId: "workspace-1",
          },
          authenticator,
          principalId: "user-1",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-1",
      turn: { id: "turn-1", sequence: 0 },
    },
    toolName,
  } satisfies ToolContext;
}
