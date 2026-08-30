import { CatalogMetadataError } from "./errors.ts";
import {
  arrayField,
  booleanField,
  finiteNumberField,
  isRecord,
  recordField,
  stringField,
} from "./guards.ts";
import {
  CODEX_API,
  CODEX_PROVIDER_ID,
  RESERVE_MODEL_ID,
  type CommonModelDefinition,
  type JsonRecord,
  type ModelCost,
  type ModelInput,
  type ParsedCodexCatalog,
  type ParsedCodexModel,
  type RemoteCodexCatalog,
  type RemoteCodexModel,
  type ThinkingConfig,
} from "./types.ts";

const KNOWN_THINKING_EFFORTS: Readonly<Record<string, true>> = {
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
};
const MODEL_ID_KEYS = ["slug", "id"] as const;
const NAME_KEYS = ["display_name", "displayName", "name"] as const;
const CONTEXT_KEYS = ["context_window", "contextWindow"] as const;
const MAX_TOKEN_KEYS = ["max_output_tokens", "max_tokens", "maxTokens", "max_output", "maxOutputTokens"] as const;
const INPUT_KEYS = ["input_modalities", "inputModalities", "input"] as const;
const REASONING_LEVEL_KEYS = ["supported_reasoning_levels", "supportedReasoningLevels"] as const;
const DEFAULT_REASONING_KEYS = ["default_reasoning_level", "defaultReasoningLevel"] as const;

function requiredPositiveInteger(record: JsonRecord, keys: readonly string[], field: string, modelId: string): number {
  const value = finiteNumberField(record, keys);
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    throw new CatalogMetadataError(`Model ${modelId} has no valid ${field}`, modelId);
  }
  return value;
}

function optionalPositiveInteger(
  record: JsonRecord,
  keys: readonly string[],
  field: string,
  modelId: string,
): number | undefined {
  const value = finiteNumberField(record, keys);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) {
    throw new CatalogMetadataError(`Model ${modelId} has no valid ${field}`, modelId);
  }
  return value;
}

function parseInput(record: JsonRecord, modelId: string): ModelInput[] {
  const values = arrayField(record, INPUT_KEYS);
  if (!values) throw new CatalogMetadataError(`Model ${modelId} has no input modalities`, modelId);

  const input: ModelInput[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      throw new CatalogMetadataError(`Model ${modelId} has invalid input modalities`, modelId);
    }
    const modality = value.trim().toLowerCase();
    if (modality !== "text" && modality !== "image") {
      throw new CatalogMetadataError(`Model ${modelId} has unsupported input modality`, modelId);
    }
    if (!input.includes(modality)) input.push(modality);
  }
  if (input.length === 0) throw new CatalogMetadataError(`Model ${modelId} has no input modalities`, modelId);
  return input;
}

function readReasoningEffort(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim().toLowerCase() || undefined;
  if (!isRecord(value)) return undefined;
  const effort = stringField(value, ["effort", "level", "name"]);
  return effort?.trim().toLowerCase() || undefined;
}

function parseReasoning(record: JsonRecord, modelId: string): {
  reasoning: boolean;
  defaultReasoningLevel?: string;
  reasoningLevels?: string[];
  thinking?: ThinkingConfig;
  thinkingLevelMap?: Readonly<Record<string, string>>;
} {
  const explicitReasoning = booleanField(record, ["reasoning", "supports_reasoning", "supportsReasoning"]);
  const defaultValue = record[DEFAULT_REASONING_KEYS[0]] ?? record[DEFAULT_REASONING_KEYS[1]];
  const hasDefault = defaultValue !== undefined;
  if (hasDefault && typeof defaultValue !== "string") {
    throw new CatalogMetadataError(`Model ${modelId} has invalid default reasoning level`, modelId);
  }
  const defaultLevel = typeof defaultValue === "string" ? defaultValue.trim().toLowerCase() : undefined;

  const levelsValue = record[REASONING_LEVEL_KEYS[0]] ?? record[REASONING_LEVEL_KEYS[1]];
  const hasLevels = levelsValue !== undefined;
  if (hasLevels && !Array.isArray(levelsValue)) {
    throw new CatalogMetadataError(`Model ${modelId} has invalid reasoning levels`, modelId);
  }

  const levels: string[] = [];
  if (Array.isArray(levelsValue)) {
    for (const value of levelsValue) {
      const effort = readReasoningEffort(value);
      if (!effort) throw new CatalogMetadataError(`Model ${modelId} has invalid reasoning levels`, modelId);
      if (!levels.includes(effort)) levels.push(effort);
    }
  }

  if (explicitReasoning === undefined && !hasDefault && !hasLevels) {
    throw new CatalogMetadataError(`Model ${modelId} has no reasoning metadata`, modelId);
  }

  const reasoning = explicitReasoning ?? Boolean(
    (defaultLevel && defaultLevel !== "none") || levels.some((level) => level !== "none"),
  );
  const knownEfforts = levels.filter((level) => KNOWN_THINKING_EFFORTS[level] === true);
  const effortMap = Object.fromEntries(knownEfforts.map((level) => [level, level]));
  const thinking = knownEfforts.length > 0
    ? {
        mode: "effort" as const,
        efforts: knownEfforts,
        ...(KNOWN_THINKING_EFFORTS[defaultLevel ?? ""] === true ? { defaultLevel } : {}),
        effortMap,
      }
    : undefined;

  return {
    reasoning,
    ...(defaultLevel ? { defaultReasoningLevel: defaultLevel } : {}),
    ...(levels.length > 0 ? { reasoningLevels: levels } : {}),
    ...(thinking ? { thinking, thinkingLevelMap: effortMap } : {}),
  };
}

function parseCost(record: JsonRecord): ModelCost | undefined {
  const input = finiteNumberField(record, ["input", "input_cost", "inputCost"]);
  const output = finiteNumberField(record, ["output", "output_cost", "outputCost"]);
  const cacheRead = finiteNumberField(record, ["cache_read", "cacheRead", "cache_read_cost"]);
  const cacheWrite = finiteNumberField(record, ["cache_write", "cacheWrite", "cache_write_cost"]);
  if (input === undefined && output === undefined && cacheRead === undefined && cacheWrite === undefined) return undefined;
  return {
    input: input ?? 0,
    output: output ?? 0,
    cacheRead: cacheRead ?? 0,
    cacheWrite: cacheWrite ?? 0,
  };
}

function cloneOptionalRecord(record: JsonRecord, keys: readonly string[]): JsonRecord | undefined {
  const value = recordField(record, keys);
  return value ? { ...value } : undefined;
}

function parseModel(entry: unknown, baseUrl: string): ParsedCodexModel | null {
  if (!isRecord(entry)) return null;
  const candidateId = stringField(entry, MODEL_ID_KEYS);
  const modelId = candidateId?.trim();
  if (!modelId) return null;

  const visibilityValue = stringField(entry, ["visibility"]);
  const visibility = visibilityValue?.trim().toLowerCase();
  const hidden = visibility === "hide" || visibility === "hidden";
  if (hidden && modelId !== RESERVE_MODEL_ID) return null;

  const contextWindow = requiredPositiveInteger(entry, CONTEXT_KEYS, "context window", modelId);
  const maxTokens = optionalPositiveInteger(entry, MAX_TOKEN_KEYS, "maximum output tokens", modelId);
  const input = parseInput(entry, modelId);
  const reasoning = parseReasoning(entry, modelId);
  const nameValue = stringField(entry, NAME_KEYS)?.trim();
  const supportsTools = booleanField(entry, ["supports_tools", "supportsTools"]);
  const preferWebsockets = booleanField(entry, ["prefer_websockets", "preferWebsockets"]);
  const useResponsesLite = booleanField(entry, ["use_responses_lite", "useResponsesLite"]);
  const toolMode = stringField(entry, ["tool_mode", "toolMode"]);
  const priority = finiteNumberField(entry, ["priority"]);
  const cost = parseCost(recordField(entry, ["cost", "pricing"]) ?? {});
  const remoteCompaction = cloneOptionalRecord(entry, ["remote_compaction", "remoteCompaction"]);
  const compat = cloneOptionalRecord(entry, ["compat", "compatibility"]);
  const requestModelId = stringField(entry, ["request_model_id", "requestModelId"])?.trim();

  const remote: RemoteCodexModel = {
    id: modelId,
    ...(nameValue ? { name: nameValue } : {}),
    ...(visibility ? { visibility } : {}),
    contextWindow,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    input,
    reasoning: reasoning.reasoning,
    ...(reasoning.defaultReasoningLevel ? { defaultReasoningLevel: reasoning.defaultReasoningLevel } : {}),
    ...(reasoning.reasoningLevels ? { reasoningLevels: reasoning.reasoningLevels } : {}),
    ...(supportsTools !== undefined ? { supportsTools } : {}),
    ...(toolMode ? { toolMode } : {}),
    ...(preferWebsockets !== undefined ? { preferWebsockets } : {}),
    ...(useResponsesLite !== undefined ? { useResponsesLite } : {}),
    ...(remoteCompaction ? { remoteCompaction } : {}),
    ...(compat ? { compat } : {}),
    ...(requestModelId ? { requestModelId } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(cost ? { cost } : {}),
  };

  const model: CommonModelDefinition = {
    id: modelId,
    name: nameValue ?? modelId,
    api: CODEX_API,
    provider: CODEX_PROVIDER_ID,
    baseUrl,
    reasoning: reasoning.reasoning,
    input,
    cost: cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(supportsTools !== undefined ? { supportsTools } : {}),
    ...(toolMode ? { toolMode } : {}),
    ...(preferWebsockets !== undefined ? { preferWebsockets } : {}),
    ...(useResponsesLite !== undefined ? { useResponsesLite } : {}),
    ...(remoteCompaction ? { remoteCompaction } : {}),
    ...(requestModelId ? { requestModelId } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(reasoning.thinking ? { thinking: reasoning.thinking } : {}),
    ...(reasoning.thinkingLevelMap ? { thinkingLevelMap: reasoning.thinkingLevelMap } : {}),
  };

  return { remote, model };
}

export interface ParseCodexCatalogOptions {
  /**
   * Require every identified visible/reserve row to be valid. This is used
   * when the result will replace a provider catalog; ordinary reserve-only
   * reads remain tolerant of unrelated malformed rows.
   */
  requireComplete?: boolean;
}

function mustParseRow(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  const modelId = stringField(entry, MODEL_ID_KEYS)?.trim();
  if (!modelId) return false;
  const visibility = stringField(entry, ["visibility"])?.trim().toLowerCase();
  return visibility !== "hide" && visibility !== "hidden" || modelId === RESERVE_MODEL_ID;
}

/** Parse remote metadata without inventing missing model capabilities. */
export function parseCodexCatalog(
  catalog: RemoteCodexCatalog,
  options: ParseCodexCatalogOptions = {},
): ParsedCodexCatalog {
  const parsed: ParsedCodexModel[] = [];
  const seen = new Set<string>();
  for (const entry of catalog.models) {
    let item: ParsedCodexModel | null;
    try {
      item = parseModel(entry, catalog.baseUrl);
    } catch (error) {
      if (options.requireComplete && mustParseRow(entry)) throw error;
      continue;
    }
    if (!item || seen.has(item.model.id)) continue;
    seen.add(item.model.id);
    parsed.push(item);
  }

  if (parsed.length === 0) throw new CatalogMetadataError("Codex catalog has no usable visible models");
  const reserve = parsed.find((item) => item.remote.id === RESERVE_MODEL_ID)?.remote;
  return {
    models: parsed.map((item) => item.model),
    remoteModels: parsed.map((item) => item.remote),
    ...(reserve ? { reserve } : {}),
    endpoint: catalog.endpoint,
    baseUrl: catalog.baseUrl,
    fetchedAt: catalog.fetchedAt,
  };
}
