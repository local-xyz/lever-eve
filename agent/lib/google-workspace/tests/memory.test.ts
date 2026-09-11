import type { enrichmentNotesSchema } from "@shared/connection-enrichment/schema";
import type { gmail_v1 } from "@googleapis/gmail";
import type { z, ZodType } from "zod";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  token: vi.fn<() => Promise<string>>(),
  profile: vi.fn<() => Promise<{ data: gmail_v1.Schema$Profile }>>(),
  list: vi.fn<() => Promise<{ data: gmail_v1.Schema$ListMessagesResponse }>>(),
  get: vi.fn<() => Promise<{ data: gmail_v1.Schema$Message }>>(),
  generate: vi.fn<
    (input: { prompt: string; tools?: never }) => Promise<{
      output: { notes: z.infer<typeof enrichmentNotesSchema> };
    }>
  >(),
}));
vi.mock("@db/services/settings", () => ({
  getGatewayModel: async () => "test/model",
}));
vi.mock("@vercel/connect", () => ({ getToken: mocks.token }));
vi.mock("@googleapis/gmail", () => ({
  auth: {
    OAuth2: class {
      setCredentials() {
        /* No external token storage in this mock. */
      }
    },
  },
  gmail: () => ({
    users: {
      getProfile: mocks.profile,
      messages: { list: mocks.list, get: mocks.get },
    },
  }),
}));
vi.mock("ai", () => ({
  generateText: mocks.generate,
  gateway: (id: string) => id,
  Output: { object: (value: { schema: ZodType }) => value },
}));
vi.mock("@vercel/connect/eve", () => ({ connect: () => ({}) }));
import { extractGmailContext } from "../memory";
const claim = {
  connector: "gmail",
  sourceLabel: "Gmail",
  account: "alice@example.com",
  userId: "alice",
  workspaceId: "alice",
  leaseToken: "lease",
  status: "running" as const,
  availableAt: new Date(),
  updatedAt: new Date(),
  notes: [],
  attempts: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockResolvedValue("private-token");
  mocks.profile.mockResolvedValue({
    data: { emailAddress: "alice@example.com" },
  });
  mocks.list.mockResolvedValue({
    data: { messages: [{ id: "m1" }, { id: "m1" }] },
  });
  mocks.get.mockResolvedValue({
    data: {
      snippet: "Name Alice; password=private-password",
      payload: { headers: [{ name: "Date", value: "2026-09-01" }] },
    },
  });
  mocks.generate.mockResolvedValue({
    output: {
      notes: [
        {
          category: "identity",
          fact: "Name may be Alice",
          evidence: "inferred",
          sources: [{ reference: "m1", date: "invented-date" }],
        },
        {
          category: "address",
          fact: "Unsupported address",
          evidence: "inferred",
          sources: [{ reference: "invented", date: "" }],
        },
      ],
    },
  });
});
it("reads a bounded deduplicated sample, redacts secrets and persists only source-backed notes", async () => {
  const result = await extractGmailContext(claim, AbortSignal.timeout(10000));
  expect(mocks.list).toHaveBeenCalledTimes(3);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.generate.mock.calls[0]?.[0].prompt).not.toContain(
    "private-password"
  );
  expect(mocks.generate.mock.calls[0]?.[0].tools).toBeUndefined();
  expect(result).toEqual([
    {
      category: "identity",
      fact: "Name may be Alice",
      evidence: "inferred",
      sources: [{ reference: "m1", date: "2026-09-01" }],
    },
  ]);
});
it("does not scan or write another Google account", async () => {
  mocks.profile.mockResolvedValue({
    data: { emailAddress: "bob@example.com" },
  });
  await expect(
    extractGmailContext(claim, AbortSignal.timeout(10000))
  ).rejects.toThrow("Gmail extraction failed.");
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("finishes empty inboxes without a model call", async () => {
  mocks.list.mockResolvedValue({ data: {} });
  expect(await extractGmailContext(claim, AbortSignal.timeout(10000))).toEqual(
    []
  );
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("keeps model failures retryable without logging private provider payloads", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.generate.mockRejectedValue(
    Object.assign(new Error("private-email-and-token"), { statusCode: 402 })
  );
  await expect(
    extractGmailContext(claim, AbortSignal.timeout(10000))
  ).rejects.toThrow("Gmail extraction failed.");
  expect(warning).toHaveBeenCalledWith(expect.any(String), {
    stage: "model",
    status: 402,
  });
  expect(JSON.stringify(warning.mock.calls)).not.toContain(
    "private-email-and-token"
  );
  warning.mockRestore();
});
