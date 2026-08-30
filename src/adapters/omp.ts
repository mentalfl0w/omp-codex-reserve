import { extractChatGptAccountId } from "../core/account-id.ts";
import { CatalogUnavailableError } from "../core/errors.ts";
import { refreshReserve } from "../core/reserve-refresh.ts";
import { logRuntimeEvent } from "../core/runtime-log.ts";
import { ReserveState } from "../core/state.ts";
import type { FetchFn } from "../core/types.ts";
import { appendReserve, nativeCodexModels, type ModelRegistryReader } from "./reserve-only.ts";
import type { CommandContextLike, ExtensionApiLike } from "./types.ts";

export interface OmpAdapterOptions {
  fetchFn?: FetchFn;
}

function registryFrom(context: CommandContextLike): ModelRegistryReader | undefined {
  const registry = context.modelRegistry;
  const getAll = registry?.getAll;
  if (typeof getAll !== "function") return undefined;
  return { getAll: () => getAll.call(registry) };
}

export function installOmpAdapter(
  omp: ExtensionApiLike,
  state: ReserveState,
  options: OmpAdapterOptions = {},
): void {
  omp.on?.("session_start", async (_event, context) => {
    const registry = registryFrom(context);
    const nativeModels = registry ? nativeCodexModels(registry) : [];
    if (!registry || nativeModels.length === 0) {
      logRuntimeEvent(omp.logger, "refresh.skipped", { host: "omp", reason: "native-catalog-unavailable" });
      return;
    }

    const accessToken = (await context.modelRegistry?.getApiKeyForProvider?.("openai-codex"))?.trim();
    logRuntimeEvent(omp.logger, "refresh.started", { host: "omp", credentialPresent: Boolean(accessToken) });
    if (!accessToken) {
      const error = new CatalogUnavailableError("OpenAI Codex OAuth credential is unavailable");
      state.recordFailure(error);
      logRuntimeEvent(omp.logger, "refresh.skipped", { host: "omp", reason: "credential-unavailable" });
      return;
    }
    const initialReserve = await refreshReserve({
      host: "omp",
      accessToken,
      accountId: extractChatGptAccountId(accessToken),
      fetchFn: options.fetchFn,
      state,
      logger: omp.logger,
    });
    if (!initialReserve) return;

    let latestCatalog = appendReserve(nativeModels, initialReserve);
    omp.registerProvider("openai-codex", {
      models: latestCatalog,
      fetchDynamicModels: async (apiKey) => {
        const reserve = await refreshReserve({
          host: "omp",
          accessToken: apiKey?.trim() || accessToken,
          accountId: extractChatGptAccountId(apiKey?.trim() || accessToken),
          fetchFn: options.fetchFn,
          state,
          logger: omp.logger,
        });
        if (reserve) latestCatalog = appendReserve(nativeModels, reserve);
        return latestCatalog;
      },
    });
  });
}
