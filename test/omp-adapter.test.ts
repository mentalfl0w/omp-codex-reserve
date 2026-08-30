import { describe, expect, test } from "bun:test";
import { installOmpAdapter } from "../src/adapters/omp.ts";
import type { CommandContextLike, ExtensionApiLike, PiProviderConfigLike } from "../src/adapters/types.ts";
import type { CommonModelDefinition, FetchFn } from "../src/core/types.ts";
import { catalog, reserveModel, visibleModel } from "./fixtures.ts";

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

type SessionHandler = (event: unknown, context: CommandContextLike) => void | Promise<void>;

function apiFor(
  onRegister: (config: PiProviderConfigLike) => void,
  onSession: (handler: SessionHandler) => void,
): ExtensionApiLike {
  return {
    registerProvider: (_provider: unknown, config?: PiProviderConfigLike) => {
      if (config) onRegister(config);
    },
    on: (_event, handler) => onSession(handler),
  };
}
describe("OMP adapter", () => {
  test("registers a dynamic source at load and returns a complete remote catalog", async () => {
    let providerConfig: PiProviderConfigLike | undefined;
    const api = apiFor((config) => { providerConfig = config; }, () => undefined);
    const fetchFn: FetchFn = async () =>
      new Response(JSON.stringify(catalog([visibleModel(), reserveModel()])), { status: 200 });

    installOmpAdapter(api, { fetchFn });

    expect(providerConfig?.models).toBeUndefined();
    const models = await providerConfig!.fetchDynamicModels!("resolved-access-token");
    expect(models.map((model) => model.id)).toEqual(["gpt-visible", "gpt-reserve"]);
    expect(models[1]?.contextWindow).toBe(987654);
  });


  test("opens gpt-reserve to one million tokens when OMP extendedContext is enabled", async () => {
    let providerConfig: PiProviderConfigLike | undefined;
    const api = apiFor((config) => { providerConfig = config; }, () => undefined);
    api.pi = {
      settings: {
        get: (path: string) => path === "extendedContext",
      },
    };
    const fetchFn: FetchFn = async () =>
      new Response(JSON.stringify(catalog([visibleModel(), reserveModel()])), { status: 200 });

    installOmpAdapter(api, { fetchFn });

    const models = await providerConfig!.fetchDynamicModels!("resolved-access-token");
    expect(models.find((model) => model.id === "gpt-reserve")?.contextWindow).toBe(1_000_000);
  });

  test("uses the refreshed native snapshot and appends only gpt-reserve", async () => {
    let providerConfig: PiProviderConfigLike | undefined;
    let sessionStart: SessionHandler | undefined;
    let runtimeModels: readonly CommonModelDefinition[] = [];
    let hostRefreshStarted = false;
    let hostRefreshAwaited = false;
    let runtimeRefreshes = 0;
    const api = apiFor(
      (config) => { providerConfig = config; },
      (handler) => { sessionStart = handler; },
    );
    const fetchFn: FetchFn = async () =>
      new Response(JSON.stringify(catalog([visibleModel({ context_window: 272000 }), reserveModel()])), { status: 200 });
    const context = {
      models: { list: () => [nativeModel] },
      modelRegistry: {
        getAll: () => [],
        getApiKeyForProvider: async () => "resolved-access-token",
        refreshInBackground: () => { hostRefreshStarted = true; },
        awaitBackgroundRefresh: async () => { hostRefreshAwaited = true; },
        refreshRuntimeProviders: async () => {
          runtimeRefreshes++;
          runtimeModels = await providerConfig!.fetchDynamicModels!("resolved-access-token");
        },
      },
    };

    installOmpAdapter(api, { fetchFn });
    await sessionStart!({}, context);

    expect(hostRefreshStarted).toBe(true);
    expect(hostRefreshAwaited).toBe(true);
    expect(runtimeRefreshes).toBe(1);
    expect(runtimeModels[0]).toEqual(nativeModel);
    expect(runtimeModels[1]).toMatchObject({ id: "gpt-reserve", contextWindow: 987654, maxTokens: 77777 });
  });

  test("keeps the native snapshot when refresh fails", async () => {
    let providerConfig: PiProviderConfigLike | undefined;
    let sessionStart: SessionHandler | undefined;
    let runtimeModels: readonly CommonModelDefinition[] = [];
    const api = apiFor(
      (config) => { providerConfig = config; },
      (handler) => { sessionStart = handler; },
    );
    const fetchFn: FetchFn = async () => new Response("unavailable", { status: 503 });
    const context = {
      models: { list: () => [nativeModel] },
      modelRegistry: {
        getApiKeyForProvider: async () => "resolved-access-token",
        refreshRuntimeProviders: async () => {
          runtimeModels = await providerConfig!.fetchDynamicModels!("resolved-access-token");
        },
      },
    };

    installOmpAdapter(api, { fetchFn });
    await sessionStart!({}, context);

    expect(runtimeModels).toEqual([nativeModel]);
  });
});
