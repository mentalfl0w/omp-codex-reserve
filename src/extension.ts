import { installOmpAdapter, type OmpAdapterOptions } from "./adapters/omp.ts";
import { detectHost } from "./adapters/detect-host.ts";
import { installPiAdapter, type PiAdapterOptions } from "./adapters/pi.ts";
import type { ExtensionApiLike, HostKind } from "./adapters/types.ts";
import { registerCommands } from "./commands/index.ts";
import { safeErrorMessage } from "./core/errors.ts";
import { ReserveState } from "./core/state.ts";
import type { FetchFn } from "./core/types.ts";

export interface ReserveExtensionOptions {
  fetchFn?: FetchFn;
}

function warn(api: ExtensionApiLike, message: string): void {
  api.logger?.warn?.(message);
}

export function installReserveExtension(
  apiValue: unknown,
  forcedHost?: HostKind,
  options: ReserveExtensionOptions = {},
): ReserveState {
  const api = apiValue as ExtensionApiLike;
  const host = forcedHost ?? detectHost(api);
  const state = new ReserveState();

  try {
    if (host === "omp") {
      const adapterOptions: OmpAdapterOptions = { fetchFn: options.fetchFn };
      installOmpAdapter(api, state, adapterOptions);
    } else {
      const adapterOptions: PiAdapterOptions = { fetchFn: options.fetchFn };
      installPiAdapter(api, state, adapterOptions);
    }
  } catch (error) {
    state.recordFailure(error);
    warn(api, `omp-codex-reserve: provider registration unavailable (${safeErrorMessage(error)})`);
  }

  try {
    registerCommands(api, state, host);
  } catch (error) {
    state.recordFailure(error);
    warn(api, `omp-codex-reserve: command registration unavailable (${safeErrorMessage(error)})`);
  }
  return state;
}
