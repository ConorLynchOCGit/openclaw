import { Client } from "pg";
import type { CandidateIngressPort } from "./candidate-ingress.js";
import type { CandidateReviewPort } from "./candidate-review.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import type {
  CandidateSubmissionAcceptedResult,
  CandidateSubmissionKind,
  CandidateSubmissionRejectedResult,
} from "./db/runtime.js";
import {
  getCaptureMetadataByWorkflowLessonFamily,
  getMemoryFamilyDefinition,
} from "./memory-family-registry.js";
import { resolveWorkflowImprovementIngestion } from "./memory-ingestion-resolver.js";
import {
  inspectWorkflowImprovementLifecycle,
  isExpiredPendingWorkflowImprovementCandidate,
} from "./workflow-improvement-lifecycle.js";
import type {
  WorkflowImprovementGuidancePattern,
  WorkflowImprovementLessonFamily,
  WorkflowImprovementLessonKey,
  WorkflowImprovementSemanticConfidence,
  WorkflowImprovementToolKey,
} from "./workflow-improvement-semantic.js";

export type SelfImprovingCandidateCaptureInput = {
  kind: CandidateSubmissionKind;
  content: string;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
  requestedOutputPosture?: string;
};

export type SelfImprovingCandidateCaptureAcceptedResult = {
  accepted: true;
  status: "accepted";
  kind: CandidateSubmissionKind;
  target: "candidate_only";
  storage: "database";
  reviewState: "candidate";
  eventId: string;
  memoryObjectId: string;
  rolloutScope: SelfImprovingCandidateCaptureRolloutScope;
  evaluation: SelfImprovingCandidateCaptureEvaluation;
};

export type SelfImprovingCandidateCaptureRejectedResult = {
  accepted: false;
  status: CandidateSubmissionRejectedResult["status"] | "blocked";
  kind: CandidateSubmissionKind;
  target: "candidate_only";
  reason: string;
  blockedOutputPosture?: string;
  rolloutScope: SelfImprovingCandidateCaptureRolloutScope;
  evaluation: SelfImprovingCandidateCaptureEvaluation;
};

export type SelfImprovingCandidateCaptureResult =
  | SelfImprovingCandidateCaptureAcceptedResult
  | SelfImprovingCandidateCaptureRejectedResult;

export type SelfImprovingCandidateCapturePort = {
  capture(input: SelfImprovingCandidateCaptureInput): Promise<SelfImprovingCandidateCaptureResult>;
};

export type SelfImprovingCandidateCaptureOutcomeCode =
  | "candidate_created"
  | "capture_disabled"
  | "output_posture_blocked"
  | "submission_kind_blocked"
  | "missing_project_scope"
  | "unrecognized_workflow_guidance"
  | "lesson_family_outside_rollout_scope"
  | "approved_memory_already_exists"
  | "pending_candidate_already_exists"
  | "expired_candidate_replay_blocked"
  | "recent_rejection_replay_blocked"
  | "candidate_submission_failed";

export type SelfImprovingCandidateDuplicateOutcome =
  | "new_candidate_cluster"
  | "approved_memory_exists"
  | "pending_candidate_exists"
  | "recent_rejection_exists"
  | "expired_pending_candidate_rejected"
  | "none";

export type SelfImprovingCandidateCaptureRolloutScope = {
  rolloutPhase: "bounded_rollout_proof_v1";
  enablementTarget: "default-off" | "off-production";
  sourceProfile: "reduced_profile_candidate_only";
  target: "candidate_only";
  requiresProjectId: true;
  allowedLessonFamilies: Array<"supported_lesson" | "generalized_workflow_lesson">;
  retrievalAuthority: "approved_only";
};

export type SelfImprovingCandidateCaptureEvaluation = {
  outcomeCode: SelfImprovingCandidateCaptureOutcomeCode;
  resolution: "candidate_created" | "blocked" | "disabled" | "failed";
  provenanceOrigin: "self_improving_capture";
  duplicateOutcome: SelfImprovingCandidateDuplicateOutcome;
  replayBlocked: boolean;
  reviewBurden: "new_candidate_review_required" | "no_new_review_required";
};

const SELF_IMPROVING_CAPTURE_SOURCE = "memory_self_improving_capture_candidate";
const SELF_IMPROVING_CAPTURE_MODE_DISABLED_REASON =
  "self-improving candidate capture mode is not enabled";
const DEFAULT_SELF_IMPROVING_ALLOWED_LESSON_FAMILIES = [
  "generalized_workflow_lesson",
  "supported_lesson",
] as const satisfies Array<"supported_lesson" | "generalized_workflow_lesson">;

type ResolvedSelfImprovingWorkflowImprovement = Awaited<
  ReturnType<typeof resolveWorkflowImprovementIngestion>
>;

function buildRolloutScope(
  allowedLessonFamilies: ReadonlyArray<"supported_lesson" | "generalized_workflow_lesson">,
  enablementTarget: "default-off" | "off-production",
): SelfImprovingCandidateCaptureRolloutScope {
  return {
    rolloutPhase: "bounded_rollout_proof_v1",
    enablementTarget,
    sourceProfile: "reduced_profile_candidate_only",
    target: "candidate_only",
    requiresProjectId: true,
    allowedLessonFamilies: [...allowedLessonFamilies],
    retrievalAuthority: "approved_only",
  };
}

function buildEvaluation(params: {
  outcomeCode: SelfImprovingCandidateCaptureOutcomeCode;
  duplicateOutcome: SelfImprovingCandidateDuplicateOutcome;
  replayBlocked: boolean;
  reviewBurden: "new_candidate_review_required" | "no_new_review_required";
}): SelfImprovingCandidateCaptureEvaluation {
  return {
    outcomeCode: params.outcomeCode,
    resolution:
      params.outcomeCode === "candidate_created"
        ? "candidate_created"
        : params.outcomeCode === "capture_disabled"
          ? "disabled"
          : params.outcomeCode === "candidate_submission_failed"
            ? "failed"
            : "blocked",
    provenanceOrigin: "self_improving_capture",
    duplicateOutcome: params.duplicateOutcome,
    replayBlocked: params.replayBlocked,
    reviewBurden: params.reviewBurden,
  };
}

function toAcceptedResult(params: {
  input: SelfImprovingCandidateCaptureInput;
  result: CandidateSubmissionAcceptedResult;
  rolloutScope: SelfImprovingCandidateCaptureRolloutScope;
}): SelfImprovingCandidateCaptureAcceptedResult {
  return {
    accepted: true,
    status: "accepted",
    kind: params.input.kind,
    target: "candidate_only",
    storage: params.result.storage,
    reviewState: "candidate",
    eventId: params.result.eventId,
    memoryObjectId: params.result.memoryObjectId,
    rolloutScope: params.rolloutScope,
    evaluation: buildEvaluation({
      outcomeCode: "candidate_created",
      duplicateOutcome: "new_candidate_cluster",
      replayBlocked: false,
      reviewBurden: "new_candidate_review_required",
    }),
  };
}

function toRejectedResult(params: {
  input: SelfImprovingCandidateCaptureInput;
  result: CandidateSubmissionRejectedResult;
  rolloutScope: SelfImprovingCandidateCaptureRolloutScope;
}): SelfImprovingCandidateCaptureRejectedResult {
  return {
    accepted: false,
    status: params.result.status,
    kind: params.input.kind,
    target: "candidate_only",
    reason: params.result.reason,
    rolloutScope: params.rolloutScope,
    evaluation: buildEvaluation({
      outcomeCode: "candidate_submission_failed",
      duplicateOutcome: "none",
      replayBlocked: false,
      reviewBurden: "no_new_review_required",
    }),
  };
}

function isAllowedOutputPosture(
  posture: string | undefined,
): posture is "candidate_only" | undefined {
  return posture === undefined || posture === "candidate_only";
}

function buildWorkflowImprovementSemanticMetadata(params: {
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source:
        params.detectionSource === "deterministic"
          ? "workflow_phrase_induction_v1"
          : params.lessonFamily === "generalized_project_rule"
            ? "project_rule_semantic_v1"
            : params.lessonFamily === "generalized_unmet_need"
              ? "unmet_need_semantic_v1"
              : "workflow_improvement_semantic_v2",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      lessonFamily: params.lessonFamily,
      ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
      ...(params.toolKey ? { toolKey: params.toolKey } : {}),
      ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      evidence: params.evidence,
    },
  };
}

function buildWorkflowImprovementPendingConfirmationMetadata(params: {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  clusterKey?: string;
}): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "workflow_improvement",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      lessonFamily: params.lessonFamily,
      ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
      ...(params.toolKey ? { toolKey: params.toolKey } : {}),
      ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      ...(params.clusterKey ? { clusterKey: params.clusterKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildCandidateMetadata(params: {
  input: SelfImprovingCandidateCaptureInput;
  resolution: NonNullable<ResolvedSelfImprovingWorkflowImprovement>;
  rolloutScope: SelfImprovingCandidateCaptureRolloutScope;
}): Record<string, unknown> {
  const workflowCaptureMetadata = getCaptureMetadataByWorkflowLessonFamily(
    params.resolution.lessonFamily,
  );

  return {
    ...(params.input.metadata ?? {}),
    ...(workflowCaptureMetadata
      ? {
          category: workflowCaptureMetadata.category,
          source: workflowCaptureMetadata.source,
        }
      : {
          category: "workflow_improvement",
          source: "explicit_workflow_improvement",
        }),
    subject_key: params.resolution.parsed.subjectKey,
    workflowPhraseInduction: {
      observedText: params.resolution.observedText,
    },
    autoCapture: {
      source: SELF_IMPROVING_CAPTURE_SOURCE,
      captureSeam: "self_improving_reduced_profile",
      profile: params.resolution.parsed.profile,
      captureClass: params.resolution.parsed.captureClass,
      reasonCode: params.resolution.parsed.reasonCode,
      template: params.resolution.parsed.template,
      lessonFamily: params.resolution.lessonFamily,
      ...(params.resolution.lessonKey ? { lessonKey: params.resolution.lessonKey } : {}),
      ...(params.resolution.toolKey ? { toolKey: params.resolution.toolKey } : {}),
      ...(params.resolution.guidancePattern
        ? { guidancePattern: params.resolution.guidancePattern }
        : {}),
      ...(params.resolution.parsed.needCategory
        ? { needCategory: params.resolution.parsed.needCategory }
        : {}),
      key: params.resolution.parsed.key,
      subjectKey: params.resolution.parsed.subjectKey,
      subject: params.resolution.parsed.subject,
      ...(params.resolution.parsed.projectScope
        ? { projectScope: params.resolution.parsed.projectScope }
        : {}),
      ...(params.resolution.parsed.normalizedProjectScope
        ? { normalizedProjectScope: params.resolution.parsed.normalizedProjectScope }
        : {}),
      normalizedSubject: params.resolution.parsed.normalizedSubject,
      value: params.resolution.parsed.value,
      normalizedValue: params.resolution.parsed.normalizedValue,
      ...(params.resolution.parsed.neededCapability
        ? { neededCapability: params.resolution.parsed.neededCapability }
        : {}),
      ...(params.resolution.parsed.normalizedNeededCapability
        ? { normalizedNeededCapability: params.resolution.parsed.normalizedNeededCapability }
        : {}),
      ...(params.resolution.parsed.recommendedAction
        ? { recommendedAction: params.resolution.parsed.recommendedAction }
        : {}),
      ...(params.resolution.parsed.normalizedRecommendedAction
        ? {
            normalizedRecommendedAction: params.resolution.parsed.normalizedRecommendedAction,
          }
        : {}),
      ...(params.resolution.parsed.avoidAction
        ? { avoidAction: params.resolution.parsed.avoidAction }
        : {}),
      ...(params.resolution.parsed.normalizedAvoidAction
        ? {
            normalizedAvoidAction: params.resolution.parsed.normalizedAvoidAction,
          }
        : {}),
      ...(params.resolution.parsed.rationale
        ? { rationale: params.resolution.parsed.rationale }
        : {}),
      ...(params.resolution.parsed.normalizedRationale
        ? { normalizedRationale: params.resolution.parsed.normalizedRationale }
        : {}),
      guidanceMode: "guidance_only",
      toolName: SELF_IMPROVING_CAPTURE_SOURCE,
    },
    ...buildWorkflowImprovementSemanticMetadata({
      detectionSource: params.resolution.detectionSource,
      confidence: params.resolution.confidence,
      evidence: params.resolution.evidence,
      lessonFamily: params.resolution.lessonFamily,
      ...(params.resolution.lessonKey ? { lessonKey: params.resolution.lessonKey } : {}),
      ...(params.resolution.toolKey ? { toolKey: params.resolution.toolKey } : {}),
      ...(params.resolution.guidancePattern
        ? { guidancePattern: params.resolution.guidancePattern }
        : {}),
    }),
    ...buildWorkflowImprovementPendingConfirmationMetadata({
      confidence: params.resolution.confidence,
      evidence: params.resolution.evidence,
      lessonFamily: params.resolution.lessonFamily,
      state: params.resolution.reviewMode,
      ...(params.resolution.lessonKey ? { lessonKey: params.resolution.lessonKey } : {}),
      ...(params.resolution.toolKey ? { toolKey: params.resolution.toolKey } : {}),
      ...(params.resolution.guidancePattern
        ? { guidancePattern: params.resolution.guidancePattern }
        : {}),
      ...(params.resolution.lessonFamily !== "supported_lesson"
        ? { clusterKey: params.resolution.parsed.key }
        : {}),
    }),
    selfImprovingAdaptation: {
      source: SELF_IMPROVING_CAPTURE_SOURCE,
      upstreamSkill: "self-improving-agent",
      profile: "reduced_profile_candidate_only",
      origin: "self_improving_capture",
      allowedOutputKind: "improvement",
      allowedFamilyId: "workflow_improvement",
      allowedLessonFamily: params.resolution.lessonFamily,
      outputPosture: "candidate_only",
      ...(params.input.requestedOutputPosture
        ? { requestedOutputPosture: params.input.requestedOutputPosture }
        : {}),
    },
    selfImprovingRollout: {
      ...params.rolloutScope,
      reviewState: params.resolution.reviewMode,
      reviewBurden: "new_candidate_review_required",
      duplicateOutcome: "new_candidate_cluster",
      replayBlocked: false,
    },
  };
}

async function findRecentRejectedWorkflowImprovementCandidate(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  projectId?: string;
}): Promise<{ id: string } | null> {
  if (!params.config.database.url) {
    return null;
  }

  const schema = params.config.database.schema ?? "memory_middleware";
  const staleWindowDays =
    getMemoryFamilyDefinition("workflow_improvement").lifecyclePolicy.staleWindowDays;
  const client = new Client({ connectionString: params.config.database.url });

  try {
    await client.connect();
    const result = await client.query<{ id: string }>(
      `
        select id::text as id
        from "${schema}"."memory_objects"
        where review_state = 'rejected'
          and coalesce(
            metadata->'autoCapture'->>'key',
            metadata->'candidateMetadata'->'autoCapture'->>'key'
          ) = $1
          and coalesce(
            metadata->'autoCapture'->>'captureClass',
            metadata->'candidateMetadata'->'autoCapture'->>'captureClass'
          ) in ('workflow_tool_gotcha', 'workflow_generalized_guidance')
          and ($2::uuid is null or project_id = $2::uuid)
          and updated_at >= now() - ($3::int * interval '1 day')
        order by updated_at desc
        limit 1
      `,
      [params.key, params.projectId ?? null, staleWindowDays],
    );

    const row = result.rows[0];
    return row ? { id: row.id } : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

async function submitWorkflowImprovementCandidate(params: {
  config: MemoryMiddlewareConfig;
  candidateIngress: CandidateIngressPort;
  candidateReview: CandidateReviewPort;
  input: SelfImprovingCandidateCaptureInput;
  rolloutScope: SelfImprovingCandidateCaptureRolloutScope;
  allowedLessonFamilies: ReadonlySet<"supported_lesson" | "generalized_workflow_lesson">;
}): Promise<SelfImprovingCandidateCaptureResult> {
  if (!params.input.projectId) {
    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason: "reduced-profile self-improving first tranche requires an explicit projectId",
      rolloutScope: params.rolloutScope,
      evaluation: buildEvaluation({
        outcomeCode: "missing_project_scope",
        duplicateOutcome: "none",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      }),
    };
  }

  const rawCandidates =
    typeof params.input.metadata?.raw === "string" && params.input.metadata.raw.trim().length > 0
      ? [params.input.metadata.raw]
      : [];
  const resolution = await resolveWorkflowImprovementIngestion({
    config: params.config,
    content: params.input.content,
    primarySource: "content",
    rawCandidates,
    projectId: params.input.projectId,
    allowPhrasePatternMatch: true,
  });

  if (!resolution) {
    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason:
        "reduced-profile self-improving first tranche supports normalized workflow-guidance candidates only",
      rolloutScope: params.rolloutScope,
      evaluation: buildEvaluation({
        outcomeCode: "unrecognized_workflow_guidance",
        duplicateOutcome: "none",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      }),
    };
  }

  if (
    (resolution.lessonFamily !== "supported_lesson" &&
      resolution.lessonFamily !== "generalized_workflow_lesson") ||
    !params.allowedLessonFamilies.has(resolution.lessonFamily)
  ) {
    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason:
        "reduced-profile self-improving first tranche supports workflow-guidance lessons only",
      rolloutScope: params.rolloutScope,
      evaluation: buildEvaluation({
        outcomeCode: "lesson_family_outside_rollout_scope",
        duplicateOutcome: "none",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      }),
    };
  }

  const inspection = await inspectWorkflowImprovementLifecycle({
    config: params.config,
    key: resolution.parsed.key,
    subjectKey: resolution.parsed.subjectKey,
    projectId: params.input.projectId,
  });

  if (inspection?.matchingApprovedObjectId) {
    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason: `approved workflow-improvement memory already exists for key ${resolution.parsed.key}`,
      rolloutScope: params.rolloutScope,
      evaluation: buildEvaluation({
        outcomeCode: "approved_memory_already_exists",
        duplicateOutcome: "approved_memory_exists",
        replayBlocked: false,
        reviewBurden: "no_new_review_required",
      }),
    };
  }

  if (inspection?.pendingCandidate) {
    if (isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate)) {
      await params.candidateReview.review({
        candidateId: inspection.pendingCandidate.id,
        outcome: "rejected",
        rationale:
          "reduced-profile self-improving replay found an expired workflow-guidance candidate without confirming evidence",
        metadata: {
          source: "self_improving_capture_replay_guard",
          candidateLifecycle: {
            family: "workflow_improvement",
            state: "rejected",
            lessonFamily: resolution.lessonFamily,
            subjectKey: resolution.parsed.subjectKey,
          },
        },
      });

      return {
        accepted: false,
        status: "blocked",
        kind: params.input.kind,
        target: "candidate_only",
        reason:
          "matching workflow-guidance candidate expired without confirming evidence; replay is blocked until new evidence appears",
        rolloutScope: params.rolloutScope,
        evaluation: buildEvaluation({
          outcomeCode: "expired_candidate_replay_blocked",
          duplicateOutcome: "expired_pending_candidate_rejected",
          replayBlocked: true,
          reviewBurden: "no_new_review_required",
        }),
      };
    }

    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason: `workflow-guidance candidate ${inspection.pendingCandidate.id} is already gathering evidence`,
      rolloutScope: params.rolloutScope,
      evaluation: buildEvaluation({
        outcomeCode: "pending_candidate_already_exists",
        duplicateOutcome: "pending_candidate_exists",
        replayBlocked: true,
        reviewBurden: "no_new_review_required",
      }),
    };
  }

  const recentRejectedCandidate = await findRecentRejectedWorkflowImprovementCandidate({
    config: params.config,
    key: resolution.parsed.key,
    projectId: params.input.projectId,
  });
  if (recentRejectedCandidate) {
    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason: `workflow-guidance candidate ${recentRejectedCandidate.id} was recently rejected for this key`,
      rolloutScope: params.rolloutScope,
      evaluation: buildEvaluation({
        outcomeCode: "recent_rejection_replay_blocked",
        duplicateOutcome: "recent_rejection_exists",
        replayBlocked: true,
        reviewBurden: "no_new_review_required",
      }),
    };
  }

  const result = await params.candidateIngress.submitImprovementNote({
    content: resolution.parsed.content,
    projectId: params.input.projectId,
    ...(params.input.sessionId ? { sessionId: params.input.sessionId } : {}),
    ...(params.input.agentId ? { agentId: params.input.agentId } : {}),
    metadata: buildCandidateMetadata({
      input: params.input,
      resolution,
      rolloutScope: params.rolloutScope,
    }),
  });

  return result.accepted
    ? toAcceptedResult({
        input: params.input,
        result,
        rolloutScope: params.rolloutScope,
      })
    : toRejectedResult({
        input: params.input,
        result,
        rolloutScope: params.rolloutScope,
      });
}

export function createSelfImprovingCandidateCapturePort(params: {
  config: MemoryMiddlewareConfig;
  candidateIngress: CandidateIngressPort;
  candidateReview: CandidateReviewPort;
  mode: "disabled" | "candidate-only";
}): SelfImprovingCandidateCapturePort {
  const allowedLessonFamilies = new Set(
    params.config.selfImprovingCapture?.allowedLessonFamilies ?? [
      ...DEFAULT_SELF_IMPROVING_ALLOWED_LESSON_FAMILIES,
    ],
  );
  const enablementTarget =
    params.config.selfImprovingCapture?.rolloutTarget === "off-production"
      ? "off-production"
      : "default-off";
  const rolloutScope = buildRolloutScope([...allowedLessonFamilies], enablementTarget);

  if (params.mode !== "candidate-only" || enablementTarget !== "off-production") {
    return {
      async capture(input) {
        return {
          accepted: false,
          status: "disabled",
          kind: input.kind,
          target: "candidate_only",
          reason:
            params.mode !== "candidate-only"
              ? SELF_IMPROVING_CAPTURE_MODE_DISABLED_REASON
              : "self-improving candidate capture is only enabled for an explicit off-production rollout target",
          rolloutScope,
          evaluation: buildEvaluation({
            outcomeCode: "capture_disabled",
            duplicateOutcome: "none",
            replayBlocked: false,
            reviewBurden: "no_new_review_required",
          }),
        };
      },
    };
  }

  return {
    async capture(input) {
      if (!isAllowedOutputPosture(input.requestedOutputPosture)) {
        return {
          accepted: false,
          status: "blocked",
          kind: input.kind,
          target: "candidate_only",
          reason: "reduced-profile self-improving adaptation may emit candidate_only outputs only",
          blockedOutputPosture: input.requestedOutputPosture,
          rolloutScope,
          evaluation: buildEvaluation({
            outcomeCode: "output_posture_blocked",
            duplicateOutcome: "none",
            replayBlocked: false,
            reviewBurden: "no_new_review_required",
          }),
        };
      }

      if (input.kind !== "improvement") {
        return {
          accepted: false,
          status: "blocked",
          kind: input.kind,
          target: "candidate_only",
          reason:
            "reduced-profile self-improving first tranche is limited to workflow-improvement candidates",
          rolloutScope,
          evaluation: buildEvaluation({
            outcomeCode: "submission_kind_blocked",
            duplicateOutcome: "none",
            replayBlocked: false,
            reviewBurden: "no_new_review_required",
          }),
        };
      }

      return submitWorkflowImprovementCandidate({
        config: params.config,
        candidateIngress: params.candidateIngress,
        candidateReview: params.candidateReview,
        input,
        rolloutScope,
        allowedLessonFamilies,
      });
    },
  };
}
