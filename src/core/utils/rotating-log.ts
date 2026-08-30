import { appendFileSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface RotatingLogOptions {
  filePath: string;
  maxBytes?: number;
  maxFiles?: number;
  maxAgeMs?: number;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 3;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Synchronous size/age rotation; every filesystem failure is best effort. */
export class RotatingLog {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly maxAgeMs: number;
  private readonly baseName: string;
  private readonly dir: string;
  private readonly activeFileName: string;

  constructor(options: RotatingLogOptions) {
    this.filePath = options.filePath;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.dir = dirname(this.filePath);
    this.activeFileName = basename(this.filePath);
    this.baseName = basename(this.filePath, ".log");
  }

  /** Append a newline-terminated line without ever throwing. */
  write(line: string): void {
    try {
      this.maybeRotate();
      appendFileSync(this.filePath, line, "utf-8");
    } catch {
      // Logging must never change the extension's behavior.
    }
  }

  /** Remove rotated files older than the configured retention window. */
  cleanStale(): void {
    const cutoff = Date.now() - this.maxAgeMs;
    try {
      for (const name of readdirSync(this.dir)) {
        if (name === this.activeFileName) continue;
        if (!name.startsWith(this.baseName) || !name.endsWith(".log")) continue;
        try {
          const file = join(this.dir, name);
          if (statSync(file).mtimeMs < cutoff) unlinkSync(file);
        } catch {
          // The file may disappear between readdir and stat/unlink.
        }
      }
    } catch {
      // The directory may not exist yet.
    }
  }

  private maybeRotate(): void {
    let size: number;
    try {
      size = statSync(this.filePath).size;
    } catch {
      return;
    }
    if (size < this.maxBytes) return;

    try { unlinkSync(this.rotatedPath(this.maxFiles)); } catch {}
    for (let index = this.maxFiles - 1; index >= 1; index--) {
      try { renameSync(this.rotatedPath(index), this.rotatedPath(index + 1)); } catch {}
    }
    try { renameSync(this.filePath, this.rotatedPath(1)); } catch {}
  }

  private rotatedPath(index: number): string {
    return join(this.dir, `${this.baseName}.${index}.log`);
  }
}
