import type { MetadataChange, RemoteCodexModel } from "./types.ts";

const DIFF_FIELDS = [
  "name",
  "visibility",
  "contextWindow",
  "maxTokens",
  "reasoning",
  "defaultReasoningLevel",
  "reasoningLevels",
  "input",
  "supportsTools",
  "toolMode",
  "preferWebsockets",
  "useResponsesLite",
  "remoteCompaction",
  "compat",
  "requestModelId",
  "priority",
  "cost",
] as const satisfies readonly (keyof RemoteCodexModel)[];

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)] as const);
  return Object.fromEntries(entries);
}

function equalMetadata(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

export function diffReserveMetadata(
  previous: RemoteCodexModel | undefined,
  current: RemoteCodexModel | undefined,
): MetadataChange[] {
  if (!previous || !current) return [];
  const changes: MetadataChange[] = [];
  for (const field of DIFF_FIELDS) {
    const before = previous[field];
    const after = current[field];
    if (!equalMetadata(before, after)) changes.push({ field, previous: before, current: after });
  }
  return changes;
}
