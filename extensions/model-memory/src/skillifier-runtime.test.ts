import { describe, expect, it } from "vitest";
import {
  SKILLIFIER_CANDIDATE_SCHEMA_VERSION,
  buildSkillifierCandidateId,
  validateSkillifierCandidateArtifact,
} from "./skillifier-runtime.ts";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    artifactKind: "model_memory_skillifier_candidate",
    schemaVersion: SKILLIFIER_CANDIDATE_SCHEMA_VERSION,
    candidateId: "skillifier-candidate-123",
    createdAt: "2026-05-11T16:40:00.000Z",
    sourceOpportunityRef: "closeout-capsule://capsule-1/opportunity/seed-1",
    sourceCloseoutCapsuleRef: "closeout-capsule://capsule-1",
    sourceCloseoutCapsuleHash: "a".repeat(64),
    targetSkillRef: null,
    candidateType: "new_skill",
    reviewState: "candidate_ready",
    modelRef: "model-task://skillifier.structured_json",
    modelTaskRefs: ["runtime-job://model-task-skillifier/model-task/validation"],
    dbOperationRefs: ["runtime-job://db-operation-skillifier/db-operation/metadata"],
    modelAuthoredRationale: "The model judged this seed useful for a bounded skill candidate.",
    modelAuthoredProposedSkillSummary: "Create a skill for bounded Skillifier runtime review.",
    proposedFilePathRef: "skills/skillifier-runtime-review/SKILL.md",
    boundedDraftRef: "artifact://skillifier-draft",
    boundedDraftHash: "b".repeat(64),
    validationRefs: ["validation://skillifier-candidate-schema"],
    reviewRefs: ["review://skillifier-candidate-quality"],
    limitations: ["candidate still needs owner review before file apply"],
    eli5Progress: "OpenClaw turned a useful closeout seed into a reviewed skill candidate.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    ...overrides,
  };
}

describe("Skillifier runtime candidate artifact", () => {
  it("accepts bounded model-authored skill candidate evidence", () => {
    expect(validateSkillifierCandidateArtifact(candidate())).toMatchObject({
      accepted: true,
      reasonCodes: ["skillifier_candidate_artifact_valid"],
    });
  });

  it("rejects raw storage flags and missing middleware refs", () => {
    expect(
      validateSkillifierCandidateArtifact(
        candidate({ rawPromptStored: true, modelTaskRefs: [], dbOperationRefs: [] }),
      ),
    ).toMatchObject({
      accepted: false,
    });
  });

  it("rejects unbounded model-authored rationale without deterministic quality scoring", () => {
    const result = validateSkillifierCandidateArtifact(
      candidate({ modelAuthoredRationale: "x".repeat(2_000) }),
    );
    expect(result.accepted).toBe(false);
    expect(result.reasonCodes.join(" ")).toContain("modelAuthoredRationale");
  });

  it("creates deterministic ids from refs without inspecting English content", () => {
    expect(
      buildSkillifierCandidateId({
        sourceCloseoutCapsuleHash: "hash",
        sourceOpportunityRef: "closeout-capsule://capsule/opportunity/seed",
        candidateType: "new_skill",
      }),
    ).toMatch(/^skillifier-candidate-[a-f0-9]{32}$/u);
  });
});
