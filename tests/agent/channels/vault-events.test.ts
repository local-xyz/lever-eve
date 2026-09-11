import { beforeEach, expect, it, vi } from "vitest";
import type { RouteHandlerArgs } from "eve/channels";
const mocks = vi.hoisted(() => ({
  resume: vi.fn<() => Promise<void>>(),
  finish: vi.fn<() => Promise<void>>(),
  list: vi.fn<() => Promise<unknown[]>>(),
  auth: vi.fn<() => Promise<Record<string, never> | Response>>(),
}));
vi.mock("workflow/api", () => ({ resumeHook: mocks.resume }));
vi.mock("@db/services/vault-requests", () => ({
  finishVaultRequest: mocks.finish,
  listReadyVaultRequests: mocks.list,
}));
vi.mock("eve/channels/auth", () => ({
  routeAuth: mocks.auth,
  vercelOidc: () => null,
  localDev: () => null,
}));
import channel from "@agent/channels/vault-events";
function unexpected(): never {
  throw new Error("Unexpected session dispatch");
}
const context: RouteHandlerArgs = {
  attachSession: unexpected,
  from: unexpected,
  resolveSession: unexpected,
  to: unexpected,
  waitUntil: unexpected,
  params: {},
  requestIp: null,
};
async function dispatch() {
  const route = channel.routes[0];
  if (!route || route.transport === "websocket")
    throw new Error("Missing route");
  return route.handler(
    new Request("https://example.com/eve/v1/internal/vault/dispatch", {
      method: "POST",
    }),
    context
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({});
  mocks.resume.mockResolvedValue();
  mocks.list.mockResolvedValue([
    {
      id: "request",
      hookToken: "private-token",
      credentialId: "credential",
      kind: { kind: "login" },
    },
  ]);
});
it("rejects unauthenticated dispatch before reading pending requests", async () => {
  mocks.auth.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await dispatch()).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("resumes the native wait with metadata only and records delivery", async () => {
  await dispatch();
  expect(mocks.resume).toHaveBeenCalledExactlyOnceWith("private-token", {
    credentialId: "credential",
    kind: "login",
  });
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("request", "delivered");
});
it("keeps an ambiguous delivery queued for retry", async () => {
  mocks.resume.mockRejectedValue(new Error("timeout"));
  await dispatch();
  expect(mocks.finish).not.toHaveBeenCalled();
});
it("retires cancelled native waits without creating another session", async () => {
  const error = new Error("gone");
  error.name = "HookNotFoundError";
  mocks.resume.mockRejectedValue(error);
  await dispatch();
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("request", "cancelled");
});
