import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import type { MemoryCorrectionPlan } from "./memory-correction-engine.js";
import type { RecurringProcedureLifecycleInspection } from "./recurring-procedure-lifecycle.js";
import { storeValidatedProcedureSemanticEmbedding } from "./semantic-retrieval-routing.js";

export type RecurringProcedureStage = "none" | "candidate" | "validated";

export type RecurringProcedureStageArtifacts = {
  candidateId?: string;
  candidateEventId?: string;
  draftProcedureId?: string;
  validatedProcedureId?: string;
  procedureRunId?: string;
};

export type RecurringProcedureStagedInspection = RecurringProcedureLifecycleInspection & {
  stage: RecurringProcedureStage;
  hasActiveValidatedSubjectTargets: boolean;
};

export type RecurringProcedureStageTransitionResult =
  | {
      accepted: true;
      stage: "validated";
      artifacts: RecurringProcedureStageArtifacts;
    }
  | {
      accepted: false;
      stage: "candidate" | "draft";
      reason: string;
      artifacts: RecurringProcedureStageArtifacts;
    };

export function buildRecurringProcedureStagedInspection(
  inspection: RecurringProcedureLifecycleInspection | null,
): RecurringProcedureStagedInspection | null {
  if (!inspection) {
    return null;
  }

  const stage: RecurringProcedureStage = inspection.matchingValidatedProcedureId
    ? "validated"
    : inspection.pendingCandidate
      ? "candidate"
      : "none";

  return {
    ...inspection,
    stage,
    hasActiveValidatedSubjectTargets: inspection.activeValidatedSubjectProcedureIds.length > 0,
  };
}

export async function advanceRecurringProcedureCandidateStages(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  candidateId: string;
  title: string;
  subjectKey: string;
  correctionPlan?: MemoryCorrectionPlan | null;
  agentExternalKey?: string;
  sessionKey?: string;
  reviewerAgentId?: string;
  logger?: PluginLogger;
  reviewCandidate: (input: {
    candidateId: string;
    outcome: "accepted";
    reviewerAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string }>;
  promoteToProcedureDraft: (input: {
    candidateId: string;
    promoterAgentId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{
    accepted: boolean;
    reason?: string;
    procedureId?: string;
    sourceEventId?: string;
  }>;
  validateProcedure: (input: {
    procedureId: string;
    validatorAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{
    accepted: boolean;
    reason?: string;
    procedureId?: string;
    procedureRunId?: string;
  }>;
  supersedeValidatedProceduresBySubjectKey: (input: {
    config: MemoryMiddlewareConfig;
    subjectKey: string;
    supersededByProcedureId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string }>;
  metadata: Record<string, unknown>;
  logLabel: string;
  logContext: Record<string, unknown>;
}): Promise<RecurringProcedureStageTransitionResult> {
  const artifacts: RecurringProcedureStageArtifacts = {
    candidateId: params.candidateId,
  };

  const reviewResult = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "accepted",
    reviewerAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!reviewResult.accepted) {
    params.logger?.warn?.(
      `memory-middleware ${params.logLabel} auto-review rejected ${JSON.stringify({
        ...params.logContext,
        candidateId: params.candidateId,
        reason: reviewResult.reason ?? "unknown",
      })}`,
    );
    return {
      accepted: false,
      stage: "candidate",
      reason: reviewResult.reason ?? "unknown",
      artifacts,
    };
  }

  const promotionResult = await params.promoteToProcedureDraft({
    candidateId: params.candidateId,
    promoterAgentId: params.reviewerAgentId,
    title: params.title,
    metadata: params.metadata,
  });
  if (!promotionResult.accepted || !promotionResult.procedureId) {
    params.logger?.warn?.(
      `memory-middleware ${params.logLabel} draft promotion failed ${JSON.stringify({
        ...params.logContext,
        candidateId: params.candidateId,
        reason: promotionResult.reason ?? "unknown",
      })}`,
    );
    return {
      accepted: false,
      stage: "candidate",
      reason: promotionResult.reason ?? "procedure draft promotion failed",
      artifacts,
    };
  }

  artifacts.draftProcedureId = promotionResult.procedureId;
  if (promotionResult.sourceEventId) {
    artifacts.candidateEventId = promotionResult.sourceEventId;
  }

  const validationResult = await params.validateProcedure({
    procedureId: promotionResult.procedureId,
    validatorAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!validationResult.accepted || !validationResult.procedureId) {
    params.logger?.warn?.(
      `memory-middleware ${params.logLabel} validation failed ${JSON.stringify({
        ...params.logContext,
        candidateId: params.candidateId,
        procedureId: promotionResult.procedureId,
        reason: validationResult.reason ?? "unknown",
      })}`,
    );
    return {
      accepted: false,
      stage: "draft",
      reason: validationResult.reason ?? "procedure validation failed",
      artifacts,
    };
  }

  artifacts.validatedProcedureId = validationResult.procedureId;
  if (validationResult.procedureRunId) {
    artifacts.procedureRunId = validationResult.procedureRunId;
  }

  try {
    await storeValidatedProcedureSemanticEmbedding({
      config: params.config,
      cfg: params.cfg,
      agentId: params.agentExternalKey,
      sessionKey: params.sessionKey,
      procedureId: validationResult.procedureId,
      logger: params.logger,
    });
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware ${params.logLabel} semantic embedding update failed ${JSON.stringify({
        ...params.logContext,
        candidateId: params.candidateId,
        procedureId: validationResult.procedureId,
        error: error instanceof Error ? error.message : String(error),
      })}`,
    );
  }

  if (
    params.correctionPlan?.status === "execute" &&
    params.correctionPlan.executionKind === "validated_procedure_supersede"
  ) {
    const supersedeResult = await params.supersedeValidatedProceduresBySubjectKey({
      config: params.config,
      subjectKey: params.subjectKey,
      supersededByProcedureId: validationResult.procedureId,
      metadata: params.metadata,
    });
    if (!supersedeResult.accepted) {
      params.logger?.warn?.(
        `memory-middleware ${params.logLabel} supersede failed ${JSON.stringify({
          ...params.logContext,
          candidateId: params.candidateId,
          procedureId: validationResult.procedureId,
          reason: supersedeResult.reason ?? "unknown",
        })}`,
      );
      return {
        accepted: false,
        stage: "draft",
        reason: supersedeResult.reason ?? "unknown",
        artifacts,
      };
    }
  }

  params.logger?.info?.(
    `memory-middleware ${params.logLabel} auto-promotion accepted ${JSON.stringify({
      ...params.logContext,
      candidateId: params.candidateId,
      procedureId: validationResult.procedureId,
      procedureRunId: validationResult.procedureRunId,
    })}`,
  );

  return {
    accepted: true,
    stage: "validated",
    artifacts,
  };
}
