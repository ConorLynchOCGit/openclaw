import { describe, expect, it } from "vitest";
import { buildMemoryObjectSurfaceReadScaffolding } from "./memory-object-surface-read-scaffolding.js";

describe("memory-object-surface-read-scaffolding", () => {
  it("builds approved-memory read scaffolding with artifact visibility filtering", () => {
    const scaffolding = buildMemoryObjectSurfaceReadScaffolding({
      alias: "v",
      surfaceKind: "approved",
      hiddenApprovedArtifactFamilies: ["workflow_phrase_pattern", "response_style_phrase_pattern"],
    });

    expect(scaffolding).toMatchObject({
      internalViewName: "internal_approved_memory_v",
      readSurface: "approved_memory_view",
      reviewStateExpression: "'approved'::text",
    });
    expect(scaffolding.baseConditions).toHaveLength(1);
    expect(scaffolding.baseConditions[0]).toContain("workflow_phrase_pattern");
    expect(scaffolding.baseConditions[0]).toContain("response_style_phrase_pattern");
  });

  it("keeps candidate reads on explicit review-state filtering instead of approved artifact hiding", () => {
    const scaffolding = buildMemoryObjectSurfaceReadScaffolding({
      alias: "v",
      surfaceKind: "reviewable_candidate",
      hiddenApprovedArtifactFamilies: ["workflow_phrase_pattern", "response_style_phrase_pattern"],
    });

    expect(scaffolding).toEqual({
      internalViewName: "internal_reviewable_candidates_v",
      readSurface: "reviewable_candidates_view",
      reviewStateExpression: "v.review_state::text",
      baseConditions: ["v.review_state = 'candidate'"],
    });
  });
});
