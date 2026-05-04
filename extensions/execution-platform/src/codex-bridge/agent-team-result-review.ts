import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

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
  const metadata = input.artifact as unknown as JsonValue;
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
    },
  });
}
