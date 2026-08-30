import type { CommonModelDefinition } from "../core/types.ts";
import { appendReserve, RESERVE_MODEL_ID } from "./reserve-only.ts";

/** Structural subset of Pi's public native Provider. */
export interface PiNativeProviderLike {
  getModels(): readonly CommonModelDefinition[];
  [key: string]: unknown;
}

export function isPiNativeProvider(value: unknown): value is PiNativeProviderLike {
  if (typeof value !== "object" || value === null || !("getModels" in value)) return false;
  return typeof value.getModels === "function";
}

/**
 * Preserve the native provider and every original operation. Only its live
 * model view gains the exact reserve row. Calling base.getModels on every read
 * keeps future native catalog refreshes visible without a plugin snapshot.
 */
export function wrapPiProviderWithReserve(
  base: PiNativeProviderLike,
  reserve: CommonModelDefinition,
): PiNativeProviderLike {
  return {
    ...base,
    getModels: () => appendReserve(base.getModels().filter((model) => model.id !== RESERVE_MODEL_ID), reserve),
  };
}
