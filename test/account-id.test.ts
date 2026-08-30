import { describe, expect, test } from "bun:test";
import { credentialAccessToken, credentialAccountId, extractChatGptAccountId } from "../src/core/account-id.ts";

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function token(payload: unknown): string {
  return `header.${base64Url(JSON.stringify(payload))}.signature`;
}

describe("Codex account claim", () => {
  test("extracts the documented nested ChatGPT account id", () => {
    const access = token({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_123" } });
    expect(extractChatGptAccountId(access)).toBe("acct_123");
    expect(credentialAccountId({ type: "oauth", access })).toBe("acct_123");
    expect(credentialAccessToken({ type: "oauth", access })).toBe(access);
  });

  test("returns no account for malformed or unrelated tokens", () => {
    expect(extractChatGptAccountId("not-a-jwt")).toBeUndefined();
    expect(extractChatGptAccountId(token({ sub: "user" }))).toBeUndefined();
    expect(credentialAccessToken({ type: "api_key", access: "secret" })).toBeUndefined();
  });
});
