import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { ReserveLogger } from "../src/core/logger.ts";
import { RotatingLog } from "../src/core/utils/rotating-log.ts";
import { logRuntimeEvent, type RuntimeLoggerLike } from "../src/core/runtime-log.ts";

describe("runtime logging", () => {
  test("emits structured debug events without credential data", () => {
    const calls: Array<{ message: string; data: unknown }> = [];
    const logger: RuntimeLoggerLike = {
      debug: (message, data) => calls.push({ message, data }),
    };

    logRuntimeEvent(logger, "refresh.started", {
      host: "omp",
      credentialPresent: true,
      accessToken: "resolved-access-token",
      authorization: "Bearer resolved-access-token",
      message: "Bearer resolved-access-token",
      nested: { token: "resolved-access-token" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.message).toBe("omp-codex-reserve: refresh.started");
    expect(calls[0]?.data).toEqual({
      host: "omp",
      credentialPresent: true,
      accessToken: "[redacted]",
      authorization: "[redacted]",
      message: "Bearer [redacted]",
      nested: "[redacted]",
    });
    expect(JSON.stringify(calls)).not.toContain("resolved-access-token");
  });

  test("writes a sanitized copy to the plugin-owned log and forwards to the host", () => {
    const dir = mkdtempSync(join(tmpdir(), "omp-codex-reserve-"));
    const calls: string[] = [];
    try {
      const logger = new ReserveLogger(
        { debug: (message) => calls.push(message) },
        { logDir: dir },
      );
      logRuntimeEvent(logger, "refresh.started", {
        host: "omp",
        accessToken: "secret-access-token",
      });

      const log = readFileSync(join(dir, "omp-codex-reserve.log"), "utf8");
      expect(log).toContain("refresh.started");
      expect(log).toContain("[redacted]");
      expect(log).not.toContain("secret-access-token");
      expect(calls).toEqual(["omp-codex-reserve: refresh.started"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rotates at the size threshold and removes stale rotated files", () => {
    const dir = mkdtempSync(join(tmpdir(), "omp-codex-rotation-"));
    const filePath = join(dir, "omp-codex-reserve.log");
    try {
      const rotatingLog = new RotatingLog({ filePath, maxBytes: 5, maxFiles: 2, maxAgeMs: 1 });
      rotatingLog.write("12345\n");
      rotatingLog.write("next\n");
      expect(statSync(join(dir, "omp-codex-reserve.1.log")).isFile()).toBe(true);

      const stalePath = join(dir, "omp-codex-reserve.2.log");
      writeFileSync(stalePath, "stale\n");
      const old = new Date(Date.now() - 10_000);
      utimesSync(stalePath, old, old);
      rotatingLog.cleanStale();
      expect(() => statSync(stalePath)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not change refresh behavior when the host logger throws", () => {
    let continued = false;
    const logger: RuntimeLoggerLike = {
      debug: () => {
        throw new Error("logger unavailable");
      },
    };

    logRuntimeEvent(logger, "refresh.started", { host: "pi" });
    continued = true;

    expect(continued).toBe(true);
  });
});
