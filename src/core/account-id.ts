import { isRecord } from "./guards.ts";

const ACCOUNT_CLAIM = "https://api.openai.com/auth";

function decodeBase64Url(value: string): string | undefined {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

/** Decode the documented account claim; JWT signatures are verified by the host/API. */
export function extractChatGptAccountId(accessToken: string): string | undefined {
  const parts = accessToken.split(".");
  if (parts.length < 2) return undefined;

  const payloadText = decodeBase64Url(parts[1]);
  if (!payloadText) return undefined;

  try {
    const payload: unknown = JSON.parse(payloadText);
    const auth = isRecord(payload) ? payload[ACCOUNT_CLAIM] : undefined;
    const accountId = isRecord(auth) ? auth.chatgpt_account_id : undefined;
    return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
  } catch {
    return undefined;
  }
}

export function credentialAccountId(credential: unknown): string | undefined {
  if (!isRecord(credential)) return undefined;
  for (const key of ["accountId", "chatgptAccountId", "chatgpt_account_id"]) {
    const value = credential[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  const access = credential.access;
  return typeof access === "string" ? extractChatGptAccountId(access) : undefined;
}

export function credentialAccessToken(credential: unknown): string | undefined {
  if (!isRecord(credential)) return undefined;
  if (credential.type !== undefined && credential.type !== "oauth") return undefined;
  for (const key of ["access", "accessToken"]) {
    const value = credential[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}
