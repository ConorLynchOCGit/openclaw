import { describe, expect, it } from "vitest";
import { compileProjection } from "../../projection-compiler.ts";

describe("render-agents-md", () => {
  it("renders only agent-visible rules and procedures into the AGENTS section", () => {
    const result = compileProjection({
      targetId: "agents-md",
      memoryObjects: [
        {
          id: "memory-rule",
          sourceWindowId: "window-001",
          canonicalClass: "feedback",
          kind: "rule",
          payload: {
            subject: "landing gate",
            recommendedAction: "use gate-command-001 before landing",
            avoidAction: "use manual-command-001 for that step",
          },
          normalizedSubject: "landing gate",
          normalizedTitle: undefined,
          normalizedSearchText: "landing gate use gate-command-001 before landing",
          scope: {},
          scopeKey: "scope-project-001",
          provenance: [],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "rule-001",
          slotKey: "slot-rule-001",
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
          payload: { title: "procedure-001", steps: ["run check-001"] },
          normalizedSubject: undefined,
          normalizedTitle: "procedure-001",
          normalizedSearchText: "procedure-001 run check-001",
          scope: {},
          scopeKey: "scope-project-001",
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
      ],
      slots: [
        {
          slotKey: "slot-rule-001",
          canonicalClass: "feedback",
          kind: "rule",
          scopeKey: "scope-project-001",
          subjectKey: "landing gate",
          currentObjectId: "memory-rule",
          currentIdentityKey: "rule-001",
          updatedAt: new Date(1000),
        },
      ],
      sets: [
        {
          id: "set-001",
          setKey: "feedback:procedure:scope-project-001",
          canonicalClass: "feedback",
          kind: "procedure",
          scopeKey: "scope-project-001",
          memoryObjectId: "memory-procedure",
          sortKey: "procedure-001",
          updatedAt: new Date(1000),
        },
      ],
      existingFileContent: "# AGENTS.md\n\nHuman instructions.\n",
    });

    expect(result.renderedText).toContain("## Generated Memory Rules");
    expect(result.renderedText).toContain("landing gate | do: use gate-command-001 before landing");
    expect(result.renderedText).toContain("## Generated Procedures");
    expect(result.outputFileContent).toContain("# AGENTS.md");
    expect(result.outputFileContent).toContain("Human instructions.");
  });
});
