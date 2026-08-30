import { extractChatGptAccountId } from "../core/account-id.ts";
import { safeErrorMessage } from "../core/errors.ts";
import {
  refreshCodexCatalog,
  reserveModelFromCatalog,
  reserveUnavailable,
} from "../core/reserve-refresh.ts";
import { isRecord } from "../core/guards.ts";
import { logRuntimeEvent, type RuntimeLoggerLike } from "../core/runtime-log.ts";
import type { CommonModelDefinition, FetchFn } from "../core/types.ts";
import {
  appendReserve,
  cloneModel,
  nativeCodexModels,
  RESERVE_MODEL_ID,
  type ModelRegistryReader,
} from "./reserve-only.ts";
import type { CommandContextLike, ExtensionApiLike } from "./types.ts";

export interface OmpAdapterOptions {
  fetchFn?: FetchFn;
  logger?: RuntimeLoggerLike;
}

function registryFrom(context: CommandContextLike): ModelRegistryReader | undefined {
  const registry = context.modelRegistry;
  const getAll = registry?.getAll;
  if (typeof getAll !== "function") return undefined;
  return { getAll: () => getAll.call(registry) ?? [] };
}

function nativeModelsFrom(context: CommandContextLike): CommonModelDefinition[] {
  const listed = context.models?.list;
  if (typeof listed === "function") {
    try {
      return nativeCodexModels({ getAll: () => listed.call(context.models) ?? [] });
    } catch {
      // Fall back to the registry facade when the live query is unavailable.
    }
  }
  const registry = registryFrom(context);
  return registry ? nativeCodexModels(registry) : [];
}

function cloneModels(models: readonly CommonModelDefinition[]): CommonModelDefinition[] {
  return models.map(cloneModel);
}

const EXTENDED_CONTEXT_WINDOW = 1_000_000;

interface OmpSettingsReader {
  get(path: string): unknown;
}

function isOmpSettingsReader(value: unknown): value is OmpSettingsReader {
  return isRecord(value) && typeof value.get === "function";
}

function ompExtendedContextEnabled(omp: ExtensionApiLike): boolean {
  if (!isRecord(omp.pi) || !isOmpSettingsReader(omp.pi.settings)) return false;
  try {
    return omp.pi.settings.get("extendedContext") === true;
  } catch {
    return false;
  }
}

function reserveForContextPolicy(
  model: CommonModelDefinition,
  extendedContextEnabled: boolean,
): CommonModelDefinition {
  const cloned = cloneModel(model);
  return extendedContextEnabled
    ? { ...cloned, contextWindow: EXTENDED_CONTEXT_WINDOW }
    : cloned;
}

class OmpCatalogOverlay {
  private nativeModels: CommonModelDefinition[] = [];
  private latestModels: CommonModelDefinition[] | undefined;
  private remoteReserveModel: CommonModelDefinition | undefined;

  constructor(
    private readonly fetchFn: FetchFn | undefined,
    private readonly logger: RuntimeLoggerLike | undefined,
    private readonly isExtendedContextEnabled: () => boolean,
  ) {}

  setNativeModels(models: readonly CommonModelDefinition[]): void {
    this.nativeModels = cloneModels(models);
    const reserve = this.effectiveReserveModel();
    if (reserve) {
      this.latestModels = appendReserve(this.nativeModels, reserve);
    } else if (this.nativeModels.length > 0) {
      this.latestModels = cloneModels(this.nativeModels);
    }
  }

  async fetchDynamicModels(apiKey: string | undefined): Promise<readonly CommonModelDefinition[]> {
    const accessToken = apiKey?.trim();
    if (!accessToken) return this.fallback("credential-unavailable");

    try {
      const result = await refreshCodexCatalog({
        host: "omp",
        accessToken,
        accountId: extractChatGptAccountId(accessToken),
        fetchFn: this.fetchFn,
        requireComplete: this.nativeModels.length === 0,
        logger: this.logger,
      });
      const remoteReserve = reserveModelFromCatalog(result.parsed);
      if (!remoteReserve) return this.fallback("reserve-not-advertised");

      this.remoteReserveModel = cloneModel(remoteReserve);
      const extendedContextEnabled = this.isExtendedContextEnabled();
      const reserve = reserveForContextPolicy(this.remoteReserveModel, extendedContextEnabled);
      logRuntimeEvent(this.logger, "refresh.context-policy", {
        host: "omp",
        extendedContextEnabled,
        reserveContextWindow: reserve.contextWindow,
      });
      const remoteNativeModels = result.parsed.models.filter((model) => model.id !== RESERVE_MODEL_ID);
      if (this.nativeModels.length > 0) {
        this.latestModels = appendReserve(this.nativeModels, reserve);
      } else {
        if (remoteNativeModels.length === 0) {
          throw reserveUnavailable("Codex response contained reserve without native models");
        }
        this.latestModels = appendReserve(remoteNativeModels, reserve);
      }
      return cloneModels(this.latestModels);
    } catch (error) {
      return this.fallbackOrThrow(error);
    }
  }

  private effectiveReserveModel(): CommonModelDefinition | undefined {
    if (!this.remoteReserveModel) return undefined;
    return reserveForContextPolicy(this.remoteReserveModel, this.isExtendedContextEnabled());
  }

  private fallback(reason: string): CommonModelDefinition[] {
    logRuntimeEvent(this.logger, "refresh.fallback", { host: "omp", reason });
    if (this.latestModels) return cloneModels(this.latestModels);
    if (this.nativeModels.length > 0) return cloneModels(this.nativeModels);
    throw reserveUnavailable();
  }

  private fallbackOrThrow(error: unknown): CommonModelDefinition[] {
    if (this.latestModels) {
      logRuntimeEvent(this.logger, "refresh.fallback", {
        host: "omp",
        reason: "last-successful-catalog",
        error: safeErrorMessage(error),
      });
      return cloneModels(this.latestModels);
    }
    if (this.nativeModels.length > 0) {
      logRuntimeEvent(this.logger, "refresh.fallback", {
        host: "omp",
        reason: "native-catalog",
        error: safeErrorMessage(error),
      });
      return cloneModels(this.nativeModels);
    }
    throw error;
  }
}

class OmpReserveAdapter {
  private readonly overlay: OmpCatalogOverlay;
  private readonly logger: RuntimeLoggerLike | undefined;
  private sessionRefresh: Promise<void> | undefined;

  constructor(
    private readonly omp: ExtensionApiLike,
    options: OmpAdapterOptions,
  ) {
    this.logger = options.logger ?? omp.logger;
    this.overlay = new OmpCatalogOverlay(
      options.fetchFn,
      this.logger,
      () => ompExtendedContextEnabled(this.omp),
    );
  }

  install(): void {
    this.registerDynamicSource();
    this.omp.on?.("session_start", (_event, context) => this.refreshSession(context));
  }

  private registerDynamicSource(): void {
    try {
      this.omp.registerProvider("openai-codex", {
        fetchDynamicModels: (apiKey) => this.overlay.fetchDynamicModels(apiKey),
      });
      logRuntimeEvent(this.logger, "provider.registered", {
        host: "omp",
        mode: "dynamic-complete-catalog",
      });
    } catch (error) {
      logRuntimeEvent(this.logger, "provider.registration-failed", {
        host: "omp",
        error: safeErrorMessage(error),
      });
      throw error;
    }
  }

  private refreshSession(context: CommandContextLike): Promise<void> {
    if (!this.sessionRefresh) {
      const refresh = this.runSessionRefresh(context).finally(() => {
        if (this.sessionRefresh === refresh) this.sessionRefresh = undefined;
      });
      this.sessionRefresh = refresh;
    }
    return this.sessionRefresh;
  }

  private async runSessionRefresh(context: CommandContextLike): Promise<void> {
    const registry = context.modelRegistry;
    try {
      registry?.refreshInBackground?.();
      await registry?.awaitBackgroundRefresh?.();
    } catch (error) {
      logRuntimeEvent(this.logger, "refresh.host-failed", {
        host: "omp",
        error: safeErrorMessage(error),
      });
    }

    const nativeModels = nativeModelsFrom(context);
    if (nativeModels.length === 0) {
      logRuntimeEvent(this.logger, "refresh.skipped", {
        host: "omp",
        reason: "native-catalog-unavailable",
      });
      return;
    }
    this.overlay.setNativeModels(nativeModels);

    const getApiKey = registry?.getApiKeyForProvider;
    const accessToken = typeof getApiKey === "function"
      ? (await getApiKey.call(registry, "openai-codex"))?.trim()
      : undefined;
    logRuntimeEvent(this.logger, "refresh.started", {
      host: "omp",
      credentialPresent: Boolean(accessToken),
      nativeModelCount: nativeModels.length,
    });
    if (!accessToken) {
      logRuntimeEvent(this.logger, "refresh.skipped", {
        host: "omp",
        reason: "credential-unavailable",
      });
      return;
    }

    const refreshRuntimeProviders = registry?.refreshRuntimeProviders;
    if (typeof refreshRuntimeProviders !== "function") {
      logRuntimeEvent(this.logger, "refresh.skipped", {
        host: "omp",
        reason: "runtime-refresh-unavailable",
      });
      return;
    }
    try {
      await refreshRuntimeProviders.call(registry, "online");
      logRuntimeEvent(this.logger, "refresh.applied", {
        host: "omp",
        nativeModelCount: nativeModels.length,
      });
    } catch (error) {
      logRuntimeEvent(this.logger, "refresh.failed", {
        host: "omp",
        error: safeErrorMessage(error),
      });
    }
  }
}

export function installOmpAdapter(
  omp: ExtensionApiLike,
  options: OmpAdapterOptions = {},
): void {
  new OmpReserveAdapter(omp, options).install();
}
