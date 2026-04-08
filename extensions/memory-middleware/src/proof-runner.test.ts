import { describe, expect, it } from "vitest";
import {
  buildProofLifecycleArtifacts,
  parseMemoryProofPlan,
  runMemoryProofPlan,
  validateHybridSearchProofResult,
} from "./proof-runner.js";

describe("parseMemoryProofPlan", () => {
  it("accepts bounded transcript-to-search proof plans", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "workflow tool gotcha proof",
      steps: [
        {
          id: "capture",
          kind: "transcript_capture",
          text: "Do not use git stash in this repo during multi-agent work.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectation: {
            family: "workflow_improvement",
            key: "workflow_tool_gotcha:git_stash_unsafe",
            subjectKey: "workflow_tool_gotcha:git_stash_unsafe",
            projectId: "project-1",
          },
        },
        {
          id: "review",
          kind: "candidate_review",
          candidateIdFromStep: "capture",
          outcome: "accepted",
        },
        {
          id: "promote",
          kind: "candidate_promote_memory",
          candidateIdFromStep: "capture",
        },
        {
          id: "search",
          kind: "hybrid_search",
          query: "can i temporarily shelve my changes while someone else edits this repo",
          kindFilter: "project",
          projectId: "project-1",
          expectation: {
            recordIdFromStep: "promote",
            matchedFieldsInclude: ["semantic_embedding", "semantic_fallback"],
          },
        },
      ],
    });

    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[0]?.kind).toBe("transcript_capture");
    expect(plan.steps[3]?.kind).toBe("hybrid_search");
  });

  it("accepts transcript steps that explicitly expect no lifecycle writes", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "generic workflow ambiguity proof",
      steps: [
        {
          id: "capture_vague_complaint",
          kind: "transcript_capture",
          text: "Build and rollout stuff has felt noisy lately.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectNoLifecycle: true,
        },
      ],
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      kind: "transcript_capture",
      expectNoLifecycle: true,
    });
  });

  it("accepts workflow phrase-pattern transcript capture expectations", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "workflow phrase induction proof",
      steps: [
        {
          id: "capture_phrase",
          kind: "transcript_capture",
          text: "Prefer bulletized proof IDs for release proof notes instead of paraphrased rollout summaries.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectation: {
            family: "workflow_phrase_pattern",
            key: "pattern-key-1",
            subjectKey: "target-key-1",
            normalizedPhrase:
              "prefer bulletized proof ids for release proof notes instead of paraphrased rollout summaries.",
            projectId: "project-1",
          },
        },
      ],
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      kind: "transcript_capture",
      expectation: {
        family: "workflow_phrase_pattern",
        key: "pattern-key-1",
      },
    });
  });

  it("accepts response-style phrase-pattern transcript capture expectations", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "response-style phrase induction proof",
      steps: [
        {
          id: "capture_phrase",
          kind: "transcript_capture",
          text: "Keep it short.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectation: {
            family: "response_style_phrase_pattern",
            key: "pattern-key-1",
            subjectKey: "target-key-1",
            normalizedPhrase: "keep it short.",
          },
        },
      ],
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      kind: "transcript_capture",
      expectation: {
        family: "response_style_phrase_pattern",
        key: "pattern-key-1",
      },
    });
  });

  it("accepts project-rule transcript capture expectations", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "project rule proof",
      steps: [
        {
          id: "capture_project_rule",
          kind: "transcript_capture",
          text: "For project Atlas, use generated audit IDs for audit events instead of client timestamps.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectation: {
            family: "project_rule",
            key: "project-rule-key-1",
            subjectKey: "project-rule-subject-key-1",
            projectId: "project-1",
          },
        },
      ],
    });

    expect(plan.steps[0]).toMatchObject({
      kind: "transcript_capture",
      expectation: {
        family: "project_rule",
        key: "project-rule-key-1",
      },
    });
  });

  it("accepts unmet-need transcript capture expectations", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "unmet need proof",
      steps: [
        {
          id: "capture_unmet_need",
          kind: "transcript_capture",
          text: "For project Atlas, we need a release evidence template for rollout audits.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectation: {
            family: "unmet_need",
            key: "unmet-need-key-1",
            subjectKey: "unmet-need-subject-key-1",
            projectId: "project-1",
          },
        },
      ],
    });

    expect(plan.steps[0]).toMatchObject({
      kind: "transcript_capture",
      expectation: {
        family: "unmet_need",
        key: "unmet-need-key-1",
      },
    });
  });

  it("rejects duplicate step ids", () => {
    expect(() =>
      parseMemoryProofPlan({
        mode: "production",
        label: "bad plan",
        steps: [
          {
            id: "dup",
            kind: "hybrid_search",
            query: "git stash unsafe",
          },
          {
            id: "dup",
            kind: "hybrid_search",
            query: "git stash unsafe",
          },
        ],
      }),
    ).toThrow(/duplicate proof step id/i);
  });

  it("requires a candidate reference for candidate review", () => {
    expect(() =>
      parseMemoryProofPlan({
        mode: "isolated",
        label: "missing candidate ref",
        steps: [
          {
            id: "review",
            kind: "candidate_review",
            outcome: "accepted",
          },
        ],
      }),
    ).toThrow(/candidate_review requires candidateId or candidateIdFromStep/i);
  });

  it("requires transcript capture to declare either expectation or ignore mode", () => {
    expect(() =>
      parseMemoryProofPlan({
        mode: "isolated",
        label: "missing capture expectation",
        steps: [
          {
            id: "capture",
            kind: "transcript_capture",
            text: "Use this instead.",
            sessionFile: "/tmp/proof.jsonl",
            sessionKey: "agent:test:proof",
            agentExternalKey: "chief",
            attribution: {
              agentId: "agent-1",
              sessionId: "session-1",
              projectId: "project-1",
            },
          },
        ],
      }),
    ).toThrow(/transcript_capture requires expectation or expectNoLifecycle/i);
  });
});

describe("registry-driven proof helpers", () => {
  it("derives approved-memory artifacts for a corrected bounded family proof", () => {
    expect(
      buildProofLifecycleArtifacts({
        artifactMode: "approved_memory_object",
        inspection: {
          matchingApprovedObjectId: "approved-fact-1",
          pendingCandidate: {
            id: "candidate-fact-1",
            sourceEventId: "event-fact-1",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            expiresAt: "2026-04-04T00:00:00.000Z",
            confirmationState: "pending_confirmation",
          },
          activeApprovedSubjectObjectIds: ["approved-fact-1"],
          pendingSubjectCandidateIds: ["candidate-fact-1"],
        },
      }),
    ).toEqual({
      candidateId: "candidate-fact-1",
      candidateEventId: "event-fact-1",
      approvedObjectId: "approved-fact-1",
    });
  });

  it("derives phrase-pattern artifacts without pretending phrase candidates are memory objects", () => {
    expect(
      buildProofLifecycleArtifacts({
        artifactMode: "phrase_pattern",
        inspection: {
          matchingApprovedObjectId: "phrase-approved-1",
          pendingCandidate: {
            id: "phrase-candidate-1",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            expiresAt: "2026-04-04T00:00:00.000Z",
          },
          conflictingApprovedObjectIds: [],
          conflictingPendingCandidateIds: [],
        },
      }),
    ).toEqual({
      candidateId: "phrase-candidate-1",
      approvedObjectId: "phrase-approved-1",
    });
  });

  it("validates retrieval-evidence matched fields for proof search steps", () => {
    expect(() =>
      validateHybridSearchProofResult({
        stepId: "search-proof",
        expectedRecordId: "memory-1",
        expectation: {
          matchedFieldsInclude: ["project_fact_scope_match", "semantic_fallback"],
        },
        result: {
          accepted: true,
          status: "ok",
          scope: "approved_only",
          query: "atlas evidence dashboard",
          records: [
            {
              objectType: "memory_object",
              readSurface: "approved_memory_view",
              id: "memory-1",
              memoryKind: "project",
              reviewState: "approved",
              content: "For project Atlas, the evidence dashboard is atlas-rollout.",
              projectId: "project-1",
              agentId: "agent-1",
              sessionId: "session-1",
              metadata: {},
              createdAt: "2026-04-01T00:00:00.000Z",
              updatedAt: "2026-04-01T00:00:00.000Z",
              score: 321,
              matchedFields: ["project_fact_scope_match", "semantic_fallback"],
            },
          ],
        },
      }),
    ).not.toThrow();
  });
});

describe("runMemoryProofPlan", () => {
  it("executes sequential proof steps and threads artifacts between them", async () => {
    const review = async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "candidate-1",
      outcome: "accepted" as const,
      reviewId: "review-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    });
    const promoteToMemory = async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "candidate-1",
      promotedMemoryObjectId: "approved-1",
      promotedMemoryKind: "project" as const,
      promotedReviewState: "approved" as const,
      sourceEventId: "event-1",
    });

    const result = await runMemoryProofPlan({
      plan: parseMemoryProofPlan({
        mode: "isolated",
        label: "executor proof",
        steps: [
          {
            id: "review",
            kind: "candidate_review",
            candidateId: "candidate-1",
            outcome: "accepted",
          },
          {
            id: "promote",
            kind: "candidate_promote_memory",
            candidateIdFromStep: "review",
          },
        ],
      }),
      cfg: { plugins: {} } as never,
      runtime: {
        config: {
          database: {
            driver: "postgres",
            schema: "memory_middleware",
            url: "",
          },
        },
        candidateReview: { review },
        candidatePromotion: { promoteToMemory },
      } as never,
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {},
      },
    });

    expect(result.steps).toEqual([
      {
        id: "review",
        kind: "candidate_review",
        artifacts: {
          candidateId: "candidate-1",
          reviewId: "review-1",
        },
        outcome: "accepted",
        accepted: true,
        status: "recorded",
      },
      {
        id: "promote",
        kind: "candidate_promote_memory",
        artifacts: {
          candidateId: "candidate-1",
          promotedMemoryObjectId: "approved-1",
        },
        accepted: true,
        status: "promoted",
      },
    ]);
  });
});
