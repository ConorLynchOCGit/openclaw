import { describe, expect, it } from "vitest";
import { buildHybridMemoryObjectSurfaceScaffolding } from "./hybrid-memory-surface-scaffolding.js";

describe("hybrid memory surface scaffolding", () => {
  it("prefers canonical metadata before promoted legacy metadata on approved memory surfaces", () => {
    const approved = buildHybridMemoryObjectSurfaceScaffolding({
      alias: "v",
      surfaceKind: "approved",
    });

    expect(approved.readSurface).toBe("approved_memory_view");
    expect(approved.reviewStateExpression).toBe("'approved'::text");
    expect(approved.compatibilityFamilyIdExpression).toContain(
      "v.metadata->'canonicalIngestionCandidate'->'record'->'compatibility'->>'transitionalFamilyId'",
    );
    expect(approved.autoCaptureTemplateExpression).toContain(
      "v.metadata->'canonicalIngestionCandidate'->'record'->'compatibility'->>'template'",
    );
    expect(approved.autoCaptureTemplateExpression).toContain(
      "v.metadata->'promotionMetadata'->'autoPromotion'->>'template'",
    );
    expect(approved.autoCaptureTemplateExpression).toContain(
      "v.metadata->'autoPromotion'->>'template'",
    );
  });

  it("keeps candidate-memory canonical matching candidate-only while sharing the legacy fallback fields", () => {
    const candidate = buildHybridMemoryObjectSurfaceScaffolding({
      alias: "v",
      surfaceKind: "reviewable_candidate",
    });

    expect(candidate.readSurface).toBe("reviewable_candidates_view");
    expect(candidate.reviewStateExpression).toBe("v.review_state::text");
    expect(candidate.autoCaptureTemplateExpression).not.toContain("promotionMetadata");
    expect(candidate.autoCaptureTemplateExpression).not.toContain("autoPromotion");
    expect(candidate.compatibilityFamilyIdExpression).not.toContain("promotionMetadata");
    expect(candidate.compatibilityFamilyIdExpression).toContain(
      "v.metadata->'candidateMetadata'->'canonicalIngestionCandidate'->'record'->'compatibility'->>'transitionalFamilyId'",
    );
    expect(candidate.autoCaptureFieldKeyExpression).not.toContain("promotionMetadata");
    expect(candidate.autoCaptureFieldKeyExpression).toContain(
      "v.metadata->'candidateMetadata'->'canonicalIngestionCandidate'->'record'->'facets'->>'fieldKey'",
    );
  });
});
