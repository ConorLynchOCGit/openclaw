import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import { closeoutCapsuleHash } from "../codex-bridge/closeout-capsule.ts";
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

export type CloseoutOpportunityProjectionDecision = {
  artifactKind: "closeout_capsule_opportunity_runtime_projection_decision";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  status: "accepted" | "needs_review" | "blocked";
  capsuleId: string;
  capsuleHash: string;
  createdWorkItemIds: string[];
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
  const skippedSeedIds: string[] = [];
  const duplicateWorkItemIds: string[] = [];
  for (const seed of input.capsule.opportunitySeeds) {
    if (seed.kind === "no_op") {
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
  }
  return {
    artifactKind: "closeout_capsule_opportunity_runtime_projection_decision",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    status: "accepted",
    capsuleId: input.capsule.capsuleId,
    capsuleHash,
    createdWorkItemIds,
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
    reasonCodes: ["closeout_opportunity_seeds_projected_via_db_operation_middleware"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
