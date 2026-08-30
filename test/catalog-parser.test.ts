import { describe, expect, test } from "bun:test";
import { parseCodexCatalog } from "../src/core/catalog-parser.ts";
import { catalog, hiddenModel, reserveModel, visibleModel } from "./fixtures.ts";

describe("parseCodexCatalog", () => {
  test("keeps the hidden exact reserve row and drops other hidden rows", () => {
    const parsed = parseCodexCatalog(catalog([visibleModel(), reserveModel(), hiddenModel()]));

    expect(parsed.models.map((model) => model.id)).toEqual(["gpt-visible", "gpt-reserve"]);
    expect(parsed.reserve).toMatchObject({
      id: "gpt-reserve",
      contextWindow: 987654,
      maxTokens: 77777,
      input: ["text"],
      reasoning: true,
      defaultReasoningLevel: "high",
      reasoningLevels: ["low", "medium", "high", "xhigh"],
      useResponsesLite: true,
    });
    expect(parsed.models[1]).toMatchObject({ contextWindow: 987654, maxTokens: 77777 });
    expect(parsed.models[1]?.compat).toBeUndefined();
    expect(parsed.reserve?.compat).toEqual({ responses: true });
  });
  test("accepts current Codex rows that omit max output metadata", () => {
    const parsed = parseCodexCatalog(
      catalog([
        {
          slug: "gpt-reserve",
          display_name: "GPT-Reserve",
          visibility: "hide",
          context_window: 272000,
          max_context_window: 872000,
          default_reasoning_level: "medium",
          supported_reasoning_levels: [
            { effort: "low", description: "Fast responses" },
            { effort: "medium", description: "Balanced responses" },
            { effort: "high", description: "Deep responses" },
            { effort: "xhigh", description: "Deeper responses" },
            { effort: "max", description: "Maximum reasoning" },
          ],
          input_modalities: ["text", "image"],
          prefer_websockets: true,
          use_responses_lite: true,
          tool_mode: "code_mode_only",
          supports_parallel_tool_calls: true,
          supports_image_detail_original: true,
          supported_in_api: true,
        },
      ]),
    );

    expect(parsed.reserve).toMatchObject({
      id: "gpt-reserve",
      visibility: "hide",
      contextWindow: 272000,
      reasoningLevels: ["low", "medium", "high", "xhigh", "max"],
    });
    expect(parsed.reserve?.maxTokens).toBeUndefined();
    expect(parsed.models[0]).toMatchObject({
      id: "gpt-reserve",
      contextWindow: 272000,
      thinking: {
        efforts: ["low", "medium", "high", "xhigh", "max"],
      },
    });
    expect(parsed.models[0]?.maxTokens).toBeUndefined();
  });


  test("does not invent context, input, or reasoning metadata", () => {
    for (const override of [
      { context_window: undefined },
      { input_modalities: undefined },
      { supported_reasoning_levels: undefined, default_reasoning_level: undefined },
    ]) {
      expect(() => parseCodexCatalog(catalog([visibleModel(override)]))).toThrow("no usable visible models");
    }
  });

  test("accepts a catalog without reserve when visible rows are complete", () => {
    const parsed = parseCodexCatalog(catalog([visibleModel()]));
    expect(parsed.reserve).toBeUndefined();
    expect(parsed.models).toHaveLength(1);
  });

  test("skips models with unsupported input modalities instead of failing the whole catalog", () => {
    expect(() => parseCodexCatalog(catalog([visibleModel({ input_modalities: ["audio"] })]))).toThrow(
      "no usable visible models",
    );
  });

  test("fails the complete-catalog path when a visible row is malformed", () => {
    expect(() =>
      parseCodexCatalog(
        catalog([visibleModel({ input_modalities: ["audio"] }), reserveModel()]),
        { requireComplete: true },
      ),
    ).toThrow("unsupported input modality");
  });
});
