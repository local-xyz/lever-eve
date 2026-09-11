import { beforeEach, expect, it, vi } from "vitest";
import type {
  claimConnectionEnrichment,
  finishConnectionEnrichment,
} from "@db/services/connection-enrichment";
import type { extractGmailContext } from "@agent/lib/google-workspace/memory";
const mocks = vi.hoisted(() => ({
  claim: vi.fn<typeof claimConnectionEnrichment>(),
  finish: vi.fn<typeof finishConnectionEnrichment>(),
  extract: vi.fn<typeof extractGmailContext>(),
}));
vi.mock("@db/services/connection-enrichment", () => ({
  claimConnectionEnrichment: mocks.claim,
  finishConnectionEnrichment: mocks.finish,
}));
vi.mock("@agent/lib/google-workspace/memory", () => ({
  extractGmailContext: mocks.extract,
}));
import { processConnectionEnrichment } from "@agent/lib/connection-enrichment";
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
  mocks.claim.mockResolvedValue(claim);
  mocks.extract.mockResolvedValue([]);
  mocks.finish.mockResolvedValue();
});
it("claims registered connectors and persists extractor results with the original lease", async () => {
  await processConnectionEnrichment();
  expect(mocks.claim).toHaveBeenCalledExactlyOnceWith(["gmail"]);
  expect(mocks.extract).toHaveBeenCalledWith(claim, expect.any(AbortSignal));
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(claim, []);
});
it("does no work when no supported job is due", async () => {
  mocks.claim.mockResolvedValue(null);
  await processConnectionEnrichment();
  expect(mocks.extract).not.toHaveBeenCalled();
  expect(mocks.finish).not.toHaveBeenCalled();
});
it("persists failure for retry without logging private payloads", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.extract.mockRejectedValue(new Error("private email"));
  await processConnectionEnrichment();
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(claim, null);
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private email");
  warn.mockRestore();
});
