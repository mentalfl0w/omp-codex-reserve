import type { RuntimeLoggerLike } from "../core/runtime-log.ts";
import type { CommonModelDefinition, JsonRecord } from "../core/types.ts";

export interface UiLike {
  notify?(message: string, type?: "info" | "warning" | "error"): void;
  select?(title: string, options: readonly string[]): Promise<string | undefined>;
}

export interface ModelRegistryLike {
  getAll?(): readonly CommonModelDefinition[];
  getProvider?(provider: string): unknown;
  getApiKeyForProvider?(provider: string): Promise<string | undefined>;
  [key: string]: unknown;
}

export interface CommandContextLike {
  ui?: UiLike;
  modelRegistry?: ModelRegistryLike;
  [key: string]: unknown;
}
export interface PiProviderConfigLike {
  models?: readonly CommonModelDefinition[];
  fetchDynamicModels?(apiKey: string | undefined): Promise<readonly CommonModelDefinition[]>;
  [key: string]: unknown;
}

export interface RegisterCommandOptionsLike {
  description?: string;
  handler(args: string, context: CommandContextLike): void | Promise<void>;
}

export interface ExtensionApiLike {
  pi?: unknown;
  registerProvider(provider: unknown): void;
  registerProvider(name: string, config: PiProviderConfigLike): void;
  registerCommand(name: string, options: RegisterCommandOptionsLike): void;
  on?(event: "session_start", handler: (event: unknown, context: CommandContextLike) => void | Promise<void>): void;
  logger?: RuntimeLoggerLike;
  [key: string]: unknown;
}

export type HostKind = "pi" | "omp";
