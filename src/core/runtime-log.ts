import { safeErrorMessage } from "./errors.ts";

/** The host logger owns the destination and automatic file rotation policy. */
export interface RuntimeLoggerLike {
  debug?(message: string, data?: unknown): void;
  warn?(message: string, data?: unknown): void;
  error?(message: string, data?: unknown): void;
}

export type RuntimeLogDetails = Readonly<Record<string, unknown>>;

const SENSITIVE_KEY = /^(?:access|refresh|id|auth|api)?[_-]?(?:token|key|authorization|cookie|credential|password|secret|account(?:[_-]?id)?)$/i;

function normalizedKey(key: string): string {
  return key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function safeDetail(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(normalizedKey(key))) return "[redacted]";
  if (value instanceof Error) return safeErrorMessage(value);
  if (typeof value === "string") return safeErrorMessage(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => safeDetail("", item));
  return "[redacted]";
}

function safeDetails(details: RuntimeLogDetails): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined) result[key] = safeDetail(key, value);
  }
  return result;
}

/** Emit a structured debug event without making logging part of the data path. */
export function logRuntimeEvent(
  logger: RuntimeLoggerLike | undefined,
  event: string,
  details: RuntimeLogDetails = {},
): void {
  if (!logger?.debug) return;
  try {
    logger.debug(`omp-codex-reserve: ${event}`, safeDetails(details));
  } catch {
    // A host logger failure must never change model discovery behavior.
  }
}
