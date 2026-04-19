import { describe, expect, it } from "vitest";
import { applyDeterministicReconciliationShortcuts, reconcileCandidate } from "./reconciliation.ts";
import {
  buildCanonicalCandidate,
  buildExistingMemorySummary,
  captureOne,
  createMmV2TestSource,
  createScriptedMmV2Interpreter,
} from "./test-helpers.ts";

describe("mmv2/reconciliation", () => {
  it("detects exact duplicates via deterministic shortcut", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "I prefer concise answers.",
    );
    const existing = buildExistingMemorySummary(candidate);

    const result = applyDeterministicReconciliationShortcuts(candidate, [existing]);
    expect(result?.decision).toBe("keep_existing_ignore_candidate");
  });

  it("supersedes older preference states via deterministic shortcut", () => {
    const source = createMmV2TestSource("I prefer detailed answers.");
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "I prefer detailed answers.",
      {
        payload: {
          claim_type: "preference_state",
          subject: "user",
          predicate: "prefers",
          object: "detailed answers",
        },
      },
    );
    const existing = buildExistingMemorySummary(candidate, {
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object: "concise answers",
      },
    });

    const result = applyDeterministicReconciliationShortcuts(candidate, [existing]);
    expect(result?.decision).toBe("supersede_existing");
    expect(result?.conflict_type).toBe("preference_changed");
  });

  it("falls through to the model path for scoped conflicts", async () => {
    const source = createMmV2TestSource("In this project, prefer detailed answers.");
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "In this project, prefer detailed answers.",
    );
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-reconciliation-v1": () =>
        captureOne({
          schema_version: "reconciliation_decision.v1",
          event_id: source.rawEvent.event_id,
          candidate_id: candidate.candidate_id,
          decision: "record_as_conflict",
          target_memory_ids: ["memory-001"],
          merged_canonical_text: null,
          conflict_type: "scope_narrowing",
          supersedes_memory_ids: [],
          rationale: "Project-scoped preference narrows an existing global preference.",
          confidence: 0.81,
        }),
    });

    const result = await reconcileCandidate({
      eventId: source.rawEvent.event_id,
      candidate,
      neighbors: [],
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
    });

    expect(result.conflict_type).toBe("scope_narrowing");
  });
});
