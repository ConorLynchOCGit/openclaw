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
};

export type SelfImprovingCandidateCaptureRejectedResult = {
  accepted: false;
  status: CandidateSubmissionRejectedResult["status"] | "blocked";
  kind: CandidateSubmissionKind;
  target: "candidate_only";
  reason: string;
  blockedOutputPosture?: string;
};

export type SelfImprovingCandidateCaptureResult =
  | SelfImprovingCandidateCaptureAcceptedResult
  | SelfImprovingCandidateCaptureRejectedResult;

export type SelfImprovingCandidateCapturePort = {
  capture(input: SelfImprovingCandidateCaptureInput): Promise<SelfImprovingCandidateCaptureResult>;
};

const SELF_IMPROVING_CAPTURE_SOURCE = "memory_self_improving_capture_candidate";
const SELF_IMPROVING_CAPTURE_MODE_DISABLED_REASON =
  "self-improving candidate capture mode is not enabled";
const SELF_IMPROVING_ALLOWED_LESSON_FAMILIES = new Set<WorkflowImprovementLessonFamily>([
  "supported_lesson",
  "generalized_workflow_lesson",
]);

type ResolvedSelfImprovingWorkflowImprovement = Awaited<
  ReturnType<typeof resolveWorkflowImprovementIngestion>
>;

function toAcceptedResult(
  input: SelfImprovingCandidateCaptureInput,
  result: CandidateSubmissionAcceptedResult,
): SelfImprovingCandidateCaptureAcceptedResult {
  return {
    accepted: true,
    status: "accepted",
    kind: input.kind,
    target: "candidate_only",
    storage: result.storage,
    reviewState: "candidate",
    eventId: result.eventId,
    memoryObjectId: result.memoryObjectId,
  };
}

function toRejectedResult(
  input: SelfImprovingCandidateCaptureInput,
  result: CandidateSubmissionRejectedResult,
): SelfImprovingCandidateCaptureRejectedResult {
  return {
    accepted: false,
    status: result.status,
    kind: input.kind,
    target: "candidate_only",
    reason: result.reason,
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
}): Promise<SelfImprovingCandidateCaptureResult> {
  if (!params.input.projectId) {
    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason: "reduced-profile self-improving first tranche requires an explicit projectId",
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
    };
  }

  if (!SELF_IMPROVING_ALLOWED_LESSON_FAMILIES.has(resolution.lessonFamily)) {
    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason:
        "reduced-profile self-improving first tranche supports workflow-guidance lessons only",
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
      };
    }

    return {
      accepted: false,
      status: "blocked",
      kind: params.input.kind,
      target: "candidate_only",
      reason: `workflow-guidance candidate ${inspection.pendingCandidate.id} is already gathering evidence`,
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
    }),
  });

  return result.accepted
    ? toAcceptedResult(params.input, result)
    : toRejectedResult(params.input, result);
}

export function createSelfImprovingCandidateCapturePort(params: {
  config: MemoryMiddlewareConfig;
  candidateIngress: CandidateIngressPort;
  candidateReview: CandidateReviewPort;
  mode: "disabled" | "candidate-only";
}): SelfImprovingCandidateCapturePort {
  if (params.mode !== "candidate-only") {
    return {
      async capture(input) {
        return {
          accepted: false,
          status: "disabled",
          kind: input.kind,
          target: "candidate_only",
          reason: SELF_IMPROVING_CAPTURE_MODE_DISABLED_REASON,
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
        };
      }

      return submitWorkflowImprovementCandidate({
        config: params.config,
        candidateIngress: params.candidateIngress,
        candidateReview: params.candidateReview,
        input,
      });
    },
  };
}
