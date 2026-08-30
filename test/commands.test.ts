import { describe, expect, test } from "bun:test";
import { registerCommands } from "../src/commands/index.ts";
import type { ExtensionApiLike, RegisterCommandOptionsLike } from "../src/adapters/types.ts";
import { parseCodexCatalog } from "../src/core/catalog-parser.ts";
import { ReserveState } from "../src/core/state.ts";
import { catalog, reserveModel, visibleModel } from "./fixtures.ts";

describe("commands", () => {
  test("status and info expose only catalog metadata", () => {
    const commands = new Map<string, RegisterCommandOptionsLike>();
    const messages: string[] = [];
    const api: ExtensionApiLike = {
      registerProvider: () => undefined,
      registerCommand: (name, options) => commands.set(name, options),
    };
    const state = new ReserveState();
    state.apply(parseCodexCatalog(catalog([visibleModel(), reserveModel()])));
    registerCommands(api, state, "omp");

    const context = {
      ui: { notify: (message: string) => messages.push(message) },
      model: { provider: "openai-codex", id: "gpt-reserve" },
    };
    commands.get("reserve-status")!.handler("", context);
    commands.get("reserve-info")!.handler("", context);

    expect(commands.has("reserve-refresh")).toBe(false);
    expect(messages[0]).toContain("Registry model: openai-codex/gpt-reserve");
    expect(messages[1]).toContain("Model ID: gpt-reserve");
    expect(messages[1]).toContain("Context window: 987654");
    expect(messages[1]).not.toContain("access");
  });
});
