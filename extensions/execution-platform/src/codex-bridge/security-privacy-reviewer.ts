import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type SecurityPrivacyFindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export type SecurityPrivacyReviewerArtifact = {
  artifactKind: "agent_team_security_privacy_review";
  reviewId: string;
  reviewKind: "human_review_required" | "model_review_assist" | "local_codex_review";
  runtimeJobId: string;
  teamRunId: string;
  objective: string;
  filesReviewed: string[];
  evidenceRefs: string[];
  findings: Array<{
    severity: SecurityPrivacyFindingSeverity;
    title: string;
    requiredFix: string | null;
  }>;
  exploitabilityNotes: string[];
  requiredFixes: string[];
  recommendedFixes: string[];
  residualRisk: string[];
  judgmentMade: boolean;
  notDeterministic: true;
  finalAcceptanceGranted: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

function hasUnsafeContent(value: unknown): boolean {
  return /raw[-_ ]?(prompt|response|transcript|log)[-_ ]?marker|hidden[-_ ]?reasoning[-_ ]?marker|secret-marker|sk-[a-z0-9_-]{12,}/iu.test(
    JSON.stringify(value),
  );
}

export function buildSecurityPrivacyReviewerArtifact(
  input: Omit<
    SecurityPrivacyReviewerArtifact,
    | "artifactKind"
    | "notDeterministic"
    | "finalAcceptanceGranted"
    | "rawPromptStored"
    | "rawResponseStored"
  >,
): SecurityPrivacyReviewerArtifact {
  return {
    artifactKind: "agent_team_security_privacy_review",
    ...input,
    notDeterministic: true,
    finalAcceptanceGranted: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function validateSecurityPrivacyReviewerArtifact(
  artifact: SecurityPrivacyReviewerArtifact,
): { valid: boolean; blockingReasons: string[] } {
  const blockingReasons: string[] = [];
  if (!artifact.objective.trim()) {
    blockingReasons.push("objective_required");
  }
  if (hasUnsafeContent(artifact)) {
    blockingReasons.push("prohibited_raw_or_secret_content");
  }
  if (artifact.finalAcceptanceGranted) {
    blockingReasons.push("assist_review_cannot_grant_final_acceptance");
  }
  if (artifact.findings.some((finding) => ["high", "critical"].includes(finding.severity))) {
    blockingReasons.push("high_risk_finding_blocks_completion");
  }
  return { valid: blockingReasons.length === 0, blockingReasons };
}

export async function recordSecurityPrivacyReviewerArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  artifact: SecurityPrivacyReviewerArtifact;
}): Promise<void> {
  const validation = validateSecurityPrivacyReviewerArtifact(input.artifact);
  const metadata = input.artifact as unknown as JsonValue;
  await input.runtimeJobs.attachArtifact({
    jobId: input.artifact.runtimeJobId,
    artifactType: "agent_team.security_privacy_review",
    storageKind: "metadata",
    uri: `runtime-job://${input.artifact.runtimeJobId}/agent-team/security-review/${input.artifact.reviewId}`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.artifact.runtimeJobId,
    eventType: "agent_team.security_privacy_review_recorded",
    data: {
      reviewId: input.artifact.reviewId,
      valid: validation.valid,
      blockingReasons: validation.blockingReasons,
    },
  });
}
