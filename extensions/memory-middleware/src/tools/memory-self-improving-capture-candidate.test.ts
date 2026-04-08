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
  learningResult?: CandidateSubmissionResult;
  correctionResult?: CandidateSubmissionResult;
  procedureResult?: CandidateSubmissionResult;
  improvementResult?: CandidateSubmissionResult;
}) {
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
        mode: params?.mode ?? "candidate-only",
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
          mode: params?.mode ?? "candidate-only",
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
      mode: params?.mode ?? "candidate-only",
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
        'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
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
          captureClass: "workflow_tool_gotcha",
          lessonFamily: "supported_lesson",
          lessonKey: "scripts_committer_required",
          toolKey: "scripts_committer",
          key: expect.any(String),
          subjectKey: expect.any(String),
          toolName: "memory_self_improving_capture_candidate",
        }),
        semanticDetection: {
          source: "workflow_improvement_semantic_v2",
          detectionSource: "semantic",
          confidence: "high",
          lessonFamily: "supported_lesson",
          lessonKey: "scripts_committer_required",
          toolKey: "scripts_committer",
          evidence: ["tool_scripts_committer", "commit_guidance", "replacement_phrase"],
        },
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "pending_confirmation",
          lessonFamily: "supported_lesson",
          lessonKey: "scripts_committer_required",
          toolKey: "scripts_committer",
        }),
        selfImprovingAdaptation: {
          source: "memory_self_improving_capture_candidate",
          upstreamSkill: "self-improving-agent",
          profile: "reduced_profile_candidate_only",
          origin: "self_improving_capture",
          allowedOutputKind: "improvement",
          allowedFamilyId: "workflow_improvement",
          allowedLessonFamily: "supported_lesson",
          outputPosture: "candidate_only",
        },
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
