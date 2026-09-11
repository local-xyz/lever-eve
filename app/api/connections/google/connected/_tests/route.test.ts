import { beforeEach, expect, it, vi } from "vitest";
import type { getAuthSession } from "@db/services/auth/session";
import type { queueConnectionEnrichment } from "@db/services/connection-enrichment";
import { accessScopeForUser } from "@shared/identity/access-scope";
const mocks = vi.hoisted(() => ({
  session: vi.fn<typeof getAuthSession>(),
  token: vi.fn<() => Promise<string>>(),
  profile: vi.fn<() => Promise<{ data: { emailAddress: string } }>>(),
  queue: vi.fn<typeof queueConnectionEnrichment>(),
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  dispatch: vi.fn<() => Promise<Response>>(),
}));
vi.mock("next/server", () => ({
  after: mocks.after,
  NextResponse: { redirect: (url: URL) => Response.redirect(url) },
}));
vi.mock("@db/services/auth/session", () => ({ getAuthSession: mocks.session }));
vi.mock("@db/services/connection-enrichment", () => ({
  queueConnectionEnrichment: mocks.queue,
}));
vi.mock("@vercel/connect", () => ({ getToken: mocks.token }));
vi.mock("@shared/eve/request", () => ({
  postScheduledRunRoute: mocks.dispatch,
}));
vi.mock("@googleapis/gmail", () => ({
  auth: {
    OAuth2: class {
      setCredentials() {
        /* Token stays inside the mock. */
      }
    },
  },
  gmail: () => ({ users: { getProfile: mocks.profile } }),
}));
import { GET } from "../route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    user: {
      id: "alice",
      phoneNumber: "+15555550100",
      phoneNumberVerified: true,
    },
  });
  mocks.token.mockResolvedValue("private-token");
  mocks.profile.mockResolvedValue({
    data: { emailAddress: "Alice@example.com" },
  });
  mocks.queue.mockResolvedValue();
  mocks.dispatch.mockResolvedValue(new Response(null, { status: 200 }));
});
it("uses the authenticated owner and verified Gmail address, ignoring query-supplied identity", async () => {
  const response = await GET(
    new Request(
      "https://lever.example/api/connections/google/connected?userId=bob&account=bob@example.com"
    )
  );
  expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(
    accessScopeForUser("better-auth:alice"),
    { connector: "gmail", sourceLabel: "Gmail", account: "alice@example.com" }
  );
  expect(response.headers.get("location")).toBe(
    "https://lever.example/?google=connected"
  );
  await mocks.after.mock.calls[0]?.[0]();
  expect(mocks.dispatch).toHaveBeenCalledWith(
    "/eve/v1/internal/connection-enrichment/dispatch",
    {}
  );
});
it("requires sign-in and verified Gmail access before queueing", async () => {
  mocks.session.mockResolvedValue(null);
  expect(
    (
      await GET(
        new Request("https://lever.example/api/connections/google/connected")
      )
    ).status
  ).toBe(401);
  expect(mocks.token).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({
    user: {
      id: "alice",
      phoneNumber: "+15555550100",
      phoneNumberVerified: true,
    },
  });
  mocks.token.mockRejectedValue(new Error("no access"));
  const response = await GET(
    new Request("https://lever.example/api/connections/google/connected")
  );
  expect(response.headers.get("location")).toBe(
    "https://lever.example/?google=unavailable"
  );
  expect(mocks.queue).not.toHaveBeenCalled();
});
