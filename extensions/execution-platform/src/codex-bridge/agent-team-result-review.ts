import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  recordCloseoutCapsuleArtifact,
  validateCloseoutCapsule,
  type CloseoutCapsule,
  type CloseoutCapsuleRoleReadback,
} from "./closeout-capsule.ts";
import type { CloseoutCapsuleReporterTiming } from "./model-closeout-capsule-reporter.ts";

export type AgentTeamHumanCloseoutSummary = {
  artifactKind: "agent_team_human_closeout_summary";
  summaryVersion: "agent-team-human-closeout-summary.v1";
  whatChanged: string;
  whyItChanged: string;
  filesTouched: string[];
  testsRun: string[];
  result: string;
  limitations: string[];
  nextStep: string;
  eli5Progress: string;
  roleReadbacks: CloseoutCapsuleRoleReadback[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
};

export type AgentTeamResultReviewArtifact = {
  artifactKind: "agent_team_result_review";
  reviewId: string;
  teamRunId: string;
  runtimeJobId: string;
  objective: string;
  validationEvidenceRefs: string[];
  closeoutRefs: string[];
  filesChanged: string[];
  reviewer: string;
  reviewKind: "human_review" | "model_review_assist" | "local_codex_review" | "no_review_performed";
  judgmentMade: boolean;
  notDeterministic: boolean;
  goalSatisfaction: "satisfied" | "unsatisfied" | "needs_review" | "unknown";
  findings: string[];
  limitations: string[];
  requiredFixes: string[];
  closeoutCapsule?: CloseoutCapsule;
  closeoutTiming?: CloseoutCapsuleReporterTiming;
  humanCloseoutSummary?: AgentTeamHumanCloseoutSummary;
  accepted: boolean;
  needsReview: boolean;
  finalAcceptanceBy: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export function buildAgentTeamResultReviewArtifact(
  input: Omit<
    AgentTeamResultReviewArtifact,
    "artifactKind" | "rawPromptStored" | "rawResponseStored"
  >,
): AgentTeamResultReviewArtifact {
  return {
    artifactKind: "agent_team_result_review",
    ...input,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function buildAgentTeamHumanCloseoutSummary(input: {
  whatChanged: string;
  whyItChanged: string;
  filesTouched: string[];
  testsRun: string[];
  result: string;
  limitations?: string[];
  nextStep: string;
  eli5Progress: string;
}): AgentTeamHumanCloseoutSummary {
  return {
    artifactKind: "agent_team_human_closeout_summary",
    summaryVersion: "agent-team-human-closeout-summary.v1",
    whatChanged: boundText(input.whatChanged, 600),
    whyItChanged: boundText(input.whyItChanged, 600),
    filesTouched: input.filesTouched.map((item) => boundText(item, 240)).slice(0, 30),
    testsRun: input.testsRun.map((item) => boundText(item, 240)).slice(0, 30),
    result: boundText(input.result, 600),
    limitations: (input.limitations ?? []).map((item) => boundText(item, 400)).slice(0, 20),
    nextStep: boundText(input.nextStep, 400),
    eli5Progress: boundText(input.eli5Progress, 600),
    roleReadbacks: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
  };
}

export function validateAgentTeamResultReviewArtifact(artifact: AgentTeamResultReviewArtifact): {
  valid: boolean;
  blockingReasons: string[];
} {
  const blockingReasons: string[] = [];
  if (artifact.judgmentMade && !artifact.notDeterministic) {
    blockingReasons.push("qualitative_judgment_must_be_not_deterministic");
  }
  if (artifact.accepted && artifact.validationEvidenceRefs.length === 0) {
    blockingReasons.push("validation_evidence_required_for_acceptance");
  }
  if (artifact.accepted && artifact.needsReview) {
    blockingReasons.push("needs_review_cannot_be_accepted");
  }
  if (artifact.accepted && artifact.goalSatisfaction !== "satisfied") {
    blockingReasons.push("accepted_result_requires_satisfied_goal");
  }
  if (artifact.accepted && !artifact.humanCloseoutSummary) {
    blockingReasons.push("accepted_result_requires_human_closeout_summary");
  }
  if (artifact.accepted && !artifact.closeoutCapsule) {
    blockingReasons.push("accepted_result_requires_model_closeout_capsule");
  }
  if (artifact.closeoutCapsule) {
    const capsuleValidation = validateCloseoutCapsule(artifact.closeoutCapsule);
    if (artifact.accepted && !capsuleValidation.valid) {
      blockingReasons.push(...capsuleValidation.blockingReasons);
    }
  }
  if (
    artifact.accepted &&
    artifact.reviewKind === "model_review_assist" &&
    artifact.finalAcceptanceBy !== "operator"
  ) {
    blockingReasons.push("model_assist_cannot_final_accept_without_operator");
  }
  if (
    /raw[-_ ]?(prompt|response|transcript|log)[-_ ]?marker|hidden[-_ ]?reasoning[-_ ]?marker|secret-marker/iu.test(
      JSON.stringify(artifact),
    )
  ) {
    blockingReasons.push("prohibited_raw_or_secret_content");
  }
  if (artifact.accepted && artifact.humanCloseoutSummary) {
    if (!artifact.humanCloseoutSummary.eli5Progress.trim()) {
      blockingReasons.push("human_closeout_eli5_required");
    }
    if (
      artifact.humanCloseoutSummary.rawPromptStored ||
      artifact.humanCloseoutSummary.rawResponseStored ||
      artifact.humanCloseoutSummary.rawTranscriptStored ||
      artifact.humanCloseoutSummary.rawLogsStored
    ) {
      blockingReasons.push("human_closeout_raw_storage_rejected");
    }
  }
  return { valid: blockingReasons.length === 0, blockingReasons };
}

export async function recordAgentTeamResultReviewArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  artifact: AgentTeamResultReviewArtifact;
}): Promise<void> {
  const validation = validateAgentTeamResultReviewArtifact(input.artifact);
  if (!validation.valid) {
    throw new Error(`invalid agent-team result review: ${validation.blockingReasons.join(",")}`);
  }
  if (input.artifact.closeoutCapsule) {
    await recordCloseoutCapsuleArtifact({
      runtimeJobs: input.runtimeJobs,
      capsule: input.artifact.closeoutCapsule,
    });
  }
  const metadata = {
    ...input.artifact,
    closeoutCapsule: undefined,
    closeoutCapsuleRef: input.artifact.closeoutRefs[0] ?? null,
    closeoutCapsuleStoredSeparately: Boolean(input.artifact.closeoutCapsule),
  } as unknown as JsonValue;
  await input.runtimeJobs.attachArtifact({
    jobId: input.artifact.runtimeJobId,
    artifactType: "agent_team.result_review",
    storageKind: "metadata",
    uri: `runtime-job://${input.artifact.runtimeJobId}/agent-team/result-review/${input.artifact.reviewId}`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.artifact.runtimeJobId,
    eventType: "agent_team.result_review_recorded",
    data: {
      reviewId: input.artifact.reviewId,
      goalSatisfaction: input.artifact.goalSatisfaction,
      accepted: input.artifact.accepted,
      needsReview: input.artifact.needsReview,
      humanCloseoutSummaryPresent: Boolean(input.artifact.humanCloseoutSummary),
    },
  });
}

export function latestAgentTeamResultReviewArtifact(
  artifacts: RuntimeJobArtifact[],
): AgentTeamResultReviewArtifact | null {
  const artifact = artifacts.findLast((item) => item.artifactType === "agent_team.result_review");
  return artifact?.metadata && typeof artifact.metadata === "object"
    ? (artifact.metadata as unknown as AgentTeamResultReviewArtifact)
    : null;
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}
