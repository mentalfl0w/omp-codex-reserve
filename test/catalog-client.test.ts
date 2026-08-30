import { describe, expect, test } from "bun:test";
import { fetchCodexCatalog } from "../src/core/catalog-client.ts";
import { CodexCatalogError } from "../src/core/errors.ts";
import type { FetchFn } from "../src/core/types.ts";
import { reserveModel } from "./fixtures.ts";

describe("fetchCodexCatalog", () => {
  test("uses the current Codex routes, query, and headers", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetchFn: FetchFn = async (input, init) => {
      calls.push({ input, init });
      if (calls.length === 1) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ data: [reserveModel()] }), {
        status: 200,
        headers: { etag: "catalog-v1" },
      });
    };

    const result = await fetchCodexCatalog({
      accessToken: "access-token-for-test",
      accountId: "account-test",
      fetchFn,
    });

    expect(calls).toHaveLength(2);
    expect(String(calls[0].input)).toContain("https://chatgpt.com/backend-api/codex/models?client_version=0.144.1");
    expect(String(calls[1].input)).toContain("https://chatgpt.com/backend-api/models?client_version=0.144.1");
    const headers = new Headers(calls[1].init?.headers);
    expect(headers.get("authorization")).toBe("Bearer access-token-for-test");
    expect(headers.get("chatgpt-account-id")).toBe("account-test");
    expect(headers.get("openai-beta")).toBe("responses=experimental");
    expect(headers.get("originator")).toBe("pi");
    expect(headers.get("version")).toBe("0.144.1");
    expect(headers.get("accept")).toBe("application/json");
    expect(result.catalog.etag).toBe("catalog-v1");
    expect(JSON.stringify(result.catalog)).not.toContain("access-token-for-test");
  });

  test("fails closed on malformed or unavailable routes without exposing credentials", async () => {
    const fetchFn: FetchFn = async () => new Response(JSON.stringify({ nope: true }), { status: 200 });
    await expect(
      fetchCodexCatalog({ accessToken: "secret-access-token", fetchFn }),
    ).rejects.toMatchObject({ name: "CodexCatalogError" });
    try {
      await fetchCodexCatalog({ accessToken: "secret-access-token", fetchFn });
    } catch (error) {
      expect(String(error)).not.toContain("secret-access-token");
    }
  });
});
