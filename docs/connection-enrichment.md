# Gmail connection memory

Connecting Google from the workspace returns through `/api/connections/google/connected`.
The route requires the signed-in Lever user, obtains that user's scoped Connect
token, and verifies Gmail access and the mailbox address with `users.getProfile`.
Only then does it queue an onboarding scan. Query parameters cannot choose the
user or mailbox. The original Google OAuth callback remains owned by Connect.

Gmail findings are imported into the existing `profile` Eve file memory, using
exactly the same scope, backend, indexed entries, save/remove tools, and recall
message as ordinary memory. There is no separate Gmail memory slot or profile UI.
The normal memory document allows 24,000 recalled characters, with Eve's unchanged
per-entry and storage limits. Existing entries are preserved.

Postgres `connection_enrichments.notes` is now a temporary extraction-delivery outbox.
At the next turn or compaction, before recall reaches the model, the profile
provider imports pending results through Eve's native `save_memory` tool. It
clears the outbox only after all saves succeed. Identical entries are deduplicated
by Eve, including retries after an ambiguous acknowledgement. A storage/capacity
failure retains the outbox without blocking ordinary recall. Completed scan
metadata remains in Postgres; delivered facts do not. This also migrates results
from the previous separate-memory implementation on first use. Existing sessions
pinned to an old deployment must move to a new session for the new provider.

The scan samples at most 30 unique messages across three searches: sent mail
from the past year, receipts/orders/shipping/reservations from the past year,
and recent non-promotional incoming mail from the past six months. It reads
at most 3,000 characters of text per message and does not download attachments.
Existing Gmail secret redaction runs before extraction and on saved fact text.
A single structured model call uses the user's configured model, a 120-second
scan timeout and a 4,500-token output limit. No agent tools or message delivery
are available during extraction. Empty mailboxes finish without a model call.

At most 25 concise notes are saved. Each has a category, an observed/inferred
label, and source message IDs with source dates. Invented source IDs are dropped;
source dates come from Gmail rather than model output. “Observed” describes email
evidence, not user confirmation. The extraction instruction excludes secrets,
sensitive personal traits and unsupported assumptions, and treats all mail as
untrusted data. It distinguishes delivery destinations from home addresses and
other people's details from the mailbox owner's. This is probabilistic extraction;
future agents must respect uncertainty and explicit corrections.

A database row provides callback deduplication, a five-minute lease, stale-worker
fencing, and exponential retry delays with a maximum of five attempts. Each
dispatch claims at most one job. The existing minute schedule retries queued or
abandoned work; the callback also requests immediate dispatch after redirect.
The internal route `/eve/v1/internal/connection-enrichment/dispatch` requires Vercel OIDC
(or local development auth). It creates no conversational agent session.
Completed scans do not repeat on repeated callbacks for the same active account.
Switching accounts replaces the notes and queues a new scan. Failed scans can be
requeued by completing the callback again. No raw email bodies or provider error
payloads are persisted by this feature.

Disconnecting Google cancels pending extraction delivery. Already imported facts
are ordinary profile memory; disconnecting does not erase them. The agent uses
`profile__remove_memory` to forget indexed entries, exactly as for other facts.
There is no longer a `gmail__forget` tool. Removed entries are not reimported from
a completed, acknowledged scan. Earlier conversation history is unchanged.
Existing Google connections are not scanned retroactively on deployment; a
signed-in user can open `/api/connections/google/connected` to initialize the memory without
repeating OAuth consent. Credentials are still verified before any scan.

Validation covers mailbox verification, authenticated callback ownership,
source filtering, redaction, empty inboxes, model failures, duplicate callbacks,
retry leases, stale worker completion, account changes, disconnect/forget,
user isolation, future-session recall, and read-only scheduled-worker access.
Live extraction requires working Gmail authorization and AI Gateway funds.

## Shared connector enrichment

The shared queue is keyed by workspace, user, and connector. Gmail uses connector
`gmail` and source label `Gmail`. Extraction remains in
`agent/lib/google-workspace/memory.ts`; the registry in
`agent/lib/connection-enrichment.ts` dispatches supported connectors. Unsupported
connector jobs are left unclaimed. Every result uses the shared notes contract,
with generic source references, and is imported into normal Eve profile memory.
Acknowledgement, cancellation, leases, and account changes are connector-scoped.

To add a connector, verify its account in its authenticated connection callback,
queue its connector ID, source label and account, then register a bounded,
read-only extractor. The extractor returns notes; the dispatcher owns retries
and persistence. No additional profile memory slot or UI is required.

Only the canonical connection callback and dispatcher are supported. Migration
0018 removes the legacy Gmail table and synchronization functions/triggers, and
clears all connector-enrichment jobs and pending extracted notes. Normal Eve
profile memories, conversations, and credentials are not deleted. A verified
connection callback queues a new scan after this reset.

Older deployments that reference the removed table or URLs are unsupported.
Historical migrations remain recorded so existing installations can migrate
forward; they are not active compatibility strategies.
