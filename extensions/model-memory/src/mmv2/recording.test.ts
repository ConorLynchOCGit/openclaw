import { describe, expect, it } from "vitest";
import { recordShadowMemoryBatch } from "./recording.ts";
import {
  buildAdmissionDecision,
  buildCanonicalCandidate,
  createMmV2TestSource,
} from "./test-helpers.ts";

describe("mmv2/recording", () => {
  it("carries model admission TTL advice into recorded memory validity", () => {
    const source = createMmV2TestSource("The current repair pass uses a temporary proof marker.");
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "The current repair pass uses a temporary proof marker.",
      {
        candidate_id: "candidate-pass-scoped",
      },
    );

    const batch = recordShadowMemoryBatch({
      eventId: source.rawEvent.event_id,
      canonicalBatch: {
        schema_version: "canonical_candidates.v1",
        event_id: source.rawEvent.event_id,
        canonical_candidates: [candidate],
      },
      admissionBatch: {
        schema_version: "admission_decision.v1",
        event_id: source.rawEvent.event_id,
        decisions: [
          buildAdmissionDecision(candidate.candidate_id, {
            decision: "admit",
            recommended_ttl_seconds: 86_400,
          }),
        ],
      },
      reconciliationDecisions: [],
    });

    expect(batch.durableMemories[0].validity.ttl_seconds).toBe(86_400);
    expect(batch.durableMemories[0].validity.temporal_status).toBe("current");
    expect(batch.memoryEvents[0].payload).toMatchObject({
      recommended_ttl_seconds: 86_400,
    });
  });
});
