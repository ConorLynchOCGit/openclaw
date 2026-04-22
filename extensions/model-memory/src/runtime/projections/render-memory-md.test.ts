import { describe, expect, it } from "vitest";
import { compileProjection } from "../../projection-compiler.ts";

describe("render-memory-md", () => {
  it("renders deterministic MEMORY.md content while leaving root MEMORY.md artifact-only", () => {
    const result = compileProjection({
      targetId: "memory-md",
      memoryObjects: [
        {
          id: "memory-fact",
          sourceWindowId: "window-001",
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "deployment region", value: "region-001" },
          normalizedSubject: "deployment region",
          normalizedTitle: undefined,
          normalizedSearchText: "deployment region region-001",
          scope: {},
          scopeKey: "scope-001",
          provenance: [],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "fact-001",
          slotKey: "slot-fact-001",
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(1000),
        },
        {
          id: "memory-procedure",
          sourceWindowId: "window-002",
          canonicalClass: "feedback",
          kind: "procedure",
          payload: { title: "procedure-001", steps: ["run check-001", "record artifact-001"] },
          normalizedSubject: undefined,
          normalizedTitle: "procedure-001",
          normalizedSearchText: "procedure-001 run check-001 record artifact-001",
          scope: {},
          scopeKey: "scope-001",
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
          createdAt: new Date(2000),
        },
      ],
      slots: [
        {
          slotKey: "slot-fact-001",
          canonicalClass: "project",
          kind: "fact",
          scopeKey: "scope-001",
          subjectKey: "deployment region",
          currentObjectId: "memory-fact",
          currentIdentityKey: "fact-001",
          updatedAt: new Date(1000),
        },
      ],
      sets: [
        {
          id: "set-001",
          setKey: "feedback:procedure:scope-001",
          canonicalClass: "feedback",
          kind: "procedure",
          scopeKey: "scope-001",
          memoryObjectId: "memory-procedure",
          sortKey: "procedure-001",
          updatedAt: new Date(2000),
        },
      ],
      existingFileContent: "<!-- BEGIN HUMAN -->\nPreserve me.\n<!-- END HUMAN -->\n",
    });

    expect(result.renderedText).toContain("## Standing Context");
    expect(result.renderedText).toContain("- deployment region: region-001");
    expect(result.renderedText).toContain("- procedure-001: run check-001 -> record artifact-001");
    expect(result.outputFileContent).toContain("Preserve me.");
    expect(result.outputFileContent).not.toContain("<!-- BEGIN GENERATED: model-memory -->");
  });
});
