import { diffReserveMetadata } from "./metadata-diff.ts";
import { isRecord } from "./guards.ts";
import { safeErrorMessage } from "./errors.ts";
import {
  CODEX_API,
  CODEX_PROVIDER_ID,
  RESERVE_MODEL_ID,
  type CommonModelDefinition,
  type MetadataChange,
  type ModelCost,
  type ModelInput,
  type ParsedCodexCatalog,
  type RemoteCodexModel,
  type ReserveStatus,
} from "./types.ts";

function cloneRemote(model: RemoteCodexModel | undefined): RemoteCodexModel | undefined {
  if (!model) return undefined;
  return {
    ...model,
    ...(model.input ? { input: [...model.input] } : {}),
    ...(model.reasoningLevels ? { reasoningLevels: [...model.reasoningLevels] } : {}),
    ...(model.remoteCompaction ? { remoteCompaction: { ...model.remoteCompaction } } : {}),
    ...(model.compat ? { compat: { ...model.compat } } : {}),
    ...(model.cost ? { cost: { ...model.cost } } : {}),
  };
}

function cloneModel(model: CommonModelDefinition): CommonModelDefinition {
  return {
    ...model,
    input: [...model.input],
    cost: { ...model.cost },
    ...(model.remoteCompaction ? { remoteCompaction: { ...model.remoteCompaction } } : {}),
    ...(model.compat ? { compat: { ...model.compat } } : {}),
    ...(model.thinking
      ? {
          thinking: {
            ...model.thinking,
            efforts: [...model.thinking.efforts],
            ...(model.thinking.effortMap ? { effortMap: { ...model.thinking.effortMap } } : {}),
          },
        }
      : {}),
    ...(model.thinkingLevelMap ? { thinkingLevelMap: { ...model.thinkingLevelMap } } : {}),
  };
}

function cachedInput(value: unknown): readonly ModelInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const input: ModelInput[] = [];
  for (const item of value) {
    if (item !== "text" && item !== "image") return undefined;
    if (!input.includes(item)) input.push(item);
  }
  return input.length > 0 ? input : undefined;
}

function cachedCost(value: unknown): ModelCost | undefined {
  if (!isRecord(value)) return undefined;
  const values = [value.input, value.output, value.cacheRead, value.cacheWrite];
  if (!values.every((item) => typeof item === "number" && Number.isFinite(item))) return undefined;
  return {
    input: values[0] as number,
    output: values[1] as number,
    cacheRead: values[2] as number,
    cacheWrite: values[3] as number,
  };
}

function cachedModel(value: unknown): CommonModelDefinition | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" ? value.id : undefined;
  const provider = value.provider;
  const api = value.api;
  const baseUrl = typeof value.baseUrl === "string" ? value.baseUrl : undefined;
  const name = typeof value.name === "string" ? value.name : id;
  const reasoning = typeof value.reasoning === "boolean" ? value.reasoning : undefined;
  const input = cachedInput(value.input);
  const cost = cachedCost(value.cost);
  const contextWindow = value.contextWindow;
  const maxTokens = value.maxTokens;
  const validMaxTokens =
    maxTokens === undefined || (typeof maxTokens === "number" && Number.isFinite(maxTokens));
  if (
    !id ||
    provider !== CODEX_PROVIDER_ID ||
    api !== CODEX_API ||
    !baseUrl ||
    !name ||
    reasoning === undefined ||
    !input ||
    !cost ||
    typeof contextWindow !== "number" ||
    !Number.isFinite(contextWindow) ||
    !validMaxTokens
  ) {
    return undefined;
  }

  const model: CommonModelDefinition = {
    id,
    name,
    api: CODEX_API,
    provider: CODEX_PROVIDER_ID,
    baseUrl,
    reasoning,
    input,
    cost,
    contextWindow,
    ...(typeof maxTokens === "number" ? { maxTokens } : {}),
  };
  const optionalBooleanFields = ["supportsTools", "preferWebsockets", "useResponsesLite"] as const;
  for (const field of optionalBooleanFields) {
    if (typeof value[field] === "boolean") model[field] = value[field];
  }
  if (typeof value.toolMode === "string") model.toolMode = value.toolMode;
  if (typeof value.requestModelId === "string") model.requestModelId = value.requestModelId;
  if (typeof value.priority === "number" && Number.isFinite(value.priority)) model.priority = value.priority;
  if (isRecord(value.remoteCompaction)) model.remoteCompaction = { ...value.remoteCompaction };
  if (isRecord(value.compat)) model.compat = { ...value.compat };
  return model;
}

export class ReserveState {
  private catalog: CommonModelDefinition[] = [];
  private remoteModels: RemoteCodexModel[] = [];
  private reserve: RemoteCodexModel | undefined;
  private metadataSource: ReserveStatus["metadataSource"] = "unknown";
  private lastRefreshAt: number | undefined;
  private lastError: string | undefined;
  private changes: MetadataChange[] = [];

  apply(parsed: ParsedCodexCatalog): readonly MetadataChange[] {
    this.changes = diffReserveMetadata(this.reserve, parsed.reserve);
    this.catalog = parsed.models.map(cloneModel);
    this.remoteModels = parsed.remoteModels.map((model) => cloneRemote(model) as RemoteCodexModel);
    this.reserve = cloneRemote(parsed.reserve);
    this.metadataSource = "remote";
    this.lastRefreshAt = parsed.fetchedAt;
    this.lastError = undefined;
    return [...this.changes];
  }

  recordFailure(error: unknown): void {
    this.lastError = safeErrorMessage(error);
  }

  restoreCachedModels(models: readonly unknown[] | undefined): boolean {
    if (this.catalog.length > 0 || !models) return this.catalog.length > 0;
    const restored = models.map(cachedModel).filter((model): model is CommonModelDefinition => model !== undefined);
    if (restored.length === 0) return false;
    this.catalog = restored.map(cloneModel);
    this.remoteModels = [];
    const cachedReserve = this.catalog.find((model) => model.id === RESERVE_MODEL_ID);
    this.reserve = cachedReserve ? { id: RESERVE_MODEL_ID } : undefined;
    this.metadataSource = "cache";
    return true;
  }

  getCatalog(): CommonModelDefinition[] {
    return this.catalog.map(cloneModel);
  }

  getReserve(): RemoteCodexModel | undefined {
    return cloneRemote(this.reserve);
  }

  getRemoteModels(): RemoteCodexModel[] {
    return this.remoteModels.map((model) => cloneRemote(model) as RemoteCodexModel);
  }

  status(registryModel?: string): ReserveStatus {
    return {
      provider: CODEX_PROVIDER_ID,
      modelId: RESERVE_MODEL_ID,
      detected: this.catalog.some((model) => model.id === RESERVE_MODEL_ID),
      registryModel,
      visibility: this.reserve?.visibility,
      metadataSource: this.metadataSource,
      lastRefreshAt: this.lastRefreshAt,
      lastError: this.lastError,
      changes: [...this.changes],
    };
  }
}
