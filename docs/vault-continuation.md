# Vault setup continuation

`request_vault_setup` is a native Eve background workflow tool. It registers a
one-use request for the authenticated user and sends the parent agent a secure
setup link. The workflow waits on a native Workflow hook for up to 24 hours.
The opaque `request` query parameter identifies the database record; the hook
token is never included in the URL or model output.

The four vault forms carry the request ID to `vault.create`. The save transaction
locks the request, checks ownership, type, and (for logins) website origin and
identifier type, then writes the encrypted secret, vault metadata, and ready
notification together. Repeated submissions return the existing credential ID.
Direct vault saves without a request ID do not resume unrelated tasks.

After the response, the app calls the OIDC-protected `/eve/v1/internal/vault/dispatch`
route. The existing minute schedule retries pending notifications. The dispatcher
passes only credential ID and kind to `resumeHook`, using the token string, not a
cached hook object. The workflow consumes one event and completes once; Eve owns
parent task delivery and cohort aggregation. Failed deliveries remain pending.
A missing or retired hook is suppressed, never replaced with a new session.

The parent sends setup links as immediate user-action requests and continues the
original work once its credential cohort settles. It must cancel setup background
tasks when the user cancels the original work. Native cancellation retires the
wait. A saved payment card is not purchase approval.

## Deployment and existing conversations

Migration `0014_woozy_scream.sql` adds `vault_setup_requests`. Existing vault
records are unchanged. Existing setup URLs without a request ID cannot notify an
agent. Sessions pinned to an earlier deployment continue using their previous
tool implementation; they need a fresh session and new setup links to use this
flow. Previously sent links still save credentials, followed by an explicit
message to continue.

## Verification

Database tests cover wrong-owner and wrong-origin rejection, duplicate saves,
expired and cancelled requests, direct saves, and transactional rollback.
Dispatcher tests cover authentication, metadata-only payloads, retryable failures,
and retired waits. Hosted verification should check two requested items, duplicate
submission, parent resumption only after both are ready, and one completion.

Identical `send_message` content repeated by the model in the same turn is
suppressed by durable session state. Retries of the original tool call remain
allowed; different text, distinct reply targets, and later conversation turns
remain independent. This prevents a model from displaying a completion twice
even when Eve delivered only one completion turn.
