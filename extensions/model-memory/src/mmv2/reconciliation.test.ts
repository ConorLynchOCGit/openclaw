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

  it("does not supersede older preference states via deterministic semantic shortcut", () => {
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
    expect(result).toBeNull();
  });

  it("supersedes only structurally targeted preferences from explicit correction candidates", () => {
    const correctionPrompt =
      "Durable correction targeting memory_id=memory-older-same-subject: replace PRIOR-PREF with this standing preference: concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons. Please store the correction and supersede the targeted preference if durable.";
    const source = createMmV2TestSource(correctionPrompt);
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      correctionPrompt,
      {
        candidate_id: `det-correction-preference:${source.segmented.segments[0].segment_id}`,
        canonical_text:
          "The user prefers concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons.",
        payload: {
          claim_type: "preference_state",
          subject: "user",
          predicate: "prefers",
          object:
            "concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons",
          qualifiers: [],
        },
        scope: {
          tenant_id: source.rawEvent.tenant_id,
          user_id: source.rawEvent.user_id,
          project_id: null,
          workspace_id: null,
          subject_type: "user",
          subject_id: "user",
          applies_to: "current_workspace",
        },
      },
    );
    const olderWithMissingSubject = buildExistingMemorySummary(candidate, {
      memory_id: "memory-older-null-subject",
      scope: {
        tenant_id: source.rawEvent.tenant_id,
        user_id: source.rawEvent.user_id,
        project_id: null,
        workspace_id: null,
        subject_type: "user",
        subject_id: null,
        applies_to: "current_workspace",
      },
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object: "concise status first, then detailed evidence, then exact artifact paths",
      },
    });
    const olderWithSameSubject = buildExistingMemorySummary(candidate, {
      memory_id: "memory-older-same-subject",
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object: "concise status first, then detailed evidence, then exact artifact paths",
      },
    });

    const result = applyDeterministicReconciliationShortcuts(candidate, [
      olderWithMissingSubject,
      olderWithSameSubject,
    ]);

    expect(result?.decision).toBe("supersede_existing");
    expect(result?.supersedes_memory_ids).toEqual(["memory-older-same-subject"]);
    expect(result?.target_memory_ids).toEqual(["memory-older-same-subject"]);
  });

  it("structural correction target resolution wins over exact duplicate neighbors", () => {
    const correctionPrompt =
      "Durable correction targeting memory_id=memory-target: replace PRIOR-PREF with this standing preference: concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons. Please store the correction and supersede only the targeted preference if durable.";
    const source = createMmV2TestSource(correctionPrompt);
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      correctionPrompt,
      {
        candidate_id: `det-correction-preference:${source.segmented.segments[0].segment_id}`,
        canonical_text:
          "The user prefers concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons.",
        payload: {
          claim_type: "preference_state",
          subject: "user",
          predicate: "prefers",
          object:
            "concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons",
          qualifiers: [],
        },
        scope: {
          tenant_id: source.rawEvent.tenant_id,
          user_id: source.rawEvent.user_id,
          project_id: null,
          workspace_id: null,
          subject_type: "user",
          subject_id: "user",
          applies_to: "current_workspace",
        },
      },
    );
    const target = buildExistingMemorySummary(candidate, {
      memory_id: "memory-target",
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object: "concise status first, then detailed evidence, then exact artifact paths",
      },
    });
    const exactDuplicateElsewhere = buildExistingMemorySummary(candidate, {
      memory_id: "memory-existing-duplicate",
      canonical_text:
        "The user prefers concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons.",
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object:
          "concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons",
        qualifiers: [],
      },
    });

    const result = applyDeterministicReconciliationShortcuts(candidate, [
      exactDuplicateElsewhere,
      target,
    ]);

    expect(result?.decision).toBe("supersede_existing");
    expect(result?.target_memory_ids).toEqual(["memory-target"]);
    expect(result?.supersedes_memory_ids).toEqual(["memory-target"]);
  });

  it("does not fuzzy-supersede from explicit correction candidates without structural targets", () => {
    const correctionPrompt =
      "Durable correction: replace PRIOR-PREF with this standing preference: concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons. Please store the correction and supersede the earlier preference if durable.";
    const source = createMmV2TestSource(correctionPrompt);
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      correctionPrompt,
      {
        candidate_id: `det-correction-preference:${source.segmented.segments[0].segment_id}`,
        canonical_text:
          "The user prefers concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons.",
        payload: {
          claim_type: "preference_state",
          subject: "user",
          predicate: "prefers",
          object:
            "concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons",
          qualifiers: [],
        },
        scope: {
          tenant_id: source.rawEvent.tenant_id,
          user_id: source.rawEvent.user_id,
          project_id: null,
          workspace_id: null,
          subject_type: "user",
          subject_id: "user",
          applies_to: "current_workspace",
        },
      },
    );
    const olderWithSameSubject = buildExistingMemorySummary(candidate, {
      memory_id: "memory-older-same-subject",
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object: "concise status first, then detailed evidence, then exact artifact paths",
      },
    });

    const result = applyDeterministicReconciliationShortcuts(candidate, [olderWithSameSubject]);

    expect(result?.decision).toBe("insert_new");
    expect(result?.conflict_type).toBe("ambiguous");
    expect(result?.supersedes_memory_ids).toEqual([]);
    expect(result?.target_memory_ids).toEqual([]);
  });

  it("does not resolve narrower-scoped preference conflicts without model reconciliation", () => {
    const source = createMmV2TestSource("For this project, I prefer detailed answers.");
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "I prefer detailed answers.",
      {
        scope: {
          tenant_id: source.rawEvent.tenant_id,
          user_id: source.rawEvent.user_id,
          project_id: "project-001",
          workspace_id: null,
          subject_type: "user",
          subject_id: "user",
          applies_to: "current_project",
        },
        payload: {
          claim_type: "preference_state",
          subject: "user",
          predicate: "prefers",
          object: "detailed answers",
        },
      },
    );
    const existing = buildExistingMemorySummary(candidate, {
      scope: {
        tenant_id: source.rawEvent.tenant_id,
        user_id: source.rawEvent.user_id,
        project_id: null,
        workspace_id: null,
        subject_type: "user",
        subject_id: "user",
        applies_to: "global",
      },
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object: "concise answers",
      },
    });

    const result = applyDeterministicReconciliationShortcuts(candidate, [existing]);
    expect(result).toBeNull();
  });

  it("falls through to the model path for scoped conflicts", async () => {
    const source = createMmV2TestSource("In this project, prefer detailed answers.");
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "In this project, prefer detailed answers.",
      {
        scope: {
          tenant_id: source.rawEvent.tenant_id,
          user_id: source.rawEvent.user_id,
          project_id: "project-001",
          workspace_id: null,
          subject_type: "user",
          subject_id: "user",
          applies_to: "current_project",
        },
        payload: {
          claim_type: "preference_state",
          subject: "user",
          predicate: "prefers",
          object: "detailed answers",
        },
      },
    );
    const existing = buildExistingMemorySummary(candidate, {
      memory_id: "memory-001",
      scope: {
        tenant_id: source.rawEvent.tenant_id,
        user_id: source.rawEvent.user_id,
        project_id: null,
        workspace_id: null,
        subject_type: "user",
        subject_id: "user",
        applies_to: "global",
      },
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object: "concise answers",
      },
    });
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
      neighbors: [existing],
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
    });

    expect(result.conflict_type).toBe("scope_narrowing");
  });
});
