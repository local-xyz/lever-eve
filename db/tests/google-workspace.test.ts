import type * as ConnectApi from "@vercel/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NoValidTokenError,
  UserAuthorizationRequiredError,
} from "@vercel/connect";
const connect = vi.hoisted(() => ({
  read: vi.fn<typeof ConnectApi.getTokenResponse>(),
}));
vi.mock("@vercel/connect", async (original) => ({
  ...(await original<typeof ConnectApi>()),
  getTokenResponse: connect.read,
}));
import { readGoogleWorkspaceConnection } from "@db/services/google-workspace";
beforeEach(() => vi.clearAllMocks());
describe("Google connection status", () => {
  it("returns only safe account metadata", async () => {
    connect.read.mockResolvedValue({
      token: "must-not-be-returned",
      expiresAt: Date.now() + 60000,
      connector: { id: "test", uid: "google/lever", type: "google" },
      claims: { email: "test@example.com" },
    });
    expect(await readGoogleWorkspaceConnection("user-1")).toEqual({
      state: "connected",
      accountLabel: "test@example.com",
    });
  });
  it.each([
    new NoValidTokenError("missing"),
    new UserAuthorizationRequiredError("authorize"),
  ])("recognizes missing user authorization", async (error) => {
    connect.read.mockRejectedValue(error);
    expect(await readGoogleWorkspaceConnection("user-1")).toEqual({
      state: "disconnected",
      accountLabel: null,
    });
  });
  it("does not mislabel a connector failure as a user sign-in issue", async () => {
    connect.read.mockRejectedValue(new Error("connector missing"));
    expect(await readGoogleWorkspaceConnection("user-1")).toEqual({
      state: "unavailable",
      accountLabel: null,
    });
  });
});
