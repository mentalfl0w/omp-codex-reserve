import { extractChatGptAccountId } from "../core/account-id.ts";
import { safeErrorMessage } from "../core/errors.ts";
import { refreshCodexCatalog, reserveModelFromCatalog, type RefreshedCodexCatalog } from "../core/reserve-refresh.ts";
import { logRuntimeEvent, type RuntimeLoggerLike } from "../core/runtime-log.ts";
import type { FetchFn } from "../core/types.ts";
import { isPiNativeProvider, wrapPiProviderWithReserve } from "./pi-native-provider.ts";
import type { CommandContextLike, ExtensionApiLike } from "./types.ts";

export interface PiAdapterOptions {
  fetchFn?: FetchFn;
  logger?: RuntimeLoggerLike;
}

function nativeProviderFrom(context: CommandContextLike) {
  const provider = context.modelRegistry?.getProvider?.("openai-codex");
  return isPiNativeProvider(provider) ? provider : undefined;
}

class PiReserveAdapter {
  private readonly logger: RuntimeLoggerLike | undefined;
  private sessionRefresh: Promise<void> | undefined;

  constructor(
    private readonly pi: ExtensionApiLike,
    private readonly options: PiAdapterOptions,
  ) {
    this.logger = options.logger ?? pi.logger;
  }

  install(): void {
    this.pi.on?.("session_start", (_event, context) => this.refreshSession(context));
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
    const base = nativeProviderFrom(context);
    if (!base) {
      logRuntimeEvent(this.logger, "refresh.skipped", {
        host: "pi",
        reason: "native-provider-unavailable",
      });
      return;
    }

    const registry = context.modelRegistry;
    const getApiKey = registry?.getApiKeyForProvider;
    const accessToken = typeof getApiKey === "function"
      ? (await getApiKey.call(registry, "openai-codex"))?.trim()
      : undefined;
    logRuntimeEvent(this.logger, "refresh.started", {
      host: "pi",
      credentialPresent: Boolean(accessToken),
      nativeModelCount: base.getModels().length,
    });
    if (!accessToken) {
      logRuntimeEvent(this.logger, "refresh.skipped", {
        host: "pi",
        reason: "credential-unavailable",
      });
      return;
    }

    let parsed: RefreshedCodexCatalog;
    try {
      parsed = await refreshCodexCatalog({
        host: "pi",
        accessToken,
        accountId: extractChatGptAccountId(accessToken),
        fetchFn: this.options.fetchFn,
        logger: this.logger,
      });
    } catch (error) {
      logRuntimeEvent(this.logger, "refresh.skipped", {
        host: "pi",
        reason: "catalog-unavailable",
        error: safeErrorMessage(error),
      });
      return;
    }
    const reserve = reserveModelFromCatalog(parsed.parsed);
    if (!reserve) {
      logRuntimeEvent(this.logger, "refresh.skipped", {
        host: "pi",
        reason: "reserve-not-advertised",
      });
      return;
    }

    this.pi.registerProvider(wrapPiProviderWithReserve(base, reserve));
    logRuntimeEvent(this.logger, "refresh.applied", {
      host: "pi",
      nativeModelCount: base.getModels().filter((model) => model.id !== "gpt-reserve").length,
    });
  }
}

export function installPiAdapter(
  pi: ExtensionApiLike,
  options: PiAdapterOptions = {},
): void {
  new PiReserveAdapter(pi, options).install();
}
