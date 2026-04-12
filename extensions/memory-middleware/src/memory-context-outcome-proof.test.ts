import { describe, expect, it, vi } from "vitest";
import { createMemoryContextOutcomeProofPort } from "./memory-context-outcome-proof.js";

describe("memory context outcome proof", () => {
  it("records an attached pack that survives to the next turn boundary without repeat correction", async () => {
    const record = vi.fn(async () => {});
    const port = createMemoryContextOutcomeProofPort({
      telemetry: {
        record,
        rootDir: ".local/memory-soak-test",
      },
    });

    await port.recordPromptAttachment({
      runId: "run-1",
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      agentId: "main",
      compiled: {
        text: "memory",
        hash: "pack-hash-1",
        attachedSlotCount: 1,
        omittedSlotCount: 0,
        packs: [
          {
            kind: "user",
            title: "User Memory Pack",
            text: "- Prefer concise answers.",
            hash: "user-pack-1",
            chars: 24,
            approxTokens: 6,
            slotKeys: ["user_preference|shared||main||user_response_concise"],
            semanticKeys: ["shared||main||user_response_concise"],
            omittedSlotKeys: [],
            sourceIds: ["memory-1"],
          },
        ],
      },
    });
    await port.recordLlmOutput({
      runId: "run-1",
      sessionId: "session-1",
    });
    await port.recordPromptAttachment({
      runId: "run-2",
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      agentId: "main",
      compiled: {
        text: "memory",
        hash: "pack-hash-2",
        attachedSlotCount: 1,
        omittedSlotCount: 0,
        packs: [
          {
            kind: "user",
            title: "User Memory Pack",
            text: "- Prefer concise answers.",
            hash: "user-pack-1",
            chars: 24,
            approxTokens: 6,
            slotKeys: ["user_preference|shared||main||user_response_concise"],
            semanticKeys: ["shared||main||user_response_concise"],
            omittedSlotKeys: [],
            sourceIds: ["memory-1"],
          },
        ],
      },
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "application",
        action: "memory_context_outcome",
        outcome: "pack_attached",
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "application",
        action: "memory_context_outcome",
        outcome: "response_observed",
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "application",
        action: "memory_context_outcome",
        outcome: "survived_turn_boundary",
        runId: "run-1",
      }),
    );
  });

  it("records a repeated correction when the next accepted candidate matches an attached semantic slot", async () => {
    const record = vi.fn(async () => {});
    const port = createMemoryContextOutcomeProofPort({
      telemetry: {
        record,
        rootDir: ".local/memory-soak-test",
      },
    });

    await port.recordPromptAttachment({
      runId: "run-1",
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      agentId: "main",
      compiled: {
        text: "memory",
        hash: "pack-hash-1",
        attachedSlotCount: 1,
        omittedSlotCount: 0,
        packs: [
          {
            kind: "user",
            title: "User Memory Pack",
            text: "- Prefer concise answers.",
            hash: "user-pack-1",
            chars: 24,
            approxTokens: 6,
            slotKeys: ["user_preference|shared||main||user_response_concise"],
            semanticKeys: ["shared||main||user_response_concise"],
            omittedSlotKeys: [],
            sourceIds: ["memory-1"],
          },
        ],
      },
    });
    await port.recordLlmOutput({
      runId: "run-1",
      sessionId: "session-1",
    });

    await port.recordCandidateSubmission({
      kind: "correction",
      accepted: true,
      input: {
        content: "No, keep answers concise.",
        sessionId: "session-1",
        agentId: "main",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              kind: "feedback",
              subject: "response style",
              statement: "Keep answers concise.",
              tags: ["requirement_correction", "response_style"],
              facets: {},
            },
            identity: {
              dedupeKey: "user.response.concise",
            },
          },
        },
      },
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "application",
        action: "memory_context_outcome",
        outcome: "repeated_correction",
        correctionKind: "correction",
        matchedSlotKeys: ["shared||main||user_response_concise"],
      }),
    );
  });

  it("records guidance alignment when learned-guidance suggestions overlap attached approved sources", async () => {
    const record = vi.fn(async () => {});
    const port = createMemoryContextOutcomeProofPort({
      telemetry: {
        record,
        rootDir: ".local/memory-soak-test",
      },
    });

    await port.recordPromptAttachment({
      runId: "run-1",
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      agentId: "main",
      compiled: {
        text: "memory",
        hash: "pack-hash-1",
        attachedSlotCount: 1,
        omittedSlotCount: 0,
        packs: [
          {
            kind: "project",
            title: "Project Memory Pack",
            text: "- Default branch: main",
            hash: "project-pack-1",
            chars: 22,
            approxTokens: 6,
            slotKeys: ["project_rule|project|maintenance|||project_maintenance_default_branch"],
            semanticKeys: ["project|maintenance|||project_maintenance_default_branch"],
            omittedSlotKeys: [],
            sourceIds: ["memory-branch-1"],
          },
        ],
      },
    });

    await port.recordGuidancePlan({
      runId: "run-1",
      sessionId: "session-1",
      result: {
        accepted: true,
        status: "ok",
        outcome: "guidance_available",
        advisoryOnly: true,
        advisoryNote: "Use the attached rule.",
        query: "How should I land this?",
        applicationMode: "guidance_only",
        suggestions: [
          {
            memoryObjectId: "memory-branch-1",
            score: 0.92,
            memoryState: "approved",
            matchedFields: ["content_substring"],
            content: "Default branch is main.",
            captureClass: "workflow_generalized_guidance",
            provenance: "native_capture",
            relevance: ["matches project workflow"],
          },
        ],
        suppressedConflicts: [],
        rationale: [],
        rolloutScope: {
          rolloutPhase: "bounded_rollout_proof_v1",
          enablementTarget: "off-production",
          mode: "inline-only",
          source: "approved_preferred_workflow_guidance",
          approvedOnly: false,
          approvedPreferred: true,
          candidateAdvisoryIncluded: true,
          advisoryOnly: true,
          inlineOnly: true,
          allowedCaptureClasses: ["workflow_generalized_guidance"],
          defaultMaxSuggestions: 2,
        },
        observability: {
          outcomeCode: "guidance_available",
          retrievedRecordCount: 1,
          eligibleWorkflowGuidanceCount: 1,
          filteredOutByScopeCount: 0,
          suggestionCount: 1,
          suppressedConflictCount: 0,
          nativeSuggestionCount: 1,
          selfImprovingSuggestionCount: 0,
          estimatedPromptTokens: 12,
          reasons: [],
        },
      },
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "application",
        action: "memory_context_outcome",
        outcome: "guidance_aligned",
        matchedSourceIds: ["memory-branch-1"],
      }),
    );
  });

  it("records guidance misses when attached memory does not supply the learned-guidance result", async () => {
    const record = vi.fn(async () => {});
    const port = createMemoryContextOutcomeProofPort({
      telemetry: {
        record,
        rootDir: ".local/memory-soak-test",
      },
    });

    await port.recordPromptAttachment({
      runId: "run-1",
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      agentId: "main",
      compiled: {
        text: "memory",
        hash: "pack-hash-1",
        attachedSlotCount: 1,
        omittedSlotCount: 0,
        packs: [
          {
            kind: "project",
            title: "Project Memory Pack",
            text: "- Default branch is main.",
            hash: "project-pack-1",
            chars: 24,
            approxTokens: 6,
            slotKeys: ["project_rule|project|maintenance|||project_maintenance_default_branch"],
            semanticKeys: ["project|maintenance|||project_maintenance_default_branch"],
            omittedSlotKeys: [],
            sourceIds: ["memory-branch-1"],
          },
        ],
      },
    });

    await port.recordGuidancePlan({
      runId: "run-1",
      sessionId: "session-1",
      result: {
        accepted: true,
        status: "ok",
        outcome: "guidance_available",
        advisoryOnly: true,
        advisoryNote: "Use the workflow guidance.",
        query: "How should I land this?",
        applicationMode: "guidance_only",
        suggestions: [
          {
            memoryObjectId: "memory-other-1",
            score: 0.82,
            memoryState: "approved",
            matchedFields: ["content_substring"],
            content: "Use the release checklist.",
            captureClass: "workflow_generalized_guidance",
            provenance: "native_capture",
            relevance: ["matches workflow"],
          },
        ],
        suppressedConflicts: [],
        rationale: [],
        rolloutScope: {
          rolloutPhase: "bounded_rollout_proof_v1",
          enablementTarget: "off-production",
          mode: "inline-only",
          source: "approved_preferred_workflow_guidance",
          approvedOnly: false,
          approvedPreferred: true,
          candidateAdvisoryIncluded: true,
          advisoryOnly: true,
          inlineOnly: true,
          allowedCaptureClasses: ["workflow_generalized_guidance"],
          defaultMaxSuggestions: 2,
        },
        observability: {
          outcomeCode: "guidance_available",
          retrievedRecordCount: 1,
          eligibleWorkflowGuidanceCount: 1,
          filteredOutByScopeCount: 0,
          suggestionCount: 1,
          suppressedConflictCount: 0,
          nativeSuggestionCount: 1,
          selfImprovingSuggestionCount: 0,
          estimatedPromptTokens: 10,
          reasons: [],
        },
      },
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "application",
        action: "memory_context_outcome",
        outcome: "guidance_missed",
        suggestionCount: 1,
      }),
    );
  });
});
