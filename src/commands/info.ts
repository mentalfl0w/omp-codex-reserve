import { RESERVE_MODEL_ID } from "../core/types.ts";
import { ReserveState } from "../core/state.ts";
import type { CommandContextLike, ExtensionApiLike } from "../adapters/types.ts";

function display(value: unknown): string {
  if (value === undefined) return "unknown";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function notify(context: CommandContextLike, message: string, type: "info" | "warning" = "info"): void {
  context.ui?.notify?.(message, type);
}

export function registerInfoCommand(api: ExtensionApiLike, state: ReserveState): void {
  api.registerCommand("reserve-info", {
    description: "Show remote metadata for gpt-reserve",
    handler: (_args, context) => {
      const reserve = state.getReserve();
      if (!reserve) {
        notify(context, `No ${RESERVE_MODEL_ID} row is available in the current Codex catalog`, "warning");
        return;
      }
      const lines = [
        `Model ID: ${reserve.id}`,
        `Name: ${display(reserve.name)}`,
        `Visibility: ${display(reserve.visibility)}`,
        `Context window: ${display(reserve.contextWindow)}`,
        `Max output tokens: ${display(reserve.maxTokens)}`,
        `Reasoning: ${display(reserve.reasoning)}`,
        `Input: ${display(reserve.input)}`,
        `Reasoning efforts: ${display(reserve.reasoningLevels)}`,
        `Default reasoning: ${display(reserve.defaultReasoningLevel)}`,
        `Supports tools: ${display(reserve.supportsTools)}`,
        `Tool mode: ${display(reserve.toolMode)}`,
        `Prefer WebSockets: ${display(reserve.preferWebsockets)}`,
        `Responses Lite: ${display(reserve.useResponsesLite)}`,
        `Request model ID: ${display(reserve.requestModelId)}`,
        `Remote compaction: ${display(reserve.remoteCompaction)}`,
        `Compatibility: ${display(reserve.compat)}`,
        `Priority: ${display(reserve.priority)}`,
      ];
      notify(context, lines.join("\n"));
    },
  });
}
