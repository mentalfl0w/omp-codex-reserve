export const CODEX_PROVIDER_ID = "openai-codex" as const;
export const CODEX_API = "openai-codex-responses" as const;
export const CODEX_BASE_URL = "https://chatgpt.com/backend-api" as const;
export const CODEX_CLIENT_VERSION = "0.144.1" as const;
export const CODEX_MODEL_PATHS = ["/codex/models", "/models"] as const;
export const RESERVE_MODEL_ID = "gpt-reserve" as const;

export type JsonRecord = Record<string, unknown>;
export type ModelInput = "text" | "image";

export interface ModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ThinkingConfig {
  mode: "effort";
  efforts: readonly string[];
  defaultLevel?: string;
  effortMap?: Readonly<Record<string, string>>;
}

/** A host-neutral model definition accepted by both Pi and OMP. */
export interface CommonModelDefinition {
  id: string;
  name: string;
  api: typeof CODEX_API;
  provider: typeof CODEX_PROVIDER_ID;
  baseUrl: string;
  reasoning: boolean;
  input: readonly ModelInput[];
  cost: ModelCost;
  contextWindow: number;
  /** Optional: current Codex catalog omits a separate output-token limit. */
  maxTokens?: number;
  supportsTools?: boolean;
  toolMode?: string;
  preferWebsockets?: boolean;
  useResponsesLite?: boolean;
  remoteCompaction?: JsonRecord;
  requestModelId?: string;
  compat?: JsonRecord;
  priority?: number;
  thinking?: ThinkingConfig;
  thinkingLevelMap?: Readonly<Record<string, string>>;
}

/** Metadata retained from the Codex response for status/info/diff output. */
export interface RemoteCodexModel {
  id: string;
  name?: string;
  visibility?: string;
  contextWindow?: number;
  maxTokens?: number;
  input?: readonly ModelInput[];
  reasoning?: boolean;
  defaultReasoningLevel?: string;
  reasoningLevels?: readonly string[];
  supportsTools?: boolean;
  toolMode?: string;
  preferWebsockets?: boolean;
  useResponsesLite?: boolean;
  remoteCompaction?: JsonRecord;
  compat?: JsonRecord;
  requestModelId?: string;
  priority?: number;
  cost?: ModelCost;
}

export interface RemoteCodexCatalog {
  models: readonly unknown[];
  endpoint: string;
  baseUrl: string;
  fetchedAt: number;
  etag?: string;
}

export interface ParsedCodexModel {
  remote: RemoteCodexModel;
  model: CommonModelDefinition;
}

export interface ParsedCodexCatalog {
  models: readonly CommonModelDefinition[];
  remoteModels: readonly RemoteCodexModel[];
  reserve?: RemoteCodexModel;
  endpoint: string;
  baseUrl: string;
  fetchedAt: number;
}

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CatalogFetchRequest {
  accessToken: string;
  accountId?: string;
  signal?: AbortSignal;
  fetchFn?: FetchFn;
  baseUrl?: string;
  clientVersion?: string;
  paths?: readonly string[];
}

export interface CatalogFetchResult {
  catalog: RemoteCodexCatalog;
  responseStatus: number;
}
