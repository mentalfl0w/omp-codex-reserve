import type { CommonModelDefinition } from "../core/types.ts";

export const CODEX_PROVIDER_ID = "openai-codex";
export const RESERVE_MODEL_ID = "gpt-reserve";

/**
 * OMP and Pi require a concrete output limit in provider registration, while
 * the current Codex catalog does not publish one for gpt-reserve. This value
 * is used only for the new reserve registration row; native rows are copied
 * unchanged.
 */
const RESERVE_REGISTRATION_MAX_TOKENS = 128_000;

export interface ModelRegistryReader {
  getAll(): readonly CommonModelDefinition[];
}

export function nativeCodexModels(registry: ModelRegistryReader): CommonModelDefinition[] {
  return registry
    .getAll()
    .filter((model) => model.provider === CODEX_PROVIDER_ID && model.id !== RESERVE_MODEL_ID)
    .map((model) => ({ ...model, input: [...model.input], cost: { ...model.cost } }));
}

/**
 * Returns a complete provider list without deriving any native-model metadata
 * from the remote catalog. The only synthesized field is the host-required
 * gpt-reserve output limit when Codex omits it.
 */
export function appendReserve(
  nativeModels: readonly CommonModelDefinition[],
  reserve: CommonModelDefinition,
): CommonModelDefinition[] {
  return [
    ...nativeModels,
    {
      ...reserve,
      input: [...reserve.input],
      cost: { ...reserve.cost },
      maxTokens: reserve.maxTokens ?? RESERVE_REGISTRATION_MAX_TOKENS,
    },
  ];
}
