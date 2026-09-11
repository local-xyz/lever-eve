vi.mock("workflow", () => ({
  createHook: () => {
    throw new Error("No workflow execution in schema tests");
  },
  sleep: () => {
    throw new Error("No workflow execution in schema tests");
  },
}));
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import vaultSetup from "@agent/tools/request_vault_setup";

describe("vault setup tool schema", () => {
  it("exposes object parameters and preserves safe setup variants", () => {
    const schema = vaultSetup.inputSchema;
    if (!(schema instanceof z.ZodType)) throw new Error("Expected Zod schema.");
    const jsonSchema = z.toJSONSchema(schema, { io: "input" });
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema).not.toHaveProperty("anyOf");
    expect(jsonSchema).not.toHaveProperty("oneOf");
    expect(schema.safeParse({ target: "vault", kind: "contact" }).success).toBe(
      true
    );
    expect(
      schema.safeParse({
        target: "vault",
        kind: "login",
        label: "Example",
        identifierType: "email",
        origin: "https://example.com",
      }).success
    ).toBe(true);
    expect(schema.safeParse({ target: "vault", kind: "login" }).success).toBe(
      false
    );
    expect(
      schema.safeParse({
        target: "vault",
        kind: "contact",
        origin: "https://example.com",
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        target: "vault",
        kind: "contact",
        secret: "never-in-chat",
      }).success
    ).toBe(false);
  });
});
