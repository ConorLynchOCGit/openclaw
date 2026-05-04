export type ModelEvalCadenceStatus =
  | "unqualified"
  | "qualified"
  | "needs_review"
  | "demoted"
  | "blocked";

export type ModelEvalCadenceRecord = {
  artifactKind: "model_eval_cadence_record";
  candidateId: string;
  modelId: string;
  roleId: string;
  cadenceKind: "manual" | "scheduled";
  latestScorecardRefs: string[];
  reliabilityRefs: string[];
  hardDisqualificationReasonCodes: string[];
  incompleteEvidenceReasonCodes: string[];
  status: ModelEvalCadenceStatus;
  noGlobalWinner: true;
  productionPromotionPerformed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export function createModelEvalCadenceRecord(input: {
  candidateId: string;
  modelId: string;
  roleId: string;
  cadenceKind?: "manual" | "scheduled";
  latestScorecardRefs?: string[];
  reliabilityRefs?: string[];
  hardDisqualificationReasonCodes?: string[];
  incompleteEvidenceReasonCodes?: string[];
}): ModelEvalCadenceRecord {
  const hard = input.hardDisqualificationReasonCodes ?? [];
  const incomplete = input.incompleteEvidenceReasonCodes ?? [];
  const scorecards = input.latestScorecardRefs ?? [];
  const status: ModelEvalCadenceStatus =
    hard.length > 0
      ? "blocked"
      : incomplete.length > 0
        ? "needs_review"
        : scorecards.length > 0
          ? "qualified"
          : "unqualified";
  return {
    artifactKind: "model_eval_cadence_record",
    candidateId: input.candidateId,
    modelId: input.modelId,
    roleId: input.roleId,
    cadenceKind: input.cadenceKind ?? "manual",
    latestScorecardRefs: scorecards,
    reliabilityRefs: input.reliabilityRefs ?? [],
    hardDisqualificationReasonCodes: hard,
    incompleteEvidenceReasonCodes: incomplete,
    status,
    noGlobalWinner: true,
    productionPromotionPerformed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function demoteModelEvalCadenceRecord(
  record: ModelEvalCadenceRecord,
  reasonCode: string,
): ModelEvalCadenceRecord {
  return {
    ...record,
    status: "demoted",
    hardDisqualificationReasonCodes: [
      ...new Set([...record.hardDisqualificationReasonCodes, reasonCode]),
    ].toSorted(),
  };
}
