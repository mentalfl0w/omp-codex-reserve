import type { RuntimeLoggerLike } from "../core/runtime-log.ts";
import type { CommonModelDefinition } from "../core/types.ts";

export interface ModelRegistryLike {
  getAll?(): readonly CommonModelDefinition[];
  getProvider?(provider: string): unknown;
  getApiKeyForProvider?(provider: string): Promise<string | undefined>;
  refreshInBackground?(mode?: string): void;
  awaitBackgroundRefresh?(): Promise<void>;
  refreshRuntimeProviders?(mode?: string): Promise<void>;
  [key: string]: unknown;
}

export interface ModelQueryLike {
  list?(): readonly CommonModelDefinition[];
}

export interface CommandContextLike {
  modelRegistry?: ModelRegistryLike;
  models?: ModelQueryLike;
  [key: string]: unknown;
}

export interface PiProviderConfigLike {
  models?: readonly CommonModelDefinition[];
  fetchDynamicModels?(apiKey: string | undefined): Promise<readonly CommonModelDefinition[]>;
  [key: string]: unknown;
}

export interface ExtensionApiLike {
  pi?: unknown;
  registerProvider(provider: unknown): void;
  registerProvider(name: string, config: PiProviderConfigLike): void;
  on?(event: "session_start", handler: (event: unknown, context: CommandContextLike) => void | Promise<void>): void;
  logger?: RuntimeLoggerLike;
  [key: string]: unknown;
}

export type HostKind = "pi" | "omp";
