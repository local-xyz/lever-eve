import { beforeEach, expect, it, vi } from "vitest";
import type { RouteHandlerArgs } from "eve/channels";
import type { processConnectionEnrichment } from "@agent/lib/connection-enrichment";
const mocks = vi.hoisted(() => ({
  process: vi.fn<typeof processConnectionEnrichment>(),
  auth: vi.fn<() => Promise<Record<string, never> | Response>>(),
}));
vi.mock("@agent/lib/connection-enrichment", () => ({
  processConnectionEnrichment: mocks.process,
}));
vi.mock("eve/channels/auth", () => ({
  routeAuth: mocks.auth,
  vercelOidc: () => null,
  localDev: () => null,
}));
import channel from "@agent/channels/connection-enrichment";
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({});
  mocks.process.mockResolvedValue();
});
it.each([0])("authenticates the connector dispatcher %s", async (index) => {
  const route = channel.routes[index];
  if (!route || route.transport === "websocket")
    throw new Error("Missing route");
  const request = new Request("https://example.com", { method: "POST" });
  mocks.auth.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await route.handler(request, context)).status).toBe(401);
  expect(mocks.process).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue({});
  expect((await route.handler(request, context)).status).toBe(200);
  expect(mocks.process).toHaveBeenCalledOnce();
});
