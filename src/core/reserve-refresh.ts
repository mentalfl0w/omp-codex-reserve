import { fetchCodexCatalog } from "./catalog-client.ts";
import { parseCodexCatalog } from "./catalog-parser.ts";
import { safeErrorMessage } from "./errors.ts";
import { logRuntimeEvent, type RuntimeLoggerLike } from "./runtime-log.ts";
import { ReserveState } from "./state.ts";
import type { CatalogFetchRequest, CommonModelDefinition, FetchFn } from "./types.ts";

export interface ReserveRefreshOptions {
  host: "omp" | "pi";
  accessToken: string;
  accountId?: string;
  fetchFn?: FetchFn;
  state: ReserveState;
  logger?: RuntimeLoggerLike;
}

/** Fetch, validate, and retain only the remotely advertised reserve model. */
export async function refreshReserve(
  options: ReserveRefreshOptions,
): Promise<CommonModelDefinition | undefined> {
  try {
    const request: CatalogFetchRequest = {
      accessToken: options.accessToken,
      ...(options.accountId ? { accountId: options.accountId } : {}),
      fetchFn: options.fetchFn,
    };
    const result = await fetchCodexCatalog(request);
    const parsed = parseCodexCatalog(result.catalog);
    const changes = options.state.apply(parsed);
    const reserve = parsed.models.find((model) => model.id === "gpt-reserve");
    if (!reserve) {
      logRuntimeEvent(options.logger, "refresh.skipped", { host: options.host, reason: "reserve-not-advertised" });
      return undefined;
    }
    logRuntimeEvent(options.logger, "refresh.succeeded", {
      host: options.host,
      endpoint: new URL(result.catalog.endpoint).pathname,
      responseStatus: result.responseStatus,
      remoteModelCount: result.catalog.models.length,
      reserveDetected: true,
      changedFields: changes.map((change) => change.field),
    });
    return reserve;
  } catch (error) {
    options.state.recordFailure(error);
    logRuntimeEvent(options.logger, "refresh.failed", { host: options.host, error: safeErrorMessage(error) });
    options.logger?.warn?.(`omp-codex-reserve: refresh unavailable (${safeErrorMessage(error)})`);
    return undefined;
  }
}
