export function visibleModel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: "gpt-visible",
    display_name: "GPT Visible",
    visibility: "public",
    context_window: 321000,
    max_output_tokens: 64000,
    input_modalities: ["text", "image"],
    default_reasoning_level: "medium",
    supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }],
    supports_tools: true,
    tool_mode: "code_mode_only",
    prefer_websockets: true,
    use_responses_lite: false,
    remote_compaction: { enabled: true },
    priority: 10,
    ...overrides,
  };
}

export function reserveModel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: "gpt-reserve",
    display_name: "GPT Reserve",
    visibility: "hidden",
    context_window: 987654,
    max_output_tokens: 77777,
    input_modalities: ["text"],
    default_reasoning_level: "high",
    supported_reasoning_levels: ["low", "medium", "high", "xhigh"],
    supports_tools: false,
    tool_mode: "code_mode_only",
    prefer_websockets: false,
    use_responses_lite: true,
    remote_compaction: { enabled: false, mode: "remote" },
    compat: { responses: true },
    request_model_id: "gpt-reserve-request",
    priority: 20,
    ...overrides,
  };
}

export function hiddenModel(): Record<string, unknown> {
  return {
    slug: "gpt-internal",
    display_name: "GPT Internal",
    visibility: "hide",
  };
}

export function catalog(models: readonly unknown[]) {
  return {
    models,
    endpoint: "https://chatgpt.com/backend-api/codex/models?client_version=0.144.1",
    baseUrl: "https://chatgpt.com/backend-api",
    fetchedAt: 1710000000000,
  };
}
