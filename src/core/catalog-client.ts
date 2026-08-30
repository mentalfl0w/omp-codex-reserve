import { CodexCatalogError } from "./errors.ts";
import { isRecord } from "./guards.ts";
import {
  CODEX_BASE_URL,
  CODEX_CLIENT_VERSION,
  CODEX_MODEL_PATHS,
  type CatalogFetchRequest,
  type CatalogFetchResult,
  type RemoteCodexCatalog,
} from "./types.ts";

const OPENAI_BETA = "OpenAI-Beta";
const ACCOUNT_ID_HEADER = "chatgpt-account-id";
const ORIGINATOR_HEADER = "originator";
const VERSION_HEADER = "version";
const ACCEPT_HEADER = "accept";
const BETA_RESPONSES = "responses=experimental";
const ORIGINATOR_CODEX = "pi";

function catalogRows(payload: unknown): readonly unknown[] | undefined {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return undefined;
  if (Array.isArray(payload.models)) return payload.models;
  if (Array.isArray(payload.data)) return payload.data;
  return undefined;
}


function endpointUrl(baseUrl: string, path: string, clientVersion: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);
  url.searchParams.set("client_version", clientVersion);
  return url.toString();
}

function requestHeaders(accessToken: string, accountId: string | undefined, clientVersion: string): Headers {
  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
    [OPENAI_BETA]: BETA_RESPONSES,
    [ORIGINATOR_HEADER]: ORIGINATOR_CODEX,
    [VERSION_HEADER]: clientVersion,
    [ACCEPT_HEADER]: "application/json",
  });
  if (accountId) headers.set(ACCOUNT_ID_HEADER, accountId);
  return headers;
}

/** Fetch the current Codex catalog using the same wire contract as the host. */
export async function fetchCodexCatalog(request: CatalogFetchRequest): Promise<CatalogFetchResult> {
  const accessToken = request.accessToken.trim();
  if (!accessToken) throw new CodexCatalogError("Codex access token is unavailable");

  const baseUrl = request.baseUrl ?? CODEX_BASE_URL;
  const clientVersion = request.clientVersion ?? CODEX_CLIENT_VERSION;
  const paths = request.paths ?? CODEX_MODEL_PATHS;
  const fetchFn = request.fetchFn ?? globalThis.fetch;
  let lastStatus: number | undefined;
  let lastEndpoint: string | undefined;

  for (const path of paths) {
    const endpoint = endpointUrl(baseUrl, path, clientVersion);
    lastEndpoint = endpoint;
    try {
      const response = await fetchFn(endpoint, {
        method: "GET",
        headers: requestHeaders(accessToken, request.accountId, clientVersion),
        signal: request.signal,
      });
      lastStatus = response.status;
      if (!response.ok) continue;

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        continue;
      }
      const models = catalogRows(payload);
      if (!models) continue;

      const catalog: RemoteCodexCatalog = {
        models,
        endpoint,
        baseUrl,
        fetchedAt: Date.now(),
        etag: response.headers.get("etag") ?? undefined,
      };
      return { catalog, responseStatus: response.status };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof Error && error.name === "AbortError") throw error;
    }
  }

  const status = lastStatus === undefined ? "network error" : `HTTP ${lastStatus}`;
  throw new CodexCatalogError(`Codex catalog unavailable (${status})`, {
    status: lastStatus,
    endpoint: lastEndpoint,
  });
}
