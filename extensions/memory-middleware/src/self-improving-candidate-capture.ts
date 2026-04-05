import type { CandidateIngressPort } from "./candidate-ingress.js";
import type {
  CandidateSubmissionAcceptedResult,
  CandidateSubmissionKind,
  CandidateSubmissionRejectedResult,
} from "./db/runtime.js";

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

function buildCandidateMetadata(
  input: SelfImprovingCandidateCaptureInput,
): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    selfImprovingAdaptation: {
      source: SELF_IMPROVING_CAPTURE_SOURCE,
      upstreamSkill: "self-improving-agent",
      profile: "reduced_profile_candidate_only",
      allowedOutputKind: input.kind,
      outputPosture: "candidate_only",
      ...(input.requestedOutputPosture
        ? { requestedOutputPosture: input.requestedOutputPosture }
        : {}),
    },
  };
}

async function submitViaCandidateIngress(params: {
  candidateIngress: CandidateIngressPort;
  input: SelfImprovingCandidateCaptureInput;
}): Promise<SelfImprovingCandidateCaptureResult> {
  const candidateInput = {
    kind: params.input.kind,
    content: params.input.content,
    ...(params.input.sessionId ? { sessionId: params.input.sessionId } : {}),
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.input.agentId ? { agentId: params.input.agentId } : {}),
    metadata: buildCandidateMetadata(params.input),
  };

  const result =
    params.input.kind === "learning"
      ? await params.candidateIngress.submitLearning(candidateInput)
      : params.input.kind === "correction"
        ? await params.candidateIngress.submitCorrectionSuggestion(candidateInput)
        : params.input.kind === "procedure"
          ? await params.candidateIngress.submitProcedureSuggestion(candidateInput)
          : await params.candidateIngress.submitImprovementNote(candidateInput);

  return result.accepted
    ? toAcceptedResult(params.input, result)
    : toRejectedResult(params.input, result);
}

export function createSelfImprovingCandidateCapturePort(params: {
  candidateIngress: CandidateIngressPort;
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
          reason: "self-improving candidate capture mode is not enabled",
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

      return submitViaCandidateIngress({
        candidateIngress: params.candidateIngress,
        input,
      });
    },
  };
}
