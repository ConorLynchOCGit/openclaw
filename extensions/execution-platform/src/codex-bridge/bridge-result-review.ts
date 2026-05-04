import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type BridgeResultReviewKind = "human_review" | "model_review_future" | "no_review_performed";
export type BridgeResultReviewFinding = "pass" | "fail" | "needs_review" | "human_review_required";

export type BridgeResultReviewArtifact = {
  artifactKind: "codex_bridge_result_review";
  reviewId: string;
  reviewKind: BridgeResultReviewKind;
  reviewerId: string | null;
  reviewedAt: string;
  objective: string;
  runtimeJobId: string;
  liveRunId: string | null;
  evidenceRefs: string[];
  validationResult: "passed" | "failed" | "not_run" | "unknown";
  closeoutRef: string | null;
  filesChanged: string[];
  qualitativeFinding: BridgeResultReviewFinding;
  limitations: string[];
  judgmentMade: boolean;
  notDeterministic: boolean;
};

function unsafeReviewContentReasons(value: unknown): string[] {
  const serialized = JSON.stringify(value).toLowerCase();
  const patterns = [
    ["raw_transcript", /raw-transcript-marker|full-transcript-marker/u],
    ["raw_prompt", /raw-prompt-marker|provider-prompt-marker/u],
    ["hidden_reasoning", /hidden-reasoning-marker/u],
    ["secret", /\bsk-[a-z0-9_-]{12,}|secret-marker|password=/u],
  ] as const;
  return patterns
    .filter(([, pattern]) => pattern.test(serialized))
    .map(([reason]) => `prohibited_${reason}_content`);
}

export function buildBridgeResultReviewArtifact(input: {
  reviewId: string;
  reviewKind: BridgeResultReviewKind;
  reviewerId?: string | null;
  reviewedAt: string;
  objective: string;
  runtimeJobId: string;
  liveRunId?: string | null;
  evidenceRefs: string[];
  validationResult: BridgeResultReviewArtifact["validationResult"];
  closeoutRef?: string | null;
  filesChanged: string[];
  qualitativeFinding?: BridgeResultReviewFinding;
  limitations?: string[];
}): BridgeResultReviewArtifact {
  const judgmentMade = input.reviewKind === "human_review";
  return boundDiagnosticJson(
    {
      artifactKind: "codex_bridge_result_review",
      reviewId: input.reviewId,
      reviewKind: input.reviewKind,
      reviewerId: input.reviewerId ?? null,
      reviewedAt: input.reviewedAt,
      objective: input.objective,
      runtimeJobId: input.runtimeJobId,
      liveRunId: input.liveRunId ?? null,
      evidenceRefs: input.evidenceRefs,
      validationResult: input.validationResult,
      closeoutRef: input.closeoutRef ?? null,
      filesChanged: input.filesChanged,
      qualitativeFinding:
        input.qualitativeFinding ?? (judgmentMade ? "needs_review" : "human_review_required"),
      limitations:
        input.limitations ??
        (judgmentMade
          ? ["qualitative review is separate from deterministic validation"]
          : ["no qualitative reviewer was invoked in this artifact"]),
      judgmentMade,
      notDeterministic: judgmentMade,
    } satisfies BridgeResultReviewArtifact,
    {
      ...DEFAULT_DIAGNOSTIC_LIMITS,
      maxObjectKeys: 160,
      maxArrayItems: 80,
      maxStringLength: 1_500,
    },
  ) as BridgeResultReviewArtifact;
}

export function validateBridgeResultReviewArtifact(artifact: BridgeResultReviewArtifact): {
  valid: boolean;
  blockingReasons: string[];
} {
  const reasons = unsafeReviewContentReasons(artifact);
  if (artifact.judgmentMade && !artifact.notDeterministic) {
    reasons.push("qualitative_judgment_must_be_marked_not_deterministic");
  }
  if (!artifact.objective.trim()) {
    reasons.push("objective_required");
  }
  if (!artifact.runtimeJobId.trim()) {
    reasons.push("runtime_job_id_required");
  }
  if (
    artifact.reviewKind === "no_review_performed" &&
    artifact.qualitativeFinding !== "human_review_required"
  ) {
    reasons.push("no_review_must_require_human_review");
  }
  return { valid: reasons.length === 0, blockingReasons: [...new Set(reasons)] };
}

export async function recordBridgeResultReviewArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  artifact: BridgeResultReviewArtifact;
}): Promise<void> {
  const validation = validateBridgeResultReviewArtifact(input.artifact);
  if (!validation.valid) {
    throw new Error(`invalid bridge result review: ${validation.blockingReasons.join(",")}`);
  }
  const metadata = input.artifact as unknown as JsonValue;
  await input.runtimeJobs.attachArtifact({
    jobId: input.artifact.runtimeJobId,
    artifactType: "codex_bridge.result_review",
    storageKind: "metadata",
    uri: `runtime-job://${input.artifact.runtimeJobId}/codex-bridge/result-review/${input.artifact.reviewId}`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.artifact.runtimeJobId,
    eventType: "codex_bridge.result_review_recorded",
    data: {
      reviewId: input.artifact.reviewId,
      reviewKind: input.artifact.reviewKind,
      qualitativeFinding: input.artifact.qualitativeFinding,
      judgmentMade: input.artifact.judgmentMade,
    },
  });
}
