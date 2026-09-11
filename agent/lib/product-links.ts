import { applicationOrigin } from "@shared/environment/origin";

const destinations = {
  google: "/#connections-heading",
  vault: "/vault",
  "personal-info": "/personal-info",
  "chat-history": "/chat/history",
  settings: "/",
} as const;

export function productLink(destination: keyof typeof destinations) {
  return new URL(destinations[destination], applicationOrigin()).toString();
}

export function productLinkContext() {
  return `# Lever website and connections
The deployed Lever website is ${productLink("settings")}.
Google Workspace (Gmail, Calendar, Contacts): ${productLink("google")}
Vault: ${productLink("vault")}
Personal information: ${productLink("personal-info")}
Chat history: ${productLink("chat-history")}
These are verified application links, not evidence that this user's accounts are connected.
When a connection would help complete the user's task, call get_product_link to check this user's status. If connected, proceed with the relevant tool. If disconnected, explain briefly what connecting enables and send the returned nativeLink via send_message, or include the full URL in a short text message. Do this for task requests, not only explicit connection questions. Never ask the user for the website address or invent a settings route.
For iMessage use a native link preview (send_message kind link with url), or a full HTTPS URL in plain text. Do not use Markdown link syntax. If an authorization tool supplies a specific sign-in URL, use that URL instead. A setup link does not mean authorization succeeded; recheck after the user connects.`;
}
