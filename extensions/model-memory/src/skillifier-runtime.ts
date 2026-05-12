import { createHash } from "node:crypto";
import { z } from "zod";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).nullable();
const refList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

export const SKILLIFIER_CANDIDATE_SCHEMA_VERSION = "model-memory.skillifier-candidate.v1";

export const SkillifierCandidateArtifactSchema = z
  .object({
    artifactKind: z.literal("model_memory_skillifier_candidate"),
    schemaVersion: z.literal(SKILLIFIER_CANDIDATE_SCHEMA_VERSION),
    candidateId: boundedString(160),
    createdAt: boundedString(80),
    sourceOpportunityRef: boundedString(260),
    sourceCloseoutCapsuleRef: boundedString(260),
    sourceCloseoutCapsuleHash: boundedString(128),
    targetSkillRef: optionalBoundedString(260),
    candidateType: z.enum(["new_skill", "skill_edit", "process_note", "reject", "needs_review"]),
    reviewState: z.enum([
      "candidate_ready",
      "needs_review",
      "rejected_duplicate",
      "rejected_low_value",
      "blocked_missing_evidence",
    ]),
    modelRef: boundedString(180),
    modelTaskRefs: refList(20),
    dbOperationRefs: refList(20),
    modelAuthoredRationale: boundedString(1_200),
    modelAuthoredProposedSkillSummary: boundedString(1_200),
    proposedFilePathRef: optionalBoundedString(260),
    boundedDraftRef: optionalBoundedString(260),
    boundedDraftHash: optionalBoundedString(128),
    validationRefs: refList(20),
    reviewRefs: refList(20),
    limitations: refList(10, 500),
    eli5Progress: boundedString(1_000),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
  })
  .strict();

export type SkillifierCandidateArtifact = z.infer<typeof SkillifierCandidateArtifactSchema>;

export type SkillifierCandidateValidation = {
  accepted: boolean;
  reasonCodes: string[];
  candidate: SkillifierCandidateArtifact | null;
};

export function parseSkillifierCandidateArtifact(value: unknown): SkillifierCandidateArtifact {
  return SkillifierCandidateArtifactSchema.parse(value);
}

export function validateSkillifierCandidateArtifact(value: unknown): SkillifierCandidateValidation {
  const parsed = SkillifierCandidateArtifactSchema.safeParse(value);
  if (!parsed.success) {
    return {
      accepted: false,
      reasonCodes: parsed.error.issues
        .map((issue) => `skillifier_candidate_schema:${issue.path.join(".") || "root"}`)
        .slice(0, 20),
      candidate: null,
    };
  }
  const candidate = parsed.data;
  const reasonCodes: string[] = [];
  if (candidate.rawPromptStored || candidate.rawResponseStored || candidate.rawProviderLogStored) {
    reasonCodes.push("skillifier_candidate_raw_storage_rejected");
  }
  if (candidate.candidateType !== "reject" && candidate.sourceOpportunityRef.length === 0) {
    reasonCodes.push("skillifier_candidate_source_opportunity_missing");
  }
  if (
    candidate.candidateType !== "reject" &&
    candidate.reviewState === "candidate_ready" &&
    candidate.modelTaskRefs.length === 0
  ) {
    reasonCodes.push("skillifier_candidate_model_task_ref_missing");
  }
  if (
    candidate.candidateType !== "reject" &&
    candidate.reviewState === "candidate_ready" &&
    candidate.dbOperationRefs.length === 0
  ) {
    reasonCodes.push("skillifier_candidate_db_operation_ref_missing");
  }
  return {
    accepted: reasonCodes.length === 0,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["skillifier_candidate_artifact_valid"],
    candidate,
  };
}

export function buildSkillifierCandidateId(input: {
  sourceCloseoutCapsuleHash: string;
  sourceOpportunityRef: string;
  candidateType: string;
}): string {
  return `skillifier-candidate-${createHash("sha256")
    .update(
      `${input.sourceCloseoutCapsuleHash}:${input.sourceOpportunityRef}:${input.candidateType}`,
    )
    .digest("hex")
    .slice(0, 32)}`;
}
