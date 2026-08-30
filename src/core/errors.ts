export class CodexReserveError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CodexReserveError";
    this.code = code;
  }
}

export class CodexCatalogError extends CodexReserveError {
  readonly status?: number;
  readonly endpoint?: string;

  constructor(message: string, options: { status?: number; endpoint?: string } = {}) {
    super("catalog-fetch", message);
    this.name = "CodexCatalogError";
    this.status = options.status;
    this.endpoint = options.endpoint;
  }
}

export class CatalogMetadataError extends CodexReserveError {
  readonly modelId?: string;

  constructor(message: string, modelId?: string) {
    super("catalog-metadata", message);
    this.name = "CatalogMetadataError";
    this.modelId = modelId;
  }
}

export class CatalogUnavailableError extends CodexReserveError {
  constructor(message: string) {
    super("catalog-unavailable", message);
    this.name = "CatalogUnavailableError";
  }
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(?:access|refresh|id)_token\s*[:=]\s*[^\s,;]+/gi, "token=[redacted]")
    .replace(/(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "credential=[redacted]")
    .slice(0, 240);
}
