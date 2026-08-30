import { registerInfoCommand } from "./info.ts";
import { registerStatusCommand } from "./status.ts";
import type { ExtensionApiLike, HostKind } from "../adapters/types.ts";
import { ReserveState } from "../core/state.ts";

export function registerCommands(api: ExtensionApiLike, state: ReserveState, host: HostKind): void {
  registerStatusCommand(api, state, host);
  registerInfoCommand(api, state);
}
