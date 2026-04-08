import type { OpenClawPluginApi } from "../api.js";
import {
  createBackgroundJobSchedulerPort,
  type BackgroundJobSchedulerPort,
} from "./background-job-scheduler.js";
import { createCandidateIngressPort, type CandidateIngressPort } from "./candidate-ingress.js";
import {
  createCandidatePromotionPlanPort,
  type CandidatePromotionPlanPort,
} from "./candidate-promotion-plan.js";
import {
  createCandidatePromotionPort,
  type CandidatePromotionPort,
} from "./candidate-promotion.js";
import { createCandidateQueryPort, type CandidateQueryPort } from "./candidate-query.js";
import { createCandidateReviewPort, type CandidateReviewPort } from "./candidate-review.js";
import {
  createCompactionPlanningPort,
  type CompactionPlanningPort,
} from "./compaction-planning.js";
import { resolveMemoryMiddlewareConfig, type MemoryMiddlewareConfig } from "./config.js";
import {
  createConsolidationExecutionPort,
  type ConsolidationExecutionPort,
} from "./consolidation-execution.js";
import {
  createConsolidationPlanningPort,
  type ConsolidationPlanningPort,
} from "./consolidation-planning.js";
import { createMemoryMiddlewareDb, type MemoryMiddlewareDb } from "./db/runtime.js";
import {
  createDriftCheckExecutionPort,
  type DriftCheckExecutionPort,
} from "./drift-check-execution.js";
import {
  createFullCompactionFallbackPort,
  type FullCompactionFallbackPort,
} from "./full-compaction-fallback.js";
import {
  createLearnedGuidanceAdvisoryPlanningPort,
  type LearnedGuidanceAdvisoryPlanningPort,
} from "./learned-guidance-advisory-planning.js";
import { createMemoryObjectQueryPort, type MemoryObjectQueryPort } from "./memory-object-query.js";
import {
  createProactiveExecutionPort,
  type ProactiveExecutionPort,
} from "./proactive-execution.js";
import { createProactivePlanningPort, type ProactivePlanningPort } from "./proactive-planning.js";
import {
  createProcedureValidationPlanPort,
  type ProcedureValidationPlanPort,
} from "./procedure-validation-plan.js";
import {
  createProcedureValidationPort,
  type ProcedureValidationPort,
} from "./procedure-validation.js";
import {
  createSelfImprovingCandidateCapturePort,
  type SelfImprovingCandidateCapturePort,
} from "./self-improving-candidate-capture.js";
import {
  createSessionMemoryCompactionPort,
  type SessionMemoryCompactionPort,
} from "./session-memory-compaction.js";
import { createSessionMemoryPort, type SessionMemoryPort } from "./session-memory.js";
import {
  createSkillCandidateApprovalPlanPort,
  type SkillCandidateApprovalPlanPort,
} from "./skill-candidate-approval-plan.js";
import {
  createSkillCandidateApprovalPort,
  type SkillCandidateApprovalPort,
} from "./skill-candidate-approval.js";
import {
  createSkillCandidateInstallHandoffPort,
  type SkillCandidateInstallHandoffPort,
} from "./skill-candidate-install-handoff.js";
import {
  createSkillCandidateInstallRecordPort,
  type SkillCandidateInstallRecordPort,
} from "./skill-candidate-install-record.js";
import {
  createSkillCandidatePlanPort,
  type SkillCandidatePlanPort,
} from "./skill-candidate-plan.js";
import {
  createSkillCandidateProcurementPlanPort,
  type SkillCandidateProcurementPlanPort,
} from "./skill-candidate-procurement-plan.js";
import {
  createSkillCandidateProcurementRecordPort,
  type SkillCandidateProcurementRecordPort,
} from "./skill-candidate-procurement-record.js";
import {
  createSkillCandidateSkillVetterHandoffPort,
  type SkillCandidateSkillVetterHandoffPort,
} from "./skill-candidate-skill-vetter-handoff.js";
import {
  createSkillCandidateVettingResultPort,
  type SkillCandidateVettingResultPort,
} from "./skill-candidate-vetting-result.js";
import { createSkillCandidatePort, type SkillCandidatePort } from "./skill-candidate.js";
import { createToolResultStorePort, type ToolResultStorePort } from "./tool-result-store.js";

export type MemoryMiddlewareRuntime = {
  config: MemoryMiddlewareConfig;
  db: MemoryMiddlewareDb;
  candidateIngress: CandidateIngressPort;
  selfImprovingCandidateCapture: SelfImprovingCandidateCapturePort;
  learnedGuidanceAdvisoryPlanning: LearnedGuidanceAdvisoryPlanningPort;
  candidateQuery: CandidateQueryPort;
  memoryObjectQuery: MemoryObjectQueryPort;
  toolResultStore: ToolResultStorePort;
  sessionMemory: SessionMemoryPort;
  sessionMemoryCompaction: SessionMemoryCompactionPort;
  compactionPlanning: CompactionPlanningPort;
  fullCompactionFallback: FullCompactionFallbackPort;
  consolidationExecution: ConsolidationExecutionPort;
  consolidationPlanning: ConsolidationPlanningPort;
  driftCheckExecution: DriftCheckExecutionPort;
  proactivePlanning: ProactivePlanningPort;
  proactiveExecution: ProactiveExecutionPort;
  backgroundJobs: BackgroundJobSchedulerPort;
  candidateReview: CandidateReviewPort;
  candidatePromotionPlan: CandidatePromotionPlanPort;
  candidatePromotion: CandidatePromotionPort;
  procedureValidationPlan: ProcedureValidationPlanPort;
  procedureValidation: ProcedureValidationPort;
  skillCandidateApprovalPlan: SkillCandidateApprovalPlanPort;
  skillCandidateApproval: SkillCandidateApprovalPort;
  skillCandidateInstallHandoff: SkillCandidateInstallHandoffPort;
  skillCandidateInstallRecord: SkillCandidateInstallRecordPort;
  skillCandidatePlan: SkillCandidatePlanPort;
  skillCandidate: SkillCandidatePort;
  skillCandidateProcurementPlan: SkillCandidateProcurementPlanPort;
  skillCandidateProcurementRecord: SkillCandidateProcurementRecordPort;
  skillCandidateSkillVetterHandoff: SkillCandidateSkillVetterHandoffPort;
  skillCandidateVettingResult: SkillCandidateVettingResultPort;
};

function isFullCandidateMode(config: MemoryMiddlewareConfig): boolean {
  return config.candidateIngress.mode === "candidate-only";
}

function candidateIngressMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-only"
  | "submit-review-only"
  | "submit-review-promote-memory"
  | "submit-review-promote-memory-procedure"
  | "submit-review-promote-memory-procedure-validate"
  | "submit-review-promote-memory-procedure-validate-skill"
  | "submit-review-promote-memory-procedure-validate-skill-procurement"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode;
}

function candidateReviewMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-review-only"
  | "submit-review-promote-memory"
  | "submit-review-promote-memory-procedure"
  | "submit-review-promote-memory-procedure-validate"
  | "submit-review-promote-memory-procedure-validate-skill"
  | "submit-review-promote-memory-procedure-validate-skill-procurement"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode === "submit-review-only" ||
    config.candidateIngress.mode === "submit-review-promote-memory" ||
    config.candidateIngress.mode === "submit-review-promote-memory-procedure" ||
    config.candidateIngress.mode === "submit-review-promote-memory-procedure-validate" ||
    config.candidateIngress.mode === "submit-review-promote-memory-procedure-validate-skill" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    config.candidateIngress.mode === "candidate-only"
    ? config.candidateIngress.mode
    : "disabled";
}

function candidatePromotionMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-review-promote-memory"
  | "submit-review-promote-memory-procedure"
  | "submit-review-promote-memory-procedure-validate"
  | "submit-review-promote-memory-procedure-validate-skill"
  | "submit-review-promote-memory-procedure-validate-skill-procurement"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode === "submit-review-promote-memory" ||
    config.candidateIngress.mode === "submit-review-promote-memory-procedure" ||
    config.candidateIngress.mode === "submit-review-promote-memory-procedure-validate" ||
    config.candidateIngress.mode === "submit-review-promote-memory-procedure-validate-skill" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    config.candidateIngress.mode === "candidate-only"
    ? config.candidateIngress.mode
    : "disabled";
}

function procedureValidationMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-review-promote-memory-procedure-validate"
  | "submit-review-promote-memory-procedure-validate-skill"
  | "submit-review-promote-memory-procedure-validate-skill-procurement"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode === "submit-review-promote-memory-procedure-validate" ||
    config.candidateIngress.mode === "submit-review-promote-memory-procedure-validate-skill" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    config.candidateIngress.mode === "candidate-only"
    ? config.candidateIngress.mode
    : "disabled";
}

function skillCandidateMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-review-promote-memory-procedure-validate-skill"
  | "submit-review-promote-memory-procedure-validate-skill-procurement"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode === "submit-review-promote-memory-procedure-validate-skill" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    config.candidateIngress.mode === "candidate-only"
    ? config.candidateIngress.mode
    : "disabled";
}

function skillCandidateProcurementMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-review-promote-memory-procedure-validate-skill-procurement"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode ===
    "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    config.candidateIngress.mode === "candidate-only"
    ? config.candidateIngress.mode
    : "disabled";
}

function skillCandidateVettingMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode ===
    "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    config.candidateIngress.mode === "candidate-only"
    ? config.candidateIngress.mode
    : "disabled";
}

function skillCandidateApprovalMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode ===
    "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    config.candidateIngress.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    config.candidateIngress.mode === "candidate-only"
    ? config.candidateIngress.mode
    : "disabled";
}

function skillCandidateInstallMode(
  config: MemoryMiddlewareConfig,
):
  | "disabled"
  | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  | "candidate-only" {
  return config.candidateIngress.mode ===
    "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    config.candidateIngress.mode === "candidate-only"
    ? config.candidateIngress.mode
    : "disabled";
}

export function createMemoryMiddlewareRuntime(api: OpenClawPluginApi): MemoryMiddlewareRuntime {
  const config = resolveMemoryMiddlewareConfig(api.pluginConfig);
  const fullCandidateMode = isFullCandidateMode(config) ? "candidate-only" : "disabled";
  const selfImprovingCaptureMode =
    config.selfImprovingCapture?.mode === "candidate-only" ? "candidate-only" : "disabled";
  const learnedGuidanceAdvisoryPlanningMode =
    config.learnedGuidanceAdvisoryPlanning?.mode === "inline-only" ? "inline-only" : "disabled";
  const submitMode = candidateIngressMode(config);
  const reviewMode = candidateReviewMode(config);
  const promotionMode = candidatePromotionMode(config);
  const validationMode = procedureValidationMode(config);
  const skillMode = skillCandidateMode(config);
  const procurementMode = skillCandidateProcurementMode(config);
  const vettingMode = skillCandidateVettingMode(config);
  const approvalMode = skillCandidateApprovalMode(config);
  const installMode = skillCandidateInstallMode(config);
  const backgroundJobInspectionMode =
    config.backgroundJobs.inspectionMode === "enabled" ? "enabled" : "disabled";
  const proactivePlanningMode =
    isFullCandidateMode(config) || config.backgroundJobs.advisorySchedulingMode === "enabled"
      ? "candidate-only"
      : "disabled";
  const backgroundJobAdvisorySchedulingMode =
    config.backgroundJobs.advisorySchedulingMode === "enabled" ? "candidate-only" : "disabled";
  const backgroundJobExecuteSchedulingMode =
    config.backgroundJobs.executeSchedulingMode === "enabled" ? "candidate-only" : "disabled";
  const db = createMemoryMiddlewareDb({
    config: config.database,
    logger: api.logger,
  });
  const candidateIngress = createCandidateIngressPort({
    db,
    mode: submitMode,
  });
  const candidateReview = createCandidateReviewPort({
    db,
    mode: reviewMode,
  });
  const driftCheckExecution = createDriftCheckExecutionPort({
    db,
    mode: fullCandidateMode,
  });
  const scheduledDriftCheckExecution = createDriftCheckExecutionPort({
    db,
    mode: backgroundJobExecuteSchedulingMode,
  });
  const proactivePlanning = createProactivePlanningPort({
    db,
    mode: proactivePlanningMode,
  });
  const consolidationPlanning = createConsolidationPlanningPort({
    db,
    mode: fullCandidateMode,
  });
  const scheduledConsolidationPlanning = createConsolidationPlanningPort({
    db,
    mode: backgroundJobAdvisorySchedulingMode,
  });
  const consolidationExecution = createConsolidationExecutionPort({
    db,
    mode: fullCandidateMode,
  });
  const scheduledConsolidationExecution = createConsolidationExecutionPort({
    db,
    mode: backgroundJobExecuteSchedulingMode,
  });
  const proactiveExecution = createProactiveExecutionPort({
    proactivePlanning,
    driftCheckExecution,
    mode: fullCandidateMode,
  });
  const scheduledProactiveExecution = createProactiveExecutionPort({
    proactivePlanning,
    driftCheckExecution: scheduledDriftCheckExecution,
    mode: backgroundJobExecuteSchedulingMode,
  });
  const memoryObjectQuery = createMemoryObjectQueryPort({
    db,
    mode: config.memoryObjectQuery.mode,
  });

  return {
    config,
    db,
    candidateIngress,
    selfImprovingCandidateCapture: createSelfImprovingCandidateCapturePort({
      config,
      candidateIngress,
      candidateReview,
      mode: selfImprovingCaptureMode,
    }),
    learnedGuidanceAdvisoryPlanning: createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery,
      mode: learnedGuidanceAdvisoryPlanningMode,
    }),
    candidateQuery: createCandidateQueryPort({
      db,
      mode: fullCandidateMode,
    }),
    memoryObjectQuery,
    toolResultStore: createToolResultStorePort({
      db,
      mode: fullCandidateMode,
    }),
    sessionMemory: createSessionMemoryPort({
      db,
      mode: fullCandidateMode,
    }),
    sessionMemoryCompaction: createSessionMemoryCompactionPort({
      db,
      mode: fullCandidateMode,
    }),
    compactionPlanning: createCompactionPlanningPort({
      db,
      mode: fullCandidateMode,
    }),
    fullCompactionFallback: createFullCompactionFallbackPort({
      db,
      mode: fullCandidateMode,
    }),
    consolidationExecution,
    consolidationPlanning,
    driftCheckExecution,
    proactivePlanning,
    proactiveExecution,
    backgroundJobs: createBackgroundJobSchedulerPort({
      db,
      consolidationExecution: scheduledConsolidationExecution,
      consolidationPlanning: scheduledConsolidationPlanning,
      proactivePlanning,
      proactiveExecution: scheduledProactiveExecution,
      inspectionMode: backgroundJobInspectionMode,
      advisorySchedulingMode: backgroundJobAdvisorySchedulingMode,
      advisoryJobClasses: config.backgroundJobs.advisoryJobClasses,
      executeSchedulingMode: backgroundJobExecuteSchedulingMode,
      executeJobClasses: config.backgroundJobs.executeJobClasses,
      runnerOwnerId: config.backgroundJobs.runnerOwnerId,
    }),
    candidateReview,
    candidatePromotionPlan: createCandidatePromotionPlanPort({
      db,
      mode: promotionMode,
    }),
    candidatePromotion: createCandidatePromotionPort({
      db,
      mode: promotionMode,
    }),
    procedureValidationPlan: createProcedureValidationPlanPort({
      db,
      mode: fullCandidateMode,
    }),
    procedureValidation: createProcedureValidationPort({
      db,
      mode: validationMode,
    }),
    skillCandidateApprovalPlan: createSkillCandidateApprovalPlanPort({
      db,
      mode: approvalMode,
    }),
    skillCandidateApproval: createSkillCandidateApprovalPort({
      db,
      mode: approvalMode,
    }),
    skillCandidateInstallHandoff: createSkillCandidateInstallHandoffPort({
      db,
      mode: installMode,
    }),
    skillCandidateInstallRecord: createSkillCandidateInstallRecordPort({
      db,
      mode: installMode,
    }),
    skillCandidatePlan: createSkillCandidatePlanPort({
      db,
      mode: skillMode,
    }),
    skillCandidate: createSkillCandidatePort({
      db,
      mode: skillMode,
    }),
    skillCandidateProcurementPlan: createSkillCandidateProcurementPlanPort({
      db,
      mode: procurementMode,
    }),
    skillCandidateProcurementRecord: createSkillCandidateProcurementRecordPort({
      db,
      mode: procurementMode,
    }),
    skillCandidateSkillVetterHandoff: createSkillCandidateSkillVetterHandoffPort({
      db,
      mode: vettingMode,
    }),
    skillCandidateVettingResult: createSkillCandidateVettingResultPort({
      db,
      mode: vettingMode,
    }),
  };
}
