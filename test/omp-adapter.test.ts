import { describe, expect, test } from "bun:test";
import { installOmpAdapter } from "../src/adapters/omp.ts";
import type { ExtensionApiLike, PiProviderConfigLike } from "../src/adapters/types.ts";
import { ReserveState } from "../src/core/state.ts";
import type { CommonModelDefinition, FetchFn } from "../src/core/types.ts";
import { reserveModel, visibleModel } from "./fixtures.ts";

const nativeModel: CommonModelDefinition = {
  id: "gpt-5.6-luna",
  name: "Native GPT-5.6 Luna",
  api: "openai-codex-responses",
  provider: "openai-codex",
  baseUrl: "https://chatgpt.com/backend-api/codex",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 7, output: 11, cacheRead: 3, cacheWrite: 5 },
  contextWindow: 1_000_000,
  maxTokens: 128_000,
  supportsTools: true,
  preferWebsockets: true,
  priority: 91,
};

describe("OMP adapter", () => {
  test("preserves every native Codex row and appends only gpt-reserve", async () => {
    let providerConfig: PiProviderConfigLike | undefined;
    let sessionStart: ((event: unknown, context: { modelRegistry: { getAll(): readonly CommonModelDefinition[]; getApiKeyForProvider(): Promise<string> } }) => Promise<void>) | undefined;
    const api: ExtensionApiLike = {
      registerProvider: (_provider: unknown, config?: PiProviderConfigLike) => { providerConfig = config; },
      registerCommand: () => undefined,
      on: (_event, handler) => { sessionStart = handler as typeof sessionStart; },
    };
    const fetchFn: FetchFn = async () =>
      new Response(JSON.stringify({ models: [visibleModel({ context_window: 272000 }), reserveModel()] }), { status: 200 });

    installOmpAdapter(api, new ReserveState(), { fetchFn });
    await sessionStart!({}, { modelRegistry: { getAll: () => [nativeModel], getApiKeyForProvider: async () => "resolved-access-token" } });

    const models = providerConfig!.models!;
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual(nativeModel);
    expect(models[1]).toMatchObject({ id: "gpt-reserve", contextWindow: 987654, maxTokens: 77777 });
    const refreshed = await providerConfig!.fetchDynamicModels!("resolved-access-token");
    expect(refreshed[0]).toEqual(nativeModel);
    expect(refreshed[1]).toMatchObject({ id: "gpt-reserve", contextWindow: 987654, maxTokens: 77777 });
  });

  test("leaves native Codex catalog untouched when reserve is unavailable", async () => {
    let registered = false;
    let sessionStart: ((event: unknown, context: { modelRegistry: { getAll(): readonly CommonModelDefinition[]; getApiKeyForProvider(): Promise<string> } }) => Promise<void>) | undefined;
    const api: ExtensionApiLike = {
      registerProvider: () => { registered = true; },
      registerCommand: () => undefined,
      on: (_event, handler) => { sessionStart = handler as typeof sessionStart; },
    };
    const fetchFn: FetchFn = async () => new Response(JSON.stringify({ models: [visibleModel()] }), { status: 200 });

    installOmpAdapter(api, new ReserveState(), { fetchFn });
    await sessionStart!({}, { modelRegistry: { getAll: () => [nativeModel], getApiKeyForProvider: async () => "resolved-access-token" } });

    expect(registered).toBe(false);
  });
});
