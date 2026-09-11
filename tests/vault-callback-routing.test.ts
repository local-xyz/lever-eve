import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
vi.mock("@db/services/auth/session", () => ({
  getAuthSession: async () => null,
}));
import { proxy } from "../proxy";
it("lets the internal vault callback reach its own OIDC authentication", async () => {
  const response = await proxy(
    new NextRequest("https://lever.example/eve/v1/internal/vault/dispatch", {
      method: "POST",
    })
  );
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("location")).toBeNull();
});
it("still requires browser sign-in for the vault page", async () => {
  const response = await proxy(new NextRequest("https://lever.example/vault"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toContain("/sign-in");
});
