import { getTaskDeliveryPhase } from "eve/context";
import { gateway } from "ai";
import { requireMessageTool } from "@agent/lib/message-model";
import { resolveModeValue } from "@agent/lib/mode";
import { defineAgent, defineDynamic } from "eve";
import { scheduledRunIdentity } from "@agent/lib/schedules/identity";
import { isScheduledAgentRunLeaseActive } from "@db/services/scheduled-agent-run-leases";
import { getGatewayModel } from "@db/services/settings";
import { scopeFromPrincipal } from "@agent/lib/principal-scope";

export default defineAgent({
  defaultTools: false,
  model: defineDynamic({
    events: {
      "step.started": async (_event, ctx) => {
        const scheduledRun = scheduledRunIdentity(ctx.session.auth);
        if (
          scheduledRun &&
          !(await isScheduledAgentRunLeaseActive(
            scheduledRun.runId,
            scheduledRun.leaseToken
          ))
        ) {
          throw new Error("The scheduled run lease is no longer active.");
        }
        const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
        if (!caller) throw new Error("An authenticated user is required.");
        const modelId = await getGatewayModel(scopeFromPrincipal(caller));
        return resolveModeValue(ctx, { interactive: true })
          ? requireMessageTool(
              gateway(modelId),
              ctx.messages,
              getTaskDeliveryPhase()
            )
          : modelId;
      },
    },
  }),
  reasoning: "low",
  compaction: {
    thresholdPercent: 0.7,
  },
});
