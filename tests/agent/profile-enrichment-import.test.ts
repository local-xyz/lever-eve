import { beforeEach, expect, it, vi } from "vitest";
import { fileMemory, inMemory } from "eve/memory/file";
import type { MemoryTurnStartedContext } from "eve/memory";
import type { ToolContext } from "eve/tools";
import type {
  readPendingConnectionEnrichments,
  acknowledgeConnectionEnrichment,
} from "@db/services/connection-enrichment";
import { importConnectionsIntoProfileMemory } from "@agent/lib/profile-memory";
const mocks = vi.hoisted(() => ({
  read: vi.fn<typeof readPendingConnectionEnrichments>(),
  acknowledge: vi.fn<typeof acknowledgeConnectionEnrichment>(),
}));
vi.mock("@db/services/connection-enrichment", () => ({
  readPendingConnectionEnrichments: mocks.read,
  acknowledgeConnectionEnrichment: mocks.acknowledge,
}));
const notes = [
  {
    category: "preference" as const,
    fact: "May enjoy cycling",
    evidence: "inferred" as const,
    sources: [{ reference: "m1", date: "2026-09-01" }],
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue([
    {
      connector: "gmail",
      sourceLabel: "Gmail",
      notes,
      updatedAt: new Date("2026-09-01"),
    },
  ]);
  mocks.acknowledge.mockResolvedValue();
});
it("adds Gmail findings to the same native document while preserving existing entries and native removal", async () => {
  const backend = inMemory();
  const native = fileMemory({ backend, maxCharacters: 24000 });
  const ctx = context();
  const tools = await native.tools?.({ ...ctx, channel: {} });
  if (!tools) throw new Error("Missing native tools");
  // SAFETY: This is the pinned fileMemory save_memory input, validated by the native implementation.
  await tools.save_memory?.execute(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The framework's MemoryToolSet erases concrete input types.
    { text: "User prefers morning meetings." } as never,
    toolContext(ctx)
  );
  const profile = importConnectionsIntoProfileMemory(native);
  const recall = await profile.recall["turn.started"](ctx);
  expect(recall?.messages[0]?.id).toBe("file-memory-document");
  expect(recall?.messages[0]?.content).toContain(
    "0: User prefers morning meetings."
  );
  expect(recall?.messages[0]?.content).toContain(
    "1: [Gmail; inferred; not user-confirmed] May enjoy cycling"
  );
  expect(recall?.messages[0]?.content).toContain("m1 (2026-09-01)");
  expect(mocks.acknowledge).toHaveBeenCalledWith(
    { userId: "alice", workspaceId: "alice-workspace" },
    "gmail",
    new Date("2026-09-01")
  );
  // Simulate retry after an ambiguous queue acknowledgement: native saves are idempotent.
  await profile.recall["turn.started"](ctx);
  const stored = await backend.read({
    key: ctx.memory.scope.key,
    signal: ctx.abortSignal,
  });
  expect(stored?.content.match(/May enjoy cycling/g)).toHaveLength(1);
  mocks.read.mockResolvedValue([]);
  // SAFETY: This is the pinned fileMemory remove_memory contract, tested against Eve itself.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The framework's MemoryToolSet erases concrete input types.
  await tools.remove_memory?.execute({ index: 1 } as never, toolContext(ctx));
  const later = await profile.recall["turn.started"]({
    ...ctx,
    session: { ...ctx.session, id: "later-session" },
  });
  expect(later?.messages[0]?.content).not.toContain("cycling");
  expect(later?.messages[0]?.content).toContain("morning meetings");
});
it("retains the queue on a storage failure without breaking normal recall", async () => {
  const backend = inMemory();
  const write = vi
    .spyOn(backend, "write")
    .mockRejectedValue(new Error("storage unavailable"));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const profile = importConnectionsIntoProfileMemory(fileMemory({ backend }));
  expect(await profile.recall["turn.started"](context())).toBeNull();
  expect(mocks.acknowledge).not.toHaveBeenCalled();
  write.mockRestore();
  expect(
    (await profile.recall["turn.started"](context()))?.messages[0]?.content
  ).toContain("cycling");
  expect(mocks.acknowledge).toHaveBeenCalledOnce();
  warning.mockRestore();
});
it("does not import another user's extraction and preserves cancellation", async () => {
  const ctx = context();
  const profile = importConnectionsIntoProfileMemory(
    fileMemory({ backend: inMemory() })
  );
  mocks.read.mockResolvedValue([]);
  await profile.recall["turn.started"](ctx);
  expect(mocks.read).toHaveBeenCalledWith({
    workspaceId: "alice-workspace",
    userId: "alice",
  });
  mocks.read.mockResolvedValue([
    { connector: "gmail", sourceLabel: "Gmail", notes, updatedAt: new Date() },
  ]);
  const controller = new AbortController();
  const reason = new Error("Cancelled");
  controller.abort(reason);
  await expect(
    profile.recall["turn.started"]({ ...ctx, abortSignal: controller.signal })
  ).rejects.toBe(reason);
  expect(mocks.acknowledge).not.toHaveBeenCalled();
});
it("imports another connector into the same native profile with its own source and acknowledgement", async () => {
  const updatedAt = new Date();
  mocks.read.mockResolvedValue([
    { connector: "gmail", sourceLabel: "Gmail", notes, updatedAt },
    {
      connector: "calendar",
      sourceLabel: "Calendar",
      notes: [
        {
          category: "preference",
          fact: "Morning appointments",
          evidence: "inferred",
          sources: [{ reference: "event-1", date: "2026-09-02" }],
        },
      ],
      updatedAt,
    },
  ]);
  const profile = importConnectionsIntoProfileMemory(
    fileMemory({ backend: inMemory() })
  );
  const recalled = await profile.recall["turn.started"](context());
  expect(recalled?.messages[0]?.content).toContain("[Gmail;");
  expect(recalled?.messages[0]?.content).toContain(
    "[Calendar; inferred; not user-confirmed] Morning appointments Sources: event-1"
  );
  expect(mocks.acknowledge).toHaveBeenCalledTimes(2);
  expect(mocks.acknowledge).toHaveBeenCalledWith(
    { userId: "alice", workspaceId: "alice-workspace" },
    "calendar",
    updatedAt
  );
});
function context(): MemoryTurnStartedContext {
  return {
    abortSignal: new AbortController().signal,
    getSandbox() {
      throw new Error("No sandbox in file memory");
    },
    getSkill() {
      throw new Error("No skill in file memory");
    },
    memory: {
      scope: {
        key: "native-profile-key",
        namespace: "profile",
        value: "alice-workspace",
      },
      slot: "profile",
    },
    messages: [],
    operationId: "recall",
    session: {
      id: "session",
      auth: {
        current: {
          principalType: "user",
          principalId: "alice",
          authenticator: "authjs",
          attributes: { workspaceId: "alice-workspace" },
        },
        initiator: null,
      },
      turn: { id: "turn", sequence: 1 },
    },
    turn: { id: "turn", input: [], sequence: 1 },
  };
}
function toolContext(ctx: MemoryTurnStartedContext): ToolContext {
  return {
    ...ctx,
    callId: "test",
    toolName: "profile",
    getToken() {
      throw new Error("No token access");
    },
    requireAuth() {
      throw new Error("No authorization");
    },
  };
}
