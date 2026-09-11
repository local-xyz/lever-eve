import type * as EveContextRuntime from "../../node_modules/eve/dist/src/context/container.js";
import type * as EveContextKeys from "../../node_modules/eve/dist/src/context/keys.js";
import { expect, it, vi } from "vitest";
import { getTaskDeliveryPhase } from "eve/context";

it("projects the actual Eve runtime phase through the public compatibility accessor", async () => {
  const runtime = await vi.importActual<typeof EveContextRuntime>(
    new URL("./context/container.js", import.meta.resolve("eve")).pathname
  );
  const keys = await vi.importActual<typeof EveContextKeys>(
    new URL("./context/keys.js", import.meta.resolve("eve")).pathname
  );
  const context = new runtime.ContextContainer();
  runtime.contextStorage.run(context, () => {
    expect(getTaskDeliveryPhase()).toBe("none");
    for (const phase of ["initiating", "pending", "settled", "none"]) {
      context.set(keys.TurnTaskDeliveryKey, phase);
      expect(getTaskDeliveryPhase()).toBe(phase);
    }
  });
  expect(() => getTaskDeliveryPhase()).toThrow("No active eve context");
});
