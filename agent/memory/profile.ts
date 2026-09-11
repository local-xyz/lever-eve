import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { vercelBlob } from "eve/memory/file/vercel";
import {
  preserveProfileMemoryCancellation,
  importConnectionsIntoProfileMemory,
  resolveProfileMemoryBackend,
  resolveProfileMemoryScope,
} from "../lib/profile-memory";
import { env } from "@shared/environment";

const backend = resolveProfileMemoryBackend(env);
const provider = preserveProfileMemoryCancellation(
  importConnectionsIntoProfileMemory(
    backend.kind === "vercel-blob"
      ? fileMemory({
          backend: vercelBlob(backend.options),
          maxCharacters: 24_000,
        })
      : fileMemory({ maxCharacters: 24_000 })
  )
);

export default defineMemory({
  description: "Remember stable facts and preferences about the current user.",
  provider,
  scope: resolveProfileMemoryScope,
});
