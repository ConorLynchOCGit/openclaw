import { describe, expect, it } from "vitest";
import { materializeActiveMemorySets } from "./active-memory-sets.ts";

describe("active-memory-sets", () => {
  it("materializes current set membership without copying semantic payload into a second ontology", () => {
    const sets = materializeActiveMemorySets([
      {
        id: "memory-procedure",
        sourceWindowId: "window-001",
        canonicalClass: "feedback",
        kind: "procedure",
        payload: { title: "procedure-001", steps: ["run check-001"] },
        normalizedSubject: undefined,
        normalizedTitle: "procedure-001",
        normalizedSearchText: "procedure-001 run check-001",
        scope: {},
        scopeKey: "scope-global",
        provenance: [],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "procedure-001",
        slotKey: undefined,
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(1000),
      },
      {
        id: "memory-reference",
        sourceWindowId: "window-002",
        canonicalClass: "reference",
        kind: "reference",
        payload: { task: "task-001", primaryResource: "resource-001" },
        normalizedSubject: undefined,
        normalizedTitle: undefined,
        normalizedSearchText: "task-001 resource-001",
        scope: {},
        scopeKey: "scope-global",
        provenance: [],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "reference-001",
        slotKey: undefined,
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(2000),
      },
    ]);

    expect(sets).toHaveLength(2);
    expect(sets[0]).not.toHaveProperty("payload");
    expect(sets.map((record) => record.memoryObjectId)).toEqual([
      "memory-procedure",
      "memory-reference",
    ]);
  });
});
