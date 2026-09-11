import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { readGoogleWorkspaceConnection } from "@db/services/google-workspace";
import { productLink } from "@agent/lib/product-links";
import { scopeFromPrincipal } from "@agent/lib/principal-scope";
import { resolveModeValue } from "@agent/lib/mode";

export default defineDynamic({
  events: {
    "turn.started": (_event, context) => {
      const caller =
        context.session.auth.current ?? context.session.auth.initiator;
      if (!caller) throw new Error("An authenticated Lever user is required.");
      const scope = scopeFromPrincipal(caller);
      return resolveModeValue(context, {
        interactive: {
          get_product_link: defineTool({
            description:
              "Get a verified Lever page link to text to the user. Use google whenever Gmail, Calendar, or Contacts would help fulfill a task, including checking an inbox, scheduling an event, or finding a contact; it also checks this user's connection status. connected means Google is available, disconnected means the user must click Connect, and unavailable means Lever's Google connector needs administrator setup. Use the appropriate destination for other product setup questions. Send the returned nativeLink through send_message for a native preview, or include the returned URL in send_message when directing the user to a page. Never invent settings URLs.",
            inputSchema: z.object({
              destination: z.enum([
                "google",
                "vault",
                "personal-info",
                "chat-history",
                "settings",
              ]),
            }),
            async execute({ destination }) {
              const url = productLink(destination);
              const nativeLink = { kind: "link" as const, url };
              if (destination === "google") {
                return {
                  url,
                  nativeLink,
                  connection: await readGoogleWorkspaceConnection(scope.userId),
                };
              }
              return { url, nativeLink };
            },
          }),
        },
      });
    },
  },
});
