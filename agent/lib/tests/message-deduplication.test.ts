import { expect, it, vi } from "vitest";
vi.mock("eve/context", () => ({
  defineState<T>(_name: string, initial: () => T) {
    let value = initial();
    return {
      get: () => value,
      update(fn: (current: T) => T) {
        value = fn(value);
      },
    };
  },
}));
import { prepareMessageDelivery } from "../message-deduplication";
it("suppresses a second identical message in one turn but permits durable retries", () => {
  const message = { kind: "message" as const, text: "Done" };
  expect(prepareMessageDelivery(message, "turn-a", "call-a")).toEqual(message);
  expect(prepareMessageDelivery(message, "turn-a", "call-a")).toEqual(message);
  expect(prepareMessageDelivery(message, "turn-a", "call-b")).toMatchObject({
    kind: "already-submitted",
  });
  expect(prepareMessageDelivery(message, "turn-b", "call-c")).toEqual(message);
});
it("allows distinct text and reply targets in the same turn", () => {
  const message = { kind: "message" as const, text: "Ready" };
  expect(prepareMessageDelivery(message, "turn-c", "call-d")).toEqual(message);
  const different = { ...message, text: "Ready now" };
  expect(prepareMessageDelivery(different, "turn-c", "call-e")).toEqual(
    different
  );
  const reply = {
    ...message,
    replyTo: { kind: "task" as const, id: "task-2" },
  };
  expect(prepareMessageDelivery(reply, "turn-c", "call-f")).toEqual(reply);
});

it("normalizes omitted and current reply targets for link deduplication", () => {
  const link = { kind: "link" as const, url: "https://example.com" };
  expect(prepareMessageDelivery(link, "turn-link", "call-link")).toEqual(link);
  expect(
    prepareMessageDelivery(
      { ...link, replyTo: { kind: "current" } },
      "turn-link",
      "call-link2"
    )
  ).toMatchObject({ kind: "already-submitted" });
});
