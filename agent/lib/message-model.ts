import type { getTaskDeliveryPhase } from "eve/context";
import { wrapLanguageModel, type ModelMessage } from "ai";

export function requireMessageTool(
  model: Parameters<typeof wrapLanguageModel>[0]["model"],
  conversation: readonly ModelMessage[],
  taskDeliveryPhase: ReturnType<typeof getTaskDeliveryPhase>
) {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      transformParams: async ({ params }) => {
        if (!params.tools?.some((tool) => tool.name === "send_message")) {
          return params;
        }
        // Runtime phase is authoritative; prompt wording and user text cannot change it.
        if (taskDeliveryPhase === "pending") return params;
        // Use Eve's durable conversation, not the provider prompt: runtime
        // task and memory notes may also have the user role in that prompt.
        const latestUser = conversation.findLastIndex(
          (message) => message.role === "user"
        );
        const delivered = conversation
          .slice(latestUser + 1)
          .some(
            (message) =>
              message.role === "tool" &&
              message.content.some(
                (part) =>
                  part.type === "tool-result" &&
                  part.toolName === "send_message" &&
                  part.output.type !== "error-text" &&
                  part.output.type !== "error-json" &&
                  part.output.type !== "execution-denied"
              )
          );
        return delivered
          ? params
          : { ...params, toolChoice: { type: "required" } };
      },
    },
  });
}
