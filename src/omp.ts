import { installReserveExtension } from "./extension.ts";

export default function ompExtension(api: unknown): void {
  installReserveExtension(api, "omp");
}
