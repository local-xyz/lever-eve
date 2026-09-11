import {
  claimConnectionEnrichment,
  finishConnectionEnrichment,
} from "@db/services/connection-enrichment";
import { extractGmailContext } from "@agent/lib/google-workspace/memory";

// Add a connector's extractor here; queueing, retries and profile-memory delivery are shared.
const extractors = new Map([["gmail", extractGmailContext]]);
export async function processConnectionEnrichment() {
  const claim = await claimConnectionEnrichment([...extractors.keys()]);
  if (!claim) return;
  const extract = extractors.get(claim.connector);
  if (!extract)
    throw new Error("No extractor registered for claimed connector.");
  try {
    const notes = await extract(claim, AbortSignal.timeout(120_000));
    await finishConnectionEnrichment(claim, notes);
  } catch {
    await finishConnectionEnrichment(claim, null);
    console.warn(
      "[connection-enrichment] Extraction failed; retry status persisted."
    );
  }
}
