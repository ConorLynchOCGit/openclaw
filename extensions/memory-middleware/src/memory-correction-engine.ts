import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareAutoPromotionConfig } from "./config.js";
import { executeApprovedMemoryObjectSupersede } from "./memory-object-supersede.js";
import {
  getMemoryCorrectionRuntimePolicy,
  type MemoryRuntimePolicyKey,
} from "./memory-runtime-policy-views.js";

export type MemoryCorrectionTrigger = "explicit_correction" | "cluster_auto_review";
export type MemoryCorrectionPromotionPolicy =
  | "defer_immediate_bounded_correction"
  | "allow_immediate_bounded_correction";
export type MemoryCorrectionExecutionKind =
  | "hold"
  | "approved_memory_object_supersede"
  | "validated_procedure_supersede";

export type SkippedMemoryCorrectionPlan = {
  status: "skip";
  reason: string;
  executionKind: Exclude<MemoryCorrectionExecutionKind, "hold">;
  supersedeTargetIds: [];
};

export type HeldMemoryCorrectionPlan = {
  status: "hold";
  reason: string;
  executionKind: "hold";
  supersedeTargetIds: [];
};

export type ExecutableMemoryObjectCorrectionPlan = {
  status: "execute";
  reason: string;
  executionKind: "approved_memory_object_supersede";
  supersedeTargetIds: string[];
};

export type ExecutableValidatedProcedureCorrectionPlan = {
  status: "execute";
  reason: string;
  executionKind: "validated_procedure_supersede";
  supersedeTargetIds: string[];
};

export type MemoryCorrectionPlan =
  | SkippedMemoryCorrectionPlan
  | HeldMemoryCorrectionPlan
  | ExecutableMemoryObjectCorrectionPlan
  | ExecutableValidatedProcedureCorrectionPlan;

export function resolveMemoryCorrectionPlan(params: {
  familyId: MemoryRuntimePolicyKey;
  trigger: MemoryCorrectionTrigger;
  promotionPolicy?: MemoryCorrectionPromotionPolicy;
  activeSubjectTargetIds?: readonly string[];
  activeApprovedSubjectObjectIds?: readonly string[];
  activeValidatedSubjectProcedureIds?: readonly string[];
  conflictingApprovedObjectIds?: readonly string[];
}): MemoryCorrectionPlan {
  const correctionPolicy = getMemoryCorrectionRuntimePolicy(params.familyId);
  const explicitExecutionKind =
    correctionPolicy.targetKind === "validated_procedure"
      ? "validated_procedure_supersede"
      : "approved_memory_object_supersede";
  if (params.trigger === "cluster_auto_review") {
    const supersedeTargetIds = [...(params.conflictingApprovedObjectIds ?? [])];
    if (supersedeTargetIds.length === 0) {
      return {
        status: "skip",
        reason: "no conflicting approved subject targets",
        executionKind: "approved_memory_object_supersede",
        supersedeTargetIds: [],
      };
    }
    return {
      status: "execute",
      reason: "cluster auto-review supersedes older conflicting approved subject targets",
      executionKind: "approved_memory_object_supersede",
      supersedeTargetIds,
    };
  }

  if (correctionPolicy.mode === "held_correction") {
    return {
      status: "hold",
      reason: "family correction policy remains held until a later slice activates it",
      executionKind: "hold",
      supersedeTargetIds: [],
    };
  }

  const supersedeTargetIds = [
    ...(params.activeSubjectTargetIds ??
      params.activeValidatedSubjectProcedureIds ??
      params.activeApprovedSubjectObjectIds ??
      []),
  ];
  if (correctionPolicy.requiresExistingTarget && supersedeTargetIds.length === 0) {
    return {
      status: "skip",
      reason: "no approved subject target exists to supersede",
      executionKind: explicitExecutionKind,
      supersedeTargetIds: [],
    };
  }
  if (params.promotionPolicy !== "allow_immediate_bounded_correction") {
    return {
      status: "skip",
      reason: "correction promotion policy does not permit immediate correction promotion",
      executionKind: explicitExecutionKind,
      supersedeTargetIds: [],
    };
  }

  return {
    status: "execute",
    reason:
      explicitExecutionKind === "validated_procedure_supersede"
        ? "bounded correction should immediately validate and supersede the active procedure subject"
        : "bounded correction should immediately supersede an approved subject target",
    executionKind: explicitExecutionKind,
    supersedeTargetIds,
  };
}

export function isExecutableMemoryObjectCorrectionPlan(
  plan: MemoryCorrectionPlan,
): plan is ExecutableMemoryObjectCorrectionPlan {
  return plan.status === "execute" && plan.executionKind === "approved_memory_object_supersede";
}

export function resolveMemoryCorrectionPromotionPolicy(
  autoPromotionProfile: MemoryMiddlewareAutoPromotionConfig["profile"] | undefined,
): MemoryCorrectionPromotionPolicy {
  return autoPromotionProfile === "explicit-user-preference-v1"
    ? "allow_immediate_bounded_correction"
    : "defer_immediate_bounded_correction";
}

export type ApprovedMemoryObjectCorrectionPromotionAttempt =
  | {
      kind: "not_executable";
      plan: Exclude<MemoryCorrectionPlan, ExecutableMemoryObjectCorrectionPlan>;
    }
  | ({
      kind: "executed";
      plan: ExecutableMemoryObjectCorrectionPlan;
    } & {
      accepted: boolean;
      promotedMemoryObjectId?: string;
    });

export async function attemptApprovedMemoryObjectCorrectionPromotion(params: {
  familyId: MemoryRuntimePolicyKey;
  trigger: MemoryCorrectionTrigger;
  promotionPolicy?: MemoryCorrectionPromotionPolicy;
  activeSubjectTargetIds?: readonly string[];
  activeApprovedSubjectObjectIds?: readonly string[];
  conflictingApprovedObjectIds?: readonly string[];
  candidateId: string;
  schema: string;
  reviewerAgentId?: string;
  reviewCandidate: (input: {
    candidateId: string;
    outcome: "accepted";
    reviewerAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string }>;
  promoteToMemory: (input: {
    candidateId: string;
    promoterAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; promotedMemoryObjectId?: string | null }>;
  promotionMetadata: Record<string, unknown>;
  config: {
    database?: {
      url?: string;
      schema?: string;
    };
  };
  logger?: PluginLogger;
  logContext: Record<string, unknown>;
  logLabel: string;
  supersedeRationale: string;
  supersedeSource: string;
  supersedeReason: string;
  supersedeMetadata?: Record<string, unknown>;
  supersedeTargets?: (input: {
    promotedMemoryObjectId: string;
    supersedeTargetIds: readonly string[];
  }) => Promise<{ accepted: boolean; reason?: string }>;
}): Promise<ApprovedMemoryObjectCorrectionPromotionAttempt> {
  const plan = resolveMemoryCorrectionPlan({
    familyId: params.familyId,
    trigger: params.trigger,
    promotionPolicy: params.promotionPolicy,
    ...(params.activeSubjectTargetIds
      ? { activeSubjectTargetIds: params.activeSubjectTargetIds }
      : {}),
    ...(params.activeApprovedSubjectObjectIds
      ? { activeApprovedSubjectObjectIds: params.activeApprovedSubjectObjectIds }
      : {}),
    ...(params.conflictingApprovedObjectIds
      ? { conflictingApprovedObjectIds: params.conflictingApprovedObjectIds }
      : {}),
  });
  if (!isExecutableMemoryObjectCorrectionPlan(plan)) {
    return {
      kind: "not_executable",
      plan,
    };
  }

  const result = await executeMemoryObjectCorrectionPlan({
    familyId: params.familyId,
    plan,
    candidateId: params.candidateId,
    schema: params.schema,
    reviewerAgentId: params.reviewerAgentId,
    reviewCandidate: params.reviewCandidate,
    promoteToMemory: params.promoteToMemory,
    promotionMetadata: params.promotionMetadata,
    config: params.config,
    logger: params.logger,
    logContext: params.logContext,
    logLabel: params.logLabel,
    supersedeRationale: params.supersedeRationale,
    supersedeSource: params.supersedeSource,
    supersedeReason: params.supersedeReason,
    ...(params.supersedeMetadata ? { supersedeMetadata: params.supersedeMetadata } : {}),
    ...(params.supersedeTargets ? { supersedeTargets: params.supersedeTargets } : {}),
  });
  return {
    kind: "executed",
    plan,
    ...result,
  };
}

export async function executeMemoryObjectCorrectionPlan(params: {
  familyId: MemoryRuntimePolicyKey;
  plan: ExecutableMemoryObjectCorrectionPlan;
  candidateId: string;
  schema: string;
  reviewerAgentId?: string;
  reviewCandidate: (input: {
    candidateId: string;
    outcome: "accepted";
    reviewerAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string }>;
  promoteToMemory: (input: {
    candidateId: string;
    promoterAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; promotedMemoryObjectId?: string | null }>;
  promotionMetadata: Record<string, unknown>;
  config: {
    database?: {
      url?: string;
      schema?: string;
    };
  };
  logger?: PluginLogger;
  logContext: Record<string, unknown>;
  logLabel: string;
  supersedeRationale: string;
  supersedeSource: string;
  supersedeReason: string;
  supersedeMetadata?: Record<string, unknown>;
  supersedeTargets?: (input: {
    promotedMemoryObjectId: string;
    supersedeTargetIds: readonly string[];
  }) => Promise<{ accepted: boolean; reason?: string }>;
}): Promise<{ accepted: boolean; promotedMemoryObjectId?: string }> {
  const reviewResult = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "accepted",
    reviewerAgentId: params.reviewerAgentId,
    metadata: params.promotionMetadata,
  });
  if (!reviewResult.accepted) {
    if (params.logger?.warn) {
      params.logger.warn(
        `memory-middleware ${params.logLabel} auto-promotion review rejected ${JSON.stringify({
          ...params.logContext,
          candidateId: params.candidateId,
          reason: reviewResult.reason ?? "unknown",
        })}`,
      );
    }
    return { accepted: false };
  }

  const promotionResult = await params.promoteToMemory({
    candidateId: params.candidateId,
    promoterAgentId: params.reviewerAgentId,
    metadata: params.promotionMetadata,
  });
  if (!promotionResult.accepted || !promotionResult.promotedMemoryObjectId) {
    if (params.logger?.warn) {
      params.logger.warn(
        `memory-middleware ${params.logLabel} auto-promotion failed ${JSON.stringify({
          ...params.logContext,
          candidateId: params.candidateId,
          reason: promotionResult.reason ?? "unknown",
        })}`,
      );
    }
    return { accepted: false };
  }

  if (params.plan.supersedeTargetIds.length > 0) {
    try {
      if (params.supersedeTargets) {
        const supersedeResult = await params.supersedeTargets({
          promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
          supersedeTargetIds: params.plan.supersedeTargetIds,
        });
        if (!supersedeResult.accepted) {
          throw new Error(supersedeResult.reason ?? `${params.logLabel} supersede failed`);
        }
      } else if (params.config.database?.url) {
        const client = new Client({ connectionString: params.config.database?.url });
        try {
          await client.connect();
          await client.query("begin");
          const supersedeResult = await executeApprovedMemoryObjectSupersede({
            client,
            schema: params.config.database?.schema ?? params.schema,
            targetObjectIds: params.plan.supersedeTargetIds,
            supersededByObjectId: promotionResult.promotedMemoryObjectId,
            reviewerAgentId: params.reviewerAgentId,
            rationale: params.supersedeRationale,
            source: params.supersedeSource,
            supersededReason: params.supersedeReason,
            ...(params.supersedeMetadata ? { metadata: params.supersedeMetadata } : {}),
            logger: params.logger,
            logLabel: params.logLabel,
          });
          if (!supersedeResult.accepted) {
            throw new Error(supersedeResult.reason ?? `${params.logLabel} supersede failed`);
          }
          await client.query("commit");
        } catch (error) {
          try {
            await client.query("rollback");
          } catch {
            // Best effort only.
          }
          throw error;
        } finally {
          await client.end().catch(() => {});
        }
      }
    } catch (error) {
      if (params.logger?.warn) {
        params.logger.warn(
          `memory-middleware ${params.logLabel} supersede failed ${JSON.stringify({
            ...params.logContext,
            candidateId: params.candidateId,
            promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
            error: error instanceof Error ? error.message : String(error),
          })}`,
        );
      }
      return { accepted: false };
    }
  }

  if (params.logger?.info) {
    params.logger.info(
      `memory-middleware ${params.logLabel} auto-promotion accepted ${JSON.stringify({
        ...params.logContext,
        candidateId: params.candidateId,
        promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
      })}`,
    );
  }
  return {
    accepted: true,
    promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
  };
}
