import { defineWorkflowTool } from "eve/tools";
import { createHook, sleep } from "workflow";
import { z } from "zod";
import type { WorkflowToolContext } from "eve/tools";
import { scopeFromPrincipal } from "@agent/lib/principal-scope";
import {
  registerVaultRequest,
  closeVaultRequest,
} from "@db/services/vault-requests";
import { applicationOrigin } from "@shared/environment/origin";
import {
  createVaultSetupUrl,
  vaultSetupRequestSchema,
  type VaultSetupRequest,
} from "@shared/vault/schema";

const [loginSetup, otherSetup] = vaultSetupRequestSchema.options;
// Present one object to model providers; validate each variant with the
// shared contract so login requirements and secret restrictions stay intact.
const vaultSetupInputSchema = z
  .strictObject({
    ...otherSetup.shape,
    kind: z.union([loginSetup.shape.kind, otherSetup.shape.kind]),
    identifierType: loginSetup.shape.identifierType.optional(),
    origin: loginSetup.shape.origin.optional(),
  })
  .superRefine((input, context) => {
    const result = vaultSetupRequestSchema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
    }
  });

export default defineWorkflowTool({
  description:
    "Request one verified required missing credential through a secure Lever vault link. For login, first require observed mandatory authentication and checked guest/public alternatives; an empty vault or a guess that checkout needs login is not sufficient. This background task sends you the setup link, waits for the user to save it, and then reports completion automatically. Start all missing credential requests in the same turn. Login requires label, identifierType and the exact website origin. Never put secrets or personal identifiers in the input. Cancel this background task if the original request is cancelled or no longer needs the credential. Saving a card is not purchase approval.",
  inputSchema: vaultSetupInputSchema,
  execution: "background",
  async *execute(input, ctx, task) {
    "use workflow";
    using hook = createHook<{ credentialId: string; kind: string }>();
    if (await hook.getConflict())
      throw new Error("Credential wait already exists.");
    const pending = await prepareVaultRequest(
      vaultSetupRequestSchema.parse(input),
      ctx.session,
      ctx.callId,
      hook.token
    );
    try {
      /* oxlint-disable unicorn/require-post-message-target-origin -- Eve task messaging is not window.postMessage. */
      yield task.postMessage(
        `Immediate user action required: send this secure setup link to the user with send_message now: ${pending.url}\nThis is a required setup action, not a progress report. The user must receive this link before this task can complete. Do not ask them to send secrets in chat. Saving through the link will automatically notify you; no 'done' message is required.`
      );
      /* oxlint-enable unicorn/require-post-message-target-origin */
      const saved = await Promise.race([hook, sleep("24h")]);
      return saved
        ? {
            status: "saved",
            ...saved,
            instruction:
              "The requested credential was saved. Recheck remaining requirements and continue the original task through its existing browser agent if still relevant. This is not approval for a purchase. Never restart cancelled work or repeat completed actions.",
          }
        : {
            status: "expired",
            instruction:
              "The credential setup link expired. Do not restart the original task automatically.",
          };
    } finally {
      await retireVaultRequest(pending.id);
    }
  },
});

async function prepareVaultRequest(
  request: VaultSetupRequest,
  session: WorkflowToolContext["session"],
  callId: string,
  hookToken: string
) {
  "use step";
  const principal = session.auth.current ?? session.auth.initiator;
  if (principal?.principalType !== "user")
    throw new Error("An authenticated user is required.");
  const pending = await registerVaultRequest(scopeFromPrincipal(principal), {
    sessionId: session.id,
    callId,
    hookToken,
    request,
  });
  const url = new URL(createVaultSetupUrl(applicationOrigin(), request));
  url.searchParams.set("request", pending.id);
  return { ...pending, url: url.toString() };
}

async function retireVaultRequest(id: string) {
  "use step";
  await closeVaultRequest(id);
}
