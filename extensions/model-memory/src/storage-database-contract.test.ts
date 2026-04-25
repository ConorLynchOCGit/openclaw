import { describe, expect, it } from "vitest";
import { CANONICAL_TABLE_CONTRACTS } from "./storage-database-contract.ts";

describe("storage-database-contract", () => {
  it("defines the canonical tables in the accepted order", () => {
    expect(Object.keys(CANONICAL_TABLE_CONTRACTS)).toEqual([
      "sources",
      "sourceWindows",
      "memoryObjects",
      "memorySupportItems",
      "writeEvents",
      "supersessionLinks",
    ]);
  });

  it("matches required canonical storage columns", () => {
    expect(CANONICAL_TABLE_CONTRACTS.memoryObjects.columns).toContain("identity_key");
    expect(CANONICAL_TABLE_CONTRACTS.memoryObjects.columns).toContain("normalized_search_text");
    expect(CANONICAL_TABLE_CONTRACTS.writeEvents.columns).toContain("decision");
  });
});
