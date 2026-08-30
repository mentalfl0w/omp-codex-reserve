import { installOmpAdapter, type OmpAdapterOptions } from "./adapters/omp.ts";
import { detectHost } from "./adapters/detect-host.ts";
import { installPiAdapter, type PiAdapterOptions } from "./adapters/pi.ts";
import type { ExtensionApiLike, HostKind } from "./adapters/types.ts";
import { safeErrorMessage } from "./core/errors.ts";
import { createReserveLogger } from "./core/logger.ts";
import type { RuntimeLoggerLike } from "./core/runtime-log.ts";
import type { FetchFn } from "./core/types.ts";

export interface ReserveExtensionOptions {
  fetchFn?: FetchFn;
  logger?: RuntimeLoggerLike;
}

/** Install only the model-discovery adapter; the host owns commands and state. */
export function installReserveExtension(
  apiValue: unknown,
  forcedHost?: HostKind,
  options: ReserveExtensionOptions = {},
): void {
  const api = apiValue as ExtensionApiLike;
  const host = forcedHost ?? detectHost(api);
  const logger = options.logger ? options.logger : createReserveLogger(api.logger);

  try {
    if (host === "omp") {
      const adapterOptions: OmpAdapterOptions = { fetchFn: options.fetchFn, logger };
      installOmpAdapter(api, adapterOptions);
    } else {
      const adapterOptions: PiAdapterOptions = { fetchFn: options.fetchFn, logger };
      installPiAdapter(api, adapterOptions);
    }
  } catch (error) {
    logger.warn?.(`omp-codex-reserve: provider registration unavailable (${safeErrorMessage(error)})`);
  }
}
