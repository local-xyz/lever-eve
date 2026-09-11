import {
  defineMemoryProvider,
  type MemoryOperationContext,
  type MemoryProvider,
  type MemoryRecallHandler,
  type MemoryScopeContext,
} from "eve/memory";
import { z } from "zod";
import { scopeFromPrincipal } from "@agent/lib/principal-scope";
import {
  readPendingConnectionEnrichments,
  acknowledgeConnectionEnrichment,
} from "@db/services/connection-enrichment";
import type { ToolContext } from "eve/tools";
import type { env } from "@shared/environment";
import { resolveModeValue } from "@agent/lib/mode";

export function resolveProfileMemoryBackend(
  environment: Pick<
    typeof env,
    "BLOB_READ_WRITE_TOKEN" | "BLOB_STORE_ID" | "NODE_ENV" | "VERCEL_ENV"
  >
) {
  if (environment.NODE_ENV !== "production") {
    return { kind: "automatic" as const };
  }

  if (environment.BLOB_STORE_ID) {
    return {
      kind: "vercel-blob" as const,
      options: { storeId: environment.BLOB_STORE_ID },
    };
  }

  return environment.VERCEL_ENV === undefined &&
    environment.BLOB_READ_WRITE_TOKEN
    ? {
        kind: "vercel-blob" as const,
        options: { token: environment.BLOB_READ_WRITE_TOKEN },
      }
    : { kind: "automatic" as const };
}

export function resolveProfileMemoryScope(context: MemoryScopeContext) {
  const caller = context.session.auth.current;
  const workspaceId = z.string().safeParse(caller?.attributes.workspaceId);
  const scope =
    caller?.principalType === "user" && workspaceId.success
      ? workspaceId.data
      : null;
  return resolveModeValue(context, {
    interactive: scope,
    "scheduled-worker": scope,
  });
}

export function preserveProfileMemoryCancellation(provider: MemoryProvider) {
  const compactionRecall = provider.recall["compaction.completed"];
  return defineMemoryProvider({
    ...provider,
    recall: {
      "turn.started": (context) =>
        recallWithCancellationReason(provider.recall["turn.started"], context),
      "compaction.completed": (context) =>
        compactionRecall
          ? recallWithCancellationReason(compactionRecall, context)
          : undefined,
    },
  });
}

async function recallWithCancellationReason<
  Context extends MemoryOperationContext,
>(handler: MemoryRecallHandler<Context>, context: Context) {
  try {
    return await handler(context);
  } catch (error) {
    if (context.abortSignal.aborted) {
      context.abortSignal.throwIfAborted();
    }
    throw error;
  }
}

/** Drain extraction results through Eve's own save tool under the actual runtime scope.
 * PostgreSQL is a delivery outbox only; profile file memory owns the saved facts.
 */
export function importConnectionsIntoProfileMemory(provider: MemoryProvider) {
  async function importPending(context: MemoryOperationContext) {
    const principal = context.session.auth.current;
    if (principal?.principalType !== "user") return;
    const owner = scopeFromPrincipal(principal);
    const deliveries = await readPendingConnectionEnrichments(owner);
    if (!deliveries.some((delivery) => delivery.notes.length > 0)) return;
    const tools = await provider.tools?.({
      ...context,
      channel: {},
      turn: {
        id: context.session.turn.id,
        sequence: context.session.turn.sequence,
        input: [],
      },
    });
    const save = tools?.save_memory;
    if (!save)
      throw new Error("Profile memory must expose Eve's save_memory tool.");
    const toolContext: ToolContext = {
      ...context,
      callId: context.operationId,
      toolName: "profile__save_memory",
      getToken() {
        throw new Error("File memory does not use authorization tokens.");
      },
      requireAuth() {
        throw new Error("File memory does not request authorization.");
      },
    };
    // Saves are ordered and retryable: Eve deduplicates identical entries and
    // performs optimistic writes without overwriting other profile memories.
    // oxlint-disable eslint/no-await-in-loop -- Native memory saves must be ordered.
    for (const pending of deliveries) {
      for (const note of pending.notes) {
        context.abortSignal.throwIfAborted();
        const text = formatConnectionProfileNote(pending.sourceLabel, note);
        const input = z.object({ text: z.string().min(1) }).parse({ text });
        // SAFETY: fileMemory's save_memory contract is {text:string}; the pinned
        // framework is exercised by integration tests. MemoryToolSet erases input to never.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Restore the validated built-in tool input at the erased provider boundary.
        await save.execute(input as never, toolContext);
      }
      await acknowledgeConnectionEnrichment(
        owner,
        pending.connector,
        pending.updatedAt
      );
    }
    // oxlint-enable eslint/no-await-in-loop
  }
  async function importSafely(context: MemoryOperationContext) {
    try {
      await importPending(context);
    } catch {
      context.abortSignal.throwIfAborted();
      // Retain undelivered notes; optional ingestion must not break conversation.
      console.warn(
        "[profile-memory] Connection import deferred; extraction remains queued."
      );
    }
  }
  const compact = provider.recall["compaction.completed"];
  return defineMemoryProvider({
    ...provider,
    recall: {
      async "turn.started"(context) {
        await importSafely(context);
        return provider.recall["turn.started"](context);
      },
      async "compaction.completed"(context) {
        await importSafely(context);
        return compact?.(context);
      },
    },
  });
}

function formatConnectionProfileNote(
  sourceLabel: string,
  note: Awaited<
    ReturnType<typeof readPendingConnectionEnrichments>
  >[number]["notes"][number]
) {
  return `[${sourceLabel}; ${note.evidence}; not user-confirmed] ${note.fact} Sources: ${note.sources.map((source) => `${source.reference} (${source.date})`).join("; ")}`;
}
