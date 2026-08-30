import { describe, expect, test } from "bun:test";
import { installReserveExtension } from "../src/extension.ts";

describe("extension wiring", () => {
  test("installs only the model adapter and never registers a command", () => {
    let commandRegistrations = 0;
    const api = {
      registerProvider: () => undefined,
      registerCommand: () => { commandRegistrations++; },
      on: () => undefined,
    };

    installReserveExtension(api, "pi", { logger: {} });

    expect(commandRegistrations).toBe(0);
  });
});
