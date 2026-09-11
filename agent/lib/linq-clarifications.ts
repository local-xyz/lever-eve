import type { InputRequest } from "eve/client";

export function renderLinqInputRequests(requests: readonly InputRequest[]) {
  return requests
    .map((request, index) => {
      const prefix = requests.length > 1 ? `${String(index + 1)}: ` : "";
      const lines = [
        requests.length > 1
          ? `${String(index + 1)}) ${request.prompt}`
          : request.prompt,
      ];
      if (request.kind === "tool-approval") {
        lines.push(
          `Reply "${prefix}approve" to approve this action or "${prefix}cancel" to decline.`
        );
      } else {
        lines.push(
          ...(request.options ?? []).map(
            (option, optionIndex) =>
              `${String(optionIndex + 1)}. ${option.label}${option.description ? ` — ${option.description}` : ""}`
          )
        );
        lines.push(
          request.allowFreeform !== false && request.kind === "question"
            ? "Reply here with your answer. Suggested choices also accept a custom answer."
            : "Reply here with an option's name or number."
        );
        if (prefix)
          lines.push(
            `Start your answer with "${prefix}" to identify this question.`
          );
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
