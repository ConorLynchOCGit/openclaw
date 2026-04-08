import { describe, expect, it } from "vitest";
import {
  CANONICAL_MEMORY_SEMANTIC_FALLBACK_STRATEGIES,
  createCanonicalMemoryRetrievalPlan,
} from "./memory-canonical-retrieval.js";

describe("memory-canonical-retrieval", () => {
  it("defines the bounded semantic fallback strategies", () => {
    expect(CANONICAL_MEMORY_SEMANTIC_FALLBACK_STRATEGIES).toEqual([
      "procedure",
      "environment_constraint",
      "workflow_tool_gotcha",
      "api_workaround",
    ]);
  });

  it("creates canonical retrieval plans with normalized filters and views", () => {
    const plan = createCanonicalMemoryRetrievalPlan({
      query: {
        rawQuery: "  what is the atlas staging branch  ",
        normalizedQuery: "what is the atlas staging branch",
        requestedKinds: ["project", "reference", "project"],
        scope: { kind: "mixed" },
        derivedViews: ["project_fact", "project_fact", "project_lookup"],
        facetFilters: [
          { key: " fieldKey ", operator: "equals", value: "staging_branch" },
          { key: "projectScope", operator: "present" },
        ],
      },
      ranking: {
        preferValidationStatuses: ["validated", "approved", "approved"],
        boostFacetFilters: [{ key: "fieldKey", operator: "equals", value: "staging_branch" }],
        preferApprovedWithinSubjectClusters: true,
        semanticFallbackStrategies: ["environment_constraint", "environment_constraint"],
      },
    });

    expect(plan).toMatchObject({
      query: {
        rawQuery: "what is the atlas staging branch",
        requestedKinds: ["project", "reference"],
        derivedViews: ["project_fact", "project_lookup"],
        facetFilters: [
          { key: "fieldKey", operator: "equals", value: "staging_branch" },
          { key: "projectScope", operator: "present" },
        ],
      },
      ranking: {
        preferValidationStatuses: ["validated", "approved"],
        semanticFallbackStrategies: ["environment_constraint"],
      },
    });
  });
});
