import { describe, expect, it, vi } from "vitest";
import type { OpenClawPluginToolContext } from "../../api.js";
import type { CandidateIngressPort } from "../candidate-ingress.js";
import type { CandidateSubmissionInput, CandidateSubmissionResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSelfImprovingCandidateCapturePort,
  type SelfImprovingCandidateCaptureInput,
} from "../self-improving-candidate-capture.js";
import {
  createMemorySelfImprovingCaptureCandidateTool,
  normalizeSelfImprovingCandidateCaptureInput,
} from "./memory-self-improving-capture-candidate.js";

function createAcceptedResult(kind: CandidateSubmissionInput["kind"]): CandidateSubmissionResult {
  return {
    accepted: true,
    status: "accepted",
    kind,
    storage: "database",
    reviewState: "candidate",
    eventId: "event-1",
    memoryObjectId: "memory-1",
  };
}

function createRuntime(params?: {
  mode?: "disabled" | "candidate-only";
  rolloutTarget?: "off-production" | "production-canary" | null;
  allowedLessonFamilies?: Array<"generalized_workflow_lesson">;
  learningResult?: CandidateSubmissionResult;
  correctionResult?: CandidateSubmissionResult;
  procedureResult?: CandidateSubmissionResult;
  improvementResult?: CandidateSubmissionResult;
}) {
  const mode = params?.mode ?? "candidate-only";
  const rolloutTarget =
    params?.rolloutTarget === null
      ? undefined
      : (params?.rolloutTarget ?? (mode === "candidate-only" ? "off-production" : undefined));
  const candidateIngress = {
    submitLearning: vi.fn(async () => params?.learningResult ?? createAcceptedResult("learning")),
    submitCorrectionSuggestion: vi.fn(
      async () => params?.correctionResult ?? createAcceptedResult("correction"),
    ),
    submitProcedureSuggestion: vi.fn(
      async () => params?.procedureResult ?? createAcceptedResult("procedure"),
    ),
    submitImprovementNote: vi.fn(
      async () => params?.improvementResult ?? createAcceptedResult("improvement"),
    ),
  };

  return {
    config: {
      database: {
        driver: "postgres",
        schema: "memory_middleware",
      },
      candidateIngress: {
        mode: "candidate-only",
      },
      memoryObjectQuery: {
        mode: "disabled",
      },
      backgroundJobs: {
        inspectionMode: "disabled",
        advisorySchedulingMode: "disabled",
        executeSchedulingMode: "disabled",
        advisoryJobClasses: ["proactive_plan"],
        executeJobClasses: ["proactive_execute_run_drift_check"],
      },
      autoCapture: {
        profile: "disabled",
        allowedAgents: ["chief", "main"],
      },
      autoPromotion: {
        profile: "disabled",
        allowedAgents: ["chief", "main"],
      },
      selfImprovingCapture: {
        mode,
        ...(rolloutTarget ? { rolloutTarget } : {}),
        allowedLessonFamilies: params?.allowedLessonFamilies ?? ["generalized_workflow_lesson"],
      },
      learnedGuidanceAdvisoryPlanning: {
        mode: "disabled",
        allowedLessonFamilies: ["generalized_workflow_lesson"],
        defaultMaxSuggestions: 3,
      },
    },
    candidateIngress,
    candidateReview: {
      review: vi.fn(async () => ({
        accepted: true as const,
        status: "recorded" as const,
        candidateId: "candidate-previous",
        outcome: "rejected" as const,
        reviewId: "review-1",
        memoryObjectStateChanged: true as const,
        reviewState: "rejected" as const,
      })),
    },
    selfImprovingCandidateCapture: createSelfImprovingCandidateCapturePort({
      config: {
        database: {
          driver: "postgres",
          schema: "memory_middleware",
        },
        candidateIngress: {
          mode: "candidate-only",
        },
        memoryObjectQuery: {
          mode: "disabled",
        },
        backgroundJobs: {
          inspectionMode: "disabled",
          advisorySchedulingMode: "disabled",
          executeSchedulingMode: "disabled",
          advisoryJobClasses: ["proactive_plan"],
          executeJobClasses: ["proactive_execute_run_drift_check"],
        },
        autoCapture: {
          profile: "disabled",
          allowedAgents: ["chief", "main"],
        },
        autoPromotion: {
          profile: "disabled",
          allowedAgents: ["chief", "main"],
        },
        selfImprovingCapture: {
          mode,
          ...(rolloutTarget ? { rolloutTarget } : {}),
          allowedLessonFamilies: params?.allowedLessonFamilies ?? ["generalized_workflow_lesson"],
        },
        learnedGuidanceAdvisoryPlanning: {
          mode: "disabled",
          allowedLessonFamilies: ["generalized_workflow_lesson"],
          defaultMaxSuggestions: 3,
        },
      },
      candidateIngress: candidateIngress as unknown as CandidateIngressPort,
      candidateReview: {
        review: vi.fn(async () => ({
          accepted: true as const,
          status: "recorded" as const,
          candidateId: "candidate-previous",
          outcome: "rejected" as const,
          reviewId: "review-1",
          memoryObjectStateChanged: true as const,
          reviewState: "rejected" as const,
        })),
      },
      mode,
    }),
  } as unknown as MemoryMiddlewareRuntime & {
    candidateIngress: typeof candidateIngress;
  };
}

describe("memory_self_improving_capture_candidate tool", () => {
  it("normalizes bounded candidate capture input without inheriting trusted context identifiers", () => {
    const normalized = normalizeSelfImprovingCandidateCaptureInput({
      rawParams: {
        kind: "learning",
        content: "  keep this bounded learning  ",
        requestedOutputPosture: "candidate_only",
        metadata: { source: "test" },
      },
      context: {
        sessionId: "session-from-context",
        agentId: "agent-from-context",
      } as OpenClawPluginToolContext,
    });

    expect(normalized).toEqual({
      kind: "learning",
      content: "keep this bounded learning",
      requestedOutputPosture: "candidate_only",
      metadata: { source: "test" },
    });
  });

  it("routes valid reduced-profile workflow-improvement outputs through the candidate-only ingress seam with provenance", async () => {
    const runtime = createRuntime();
    const tool = createMemorySelfImprovingCaptureCandidateTool({
      runtime,
      context: {
        sessionId: "session-ctx",
        agentId: "agent-ctx",
      },
    });

    const result = await tool.execute("call-1", {
      kind: "improvement",
      content:
        'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
      projectId: "11111111-1111-4111-8111-111111111111",
      metadata: { source: "unit-test" },
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      content:
        'Workflow improvement: for scoped commits, use scripts/committer "<msg>" <file...> instead of manual git add / git commit because staging stays scoped.',
      projectId: "11111111-1111-4111-8111-111111111111",
      metadata: expect.objectContaining({
        category: "workflow_improvement",
        source: "explicit_workflow_improvement",
        subject_key: expect.any(String),
        workflowPhraseInduction: {
          observedText:
            'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
        },
        autoCapture: expect.objectContaining({
          source: "memory_self_improving_capture_candidate",
          captureSeam: "self_improving_reduced_profile",
          captureClass: "workflow_generalized_guidance",
          lessonFamily: "generalized_workflow_lesson",
          guidancePattern: "use_instead_of",
          key: expect.any(String),
          subjectKey: expect.any(String),
          toolName: "memory_self_improving_capture_candidate",
        }),
        semanticDetection: {
          source: "workflow_improvement_semantic_v2",
          detectionSource: "semantic",
          confidence: "high",
          lessonFamily: "generalized_workflow_lesson",
          guidancePattern: "use_instead_of",
          evidence: ["tool_scripts_committer", "commit_guidance", "replacement_phrase"],
        },
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "hold_for_more_evidence",
          lessonFamily: "generalized_workflow_lesson",
        }),
        selfImprovingAdaptation: {
          source: "memory_self_improving_capture_candidate",
          upstreamSkill: "self-improving-agent",
          profile: "reduced_profile_candidate_only",
          origin: "self_improving_capture",
          allowedOutputKind: "improvement",
          allowedFamilyId: "workflow_improvement",
          allowedLessonFamily: "generalized_workflow_lesson",
          outputPosture: "candidate_only",
        },
        selfImprovingRollout: expect.objectContaining({
          rolloutPhase: "bounded_rollout_proof_v1",
          allowedLessonFamilies: ["generalized_workflow_lesson"],
          duplicateOutcome: "new_candidate_cluster",
          reviewBurden: "new_candidate_review_required",
        }),
      }),
    });
    expect(result.details).toEqual({
      accepted: true,
      status: "accepted",
      kind: "improvement",
      target: "candidate_only",
      storage: "database",
      reviewState: "candidate",
      eventId: "event-1",
      memoryObjectId: "memory-1",
      rolloutScope: {
        rolloutPhase: "bounded_rollout_proof_v1",
        enablementTarget: "off-production",
        sourceProfile: "reduced_profile_candidate_only",
        target: "candidate_only",
        requiresProjectId: true,
        allowedLessonFamilies: ["generalized_workflow_lesson"],
        retrievalAuthority: "approved_only",
      },
      evaluation: {
        outcomeCode: "candidate_created",
        resolution: "candidate_created",
        provenanceOrigin: "self_improving_capture",
        duplicateOutcome: "new_candidate_cluster",
        replayBlocked: false,
        reviewBurden: "new_candidate_review_required",
      },
    });
  });

  it("blocks non-workflow-improvement kinds in the bounded first tranche", async () => {
    const runtime = createRuntime();
    const tool = createMemorySelfImprovingCaptureCandidateTool({ runtime });

    const result = await tool.execute("call-1b", {
      kind: "procedure",
      content: "Suggest a bounded procedure candidate from repeated success.",
      projectId: "11111111-1111-4111-8111-111111111111",
    });

    expect(runtime.candidateIngress.submitProcedureSuggestion).not.toHaveBeenCalled();
    expect(result.details).toEqual({
      accepted: false,
      status: "blocked",
      kind: "procedure",
      target: "candidate_only",
      reason:
        "reduced-profile self-improving first tranche is limited to workflow-improvement candidates",
      rolloutScope: {
        rolloutPhase: "bounded_rollout_proof_v1",
        enablementTarget: "off-production",
        sourceProfile: "reduced_profile_candidate_only",
        target: "candidate_only",
        requiresProjectId: true,
        allowedLessonFamilies: ["generalized_workflow_lesson"],
        retrievalAuthority: "approved_only",
      },
      evaluation: {
        outcomeCode: "submission_kind_blocked",
        resolution: "blocked",
        provenanceOrigin: "self_improving_capture",
        duplicateOutcome: "none",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      },
    });
  });

  it("blocks forbidden non-candidate output postures before calling candidate ingress", async () => {
    const runtime = createRuntime();
    const tool = createMemorySelfImprovingCaptureCandidateTool({ runtime });

    const result = await tool.execute("call-2", {
      kind: "improvement",
      content: "Should not become approved memory directly.",
      requestedOutputPosture: "approved_memory",
    });

    expect(runtime.candidateIngress.submitImprovementNote).not.toHaveBeenCalled();
    expect(result.details).toEqual({
      accepted: false,
      status: "blocked",
      kind: "improvement",
      target: "candidate_only",
      reason: "reduced-profile self-improving adaptation may emit candidate_only outputs only",
      blockedOutputPosture: "approved_memory",
      rolloutScope: {
        rolloutPhase: "bounded_rollout_proof_v1",
        enablementTarget: "off-production",
        sourceProfile: "reduced_profile_candidate_only",
        target: "candidate_only",
        requiresProjectId: true,
        allowedLessonFamilies: ["generalized_workflow_lesson"],
        retrievalAuthority: "approved_only",
      },
      evaluation: {
        outcomeCode: "output_posture_blocked",
        resolution: "blocked",
        provenanceOrigin: "self_improving_capture",
        duplicateOutcome: "none",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      },
    });
  });

  it("passes through disabled and not-configured candidate-path failures without side effects", async () => {
    const disabledRuntime = createRuntime({
      mode: "disabled",
    });
    const disabledTool = createMemorySelfImprovingCaptureCandidateTool({
      runtime: disabledRuntime,
    });

    const disabledResult = await disabledTool.execute("call-3", {
      kind: "learning",
      content: "disabled path",
    });

    expect(disabledResult.details).toEqual({
      accepted: false,
      status: "disabled",
      kind: "learning",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
      rolloutScope: {
        rolloutPhase: "bounded_rollout_proof_v1",
        enablementTarget: "default-off",
        sourceProfile: "reduced_profile_candidate_only",
        target: "candidate_only",
        requiresProjectId: true,
        allowedLessonFamilies: ["generalized_workflow_lesson"],
        retrievalAuthority: "approved_only",
      },
      evaluation: {
        outcomeCode: "capture_disabled",
        resolution: "disabled",
        provenanceOrigin: "self_improving_capture",
        duplicateOutcome: "none",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      },
    });

    const defaultOffRuntime = createRuntime({
      rolloutTarget: null,
    });
    const defaultOffTool = createMemorySelfImprovingCaptureCandidateTool({
      runtime: defaultOffRuntime,
    });

    const defaultOffResult = await defaultOffTool.execute("call-3b", {
      kind: "improvement",
      content:
        'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
      projectId: "11111111-1111-4111-8111-111111111111",
    });

    expect(defaultOffRuntime.candidateIngress.submitImprovementNote).not.toHaveBeenCalled();
    expect(defaultOffResult.details).toEqual({
      accepted: false,
      status: "disabled",
      kind: "improvement",
      target: "candidate_only",
      reason:
        "self-improving candidate capture is only enabled for an explicit off-production or production-canary rollout target",
      rolloutScope: {
        rolloutPhase: "bounded_rollout_proof_v1",
        enablementTarget: "default-off",
        sourceProfile: "reduced_profile_candidate_only",
        target: "candidate_only",
        requiresProjectId: true,
        allowedLessonFamilies: ["generalized_workflow_lesson"],
        retrievalAuthority: "approved_only",
      },
      evaluation: {
        outcomeCode: "capture_disabled",
        resolution: "disabled",
        provenanceOrigin: "self_improving_capture",
        duplicateOutcome: "none",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      },
    });

    const canaryRuntime = createRuntime({
      rolloutTarget: "production-canary",
    });
    const canaryTool = createMemorySelfImprovingCaptureCandidateTool({
      runtime: canaryRuntime,
    });

    const canaryResult = await canaryTool.execute("call-3c", {
      kind: "improvement",
      content:
        'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
      projectId: "11111111-1111-4111-8111-111111111111",
    });

    expect(canaryResult.details).toMatchObject({
      accepted: true,
      status: "accepted",
      target: "candidate_only",
      rolloutScope: {
        enablementTarget: "production-canary",
        target: "candidate_only",
      },
      evaluation: {
        outcomeCode: "candidate_created",
      },
    });

    const notConfiguredRuntime = createRuntime({
      improvementResult: {
        accepted: false,
        status: "not_configured",
        kind: "improvement",
        reason: "memory middleware database URL is not configured",
      },
    });
    const notConfiguredTool = createMemorySelfImprovingCaptureCandidateTool({
      runtime: notConfiguredRuntime,
    });

    const notConfiguredResult = await notConfiguredTool.execute("call-4", {
      kind: "improvement",
      content:
        'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
      projectId: "11111111-1111-4111-8111-111111111111",
    });

    expect(notConfiguredResult.details).toEqual({
      accepted: false,
      status: "not_configured",
      kind: "improvement",
      target: "candidate_only",
      reason: "memory middleware database URL is not configured",
      rolloutScope: {
        rolloutPhase: "bounded_rollout_proof_v1",
        enablementTarget: "off-production",
        sourceProfile: "reduced_profile_candidate_only",
        target: "candidate_only",
        requiresProjectId: true,
        allowedLessonFamilies: ["generalized_workflow_lesson"],
        retrievalAuthority: "approved_only",
      },
      evaluation: {
        outcomeCode: "candidate_submission_failed",
        resolution: "failed",
        provenanceOrigin: "self_improving_capture",
        duplicateOutcome: "none",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      },
    });
  });

  it("blocks lesson families outside the configured rollout scope", async () => {
    const runtime = createRuntime({
      allowedLessonFamilies: [],
    });
    const tool = createMemorySelfImprovingCaptureCandidateTool({ runtime });

    const result = await tool.execute("call-5", {
      kind: "improvement",
      content:
        "For release proof notes here, use bulletized proof IDs instead of paraphrased rollout summaries.",
      projectId: "11111111-1111-4111-8111-111111111111",
    });

    expect(runtime.candidateIngress.submitImprovementNote).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      accepted: false,
      status: "blocked",
      reason:
        "reduced-profile self-improving first tranche supports workflow-guidance lessons only",
      rolloutScope: {
        allowedLessonFamilies: [],
      },
      evaluation: {
        outcomeCode: "lesson_family_outside_rollout_scope",
        duplicateOutcome: "none",
      },
    });
  });

  it("rejects malformed bounded adaptation payloads", () => {
    expect(() =>
      normalizeSelfImprovingCandidateCaptureInput({
        rawParams: {
          kind: "policy",
          content: "bad kind",
        },
      }),
    ).toThrow("kind must be one of");

    expect(() =>
      normalizeSelfImprovingCandidateCaptureInput({
        rawParams: {
          kind: "learning",
          content: "ok",
          metadata: ["not-an-object"],
        },
      }),
    ).toThrow("metadata must be an object");
  });
});
