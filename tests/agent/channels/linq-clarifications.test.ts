import type { InputRequest, InputResponse } from "eve/client";
import { describe, expect, it, vi } from "vitest";
import { renderLinqInputRequests } from "@agent/lib/linq-clarifications";

const { resolveTextToResponses } = await vi.importActual<{
  resolveTextToResponses: (
    text: string,
    requests: readonly InputRequest[]
  ) => readonly InputResponse[];
}>(new URL("./channel/resolve-text.js", import.meta.resolve("eve")).pathname);

const question = (id = "q1"): InputRequest => ({
  requestId: id,
  kind: "question",
  prompt: "Delivery or pickup?",
  action: {
    kind: "tool-call",
    callId: id,
    toolName: "ask_question",
    input: {},
  },
  options: [
    { id: "delivery", label: "Delivery" },
    { id: "pickup", label: "Pickup" },
  ],
});
const approval: InputRequest = {
  ...question("purchase"),
  kind: "tool-approval",
  allowFreeform: false,
  prompt: "Approve purchase for $20?",
  options: [
    { id: "approve", label: "Approve" },
    { id: "cancel", label: "Cancel" },
  ],
};

describe("iMessage clarification protocol", () => {
  it("renders choices and text instructions without sending users to another UI", () => {
    const text = renderLinqInputRequests([question()]);
    expect(text).toContain("Delivery or pickup?");
    expect(text).toContain("1. Delivery");
    expect(text).toContain("custom answer");
    expect(text).not.toContain("session UI");
  });
  it.each([
    "scheduled delivery",
    "Never mind",
    "Actually check my email",
    "delivery tomorrow at 6 🥣",
  ])("preserves freeform intent: %s", (text) => {
    expect(resolveTextToResponses(text, [question()])).toEqual([
      { requestId: "q1", text },
    ]);
  });
  it.each(["pickup", "PICKUP", "2"])("accepts a choice: %s", (text) => {
    expect(resolveTextToResponses(text, [question()])).toEqual([
      { requestId: "q1", optionId: "pickup" },
    ]);
  });
  it("does not fan one answer out across multiple questions", () => {
    expect(
      resolveTextToResponses("delivery", [question(), question("q2")])
    ).toEqual([]);
  });
  it("routes a numbered question explicitly", () => {
    expect(
      resolveTextToResponses("2: scheduled delivery", [
        question(),
        question("q2"),
      ])
    ).toEqual([{ requestId: "q2", text: "scheduled delivery" }]);
  });
  it.each(["yes", "1", "scheduled delivery", "approve it please"])(
    "does not infer approval from %s",
    (text) => {
      expect(resolveTextToResponses(text, [approval])).toEqual([]);
    }
  );
  it("requires a specific approval when questions are also pending", () => {
    expect(resolveTextToResponses("approve", [question(), approval])).toEqual(
      []
    );
    expect(
      resolveTextToResponses("2: approve", [question(), approval])
    ).toEqual([{ requestId: "purchase", optionId: "approve" }]);
  });
  it("accepts explicit approval and cancellation", () => {
    expect(resolveTextToResponses("approve", [approval])).toEqual([
      { requestId: "purchase", optionId: "approve" },
    ]);
    expect(resolveTextToResponses("cancel", [approval])).toEqual([
      { requestId: "purchase", optionId: "cancel" },
    ]);
  });
  it("honors closed choices and rejects empty replies", () => {
    expect(
      resolveTextToResponses("later", [{ ...question(), allowFreeform: false }])
    ).toEqual([]);
    expect(resolveTextToResponses("   ", [question()])).toEqual([]);
  });
  it("renders explicit approval instructions and distinguishes multiple requests", () => {
    expect(renderLinqInputRequests([question(), approval])).toContain(
      "2: approve"
    );
    expect(renderLinqInputRequests([approval])).not.toContain("custom answer");
    expect(renderLinqInputRequests([])).toBe("");
  });
});
