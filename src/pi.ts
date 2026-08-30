import { installReserveExtension } from "./extension.ts";

export default function piExtension(pi: unknown): void {
  installReserveExtension(pi, "pi");
}
