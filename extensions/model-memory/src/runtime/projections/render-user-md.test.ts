import { describe, expect, it } from "vitest";
import { compileProjection } from "../../projection-compiler.ts";

describe("render-user-md", () => {
  it("renders only user-scoped standing items into USER.md", () => {
    const result = compileProjection({
      targetId: "user-md",
      memoryObjects: [
        {
          id: "memory-pref",
          sourceWindowId: "window-001",
          canonicalClass: "user",
          kind: "preference",
          payload: {
            subject: "response detail",
            instruction: "keep explanations high level",
            operation: "prefer",
          },
          normalizedSubject: "response detail",
          normalizedTitle: undefined,
          normalizedSearchText: "response detail keep explanations high level",
          scope: {},
          scopeKey: "scope-user-001",
          provenance: [],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "pref-001",
          slotKey: "slot-pref-001",
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(1000),
        },
        {
          id: "memory-fact",
          sourceWindowId: "window-002",
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "deployment region", value: "region-001" },
          normalizedSubject: "deployment region",
          normalizedTitle: undefined,
          normalizedSearchText: "deployment region region-001",
          scope: {},
          scopeKey: "scope-project-001",
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
      ],
      slots: [
        {
          slotKey: "slot-pref-001",
          canonicalClass: "user",
          kind: "preference",
          scopeKey: "scope-user-001",
          subjectKey: "response detail",
          currentObjectId: "memory-pref",
          currentIdentityKey: "pref-001",
          updatedAt: new Date(1000),
        },
        {
          slotKey: "slot-fact-001",
          canonicalClass: "project",
          kind: "fact",
          scopeKey: "scope-project-001",
          subjectKey: "deployment region",
          currentObjectId: "memory-fact",
          currentIdentityKey: "fact-001",
          updatedAt: new Date(1000),
        },
      ],
      sets: [],
    });

    expect(result.renderedText).toContain("## Preferences");
    expect(result.renderedText).toContain("- response detail: keep explanations high level");
    expect(result.renderedText).not.toContain("deployment region");
  });
});
