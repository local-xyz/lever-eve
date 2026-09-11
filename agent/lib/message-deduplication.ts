import { createHash } from "node:crypto";
import { defineState } from "eve/context";
import type { z } from "zod";
import type { sendMessageOutputSchema } from "@shared/chat/message-delivery";

interface MessageDeliveryState {
  turnId: string;
  calls: Record<string, string>;
}
const deliveries = defineState<MessageDeliveryState>(
  "lever.message-deliveries",
  () => ({ turnId: "", calls: {} })
);

export function prepareMessageDelivery(
  message: z.infer<typeof sendMessageOutputSchema>,
  turnId: string,
  callId: string
) {
  const key = createHash("sha256")
    .update(
      JSON.stringify(
        message.kind === "link"
          ? {
              kind: message.kind,
              url: message.url,
              replyTo: message.replyTo ?? { kind: "current" },
            }
          : {
              kind: message.kind,
              text: message.text,
              attachments: message.attachments,
              replyTo: message.replyTo ?? { kind: "current" },
            }
      )
    )
    .digest("hex");
  const state = deliveries.get();
  const originalCallId = state.turnId === turnId ? state.calls[key] : undefined;
  if (originalCallId && originalCallId !== callId)
    return { kind: "already-submitted" as const, originalCallId };
  // A retry of the same durable call must still reach the provider's idempotent
  // delivery path. Only a different call repeating the content is suppressed.
  deliveries.update((current) => {
    const calls = current.turnId === turnId ? { ...current.calls } : {};
    calls[key] = callId;
    return { turnId, calls };
  });
  return message;
}
