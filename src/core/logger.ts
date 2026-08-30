import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isRecord } from "./guards.ts";
import { safeErrorMessage } from "./errors.ts";
import { RotatingLog } from "./utils/rotating-log.ts";
import { sanitizeRuntimeDetails, type RuntimeLogDetails, type RuntimeLoggerLike } from "./runtime-log.ts";

export interface ReserveLoggerOptions {
  logDir?: string;
  logFileName?: string;
}

const LOG_FILE_NAME = "omp-codex-reserve.log";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 3;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function defaultLogDir(): string {
  const home = os.homedir();
  const ompLogs = path.join(home, ".omp", "logs");
  const piLogs = path.join(home, ".pi", "logs");
  try {
    if (fs.existsSync(ompLogs)) return ompLogs;
    if (fs.existsSync(piLogs)) return piLogs;
  } catch {
    // Fall through to the host config directory.
  }
  return path.join(home, ".omp", "agent");
}

function safeFileValue(value: unknown): unknown {
  if (value instanceof Error) return safeErrorMessage(value);
  if (typeof value === "string") return safeErrorMessage(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (isRecord(value)) return sanitizeRuntimeDetails(value);
  return "[redacted]";
}

/** Plugin-owned logger with smart-approve-compatible size and age rotation. */
export class ReserveLogger implements RuntimeLoggerLike {
  private readonly host: RuntimeLoggerLike | undefined;
  private readonly rotatingLog: RotatingLog;

  constructor(host?: RuntimeLoggerLike, options: ReserveLoggerOptions = {}) {
    this.host = host;
    const dir = options.logDir ?? defaultLogDir();
    const fileName = options.logFileName ?? LOG_FILE_NAME;
    const filePath = path.join(dir, fileName);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {
      // RotatingLog remains best effort if the host directory is unavailable.
    }
    this.rotatingLog = new RotatingLog({
      filePath,
      maxBytes: MAX_BYTES,
      maxFiles: MAX_FILES,
      maxAgeMs: MAX_AGE_MS,
    });
    this.rotatingLog.cleanStale();
  }

  log(message: string, details?: RuntimeLogDetails): void {
    this.write("INFO", message, details);
  }

  debug(message: string, details?: unknown): void {
    this.write("DEBUG", message, details);
    try {
      this.host?.debug?.(message, details);
    } catch {
      // Host logger failures must not affect discovery.
    }
  }

  warn(message: string, details?: unknown): void {
    this.write("WARN", message, details);
    try {
      this.host?.warn?.(message, details);
    } catch {
      // Host logger failures must not affect discovery.
    }
  }

  error(message: string, details?: unknown): void {
    this.write("ERROR", message, details);
    try {
      this.host?.error?.(message, details);
    } catch {
      // Host logger failures must not affect discovery.
    }
  }

  private write(level: string, message: string, details?: unknown): void {
    const safeMessage = safeErrorMessage(message);
    const suffix = details === undefined ? "" : ` ${JSON.stringify(safeFileValue(details))}`;
    this.rotatingLog.write(`${new Date().toISOString()} ${level} ${safeMessage}${suffix}\n`);
  }
}

export function createReserveLogger(host?: RuntimeLoggerLike, options?: ReserveLoggerOptions): ReserveLogger {
  return new ReserveLogger(host, options);
}
