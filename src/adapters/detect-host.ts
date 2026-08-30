import type { ExtensionApiLike, HostKind } from "./types.ts";

export function detectHost(api: ExtensionApiLike): HostKind {
  return api.pi ? "omp" : "pi";
}
