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
import {
  resolveMemoryMiddlewareCandidateIngressCapabilities,
  resolveMemoryMiddlewareConfig,
  type MemoryMiddlewareConfig,
} from "./config.js";
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
  observeCandidateIngressPort,
  observeCandidatePromotionPort,
  observeCandidateReviewPort,
  observeCompactionPlanningPort,
  observeSessionMemoryPort,
} from "./memory-soak-runtime-observation.js";
import {
  createMemorySoakTelemetryPort,
  type MemorySoakTelemetryPort,
} from "./memory-soak-telemetry.js";
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
  soakTelemetry: MemorySoakTelemetryPort;
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

export function createMemoryMiddlewareRuntime(api: OpenClawPluginApi): MemoryMiddlewareRuntime {
  const config = resolveMemoryMiddlewareConfig(api.pluginConfig);
  const automation = resolveMemoryMiddlewareCandidateIngressCapabilities(
    config.candidateIngress.mode,
  );
  const fullCandidateMode = automation.fullCandidateSandbox ? "candidate-only" : "disabled";
  const selfImprovingCaptureMode =
    config.selfImprovingCapture?.mode === "candidate-only" ? "candidate-only" : "disabled";
  const learnedGuidanceAdvisoryPlanningMode =
    config.learnedGuidanceAdvisoryPlanning?.mode === "inline-only" ? "inline-only" : "disabled";
  const backgroundJobInspectionMode =
    config.backgroundJobs.inspectionMode === "enabled" ? "enabled" : "disabled";
  const proactivePlanningMode =
    automation.fullCandidateSandbox || config.backgroundJobs.advisorySchedulingMode === "enabled"
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
  const soakTelemetry = createMemorySoakTelemetryPort({
    logger: api.logger,
  });
  const rawCandidateIngress = createCandidateIngressPort({
    db,
    enabled: automation.submit,
  });
  const rawCandidateReview = createCandidateReviewPort({
    db,
    enabled: automation.review,
  });
  const candidateQuery = createCandidateQueryPort({
    db,
    mode: fullCandidateMode,
  });
  const candidateIngress = observeCandidateIngressPort({
    port: rawCandidateIngress,
    telemetry: soakTelemetry,
  });
  const candidateReview = observeCandidateReviewPort({
    port: rawCandidateReview,
    candidateQuery,
    telemetry: soakTelemetry,
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
  const rawCompactionPlanning = createCompactionPlanningPort({
    db,
    mode: fullCandidateMode,
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
  const rawCandidatePromotion = createCandidatePromotionPort({
    db,
    memoryPromotionEnabled: automation.memoryPromotion,
    procedureDraftPromotionEnabled: automation.procedureDraftPromotion,
  });
  const candidatePromotion = observeCandidatePromotionPort({
    port: rawCandidatePromotion,
    candidateQuery,
    telemetry: soakTelemetry,
  });
  const rawSessionMemory = createSessionMemoryPort({
    db,
    mode: fullCandidateMode,
  });
  const sessionMemory = observeSessionMemoryPort({
    port: rawSessionMemory,
    telemetry: soakTelemetry,
  });
  const compactionPlanning = observeCompactionPlanningPort({
    port: rawCompactionPlanning,
    telemetry: soakTelemetry,
  });

  return {
    config,
    soakTelemetry,
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
      rolloutTarget: config.learnedGuidanceAdvisoryPlanning?.rolloutTarget,
      allowedCaptureClasses: config.learnedGuidanceAdvisoryPlanning?.allowedCaptureClasses,
      defaultMaxSuggestions: config.learnedGuidanceAdvisoryPlanning?.defaultMaxSuggestions,
    }),
    candidateQuery,
    memoryObjectQuery,
    toolResultStore: createToolResultStorePort({
      db,
      mode: fullCandidateMode,
    }),
    sessionMemory,
    sessionMemoryCompaction: createSessionMemoryCompactionPort({
      db,
      mode: fullCandidateMode,
    }),
    compactionPlanning,
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
      enabled: automation.memoryPromotion || automation.procedureDraftPromotion,
    }),
    candidatePromotion,
    procedureValidationPlan: createProcedureValidationPlanPort({
      db,
      enabled: automation.procedureValidation,
    }),
    procedureValidation: createProcedureValidationPort({
      db,
      enabled: automation.procedureValidation,
    }),
    skillCandidateApprovalPlan: createSkillCandidateApprovalPlanPort({
      db,
      enabled: automation.skillApproval,
    }),
    skillCandidateApproval: createSkillCandidateApprovalPort({
      db,
      enabled: automation.skillApproval,
    }),
    skillCandidateInstallHandoff: createSkillCandidateInstallHandoffPort({
      db,
      enabled: automation.skillInstall,
    }),
    skillCandidateInstallRecord: createSkillCandidateInstallRecordPort({
      db,
      enabled: automation.skillInstall,
    }),
    skillCandidatePlan: createSkillCandidatePlanPort({
      db,
      enabled: automation.skillCandidate,
    }),
    skillCandidate: createSkillCandidatePort({
      db,
      enabled: automation.skillCandidate,
    }),
    skillCandidateProcurementPlan: createSkillCandidateProcurementPlanPort({
      db,
      enabled: automation.skillProcurement,
    }),
    skillCandidateProcurementRecord: createSkillCandidateProcurementRecordPort({
      db,
      enabled: automation.skillProcurement,
    }),
    skillCandidateSkillVetterHandoff: createSkillCandidateSkillVetterHandoffPort({
      db,
      enabled: automation.skillVetting,
    }),
    skillCandidateVettingResult: createSkillCandidateVettingResultPort({
      db,
      enabled: automation.skillVetting,
    }),
  };
}
