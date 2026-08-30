import { fetchCodexCatalog } from "./catalog-client.ts";
import { parseCodexCatalog } from "./catalog-parser.ts";
import { CatalogUnavailableError, safeErrorMessage } from "./errors.ts";
import { logRuntimeEvent, type RuntimeLoggerLike } from "./runtime-log.ts";
import { RESERVE_MODEL_ID, type CatalogFetchRequest, type CommonModelDefinition, type FetchFn, type ParsedCodexCatalog } from "./types.ts";

export interface ReserveRefreshOptions {
  host: "omp" | "pi";
  accessToken: string;
  accountId?: string;
  signal?: AbortSignal;
  fetchFn?: FetchFn;
  requireComplete?: boolean;
  logger?: RuntimeLoggerLike;
}

export interface RefreshedCodexCatalog {
  parsed: ParsedCodexCatalog;
  responseStatus: number;
}

export function reserveModelFromCatalog(parsed: ParsedCodexCatalog): CommonModelDefinition | undefined {
  return parsed.models.find((model) => model.id === RESERVE_MODEL_ID);
}

/** Fetch and validate a Codex catalog, retaining all accepted remote rows. */
export async function refreshCodexCatalog(
  options: ReserveRefreshOptions,
): Promise<RefreshedCodexCatalog> {
  try {
    const request: CatalogFetchRequest = {
      accessToken: options.accessToken,
      ...(options.accountId ? { accountId: options.accountId } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      fetchFn: options.fetchFn,
    };
    const result = await fetchCodexCatalog(request);
    const parsed = parseCodexCatalog(result.catalog, { requireComplete: options.requireComplete });
    const endpoint = new URL(result.catalog.endpoint).pathname;
    logRuntimeEvent(options.logger, "refresh.succeeded", {
      host: options.host,
      endpoint,
      responseStatus: result.responseStatus,
      remoteModelCount: result.catalog.models.length,
      acceptedModelCount: parsed.models.length,
      reserveDetected: Boolean(parsed.reserve),
    });
    if (!parsed.reserve) {
      logRuntimeEvent(options.logger, "refresh.skipped", {
        host: options.host,
        reason: "reserve-not-advertised",
      });
    }
    return { parsed, responseStatus: result.responseStatus };
  } catch (error) {
    logRuntimeEvent(options.logger, "refresh.failed", {
      host: options.host,
      error: safeErrorMessage(error),
    });
    options.logger?.warn?.(`omp-codex-reserve: refresh unavailable (${safeErrorMessage(error)})`);
    throw error;
  }
}

export function reserveUnavailable(message = "gpt-reserve is not available in the current Codex catalog"): CatalogUnavailableError {
  return new CatalogUnavailableError(message);
}
