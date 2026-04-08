import { describe, expect, it } from "vitest";
import { buildHybridMemoryObjectSurfaceScaffolding } from "./hybrid-memory-surface-scaffolding.js";

describe("hybrid memory surface scaffolding", () => {
  it("keeps approved-memory template matching aware of promoted metadata", () => {
    const approved = buildHybridMemoryObjectSurfaceScaffolding({
      alias: "v",
      surfaceKind: "approved",
    });

    expect(approved.readSurface).toBe("approved_memory_view");
    expect(approved.reviewStateExpression).toBe("'approved'::text");
    expect(approved.autoCaptureTemplateExpression).toContain(
      "v.metadata->'promotionMetadata'->'autoPromotion'->>'template'",
    );
    expect(approved.autoCaptureTemplateExpression).toContain(
      "v.metadata->'autoPromotion'->>'template'",
    );
  });

  it("keeps candidate-memory template matching candidate-only while sharing the rest", () => {
    const candidate = buildHybridMemoryObjectSurfaceScaffolding({
      alias: "v",
      surfaceKind: "reviewable_candidate",
    });

    expect(candidate.readSurface).toBe("reviewable_candidates_view");
    expect(candidate.reviewStateExpression).toBe("v.review_state::text");
    expect(candidate.autoCaptureTemplateExpression).not.toContain("promotionMetadata");
    expect(candidate.autoCaptureTemplateExpression).not.toContain("autoPromotion");
    expect(candidate.autoCaptureFieldKeyExpression).toContain(
      "v.metadata->'promotionMetadata'->'autoPromotion'->>'fieldKey'",
    );
  });
});
