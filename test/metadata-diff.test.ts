import { describe, expect, test } from "bun:test";
import { diffReserveMetadata } from "../src/core/metadata-diff.ts";
import { reserveModel, catalog } from "./fixtures.ts";
import { parseCodexCatalog } from "../src/core/catalog-parser.ts";

describe("diffReserveMetadata", () => {
  test("reports remote field changes without treating object key order as a change", () => {
    const before = parseCodexCatalog(catalog([reserveModel({ compat: { a: 1, b: 2 } })])).reserve;
    const after = parseCodexCatalog(catalog([reserveModel({ context_window: 999999, compat: { b: 2, a: 1 } })])).reserve;
    expect(diffReserveMetadata(before, after)).toEqual([
      { field: "contextWindow", previous: 987654, current: 999999 },
    ]);
  });

  test("does not invent a diff when either reserve row is absent", () => {
    expect(diffReserveMetadata(undefined, undefined)).toEqual([]);
  });
});
