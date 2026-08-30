import { installReserveExtension } from "./extension.ts";

export default function extension(api: unknown): void {
  installReserveExtension(api);
}

export { installReserveExtension } from "./extension.ts";
export * from "./core.ts";
