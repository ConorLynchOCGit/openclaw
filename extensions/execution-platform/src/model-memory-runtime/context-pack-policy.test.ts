import { describe, expect, it } from "vitest";
import { assembleBoundedContextPack, type ContextPackBudget } from "./context-pack-policy.ts";

const budget: ContextPackBudget = {
  maxTotalTokens: 5_000,
  maxRetrievalPackTokens: 2_000,
  maxProjectionTokens: 1_000,
  maxStableMemoryTokens: 1_000,
  maxToolResultSummaryTokens: 600,
  maxCloseoutContextTokens: 1_000,
  sessionContextRemainingTokens: 5_000,
};

describe("context pack policy", () => {
  it("inserts a bounded pack under budget", () => {
    const decision = assembleBoundedContextPack({
      budget,
      segments: [
        {
          segmentId: "retrieval-1",
          kind: "retrieval_pack",
          tokenEstimate: 800,
          ref: "memory://retrieval/1",
          boundedSummary: "retrieval summary",
        },
      ],
    });

    expect(decision.decision).toBe("insert_bounded_pack");
    expect(decision.totalTokenEstimate).toBe(800);
    expect(decision.rawTranscriptStored).toBe(false);
  });

  it("trims over-budget and duplicate refs without rewriting memory", () => {
    const decision = assembleBoundedContextPack({
      budget,
      segments: [
        {
          segmentId: "retrieval-1",
          kind: "retrieval_pack",
          tokenEstimate: 1_000,
          ref: "memory://retrieval/1",
          boundedSummary: "retrieval summary",
        },
        {
          segmentId: "retrieval-duplicate",
          kind: "retrieval_pack",
          tokenEstimate: 100,
          ref: "memory://retrieval/1",
          boundedSummary: "duplicate",
        },
        {
          segmentId: "retrieval-too-large",
          kind: "retrieval_pack",
          tokenEstimate: 4_000,
          ref: "memory://retrieval/2",
          boundedSummary: "too large",
        },
      ],
    });

    expect(decision.decision).toBe("trimmed_bounded_pack");
    expect(decision.selectedRefs).toHaveLength(1);
    expect(decision.skippedRefs).toHaveLength(2);
    expect(decision.reasonCodes).toContain("context_pack_segments_skipped_or_trimmed");
  });

  it("skips stale-only packs", () => {
    const decision = assembleBoundedContextPack({
      budget,
      segments: [
        {
          segmentId: "stale",
          kind: "stable_memory",
          tokenEstimate: 200,
          ref: "memory://stable/stale",
          boundedSummary: "stale",
          stale: true,
        },
      ],
    });

    expect(decision.decision).toBe("skip_stale_only");
  });
});
