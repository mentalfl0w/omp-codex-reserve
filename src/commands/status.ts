import { CODEX_PROVIDER_ID } from "../core/types.ts";
import { isRecord } from "../core/guards.ts";
import { ReserveState } from "../core/state.ts";
import type { CommandContextLike, ExtensionApiLike, HostKind } from "../adapters/types.ts";

function currentModelName(context: CommandContextLike): string | undefined {
  const model = context.model;
  if (!isRecord(model)) return undefined;
  const provider = typeof model.provider === "string" ? model.provider : undefined;
  const id = typeof model.id === "string" ? model.id : undefined;
  if (provider && id) return `${provider}/${id}`;
  return id;
}

function notify(context: CommandContextLike, message: string, type: "info" | "warning" = "info"): void {
  context.ui?.notify?.(message, type);
}

export function registerStatusCommand(
  api: ExtensionApiLike,
  state: ReserveState,
  host: HostKind,
): void {
  api.registerCommand("reserve-status", {
    description: "Show whether the remote Codex reserve model is available",
    handler: (_args, context) => {
      const status = state.status(currentModelName(context));
      const lines = [
        "omp-codex-reserve",
        `Host: ${host === "omp" ? "OMP" : "Pi"}`,
        `Provider: ${CODEX_PROVIDER_ID}`,
        `Reserve detected: ${status.detected ? "yes" : "no"}`,
        `Registry model: ${status.registryModel ?? "none"}`,
        `Remote visibility: ${status.visibility ?? "unknown"}`,
        `Metadata source: ${status.metadataSource}`,
        `Last refresh: ${status.lastRefreshAt ? new Date(status.lastRefreshAt).toISOString() : "unknown"}`,
        ...(status.lastError ? [`Last error: ${status.lastError}`] : []),
      ];
      notify(context, lines.join("\n"));
    },
  });
}
