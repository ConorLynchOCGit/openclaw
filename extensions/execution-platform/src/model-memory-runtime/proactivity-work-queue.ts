import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import { closeoutCapsuleHash } from "../codex-bridge/closeout-capsule.ts";
import { createPlanningCapsuleFromOpportunitySeed } from "../work-queue/planning-lifecycle.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  MODEL_MEMORY_RUNTIME_WIRING_VERSION,
  type MemoryRuntimeEvidenceRef,
  compactString,
} from "./types.ts";

export type CloseoutOpportunityDbOperationEvidence = {
  dbOperationRefs: string[];
  modelTaskRefs?: string[];
  actorId?: string | null;
};

export type CloseoutOpportunityQualityReview = {
  source: "model" | "owner";
  usefulness: "useful" | "needs_review" | "duplicate" | "stale" | "too_generic";
  specificity: "specific" | "mixed" | "too_broad";
  ownerFit: "high" | "medium" | "low" | "unknown";
  reviewRef: string;
  limitations: string[];
  recommendedQueueKind?: string | null;
};

export type CloseoutOpportunityProjectionDecision = {
  artifactKind: "closeout_capsule_opportunity_runtime_projection_decision";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  status: "accepted" | "needs_review" | "blocked";
  capsuleId: string;
  capsuleHash: string;
  createdWorkItemIds: string[];
  planningCapsuleRefs: string[];
  skippedSeedIds: string[];
  duplicateWorkItemIds: string[];
  evidenceRefs: MemoryRuntimeEvidenceRef[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

function opportunityWorkItemId(input: { capsuleHash: string; seedId: string; kind: string }) {
  const normalizedSeed = input.seedId.replace(/[^a-zA-Z0-9:-]/gu, "-").slice(0, 40);
  const normalizedKind = input.kind.replace(/[^a-zA-Z0-9:-]/gu, "-").slice(0, 30);
  return `closeout-opportunity-${input.capsuleHash.slice(0, 18)}-${normalizedSeed}-${normalizedKind}`
    .replace(/-+/gu, "-")
    .slice(0, 120);
}

export async function projectCloseoutCapsuleOpportunitySeedsViaDbOperation(input: {
  workQueue: WorkQueueRepository;
  capsule: CloseoutCapsule;
  dbOperationEvidence: CloseoutOpportunityDbOperationEvidence;
  qualityReviewsBySeedId?: Record<string, CloseoutOpportunityQualityReview>;
  createPlanningCapsuleIntakeForAcceptedSeeds?: boolean;
}): Promise<CloseoutOpportunityProjectionDecision> {
  const capsuleHash = closeoutCapsuleHash(input.capsule);
  const dbOperationRefs = input.dbOperationEvidence.dbOperationRefs.slice(0, 20);
  if (dbOperationRefs.length === 0) {
    return {
      artifactKind: "closeout_capsule_opportunity_runtime_projection_decision",
      version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
      status: "needs_review",
      capsuleId: input.capsule.capsuleId,
      capsuleHash,
      createdWorkItemIds: [],
      planningCapsuleRefs: [],
      skippedSeedIds: input.capsule.opportunitySeeds.map((seed) => seed.seedId).slice(0, 50),
      duplicateWorkItemIds: [],
      evidenceRefs: [],
      reasonCodes: ["db_operation_middleware_evidence_required_for_opportunity_projection"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const createdWorkItemIds: string[] = [];
  const planningCapsuleRefs: string[] = [];
  const skippedSeedIds: string[] = [];
  const duplicateWorkItemIds: string[] = [];
  for (const seed of input.capsule.opportunitySeeds) {
    const qualityReview = input.qualityReviewsBySeedId?.[seed.seedId] ?? {
      source: "model" as const,
      usefulness: "needs_review" as const,
      specificity: "mixed" as const,
      ownerFit: "unknown" as const,
      reviewRef: `closeout-capsule://${input.capsule.capsuleId}/opportunity/${seed.seedId}/review-pending`,
      limitations: ["No model-authored opportunity quality review was provided."],
      recommendedQueueKind: seed.kind,
    };
    if (seed.kind === "no_op") {
      skippedSeedIds.push(seed.seedId);
      continue;
    }
    if (
      qualityReview.usefulness === "duplicate" ||
      qualityReview.usefulness === "stale" ||
      qualityReview.usefulness === "too_generic"
    ) {
      skippedSeedIds.push(seed.seedId);
      continue;
    }
    const workItemId = opportunityWorkItemId({
      capsuleHash,
      seedId: seed.seedId,
      kind: seed.kind,
    });
    const existing = await input.workQueue.readWorkItemTruth(workItemId, 1);
    if (existing) {
      duplicateWorkItemIds.push(workItemId);
      continue;
    }
    await input.workQueue.createWorkItem({
      workItemId,
      itemType: `closeout_${seed.kind}`,
      title: compactString(seed.title, 160),
      description: compactString(seed.rationale, 1_000),
      actorId: input.dbOperationEvidence.actorId ?? "execution-platform-closeout-capsule",
      metadata: {
        source: "closeout_capsule_opportunity_seed",
        projectionBoundary: "db_operation_middleware",
        capsuleId: input.capsule.capsuleId,
        capsuleHash,
        seedId: seed.seedId,
        kind: seed.kind,
        recommendedNextStep: compactString(seed.recommendedNextStep, 1_000),
        evidenceRefs: seed.evidenceRefs.slice(0, 20),
        confidence: seed.confidence,
        qualityReview: {
          source: qualityReview.source,
          usefulness: qualityReview.usefulness,
          specificity: qualityReview.specificity,
          ownerFit: qualityReview.ownerFit,
          reviewRef: compactString(qualityReview.reviewRef, 300),
          limitations: qualityReview.limitations
            .map((entry) => compactString(entry, 300))
            .slice(0, 8),
          recommendedQueueKind: qualityReview.recommendedQueueKind
            ? compactString(qualityReview.recommendedQueueKind, 80)
            : null,
        },
        qualityReviewState:
          qualityReview.usefulness === "useful" ? "model_reviewed_useful" : "pending_review",
        dbOperationRefs,
        modelTaskRefs: input.dbOperationEvidence.modelTaskRefs?.slice(0, 20) ?? [],
        reviewStatus: "pending_review",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
    });
    createdWorkItemIds.push(workItemId);
    if (input.createPlanningCapsuleIntakeForAcceptedSeeds !== false) {
      const planningCapsule = await createPlanningCapsuleFromOpportunitySeed({
        workQueue: input.workQueue,
        workItemId,
        capsuleId: `planning-from-${seed.seedId}`.replace(/[^a-zA-Z0-9:-]/gu, "-").slice(0, 120),
        seed,
        sourceCloseoutRef: `closeout-capsule://${input.capsule.capsuleId}`,
        qualityReviewRef: qualityReview.reviewRef,
        actorId: input.dbOperationEvidence.actorId ?? "execution-platform-closeout-capsule",
      });
      planningCapsuleRefs.push(planningCapsule.refs.artifactRef);
    }
  }
  return {
    artifactKind: "closeout_capsule_opportunity_runtime_projection_decision",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    status: "accepted",
    capsuleId: input.capsule.capsuleId,
    capsuleHash,
    createdWorkItemIds,
    planningCapsuleRefs,
    skippedSeedIds,
    duplicateWorkItemIds,
    evidenceRefs: [
      ...dbOperationRefs.map((ref) => ({
        ref,
        kind: "db_operation" as const,
        boundedSummary: "DB-operation middleware evidence for opportunity seed projection.",
      })),
      ...(input.dbOperationEvidence.modelTaskRefs ?? []).map((ref) => ({
        ref,
        kind: "model_task" as const,
        boundedSummary: "Model-task evidence for opportunity seed interpretation.",
      })),
    ].slice(0, 40),
    reasonCodes: [
      "closeout_opportunity_seeds_projected_via_db_operation_middleware",
      ...(planningCapsuleRefs.length > 0
        ? ["accepted_opportunity_seeds_unpacked_to_planning_capsules"]
        : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
