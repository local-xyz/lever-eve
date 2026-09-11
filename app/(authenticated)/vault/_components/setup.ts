"use client";

import { z } from "zod";
import { useSearchParams } from "next/navigation";
import { parseVaultSetupSearchParams } from "@shared/vault/schema";

export function useVaultSetup() {
  const searchParams = useSearchParams();
  const requestedSetup = parseVaultSetupSearchParams(
    Object.fromEntries(searchParams.entries())
  );
  return requestedSetup.success ? requestedSetup.data : undefined;
}

export function useVaultSetupRequestId(kind: string) {
  const params = useSearchParams();
  if (params.get("kind") !== kind || params.get("setup") !== "vault")
    return undefined;
  return z.uuid().safeParse(params.get("request")).data;
}
