import { describe, expect, it } from "vitest";
import { createMemoryContextOutcomeTracker } from "./memory-context-outcome-tracker.js";

describe("memory context outcome tracker", () => {
  it("stores generated run ids in observations when prompt attachments omit them", () => {
    const tracker = createMemoryContextOutcomeTracker();

    const observations = tracker.recordPromptAttachment({
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
            slotKeys: ["user_preference|shared|||user_response_concise"],
            semanticKeys: ["shared||||user_response_concise"],
            omittedSlotKeys: [],
            sourceIds: ["memory-1"],
          },
        ],
      },
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]?.outcome).toBe("pack_attached");
    expect(observations[0]?.runId).toMatch(/^memory-context-run:/u);
  });

  it("records survival after explicit application separately from generic boundary survival", () => {
    const tracker = createMemoryContextOutcomeTracker();

    tracker.recordPromptAttachment({
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
            text: "- Use scripts/committer.",
            hash: "project-pack-1",
            chars: 24,
            approxTokens: 6,
            slotKeys: ["workflow_guidance|shared||main||commit_flow"],
            semanticKeys: ["shared||main||workflow_commit_flow"],
            omittedSlotKeys: [],
            sourceIds: ["memory-1"],
          },
        ],
      },
    });
    tracker.recordLlmOutput({
      runId: "run-1",
      sessionId: "session-1",
    });
    tracker.recordGuidancePlan({
      runId: "run-1",
      sessionId: "session-1",
      result: {
        accepted: true,
        status: "ok",
        outcome: "guidance_available",
        advisoryOnly: true,
        advisoryNote: "Use the attached workflow guidance.",
        query: "How should I land this?",
        applicationMode: "guidance_only",
        suggestions: [
          {
            memoryObjectId: "memory-1",
            score: 0.92,
            memoryState: "approved",
            matchedFields: ["content_substring"],
            content: "Use scripts/committer.",
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
          estimatedPromptTokens: 8,
          reasons: [],
        },
      },
    });

    const nextTurn = tracker.recordPromptAttachment({
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
            kind: "project",
            title: "Project Memory Pack",
            text: "- Use scripts/committer.",
            hash: "project-pack-1",
            chars: 24,
            approxTokens: 6,
            slotKeys: ["workflow_guidance|shared||main||commit_flow"],
            semanticKeys: ["shared||main||workflow_commit_flow"],
            omittedSlotKeys: [],
            sourceIds: ["memory-1"],
          },
        ],
      },
    });

    expect(nextTurn).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "survived_after_application",
          matchedSourceIds: ["memory-1"],
        }),
      ]),
    );
  });
});
