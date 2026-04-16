import { z } from "zod";
import { parseJsonModelOutput, type JsonModelExecutor } from "./model-execution.ts";
import { createModelContractMetadata } from "./prompt-contracts.ts";
import {
  assessStructuralSameClaimDelta,
  describeClaimFieldComparison,
  describeDecisiveFieldAgreement,
  describeFamilyRecallMatch,
  describeRuleActionBundleMatchProfile,
} from "./semantic-identity.ts";
import type { ModelMemoryObject } from "./semantic-schema.ts";
import type { ModelMemoryObjectRecord } from "./storage-database-contract.ts";

export type CollisionCandidate = Pick<
  ModelMemoryObjectRecord,
  | "id"
  | "identityKey"
  | "canonicalClass"
  | "kind"
  | "payload"
  | "scope"
  | "normalizedSearchText"
  | "lifecycleState"
  | "slotKey"
>;

export type CollisionAdjudicationDecision =
  | { relation: "distinct" }
  | { relation: "conflict_hold" }
  | { relation: "attach_support"; targetObjectId: string }
  | { relation: "supersedes"; targetObjectId: string };

export type CollisionAdjudicationRequest = {
  candidateId: string;
  sourceKind: string;
  sourceWindowId?: string;
  object: ModelMemoryObject;
  candidates: CollisionCandidate[];
};

export type CollisionAdjudicationBatchDecision = CollisionAdjudicationDecision & {
  candidateId: string;
};

export type BoundedCandidateAdjudicationSource = "retained_structural" | "raw_text_fallback";

export type BoundedCandidateAdjudicationCandidate = CollisionCandidate & {
  adjudicationCandidateId: string;
  candidateSource: BoundedCandidateAdjudicationSource;
  similarityScore: number;
  scopeKey?: string;
  sameCanonicalClass: boolean;
  sameKind: boolean;
  sameScope: boolean;
  sourcePath?: string;
};

export type BoundedCandidateAdjudicationDeltaType = "non_additive" | "additive" | "unclear";

export type BoundedCandidateAdjudicationDecision = {
  sameCoreMemory: "yes" | "no" | "ambiguous";
  matchedCandidateId: string | "none";
  deltaType: BoundedCandidateAdjudicationDeltaType;
};

export type BoundedCandidateAdjudicationRequest = {
  candidateId: string;
  sourceKind: string;
  sourceWindowId?: string;
  sourcePath?: string;
  object: ModelMemoryObject;
  candidates: BoundedCandidateAdjudicationCandidate[];
};

export type BoundedCandidateAdjudicationBatchDecision = BoundedCandidateAdjudicationDecision & {
  candidateId: string;
};

export type ZeroCandidateRecoveryCandidate = BoundedCandidateAdjudicationCandidate;
export type ZeroCandidateRecoveryDeltaType = BoundedCandidateAdjudicationDeltaType;
export type ZeroCandidateRecoveryDecision = BoundedCandidateAdjudicationDecision;
export type ZeroCandidateRecoveryRequest = BoundedCandidateAdjudicationRequest;
export type ZeroCandidateRecoveryBatchDecision = BoundedCandidateAdjudicationBatchDecision;

export interface SemanticCollisionAdjudicator {
  adjudicate(input: {
    sourceKind: string;
    object: ModelMemoryObject;
    candidates: CollisionCandidate[];
    modelId: string;
    contractVersion?: string;
  }): Promise<CollisionAdjudicationDecision>;
  adjudicateBatch(input: {
    requests: CollisionAdjudicationRequest[];
    modelId: string;
    contractVersion?: string;
  }): Promise<CollisionAdjudicationBatchDecision[]>;
  adjudicateBoundedCandidateBatch?(input: {
    requests: BoundedCandidateAdjudicationRequest[];
    modelId: string;
    contractVersion?: string;
  }): Promise<BoundedCandidateAdjudicationBatchDecision[]>;
  adjudicateZeroCandidateRecoveryBatch?(input: {
    requests: ZeroCandidateRecoveryRequest[];
    modelId: string;
    contractVersion?: string;
  }): Promise<ZeroCandidateRecoveryBatchDecision[]>;
}

const CollisionAdjudicationSchema = z
  .object({
    relation: z.enum(["attach_support", "supersedes", "distinct", "conflict_hold"]),
    targetObjectId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.relation === "attach_support" || value.relation === "supersedes") &&
      !value.targetObjectId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetObjectId is required for attach_support or supersedes",
        path: ["targetObjectId"],
      });
    }
    if (
      (value.relation === "distinct" || value.relation === "conflict_hold") &&
      value.targetObjectId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetObjectId must be omitted for distinct or conflict_hold",
        path: ["targetObjectId"],
      });
    }
  });

const CollisionAdjudicationBatchSchema = z.object({
  decisions: z.array(
    z
      .object({
        candidateId: z.string().trim().min(1),
        relation: z.enum(["attach_support", "supersedes", "distinct", "conflict_hold"]),
        targetObjectId: z.string().trim().min(1).optional(),
      })
      .superRefine((value, ctx) => {
        if (
          (value.relation === "attach_support" || value.relation === "supersedes") &&
          !value.targetObjectId
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "targetObjectId is required for attach_support or supersedes",
            path: ["targetObjectId"],
          });
        }
        if (
          (value.relation === "distinct" || value.relation === "conflict_hold") &&
          value.targetObjectId
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "targetObjectId must be omitted for distinct or conflict_hold",
            path: ["targetObjectId"],
          });
        }
      }),
  ),
});

const BoundedCandidateAdjudicationBatchSchema = z.object({
  decisions: z.array(
    z
      .object({
        candidateId: z.string().trim().min(1),
        sameCoreMemory: z.enum(["yes", "no", "ambiguous"]),
        matchedCandidateId: z.string().trim().min(1),
        deltaType: z.enum(["non_additive", "additive", "unclear"]),
      })
      .superRefine((value, ctx) => {
        if (value.sameCoreMemory === "no" && value.matchedCandidateId !== "none") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "matchedCandidateId must be none when sameCoreMemory=no",
            path: ["matchedCandidateId"],
          });
        }
      }),
  ),
});

function isContainedCandidateState(lifecycleState: CollisionCandidate["lifecycleState"]): boolean {
  return (
    lifecycleState === "conflict_hold" ||
    lifecycleState === "provisional" ||
    lifecycleState === "superseded" ||
    lifecycleState === "expired"
  );
}

function summarizeCollisionCandidate(object: ModelMemoryObject, candidate: CollisionCandidate) {
  const decisiveFieldAgreement = describeDecisiveFieldAgreement(object, candidate);
  const claimFieldComparison = describeClaimFieldComparison(object, candidate);
  const structuralDelta = assessStructuralSameClaimDelta(object, candidate);
  const familyRecallMatch = describeFamilyRecallMatch(object, candidate);
  const ruleActionBundleMatch =
    object.kind === "rule" && candidate.kind === "rule"
      ? describeRuleActionBundleMatchProfile(object, candidate)
      : undefined;
  const blockingFieldSummary =
    [
      claimFieldComparison.blockingCoreClaimFields.length > 0
        ? `core:${claimFieldComparison.blockingCoreClaimFields.join(",")}`
        : undefined,
      claimFieldComparison.blockingPackagingFields.length > 0
        ? `packaging:${claimFieldComparison.blockingPackagingFields.join(",")}`
        : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | ") || "none";
  return {
    id: candidate.id,
    lifecycleState: candidate.lifecycleState,
    candidateState: isContainedCandidateState(candidate.lifecycleState) ? "contained" : "active",
    payload: candidate.payload,
    normalizedSearchText: candidate.normalizedSearchText,
    decisiveFields: decisiveFieldAgreement.decisiveFields,
    decisiveFieldAgreement: decisiveFieldAgreement.allComparableFieldsMatch,
    decisiveFieldSummary: decisiveFieldAgreement.summary,
    matchingDecisiveFields: decisiveFieldAgreement.matchingFields,
    mismatchedDecisiveFields: decisiveFieldAgreement.mismatchedFields,
    coreClaimFields: claimFieldComparison.coreClaimFields,
    coreClaimMatch: claimFieldComparison.coreClaimMatch,
    coreClaimSummary: claimFieldComparison.coreClaimSummary,
    matchingCoreClaimFields: claimFieldComparison.matchingCoreClaimFields,
    blockingCoreClaimFields: claimFieldComparison.blockingCoreClaimFields,
    packagingSummary: claimFieldComparison.packagingSummary,
    matchingPackagingFields: claimFieldComparison.matchingPackagingFields,
    blockingPackagingFields: claimFieldComparison.blockingPackagingFields,
    blockingFieldSummary,
    deltaClass: structuralDelta.deltaClass,
    sameClaimLeaning: structuralDelta.sameClaimLeaning,
    sameClaimConfidence: structuralDelta.sameClaimConfidence,
    packagingDriftType: structuralDelta.packagingDriftType,
    candidateRankReason: claimFieldComparison.coreClaimMatch
      ? structuralDelta.deltaClass === "packaging_only_drift"
        ? "core_claim_match_packaging_only_drift"
        : structuralDelta.deltaClass === "additive_operational_delta"
          ? "core_claim_match_possible_constraint"
          : "core_claim_match_unresolved_delta"
      : candidate.lifecycleState === "active"
        ? "active_scope_matched_candidate"
        : "contained_scope_matched_candidate",
    sameClaimRisk:
      structuralDelta.deltaClass === "packaging_only_drift"
        ? structuralDelta.packagingDriftType === "broader_narrower"
          ? "broader_narrower_conflict"
          : "field_match_wrapper_drift"
        : candidate.slotKey
          ? "slot_change_risk"
          : "possible_new_constraint",
    structuralDeltaSummary: structuralDelta.summary,
    familyRecallSummary: familyRecallMatch.summary,
    familyRecallStrong: familyRecallMatch.strong,
    familyRecallModerate: familyRecallMatch.moderate,
    ruleActionBundleComparable: ruleActionBundleMatch?.comparable ?? false,
    ruleActionBundleStrong: ruleActionBundleMatch?.strong ?? false,
    ruleActionBundleModerate: ruleActionBundleMatch?.moderate ?? false,
    ruleActionBundleSummary: ruleActionBundleMatch
      ? `exact=${ruleActionBundleMatch.exact}; strong=${ruleActionBundleMatch.strong}; moderate=${ruleActionBundleMatch.moderate}; overlap=${ruleActionBundleMatch.overlapCount}; smaller=${ruleActionBundleMatch.smallerCoverage.toFixed(2)}; larger=${ruleActionBundleMatch.largerCoverage.toFixed(2)}; containsOther=${ruleActionBundleMatch.containsOther}`
      : "n/a",
  };
}

function buildCollisionBatchPrompt(input: {
  requests: CollisionAdjudicationRequest[];
  modelId: string;
  contractVersion?: string;
}) {
  const contract = createModelContractMetadata({
    contractName: "semantic_collision_adjudication",
    contractVersion: input.contractVersion ?? "v3-batch",
    modelId: input.modelId,
  });

  return {
    contract,
    responseFormat: "json" as const,
    systemPrompt: [
      "Decide whether each newly captured canonical memory object matches one of its provided stored memory-object candidates.",
      "Return JSON only with one object containing a decisions array.",
      "Each decisions entry must include candidateId, relation, and optional targetObjectId.",
      "Allowed relation values: attach_support, supersedes, distinct, conflict_hold.",
      "Use attach_support only when the new object is the same durable memory claim as one candidate.",
      "Use attach_support when the new object is a narrower restatement, paraphrase, or operational variant of the same single durable rule/fact/preference as one candidate.",
      "Do not require wording identity for attach_support.",
      "The decisiveFields and decisiveFieldSummary tell you which claim-defining non-subject fields matched or differed for this kind.",
      "coreClaimMatch, coreClaimSummary, and blockingFieldSummary make the local same-claim evidence explicit before you decide.",
      "packagingSummary, deltaClass, sameClaimConfidence, packagingDriftType, and sameClaimLeaning summarize whether the remaining delta looks like wrapper drift, field packing drift, broader-vs-narrower packaging, or a real new constraint.",
      "familyRecallSummary tells you whether the decisive-field fingerprint surface still says these objects belong to the same narrow memory family even when strict core-claim equality failed.",
      "For rules, ruleActionBundleStrong, ruleActionBundleModerate, and ruleActionBundleSummary tell you whether the combined action-bearing fields still match despite wrapper-heavy phrasing drift.",
      "candidateRankReason explains why local deterministic ranking kept a candidate in the residual set.",
      "sameClaimRisk tells you which remaining ambiguity shape is still unresolved after deterministic ranking.",
      "dominantCandidateId is present when one candidate remains the local front-runner but local code still could not attach support safely.",
      "If coreClaimMatch=true and deltaClass=packaging_only_drift, that is strong evidence for attach_support unless the payload clearly adds a real new requirement.",
      "Treat exact decisive-field agreement as strong evidence of the same durable claim when the remaining difference is only subject, title, or phrasing drift.",
      "CandidateState=active means the candidate is currently live; candidateState=contained means it is provisional, conflict-held, expired, or otherwise non-active containment.",
      "When exactly one candidate has decisiveFieldAgreement=true and the others do not, strongly prefer attach_support unless the new object adds a real new requirement or constraint.",
      "If sameClaimConfidence=high and packagingDriftType is field_packing_drift, subject_drift, or value_wrapper_drift, prefer attach_support unless the payload clearly adds a new operational requirement.",
      "For rules, field-packing drift means the same action-bearing instruction is distributed across recommendedAction/avoidAction/neededCapability differently; that usually still indicates the same durable rule.",
      "For rules, if ruleActionBundleStrong=true and the remaining drift is explanatory wrapper phrasing, examples, or field packing, prefer attach_support over conflict_hold.",
      "For rules, if familyRecallStrong=true or ruleActionBundleModerate=true but a specific field may carry a stronger constraint, treat that as wrapper-vs-constraint ambiguity and attach only when the added text does not introduce a real new requirement.",
      "For rules, wrapper-heavy restatements that preserve the same action bundle should lean attach_support, not conflict_hold.",
      "Use supersedes only when the new object replaces a single prior memory in the same slot.",
      "Use distinct when the new object is related but should remain its own memory object.",
      "Use distinct when the new object is only one sub-clause of a broader multi-part candidate and attaching it would incorrectly strengthen unrelated parts of the broader candidate.",
      "Use distinct when the new object adds a new operational requirement, verification step, or constraint that is not already the same durable claim as the candidate.",
      "Use conflict_hold when the candidate set is ambiguous or conflicting enough that you cannot safely choose one target.",
      "If exactly one candidate remains after deterministic gating and it reads like a near-restatement or paraphrase of the same durable claim, prefer attach_support.",
      "Reserve conflict_hold for actual ambiguity, conflicting candidates, or malformed uncertainty that makes target selection unsafe.",
      "Do not use conflict_hold as the default answer for a one-candidate paraphrase.",
      "If exactly one candidate remains after deterministic gating, prefer attach_support or distinct unless there is a real ambiguity you can explain from the object-native content.",
      "Do not invent a third memory object.",
      "Do not choose attach_support or supersedes only because wording is similar.",
      "Rely on canonical class, kind, payload, scope, and normalized meaning.",
      "If no candidate is a safe target, return distinct for that candidateId.",
      "Return exactly one decision row for each submitted candidateId.",
    ].join("\n"),
    userPrompt: JSON.stringify({
      requests: input.requests.map((request) => ({
        candidateId: request.candidateId,
        sourceKind: request.sourceKind,
        sourceWindowId: request.sourceWindowId,
        newObject: request.object,
        decisiveFields: describeDecisiveFieldAgreement(request.object, request.object)
          .decisiveFields,
        coreClaimFields: describeClaimFieldComparison(request.object, request.object)
          .coreClaimFields,
        dominantCoreClaimCandidateIds: request.candidates
          .filter(
            (candidate) => describeClaimFieldComparison(request.object, candidate).coreClaimMatch,
          )
          .map((candidate) => candidate.id),
        dominantCandidateId: request.candidates
          .map((candidate) => ({
            candidateId: candidate.id,
            coreClaimMatch: describeClaimFieldComparison(request.object, candidate).coreClaimMatch,
            structuralDelta: assessStructuralSameClaimDelta(request.object, candidate),
          }))
          .filter(
            (candidate) =>
              candidate.coreClaimMatch &&
              candidate.structuralDelta.deltaClass === "packaging_only_drift",
          )
          .map((candidate) => candidate.candidateId)[0],
        candidates: request.candidates.map((candidate) =>
          summarizeCollisionCandidate(request.object, candidate),
        ),
      })),
    }),
  };
}

function summarizeBoundedCandidateAdjudicationCandidate(
  object: ModelMemoryObject,
  candidate: BoundedCandidateAdjudicationCandidate,
) {
  return {
    adjudicationCandidateId: candidate.adjudicationCandidateId,
    candidateSource: candidate.candidateSource,
    objectId: candidate.id,
    sourcePath: candidate.sourcePath ?? "unknown",
    similarityScore: candidate.similarityScore,
    candidateScopeKey: candidate.scopeKey ?? "unknown",
    sameCanonicalClass: candidate.sameCanonicalClass,
    sameKind: candidate.sameKind,
    sameScope: candidate.sameScope,
    ...summarizeCollisionCandidate(object, candidate),
  };
}

function buildBoundedCandidateAdjudicationBatchPrompt(input: {
  requests: BoundedCandidateAdjudicationRequest[];
  modelId: string;
  contractVersion?: string;
}) {
  const contract = createModelContractMetadata({
    contractName: "semantic_collision_adjudication",
    contractVersion: input.contractVersion ?? "v1-batch",
    modelId: input.modelId,
  });

  return {
    contract,
    responseFormat: "json" as const,
    systemPrompt: [
      "Decide whether each bounded-candidate adjudication row still matches one of its candidates as the same core durable memory.",
      "Return JSON only with one object containing a decisions array.",
      "Each decision must include candidateId, sameCoreMemory, matchedCandidateId, and deltaType.",
      "Allowed sameCoreMemory values: yes, no, ambiguous.",
      "Allowed deltaType values: non_additive, additive, unclear.",
      "Use yes only when exactly one candidate is the same durable memory claim as the new object.",
      "Use non_additive when the remaining difference is only wrapper phrasing, subject drift, title drift, field packing drift, or reordered wording inside already-matching claim content.",
      "Use additive when the remaining difference adds a new requirement, exception, capability, step, resource, or operational condition.",
      "Use ambiguous when multiple candidates remain plausible or when you cannot safely tell whether the delta is additive.",
      "Do not choose a final write action.",
      "Do not infer meaning from topic taxonomies or external knowledge.",
      "Rely on the provided candidateSource, similarity score, payload text, normalized search text, core-claim summary, blocking-field summary, and structural delta summary only.",
      "candidateSource=retained_structural means the candidate already survived deterministic structural recall.",
      "candidateSource=raw_text_fallback means deterministic structural recall retained zero candidates and this candidate came from raw-text fallback retrieval.",
      "Ignore sameCanonicalClass, sameKind, and sameScope when deciding sameCoreMemory.",
      "For bounded adjudication, decide from the memory text and payload content, not from structural field agreement.",
      "If sameCoreMemory=no, matchedCandidateId must be none.",
      "If sameCoreMemory=ambiguous, matchedCandidateId may be a plausible candidate or none.",
      "If no candidate is the same core memory, return sameCoreMemory=no, matchedCandidateId=none.",
      "Return exactly one decision row for each submitted candidateId.",
    ].join("\n"),
    userPrompt: JSON.stringify({
      requests: input.requests.map((request) => ({
        candidateId: request.candidateId,
        sourceKind: request.sourceKind,
        sourceWindowId: request.sourceWindowId,
        sourcePath: request.sourcePath,
        newObject: request.object,
        decisiveFields: describeDecisiveFieldAgreement(request.object, request.object)
          .decisiveFields,
        coreClaimFields: describeClaimFieldComparison(request.object, request.object)
          .coreClaimFields,
        candidates: request.candidates.map((candidate) =>
          summarizeBoundedCandidateAdjudicationCandidate(request.object, candidate),
        ),
      })),
    }),
  };
}

function fallbackBatchDecisions(
  requests: CollisionAdjudicationRequest[],
): CollisionAdjudicationBatchDecision[] {
  return requests.map((request) => ({
    candidateId: request.candidateId,
    relation: "conflict_hold",
  }));
}

function validateBatchDecisions(input: {
  requests: CollisionAdjudicationRequest[];
  parsedDecisions: Array<{
    candidateId: string;
    relation: "attach_support" | "supersedes" | "distinct" | "conflict_hold";
    targetObjectId?: string;
  }>;
}): CollisionAdjudicationBatchDecision[] {
  const requestById = new Map(
    input.requests.map((request) => [request.candidateId, request] as const),
  );
  const seen = new Set<string>();
  const parsedById = new Map<string, CollisionAdjudicationBatchDecision>();

  for (const decision of input.parsedDecisions) {
    const request = requestById.get(decision.candidateId);
    if (!request || seen.has(decision.candidateId)) {
      continue;
    }
    seen.add(decision.candidateId);

    if (decision.relation === "attach_support" || decision.relation === "supersedes") {
      const targetIsValid = request.candidates.some(
        (candidate) => candidate.id === decision.targetObjectId,
      );
      if (!targetIsValid) {
        continue;
      }
      parsedById.set(decision.candidateId, {
        candidateId: decision.candidateId,
        relation: decision.relation,
        targetObjectId: decision.targetObjectId!,
      });
      continue;
    }

    parsedById.set(decision.candidateId, {
      candidateId: decision.candidateId,
      relation: decision.relation,
    });
  }

  return input.requests.map(
    (request) =>
      parsedById.get(request.candidateId) ?? {
        candidateId: request.candidateId,
        relation: "conflict_hold",
      },
  );
}

function fallbackBoundedCandidateAdjudicationDecisions(
  requests: BoundedCandidateAdjudicationRequest[],
): BoundedCandidateAdjudicationBatchDecision[] {
  return requests.map((request) => ({
    candidateId: request.candidateId,
    sameCoreMemory: "ambiguous",
    matchedCandidateId: "none",
    deltaType: "unclear",
  }));
}

function validateBoundedCandidateAdjudicationDecisions(input: {
  requests: BoundedCandidateAdjudicationRequest[];
  parsedDecisions: Array<{
    candidateId: string;
    sameCoreMemory: "yes" | "no" | "ambiguous";
    matchedCandidateId: string;
    deltaType: BoundedCandidateAdjudicationDeltaType;
  }>;
}): BoundedCandidateAdjudicationBatchDecision[] {
  const requestById = new Map(
    input.requests.map((request) => [request.candidateId, request] as const),
  );
  const seen = new Set<string>();
  const parsedById = new Map<string, BoundedCandidateAdjudicationBatchDecision>();

  for (const decision of input.parsedDecisions) {
    const request = requestById.get(decision.candidateId);
    if (!request || seen.has(decision.candidateId)) {
      continue;
    }
    seen.add(decision.candidateId);
    const matchedCandidateValid =
      decision.matchedCandidateId === "none" ||
      request.candidates.some(
        (candidate) => candidate.adjudicationCandidateId === decision.matchedCandidateId,
      );
    if (!matchedCandidateValid) {
      continue;
    }
    if (decision.sameCoreMemory === "yes" && decision.matchedCandidateId === "none") {
      continue;
    }
    if (decision.sameCoreMemory === "no" && decision.matchedCandidateId !== "none") {
      continue;
    }
    parsedById.set(decision.candidateId, decision);
  }

  return input.requests.map(
    (request) =>
      parsedById.get(request.candidateId) ?? {
        candidateId: request.candidateId,
        sameCoreMemory: "ambiguous",
        matchedCandidateId: "none",
        deltaType: "unclear",
      },
  );
}

export class ExecutorBackedSemanticCollisionAdjudicator implements SemanticCollisionAdjudicator {
  constructor(private readonly executor: JsonModelExecutor) {}

  async adjudicate(input: {
    sourceKind: string;
    object: ModelMemoryObject;
    candidates: CollisionCandidate[];
    modelId: string;
    contractVersion?: string;
  }): Promise<CollisionAdjudicationDecision> {
    const [decision] = await this.adjudicateBatch({
      requests: [
        {
          candidateId: "candidate-0",
          sourceKind: input.sourceKind,
          object: input.object,
          candidates: input.candidates,
          sourceWindowId: undefined,
        },
      ],
      modelId: input.modelId,
      contractVersion: input.contractVersion,
    });

    if (!decision || decision.relation === "distinct" || decision.relation === "conflict_hold") {
      return { relation: decision?.relation ?? "conflict_hold" };
    }

    return {
      relation: decision.relation,
      targetObjectId: decision.targetObjectId,
    };
  }

  async adjudicateBatch(input: {
    requests: CollisionAdjudicationRequest[];
    modelId: string;
    contractVersion?: string;
  }): Promise<CollisionAdjudicationBatchDecision[]> {
    const requests = input.requests.filter((request) => request.candidates.length > 0);
    if (requests.length === 0) {
      return [];
    }

    const prompt = buildCollisionBatchPrompt({
      requests,
      modelId: input.modelId,
      contractVersion: input.contractVersion,
    });

    try {
      const response = await this.executor.execute(prompt);
      const parsed = parseJsonModelOutput(
        response,
        prompt.contract,
        CollisionAdjudicationBatchSchema,
      );
      return validateBatchDecisions({
        requests,
        parsedDecisions: parsed.decisions,
      });
    } catch {
      return fallbackBatchDecisions(requests);
    }
  }

  async adjudicateZeroCandidateRecoveryBatch(input: {
    requests: ZeroCandidateRecoveryRequest[];
    modelId: string;
    contractVersion?: string;
  }): Promise<ZeroCandidateRecoveryBatchDecision[]> {
    return this.adjudicateBoundedCandidateBatch(input);
  }

  async adjudicateBoundedCandidateBatch(input: {
    requests: BoundedCandidateAdjudicationRequest[];
    modelId: string;
    contractVersion?: string;
  }): Promise<BoundedCandidateAdjudicationBatchDecision[]> {
    const requests = input.requests.filter((request) => request.candidates.length > 0);
    if (requests.length === 0) {
      return [];
    }

    const prompt = buildBoundedCandidateAdjudicationBatchPrompt({
      requests,
      modelId: input.modelId,
      contractVersion: input.contractVersion,
    });

    try {
      const response = await this.executor.execute(prompt);
      const parsed = parseJsonModelOutput(
        response,
        prompt.contract,
        BoundedCandidateAdjudicationBatchSchema,
      );
      return validateBoundedCandidateAdjudicationDecisions({
        requests,
        parsedDecisions: parsed.decisions,
      });
    } catch {
      return fallbackBoundedCandidateAdjudicationDecisions(requests);
    }
  }
}
