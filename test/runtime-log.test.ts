import { describe, expect, test } from "bun:test";
import { logRuntimeEvent } from "../src/core/runtime-log.ts";
import type { RuntimeLoggerLike } from "../src/core/runtime-log.ts";

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
