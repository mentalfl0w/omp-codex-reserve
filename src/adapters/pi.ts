import { credentialAccountId } from "../core/account-id.ts";
import { CatalogUnavailableError } from "../core/errors.ts";
import { refreshReserve } from "../core/reserve-refresh.ts";
import { logRuntimeEvent } from "../core/runtime-log.ts";
import { ReserveState } from "../core/state.ts";
import type { FetchFn } from "../core/types.ts";
import { isPiNativeProvider, wrapPiProviderWithReserve } from "./pi-native-provider.ts";
import type { CommandContextLike, ExtensionApiLike } from "./types.ts";

export interface PiAdapterOptions {
  fetchFn?: FetchFn;
}

function nativeProviderFrom(context: CommandContextLike) {
  const provider = context.modelRegistry?.getProvider?.("openai-codex");
  return isPiNativeProvider(provider) ? provider : undefined;
}

export function installPiAdapter(
  pi: ExtensionApiLike,
  state: ReserveState,
  options: PiAdapterOptions = {},
): void {
  pi.on?.("session_start", async (_event, context) => {
    const base = nativeProviderFrom(context);
    if (!base) {
      logRuntimeEvent(pi.logger, "refresh.skipped", { host: "pi", reason: "native-provider-unavailable" });
      return;
    }

    const accessToken = (await context.modelRegistry?.getApiKeyForProvider?.("openai-codex"))?.trim();
    logRuntimeEvent(pi.logger, "refresh.started", { host: "pi", credentialPresent: Boolean(accessToken) });
    if (!accessToken) {
      const error = new CatalogUnavailableError("OpenAI Codex OAuth credential is unavailable");
      state.recordFailure(error);
      logRuntimeEvent(pi.logger, "refresh.skipped", { host: "pi", reason: "credential-unavailable" });
      return;
    }

    const reserve = await refreshReserve({
      host: "pi",
      accessToken,
      accountId: credentialAccountId({ access: accessToken }),
      fetchFn: options.fetchFn,
      state,
      logger: pi.logger,
    });
    if (!reserve) return;

    pi.registerProvider(wrapPiProviderWithReserve(base, reserve));
    logRuntimeEvent(pi.logger, "refresh.applied", {
      host: "pi",
      nativeModelCount: base.getModels().length,
    });
  });
}
