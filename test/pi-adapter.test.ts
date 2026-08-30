import { describe, expect, test } from "bun:test";
import { installPiAdapter } from "../src/adapters/pi.ts";
import { isPiNativeProvider } from "../src/adapters/pi-native-provider.ts";
import type { CommandContextLike, ExtensionApiLike } from "../src/adapters/types.ts";
import type { CommonModelDefinition, FetchFn } from "../src/core/types.ts";
import { reserveModel } from "./fixtures.ts";

const nativeModel: CommonModelDefinition = {
  id: "gpt-5.6-terra",
  name: "Native GPT-5.6 Terra",
  api: "openai-codex-responses",
  provider: "openai-codex",
  baseUrl: "https://chatgpt.com/backend-api/codex",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 13, output: 17, cacheRead: 19, cacheWrite: 23 },
  contextWindow: 1_000_000,
  maxTokens: 128_000,
  supportsTools: true,
  preferWebsockets: true,
  priority: 99,
};

describe("Pi adapter", () => {
  test("wraps the native provider and appends only gpt-reserve", async () => {
    let registered: unknown;
    let sessionStart: ((event: unknown, context: CommandContextLike) => void | Promise<void>) | undefined;
    const nativeProvider = {
      id: "openai-codex",
      auth: { oauth: { name: "OpenAI Codex" } },
      getModels: () => [nativeModel],
      stream: () => "native-stream",
      streamSimple: () => "native-simple-stream",
    };
    const api: ExtensionApiLike = {
      registerProvider: (provider: unknown) => { registered = provider; },
      on: (_event, handler) => { sessionStart = handler; },
    };
    const fetchFn: FetchFn = async () => new Response(JSON.stringify({ models: [reserveModel()] }), { status: 200 });

    installPiAdapter(api, { fetchFn });
    await sessionStart!({}, {
      modelRegistry: {
        getProvider: () => nativeProvider,
        getApiKeyForProvider: async () => "access-token",
      },
    });

    expect(isPiNativeProvider(registered)).toBe(true);
    if (!isPiNativeProvider(registered)) throw new Error("native wrapper was not registered");
    expect(registered.getModels()[0]).toEqual(nativeModel);
    expect(registered.getModels()[1]).toMatchObject({ id: "gpt-reserve", contextWindow: 987654, maxTokens: 77777 });
    expect(registered.stream).toBe(nativeProvider.stream);
    expect(registered.streamSimple).toBe(nativeProvider.streamSimple);
    expect(registered.auth).toBe(nativeProvider.auth);
  });

  test("reads future native models through the wrapper", async () => {
    let registered: unknown;
    let currentModels: readonly CommonModelDefinition[] = [nativeModel];
    let sessionStart: ((event: unknown, context: CommandContextLike) => void | Promise<void>) | undefined;
    const nativeProvider = {
      getModels: () => currentModels,
      stream: () => "native-stream",
    };
    const api: ExtensionApiLike = {
      registerProvider: (provider: unknown) => { registered = provider; },
      on: (_event, handler) => { sessionStart = handler; },
    };
    const fetchFn: FetchFn = async () => new Response(JSON.stringify({ models: [reserveModel()] }), { status: 200 });

    installPiAdapter(api, { fetchFn });
    await sessionStart!({}, {
      modelRegistry: {
        getProvider: () => nativeProvider,
        getApiKeyForProvider: async () => "access-token",
      },
    });

    if (!isPiNativeProvider(registered)) throw new Error("native wrapper was not registered");
    currentModels = [{
      ...nativeModel,
      id: "gpt-5.6-new",
    }];
    expect(registered.getModels().map((model) => model.id)).toEqual(["gpt-5.6-new", "gpt-reserve"]);
  });
});
