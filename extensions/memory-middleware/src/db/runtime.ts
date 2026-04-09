import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import { createMemoryMiddlewareQueryLayer } from "./queries.js";

export const CANDIDATE_SUBMISSION_KINDS = [
  "learning",
  "correction",
  "procedure",
  "improvement",
] as const;

export type CandidateSubmissionKind = (typeof CANDIDATE_SUBMISSION_KINDS)[number];

export type CandidateSubmissionAcceptedResult = {
  accepted: true;
  status: "accepted";
  kind: CandidateSubmissionKind;
  storage: "database";
  reviewState: "candidate" | "approved";
  eventId: string;
  memoryObjectId: string;
};

export type CandidateSubmissionRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "not_implemented" | "failed";
  kind: CandidateSubmissionKind;
  reason: string;
};

export type CandidateSubmissionResult =
  | CandidateSubmissionAcceptedResult
  | CandidateSubmissionRejectedResult;

export type CandidateSubmissionInput = {
  kind: CandidateSubmissionKind;
  content: string;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CandidateRecord = {
  id: string;
  eventId: string;
  kind: CandidateSubmissionKind;
  memoryKind: "project" | "feedback" | "procedure";
  reviewState: "candidate";
  content: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  eventName: `candidate_submission.${CandidateSubmissionKind}`;
  candidateMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CandidateListInput = {
  kind?: CandidateSubmissionKind;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  limit?: number;
};

export type CandidateGetInput = {
  candidateId: string;
};

export type CandidateListAcceptedResult = {
  accepted: true;
  status: "ok";
  candidates: CandidateRecord[];
};

export type CandidateGetAcceptedResult = {
  accepted: true;
  status: "ok";
  candidate: CandidateRecord;
};

export type CandidateQueryRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type CandidateListResult = CandidateListAcceptedResult | CandidateQueryRejectedResult;
export type CandidateGetResult = CandidateGetAcceptedResult | CandidateQueryRejectedResult;

export const CANDIDATE_REVIEW_OUTCOMES = ["accepted", "rejected", "needs_revision"] as const;

export type CandidateReviewOutcome = (typeof CANDIDATE_REVIEW_OUTCOMES)[number];

export type CandidateReviewInput = {
  candidateId: string;
  outcome: CandidateReviewOutcome;
  rationale?: string;
  reviewerAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type CandidateReviewAcceptedResult = {
  accepted: true;
  status: "recorded";
  candidateId: string;
  outcome: CandidateReviewOutcome;
  reviewId: string;
  memoryObjectStateChanged: boolean;
  reviewState: "candidate" | "corrected" | "rejected";
};

export type CandidateReviewRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "invalid_state";
  reason: string;
};

export type CandidateReviewResult = CandidateReviewAcceptedResult | CandidateReviewRejectedResult;

export const CANDIDATE_PROMOTION_PLAN_TARGETS = [
  "remain_candidate_only",
  "propose_memory_promotion",
  "propose_procedure_draft",
] as const;

export type CandidatePromotionPlanTarget = (typeof CANDIDATE_PROMOTION_PLAN_TARGETS)[number];

export type CandidatePromotionPlanInput = {
  candidateId: string;
};

export type CandidatePromotionPlanAcceptedResult = {
  accepted: true;
  status: "ok";
  candidateId: string;
  candidateKind: CandidateSubmissionKind;
  reviewState: "candidate" | "corrected" | "rejected";
  latestReviewOutcome?: CandidateReviewOutcome;
  eligible: boolean;
  possibleTargets: CandidatePromotionPlanTarget[];
  rationale: string[];
  requiredGates: string[];
};

export type CandidatePromotionPlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type CandidatePromotionPlanResult =
  | CandidatePromotionPlanAcceptedResult
  | CandidatePromotionPlanRejectedResult;

export type CandidateMemoryPromotionInput = {
  candidateId: string;
  rationale?: string;
  promoterAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type CandidateMemoryPromotionAcceptedResult = {
  accepted: true;
  status: "promoted" | "already_promoted";
  candidateId: string;
  promotedMemoryObjectId: string;
  promotedMemoryKind: "project" | "feedback";
  promotedReviewState: "approved";
  sourceEventId: string;
};

export type CandidateMemoryPromotionRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "ineligible";
  reason: string;
};

export type CandidateMemoryPromotionResult =
  | CandidateMemoryPromotionAcceptedResult
  | CandidateMemoryPromotionRejectedResult;

export type CandidateProcedurePromotionInput = {
  candidateId: string;
  title?: string;
  rationale?: string;
  promoterAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type CandidateProcedurePromotionAcceptedResult = {
  accepted: true;
  status: "promoted" | "already_promoted";
  candidateId: string;
  procedureId: string;
  procedureStatus: "draft";
  sourceEventId: string;
};

export type CandidateProcedurePromotionRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "ineligible";
  reason: string;
};

export type CandidateProcedurePromotionResult =
  | CandidateProcedurePromotionAcceptedResult
  | CandidateProcedurePromotionRejectedResult;

export const PROCEDURE_VALIDATION_PLAN_TARGETS = [
  "remain_draft_only",
  "propose_validated_procedure",
] as const;

export type ProcedureValidationPlanTarget = (typeof PROCEDURE_VALIDATION_PLAN_TARGETS)[number];

export type ProcedureStatus = "draft" | "validated" | "superseded" | "rejected" | "archived";

export type ProcedureValidationPlanInput = {
  procedureId: string;
};

export type ProcedureValidationPlanAcceptedResult = {
  accepted: true;
  status: "ok";
  procedureId: string;
  procedureStatus: ProcedureStatus;
  sourceCandidateId?: string;
  latestCandidateReviewOutcome?: CandidateReviewOutcome;
  eligible: boolean;
  possibleTargets: ProcedureValidationPlanTarget[];
  rationale: string[];
  requiredGates: string[];
};

export type ProcedureValidationPlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type ProcedureValidationPlanResult =
  | ProcedureValidationPlanAcceptedResult
  | ProcedureValidationPlanRejectedResult;

export type ProcedureValidationInput = {
  procedureId: string;
  rationale?: string;
  validatorAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type ProcedureValidationAcceptedResult = {
  accepted: true;
  status: "validated" | "already_validated";
  procedureId: string;
  procedureStatus: "validated";
  procedureRunId?: string;
  sourceCandidateId?: string;
};

export type ProcedureValidationRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "ineligible";
  reason: string;
};

export type ProcedureValidationResult =
  | ProcedureValidationAcceptedResult
  | ProcedureValidationRejectedResult;

export const SKILL_CANDIDATE_PLAN_TARGETS = [
  "remain_validated_procedure_only",
  "propose_skill_candidate",
] as const;

export type SkillCandidatePlanTarget = (typeof SKILL_CANDIDATE_PLAN_TARGETS)[number];

export type SkillCandidatePlanInput = {
  procedureId: string;
};

export type SkillCandidatePlanAcceptedResult = {
  accepted: true;
  status: "ok";
  procedureId: string;
  procedureStatus: ProcedureStatus;
  sourceCandidateId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  eligible: boolean;
  possibleTargets: SkillCandidatePlanTarget[];
  rationale: string[];
  requiredGates: string[];
};

export type SkillCandidatePlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type SkillCandidatePlanResult =
  | SkillCandidatePlanAcceptedResult
  | SkillCandidatePlanRejectedResult;

export type SkillCandidateStatus =
  | "candidate"
  | "vetted"
  | "approved_limited"
  | "approved_normal"
  | "rejected"
  | "quarantined"
  | "installed";

export type SkillCandidateCreateInput = {
  procedureId: string;
  name?: string;
  summary?: string;
  rationale?: string;
  creatorAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type SkillCandidateCreateAcceptedResult = {
  accepted: true;
  status: "created" | "already_created";
  procedureId: string;
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceCandidateId?: string;
};

export type SkillCandidateCreateRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "ineligible";
  reason: string;
};

export type SkillCandidateCreateResult =
  | SkillCandidateCreateAcceptedResult
  | SkillCandidateCreateRejectedResult;

export const SKILL_CANDIDATE_PROCUREMENT_PLAN_TARGETS = [
  "remain_internal_skill_candidate_only",
  "propose_procurement_handoff",
] as const;

export type SkillCandidateProcurementPlanTarget =
  (typeof SKILL_CANDIDATE_PROCUREMENT_PLAN_TARGETS)[number];

export type SkillCandidateProcurementPlanInput = {
  skillCandidateId: string;
};

export type SkillCandidateProcurementHandoff = {
  source: {
    sourceType: "bounded_internal_skill_candidate";
    skillCandidateId: string;
    sourceProcedureId?: string;
    sourceCandidateId?: string;
    sourceEventId?: string;
    validationRunId?: string;
  };
  scope: {
    name: string;
    summary: string;
    intendedRole: "candidate_reusable_behavior";
    boundaries: string[];
    overlaps: string[];
  };
  permissionsRisk: {
    currentArtifactRisk: "bounded_internal_record_only";
    installRisk: "external_skill_not_reviewed";
    requiredChecks: string[];
  };
  suspiciousPatterns: {
    knownConcerns: string[];
    openQuestions: string[];
  };
  operationalFit: {
    roadmapRole: "skill_candidate";
    acceleratorOnly: true;
    canonicalMemorySubstrate: false;
    repoNativeLineagePreserved: boolean;
  };
  approvalRecommendation: {
    proposedLifecycleState: "discovered" | "under_review";
    installRecommendation: "do_not_install";
    blockers: string[];
  };
};

export type SkillCandidateProcurementPlanAcceptedResult = {
  accepted: true;
  status: "ok";
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceCandidateId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  eligible: boolean;
  possibleTargets: SkillCandidateProcurementPlanTarget[];
  rationale: string[];
  requiredGates: string[];
  handoff?: SkillCandidateProcurementHandoff;
};

export type SkillCandidateProcurementPlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type SkillCandidateProcurementPlanResult =
  | SkillCandidateProcurementPlanAcceptedResult
  | SkillCandidateProcurementPlanRejectedResult;

export type SkillCandidateProcurementRecordInput = {
  skillCandidateId: string;
  rationale?: string;
  recorderAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type SkillCandidateProcurementRecordAcceptedResult = {
  accepted: true;
  status: "created" | "already_created";
  skillCandidateId: string;
  procurementRecordId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceCandidateId?: string;
};

export type SkillCandidateProcurementRecordRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "ineligible";
  reason: string;
};

export type SkillCandidateProcurementRecordResult =
  | SkillCandidateProcurementRecordAcceptedResult
  | SkillCandidateProcurementRecordRejectedResult;

export const SKILL_CANDIDATE_SKILL_VETTER_HANDOFF_TARGETS = [
  "remain_internal_only",
  "propose_skill_vetter_handoff",
] as const;

export type SkillCandidateSkillVetterHandoffTarget =
  (typeof SKILL_CANDIDATE_SKILL_VETTER_HANDOFF_TARGETS)[number];

export type SkillCandidateSkillVetterHandoffInput = {
  skillCandidateId: string;
};

export type SkillCandidateSkillVetterHandoffPackage = {
  procurementRecord: {
    procurementRecordId: string;
    eventName: "skill_candidate.procurement_record";
    recordedAt: string;
  };
  handoff: SkillCandidateProcurementHandoff;
  manualSkillVetterInputs: {
    source: SkillCandidateProcurementHandoff["source"];
    scope: SkillCandidateProcurementHandoff["scope"];
    permissionsRisk: SkillCandidateProcurementHandoff["permissionsRisk"];
    suspiciousPatterns: SkillCandidateProcurementHandoff["suspiciousPatterns"];
    operationalFit: SkillCandidateProcurementHandoff["operationalFit"];
    approvalRecommendation: SkillCandidateProcurementHandoff["approvalRecommendation"];
  };
  manualSteps: string[];
  installGuardrails: string[];
};

export type SkillCandidateSkillVetterHandoffAcceptedResult = {
  accepted: true;
  status: "ok";
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  procurementRecordId?: string;
  sourceProcedureId?: string;
  sourceCandidateId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  eligible: boolean;
  possibleTargets: SkillCandidateSkillVetterHandoffTarget[];
  rationale: string[];
  requiredGates: string[];
  handoff?: SkillCandidateSkillVetterHandoffPackage;
};

export type SkillCandidateSkillVetterHandoffRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type SkillCandidateSkillVetterHandoffResult =
  | SkillCandidateSkillVetterHandoffAcceptedResult
  | SkillCandidateSkillVetterHandoffRejectedResult;

export const SKILL_CANDIDATE_VETTING_DECISIONS = [
  "reject",
  "defer",
  "approve_limited",
  "approve_normal",
] as const;

export type SkillCandidateVettingDecision = (typeof SKILL_CANDIDATE_VETTING_DECISIONS)[number];

export type SkillCandidateVettingResultInput = {
  skillCandidateId: string;
  decision: SkillCandidateVettingDecision;
  summary?: string;
  reviewerAgentId?: string;
  permissionsRisk: {
    level: "low" | "medium" | "high";
    notes: string[];
    requiredChecks: string[];
  };
  suspiciousPatterns: {
    redFlags: string[];
    unresolvedQuestions: string[];
  };
  operationalFit: {
    fit: "good" | "limited" | "poor";
    notes: string[];
    acceleratorOnly: boolean;
    canonicalMemorySubstrate: boolean;
  };
  approvalRecommendation: {
    proposedLifecycleState:
      | "under_review"
      | "vetted"
      | "approved_limited"
      | "approved_normal"
      | "rejected"
      | "quarantined";
    installRecommendation: "do_not_install" | "manual_followup_required";
    blockers: string[];
  };
  metadata?: Record<string, unknown>;
};

export type SkillCandidateVettingResultAcceptedResult = {
  accepted: true;
  status: "created" | "already_created";
  skillCandidateId: string;
  procurementRecordId: string;
  vettingResultRecordId: string;
  decision: SkillCandidateVettingDecision;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceCandidateId?: string;
};

export type SkillCandidateVettingResultRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "ineligible";
  reason: string;
};

export type SkillCandidateVettingResultRecordResult =
  | SkillCandidateVettingResultAcceptedResult
  | SkillCandidateVettingResultRejectedResult;

export const SKILL_CANDIDATE_APPROVAL_PLAN_TARGETS = [
  "remain_internal_only",
  "propose_approved_for_limited_use",
  "propose_approved_for_normal_use",
  "remain_blocked",
] as const;

export type SkillCandidateApprovalPlanTarget =
  (typeof SKILL_CANDIDATE_APPROVAL_PLAN_TARGETS)[number];

export type SkillCandidateApprovalPlanInput = {
  skillCandidateId: string;
};

export type SkillCandidateApprovalPlanAcceptedResult = {
  accepted: true;
  status: "ok";
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  procurementRecordId?: string;
  vettingResultRecordId?: string;
  sourceProcedureId?: string;
  sourceCandidateId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  latestVettingDecision?: SkillCandidateVettingDecision;
  eligible: boolean;
  possibleTargets: SkillCandidateApprovalPlanTarget[];
  rationale: string[];
  requiredGates: string[];
  installGuardrails: string[];
  remainingBlockers: string[];
};

export type SkillCandidateApprovalPlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type SkillCandidateApprovalPlanResult =
  | SkillCandidateApprovalPlanAcceptedResult
  | SkillCandidateApprovalPlanRejectedResult;

export const SKILL_CANDIDATE_APPROVAL_SCOPES = ["limited", "normal"] as const;

export type SkillCandidateApprovalScope = (typeof SKILL_CANDIDATE_APPROVAL_SCOPES)[number];

export type SkillCandidateApproveInput = {
  skillCandidateId: string;
  scope: SkillCandidateApprovalScope;
  rationale?: string;
  approverAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type SkillCandidateApproveAcceptedResult = {
  accepted: true;
  status: "approved" | "already_approved";
  skillCandidateId: string;
  approvalRecordId: string;
  approvedScope: SkillCandidateApprovalScope;
  skillCandidateStatus: "approved_limited" | "approved_normal";
  procurementRecordId: string;
  vettingResultRecordId: string;
  sourceProcedureId?: string;
  sourceCandidateId?: string;
};

export type SkillCandidateApproveRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "ineligible";
  reason: string;
};

export type SkillCandidateApproveResult =
  | SkillCandidateApproveAcceptedResult
  | SkillCandidateApproveRejectedResult;

export const SKILL_CANDIDATE_INSTALL_HANDOFF_TARGETS = [
  "remain_approved_internal_only",
  "propose_manual_install_handoff",
] as const;

export type SkillCandidateInstallHandoffTarget =
  (typeof SKILL_CANDIDATE_INSTALL_HANDOFF_TARGETS)[number];

export type SkillCandidateInstallHandoffInput = {
  skillCandidateId: string;
};

export type SkillCandidateInstallHandoffPackage = {
  approval: {
    approvalRecordId: string;
    eventName: "skill_candidate.approval";
    recordedAt: string;
    approvedScope: SkillCandidateApprovalScope;
  };
  source: {
    skillCandidateId: string;
    sourceProcedureId?: string;
    sourceCandidateId?: string;
    procurementRecordId?: string;
    vettingResultRecordId?: string;
    validationRunId?: string;
  };
  rationale: string[];
  remainingBlockers: string[];
  installGuardrails: string[];
  manualSteps: string[];
};

export type SkillCandidateInstallHandoffAcceptedResult = {
  accepted: true;
  status: "ok";
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  approvedScope?: SkillCandidateApprovalScope;
  approvalRecordId?: string;
  procurementRecordId?: string;
  vettingResultRecordId?: string;
  sourceProcedureId?: string;
  sourceCandidateId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  eligible: boolean;
  possibleTargets: SkillCandidateInstallHandoffTarget[];
  rationale: string[];
  requiredGates: string[];
  remainingBlockers: string[];
  installGuardrails: string[];
  handoff?: SkillCandidateInstallHandoffPackage;
};

export type SkillCandidateInstallHandoffRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type SkillCandidateInstallHandoffResult =
  | SkillCandidateInstallHandoffAcceptedResult
  | SkillCandidateInstallHandoffRejectedResult;

export type SkillCandidateInstallRecordInput = {
  skillCandidateId: string;
  installerAgentId?: string;
  installNotes?: string;
  metadata?: Record<string, unknown>;
};

export type SkillCandidateInstallRecordAcceptedResult = {
  accepted: true;
  status: "created" | "already_created";
  skillCandidateId: string;
  installRecordId: string;
  installedScope: SkillCandidateApprovalScope;
  skillCandidateStatus: "approved_limited" | "approved_normal";
  approvalRecordId: string;
  procurementRecordId: string;
  vettingResultRecordId: string;
  sourceProcedureId?: string;
  sourceCandidateId?: string;
};

export type SkillCandidateInstallRecordRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found" | "ineligible";
  reason: string;
};

export type SkillCandidateInstallRecordResult =
  | SkillCandidateInstallRecordAcceptedResult
  | SkillCandidateInstallRecordRejectedResult;

export const MEMORY_OBJECT_SEARCH_SCOPES = [
  "approved_only",
  "include_candidates",
  "include_validated_procedures",
  "include_candidates_and_validated_procedures",
] as const;

export type MemoryObjectSearchScope = (typeof MEMORY_OBJECT_SEARCH_SCOPES)[number];

export const MEMORY_OBJECT_READ_SURFACES = [
  "approved_memory_view",
  "reviewable_candidates_view",
  "validated_procedure_read_model",
] as const;

export type MemoryObjectReadSurface = (typeof MEMORY_OBJECT_READ_SURFACES)[number];

export type MemoryObjectRecord = {
  objectType: "memory_object";
  readSurface: "approved_memory_view" | "reviewable_candidates_view";
  id: string;
  memoryKind: "project" | "feedback" | "procedure";
  reviewState: "candidate" | "approved";
  content: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  sourceEventId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProcedureObjectRecord = {
  objectType: "procedure";
  readSurface: "validated_procedure_read_model";
  id: string;
  status: "validated";
  title: string;
  body: string;
  projectId?: string;
  sourceMemoryObjectId?: string;
  sourceCandidateId?: string;
  latestValidationRunId?: string;
  latestValidationRunOutcome?: "passed";
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RetrievedMemoryRecord = MemoryObjectRecord | ProcedureObjectRecord;

export type MemoryObjectGetInput = {
  objectId: string;
  scope?: MemoryObjectSearchScope;
};

export type MemoryObjectListInput = {
  scope?: MemoryObjectSearchScope;
  kind?: "project" | "feedback" | "procedure";
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  limit?: number;
};

export type MemoryObjectSearchBasicInput = {
  query: string;
  scope?: MemoryObjectSearchScope;
  kind?: "project" | "feedback" | "procedure";
  projectId?: string;
  limit?: number;
};

export type MemoryObjectSearchHybridInput = {
  query: string;
  scope?: MemoryObjectSearchScope;
  kind?: "project" | "feedback" | "procedure";
  projectId?: string;
  limit?: number;
};

export const MEMORY_OBJECT_SEMANTIC_SEARCH_SCOPES = [
  "approved_only",
  "include_validated_procedures",
] as const;

export type MemoryObjectSemanticSearchScope = (typeof MEMORY_OBJECT_SEMANTIC_SEARCH_SCOPES)[number];

export type MemoryObjectSearchSemanticInput = {
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: string;
  scope?: MemoryObjectSemanticSearchScope;
  kind?: "project" | "feedback" | "procedure";
  projectId?: string;
  limit?: number;
};

export type MemoryObjectGetAcceptedResult = {
  accepted: true;
  status: "ok";
  record: RetrievedMemoryRecord;
};

export type MemoryObjectListAcceptedResult = {
  accepted: true;
  status: "ok";
  scope: MemoryObjectSearchScope;
  records: RetrievedMemoryRecord[];
};

export type MemoryObjectSearchBasicAcceptedResult = {
  accepted: true;
  status: "ok";
  scope: MemoryObjectSearchScope;
  query: string;
  records: RetrievedMemoryRecord[];
};

export type RankedRetrievedMemoryRecord = RetrievedMemoryRecord & {
  score: number;
  matchedFields: string[];
};

export type MemoryObjectSearchHybridAcceptedResult = {
  accepted: true;
  status: "ok";
  scope: MemoryObjectSearchScope;
  query: string;
  records: RankedRetrievedMemoryRecord[];
};

export type SemanticRetrievedMemoryRecord = RetrievedMemoryRecord & {
  score: number;
  distance: number;
  matchedFields: string[];
  embeddingModel: string;
  embeddingVersion: string;
  chunkIndex: number;
};

export type MemoryObjectSearchSemanticAcceptedResult = {
  accepted: true;
  status: "ok";
  scope: MemoryObjectSemanticSearchScope;
  embeddingModel: string;
  embeddingVersion: string;
  records: SemanticRetrievedMemoryRecord[];
};

export type MemoryObjectQueryRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type MemoryObjectGetResult = MemoryObjectGetAcceptedResult | MemoryObjectQueryRejectedResult;
export type MemoryObjectListResult =
  | MemoryObjectListAcceptedResult
  | MemoryObjectQueryRejectedResult;
export type MemoryObjectSearchBasicResult =
  | MemoryObjectSearchBasicAcceptedResult
  | MemoryObjectQueryRejectedResult;
export type MemoryObjectSearchHybridResult =
  | MemoryObjectSearchHybridAcceptedResult
  | MemoryObjectQueryRejectedResult;
export type MemoryObjectSearchSemanticResult =
  | MemoryObjectSearchSemanticAcceptedResult
  | MemoryObjectQueryRejectedResult;

export type ToolResultPreview = {
  kind: "tool_result_preview";
  shouldSubstitute: boolean;
  previewText: string;
  substitutionText: string;
  retrievalToolName: "memory_tool_result_get";
  retrievalArgs?: {
    toolResultId: string;
  };
  referenceToken?: string;
  contentType: string;
  sizeBytes: number;
  truncated: boolean;
  omittedBytes: number;
};

export type ToolResultPersistInput = {
  sessionId: string;
  toolName: string;
  contentType?: string;
  payloadText?: string;
  payloadJson?: JsonValue;
  projectId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
  persistThresholdBytes?: number;
  previewCharLimit?: number;
  forcePersist?: boolean;
};

export type ToolResultPersistPersistedResult = {
  accepted: true;
  status: "persisted";
  persisted: true;
  toolResultId: string;
  memoryEventId: string;
  sessionId: string;
  toolName: string;
  contentType: string;
  storageStatus: "persisted";
  sizeBytes: number;
  checksumSha256: string;
  thresholdBytes: number;
  preview: ToolResultPreview;
};

export type ToolResultPersistInlineResult = {
  accepted: true;
  status: "inline";
  persisted: false;
  sessionId: string;
  toolName: string;
  contentType: string;
  sizeBytes: number;
  thresholdBytes: number;
  preview: ToolResultPreview;
};

export type ToolResultPersistRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type ToolResultPersistResult =
  | ToolResultPersistPersistedResult
  | ToolResultPersistInlineResult
  | ToolResultPersistRejectedResult;

export type ToolResultGetInput = {
  toolResultId: string;
};

export type ToolResultRecord = {
  id: string;
  sessionId: string;
  toolName: string;
  storageStatus: "persisted" | "rehydrated" | "compacted" | "deleted";
  contentType?: string;
  previewText?: string;
  payloadText?: string;
  payloadJson?: JsonValue;
  sizeBytes?: number;
  checksumSha256?: string;
  projectId?: string;
  agentId?: string;
  memoryEventId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ToolResultGetAcceptedResult = {
  accepted: true;
  status: "ok";
  toolResult: ToolResultRecord;
};

export type ToolResultGetRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type ToolResultGetResult = ToolResultGetAcceptedResult | ToolResultGetRejectedResult;

export type ToolResultMicrocompactPlanInput = {
  sessionId: string;
  idleGapSeconds?: number;
  persistedCountThreshold?: number;
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold?: number;
  recentFloorCount?: number;
  maxClearCount?: number;
};

export type ToolResultMicrocompactTrigger =
  | "idle_gap_threshold"
  | "persisted_count_threshold"
  | "estimated_token_pressure";

export type ToolResultMicrocompactCandidate = {
  toolResultId: string;
  toolName: string;
  previewText?: string;
  referenceToken: string;
  sizeBytes?: number;
  estimatedPreviewTokens: number;
  createdAt: string;
  updatedAt: string;
};

export type ToolResultMicrocompactPlanAcceptedResult = {
  accepted: true;
  status: "ok";
  sessionId: string;
  shouldCompact: boolean;
  recommendedAction: "none" | "clear_persisted_previews";
  triggers: ToolResultMicrocompactTrigger[];
  rationale: string[];
  persistedResultCount: number;
  recentFloorCount: number;
  preservedToolResultIds: string[];
  clearCandidates: ToolResultMicrocompactCandidate[];
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold: number;
};

export type ToolResultMicrocompactPlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type ToolResultMicrocompactPlanResult =
  | ToolResultMicrocompactPlanAcceptedResult
  | ToolResultMicrocompactPlanRejectedResult;

export type ToolResultMicrocompactExecuteInput = {
  sessionId: string;
  clearToolResultIds?: string[];
  idleGapSeconds?: number;
  persistedCountThreshold?: number;
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold?: number;
  recentFloorCount?: number;
  maxClearCount?: number;
  agentId?: string;
};

export type ToolResultMicrocompactExecuteAcceptedResult = {
  accepted: true;
  status: "executed" | "no_op";
  sessionId: string;
  compactionEventId?: string;
  clearedToolResultIds: string[];
  preservedToolResultIds: string[];
  requestedToolResultIds?: string[];
  clearCandidates: ToolResultMicrocompactCandidate[];
  skippedRequestedToolResultIds: string[];
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold: number;
};

export type ToolResultMicrocompactExecuteRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type ToolResultMicrocompactExecuteResult =
  | ToolResultMicrocompactExecuteAcceptedResult
  | ToolResultMicrocompactExecuteRejectedResult;

export type SessionMemoryState = {
  title?: string;
  currentState?: string;
  taskSpecification?: string;
  relevantFiles: string[];
  commandsUsed: string[];
  errorsAndCorrections: string[];
  decisionsMade: string[];
  importantFactsLearned: string[];
  keyResults: string[];
  pendingTasks: string[];
  worklog: string[];
};

export type SessionMemoryGetInput = {
  sessionId: string;
  agentId: string;
};

export type SessionMemoryUpdateInput = {
  sessionId: string;
  agentId: string;
  title?: string;
  currentState?: string;
  taskSpecification?: string;
  relevantFiles?: string[];
  commandsUsed?: string[];
  errorsAndCorrections?: string[];
  decisionsMade?: string[];
  importantFactsLearned?: string[];
  keyResults?: string[];
  pendingTasks?: string[];
  worklog?: string[];
  updateReason?: string;
  metadata?: Record<string, unknown>;
};

export type SessionMemoryGetAcceptedResult = {
  accepted: true;
  status: "ok";
  exists: boolean;
  sessionId: string;
  agentId: string;
  memory: SessionMemoryState;
  stateKey: "session_memory";
  stateId?: string;
  lifecycle?: "active" | "paused" | "completed" | "superseded";
  updateCount?: number;
  updateReason?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SessionMemoryUpdateAcceptedResult = {
  accepted: true;
  status: "created" | "updated";
  sessionId: string;
  agentId: string;
  stateKey: "session_memory";
  stateId: string;
  lifecycle: "active";
  memory: SessionMemoryState;
  updateCount: number;
  updateReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionMemoryRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type SessionMemoryGetResult = SessionMemoryGetAcceptedResult | SessionMemoryRejectedResult;
export type SessionMemoryUpdateResult =
  | SessionMemoryUpdateAcceptedResult
  | SessionMemoryRejectedResult;

export type CompactionPlanInput = {
  sessionId: string;
  agentId: string;
  idleGapSeconds?: number;
  persistedCountThreshold?: number;
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold?: number;
  recentFloorCount?: number;
  maxClearCount?: number;
  sessionMemoryStaleAfterSeconds?: number;
};

export type CompactionPlanOutcome =
  | "none"
  | "use_microcompaction"
  | "use_session_memory"
  | "propose_full_compaction_fallback";

export type CompactionPlanSessionMemoryStatus =
  | "missing"
  | "fresh_and_sufficient"
  | "fresh_but_insufficient"
  | "stale"
  | "unavailable";

export type CompactionPlanAcceptedResult = {
  accepted: true;
  status: "ok";
  sessionId: string;
  agentId: string;
  outcome: CompactionPlanOutcome;
  rationale: string[];
  requiredInputs: string[];
  clearCandidates: ToolResultMicrocompactCandidate[];
  microcompactionRecommended: boolean;
  sessionMemoryStatus: CompactionPlanSessionMemoryStatus;
  sessionMemoryExists: boolean;
  sessionMemorySufficient: boolean;
  sessionMemoryFresh: boolean;
  sessionMemoryUpdatedAt?: string;
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold: number;
};

export type CompactionPlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type CompactionPlanResult = CompactionPlanAcceptedResult | CompactionPlanRejectedResult;

export type SessionMemoryCompactionPayload = {
  kind: "session_memory_compaction";
  shouldSubstitute: true;
  substitutionText: string;
  compactedText: string;
  fieldsIncluded: string[];
  structuredMemory: SessionMemoryState;
};

export type SessionMemoryCompactExecuteInput = {
  sessionId: string;
  agentId: string;
  idleGapSeconds?: number;
  persistedCountThreshold?: number;
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold?: number;
  recentFloorCount?: number;
  maxClearCount?: number;
  sessionMemoryStaleAfterSeconds?: number;
};

export type SessionMemoryCompactExecuteAcceptedResult = {
  accepted: true;
  status: "executed" | "no_op" | "already_executed";
  sessionId: string;
  agentId: string;
  plannerOutcome: CompactionPlanOutcome;
  sessionMemoryStatus: CompactionPlanSessionMemoryStatus;
  sessionMemoryStateId?: string;
  sessionMemoryUpdatedAt?: string;
  compactionEventId?: string;
  payload?: SessionMemoryCompactionPayload;
  rationale: string[];
  requiredInputs: string[];
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold: number;
};

export type SessionMemoryCompactExecuteRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type SessionMemoryCompactExecuteResult =
  | SessionMemoryCompactExecuteAcceptedResult
  | SessionMemoryCompactExecuteRejectedResult;

export type FullCompactionFallbackPayload = {
  kind: "full_compaction_fallback";
  shouldSubstitute: true;
  substitutionText: string;
  compactedText: string;
  substrate: {
    plannerOutcome: "propose_full_compaction_fallback";
    sessionMemoryStatus: CompactionPlanSessionMemoryStatus;
    sessionMemoryStateId?: string;
    sessionMemoryUpdatedAt?: string;
    microcompactionRecommended: boolean;
    clearCandidateIds: string[];
  };
  rationale: string[];
  structuredSessionMemory?: SessionMemoryState;
};

export type FullCompactionFallbackExecuteInput = {
  sessionId: string;
  agentId: string;
  idleGapSeconds?: number;
  persistedCountThreshold?: number;
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold?: number;
  recentFloorCount?: number;
  maxClearCount?: number;
  sessionMemoryStaleAfterSeconds?: number;
};

export type FullCompactionFallbackExecuteAcceptedResult = {
  accepted: true;
  status: "executed" | "no_op" | "already_executed";
  sessionId: string;
  agentId: string;
  plannerOutcome: CompactionPlanOutcome;
  sessionMemoryStatus: CompactionPlanSessionMemoryStatus;
  sessionMemoryStateId?: string;
  sessionMemoryUpdatedAt?: string;
  compactionEventId?: string;
  payload?: FullCompactionFallbackPayload;
  rationale: string[];
  requiredInputs: string[];
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold: number;
};

export type FullCompactionFallbackExecuteRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type FullCompactionFallbackExecuteResult =
  | FullCompactionFallbackExecuteAcceptedResult
  | FullCompactionFallbackExecuteRejectedResult;

export type ConsolidationPlanInput = {
  projectId?: string;
  includeValidatedProcedures?: boolean;
  limit?: number;
  maxFindings?: number;
};

export type ConsolidationPlanActionType =
  | "duplicate_merge_review"
  | "contradiction_review"
  | "stale_superseded_review"
  | "drift_check_review";

export type ConsolidationPlanPriority = "high" | "medium" | "low";

export type ConsolidationPlanConfidence = "high" | "medium" | "low";

export type ConsolidationPlanFinding = {
  actionType: ConsolidationPlanActionType;
  priority: ConsolidationPlanPriority;
  confidence: ConsolidationPlanConfidence;
  affectedObjectIds: string[];
  affectedObjectTypes: Array<"memory_object" | "procedure">;
  rationale: string[];
  projectId?: string;
};

export type ConsolidationPlanAcceptedResult = {
  accepted: true;
  status: "ok";
  outcome: "no_action" | "review_needed";
  inspectedRecordCount: number;
  includeValidatedProcedures: boolean;
  findings: ConsolidationPlanFinding[];
  rationale: string[];
};

export type ConsolidationPlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type ConsolidationPlanResult =
  | ConsolidationPlanAcceptedResult
  | ConsolidationPlanRejectedResult;

export type ConsolidationExecuteSelection = {
  actionType: ConsolidationPlanActionType;
  affectedObjectIds: string[];
};

export type ConsolidationExecuteInput = ConsolidationPlanInput & {
  approvedFindings?: ConsolidationExecuteSelection[];
  reviewerAgentId?: string;
};

export type ConsolidationExecuteActionStatus =
  | "executed"
  | "already_executed"
  | "skipped_ineligible";

export type ConsolidationExecuteAction = {
  actionType: ConsolidationPlanActionType;
  status: ConsolidationExecuteActionStatus;
  affectedObjectIds: string[];
  supersededObjectIds: string[];
  survivorObjectId?: string;
  reviewIds: string[];
  linkIds: string[];
  rationale: string[];
};

export type ConsolidationExecuteAcceptedResult = {
  accepted: true;
  status: "executed" | "no_op" | "already_executed";
  executionMode: "plan_all_eligible" | "approved_subset";
  reviewedFindingCount: number;
  executedActionCount: number;
  alreadyExecutedCount: number;
  skippedFindingCount: number;
  actions: ConsolidationExecuteAction[];
  rationale: string[];
};

export type ConsolidationExecuteRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type ConsolidationExecuteResult =
  | ConsolidationExecuteAcceptedResult
  | ConsolidationExecuteRejectedResult;

export type DriftCheckExecuteSelection = {
  actionType: "drift_check_review";
  affectedObjectIds: string[];
};

export type DriftCheckExecuteInput = ConsolidationPlanInput & {
  approvedFindings?: DriftCheckExecuteSelection[];
  reviewerAgentId?: string;
};

export type DriftCheckExecuteActionStatus = "executed" | "already_executed" | "skipped_ineligible";

export type DriftCheckExecuteAction = {
  actionType: "drift_check_review";
  status: DriftCheckExecuteActionStatus;
  affectedObjectId: string;
  affectedObjectType: "memory_object" | "procedure";
  driftCheckDueAt: string;
  driftCheckedAt?: string;
  eventId?: string;
  rationale: string[];
};

export type DriftCheckExecuteAcceptedResult = {
  accepted: true;
  status: "executed" | "no_op" | "already_executed";
  executionMode: "plan_all_eligible" | "approved_subset";
  reviewedFindingCount: number;
  executedActionCount: number;
  alreadyExecutedCount: number;
  skippedFindingCount: number;
  actions: DriftCheckExecuteAction[];
  rationale: string[];
};

export type DriftCheckExecuteRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type DriftCheckExecuteResult =
  | DriftCheckExecuteAcceptedResult
  | DriftCheckExecuteRejectedResult;

export const MEMORY_PROACTIVE_PLAN_ACTIONS = [
  "follow_up_candidate_review",
  "follow_up_procedure_validation",
  "follow_up_skill_candidate_governance",
  "revisit_stale_memory",
  "run_drift_check",
  "review_consolidation_findings",
  "no_action",
] as const;

export type MemoryProactivePlanActionType = (typeof MEMORY_PROACTIVE_PLAN_ACTIONS)[number];

export const MEMORY_PROACTIVE_PLAN_PRIORITIES = ["high", "medium", "low", "none"] as const;

export type MemoryProactivePlanPriority = (typeof MEMORY_PROACTIVE_PLAN_PRIORITIES)[number];

export const MEMORY_PROACTIVE_PLAN_ACTION_CLASSES = [
  "candidate_review_follow_up",
  "procedure_validation_follow_up",
  "skill_candidate_governance_follow_up",
  "memory_hygiene_follow_up",
  "drift_check_follow_up",
  "consolidation_review_follow_up",
  "none",
] as const;

export type MemoryProactivePlanActionClass = (typeof MEMORY_PROACTIVE_PLAN_ACTION_CLASSES)[number];

export const MEMORY_PROACTIVE_PLAN_APPROVAL_CLASSES = [
  "conversational_review",
  "manual_review",
  "explicit_write_invocation",
  "none",
] as const;

export type MemoryProactivePlanApprovalClass =
  (typeof MEMORY_PROACTIVE_PLAN_APPROVAL_CLASSES)[number];

export type MemoryProactivePlanInput = {
  projectId?: string;
  maxActions?: number;
};

export type MemoryProactivePlanAction = {
  actionType: MemoryProactivePlanActionType;
  priority: MemoryProactivePlanPriority;
  actionClass: MemoryProactivePlanActionClass;
  requiredApprovalClass: MemoryProactivePlanApprovalClass;
  affectedIds: string[];
  rationale: string[];
  advisoryOnly: true;
  advisoryNote: string;
};

export type MemoryProactivePlanAcceptedResult = {
  accepted: true;
  status: "ok";
  outcome: "actions_available" | "no_action";
  projectId?: string;
  advisoryOnly: true;
  advisoryNote: string;
  actions: MemoryProactivePlanAction[];
  inspectedState: {
    pendingCandidateReviewCount: number;
    eligibleProcedureValidationCount: number;
    candidateSkillGovernanceCount: number;
    staleMemoryCount: number;
    driftCheckCount: number;
    consolidationReviewCount: number;
  };
  rationale: string[];
};

export type MemoryProactivePlanRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type MemoryProactivePlanResult =
  | MemoryProactivePlanAcceptedResult
  | MemoryProactivePlanRejectedResult;

export type MemoryProactiveExecuteInput = {
  actionType: MemoryProactivePlanActionType;
  projectId?: string;
  maxActions?: number;
  affectedIds?: string[];
  reviewerAgentId?: string;
  includeValidatedProcedures?: boolean;
};

export type MemoryProactiveExecuteAcceptedResult = {
  accepted: true;
  status: "executed" | "already_executed" | "no_op" | "blocked";
  actionType: MemoryProactivePlanActionType;
  executionSource: "explicit_selection" | "derived_plan";
  affectedIds: string[];
  rationale: string[];
  driftCheckExecution?: Extract<DriftCheckExecuteResult, { accepted: true }>;
};

export type MemoryProactiveExecuteRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  actionType: MemoryProactivePlanActionType;
  reason: string;
};

export type MemoryProactiveExecuteResult =
  | MemoryProactiveExecuteAcceptedResult
  | MemoryProactiveExecuteRejectedResult;

export const MEMORY_BACKGROUND_JOB_CLASSES = [
  "proactive_plan",
  "proactive_execute_run_drift_check",
  "consolidation_plan",
  "consolidation_execute",
] as const;

export type MemoryBackgroundJobClass = (typeof MEMORY_BACKGROUND_JOB_CLASSES)[number];

export type MemoryBackgroundJobEnqueueInput = {
  jobClass: MemoryBackgroundJobClass;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  runAfter?: string;
  maxAttempts?: number;
  maxActions?: number;
  limit?: number;
  maxFindings?: number;
  affectedIds?: string[];
  approvedFindings?: ConsolidationExecuteSelection[];
  reviewerAgentId?: string;
  includeValidatedProcedures?: boolean;
};

export type MemoryBackgroundJobEnqueueAcceptedResult = {
  accepted: true;
  status: "queued" | "already_queued";
  jobId: string;
  jobClass: MemoryBackgroundJobClass;
  jobKind: "maintenance";
  runAfter: string;
  payloadFingerprint: string;
};

export type MemoryBackgroundJobEnqueueRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "blocked";
  jobClass: MemoryBackgroundJobClass;
  reason: string;
};

export type MemoryBackgroundJobEnqueueResult =
  | MemoryBackgroundJobEnqueueAcceptedResult
  | MemoryBackgroundJobEnqueueRejectedResult;

export type MemoryBackgroundJobRunNextInput = {
  projectId?: string;
  runnerId?: string;
  allowedJobClasses?: MemoryBackgroundJobClass[];
};

export const MEMORY_BACKGROUND_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type MemoryBackgroundJobStatus = (typeof MEMORY_BACKGROUND_JOB_STATUSES)[number];

export type MemoryBackgroundJobRecord = {
  jobId: string;
  jobClass: MemoryBackgroundJobClass;
  jobKind: "maintenance";
  status: MemoryBackgroundJobStatus;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  runAfter: string;
  attempts: number;
  maxAttempts: number;
  payloadFingerprint: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  metadata?: Record<string, unknown>;
  maxActions?: number;
  limit?: number;
  maxFindings?: number;
  affectedIds?: string[];
  approvedFindings?: ConsolidationExecuteSelection[];
  reviewerAgentId?: string;
  includeValidatedProcedures?: boolean;
};

export type MemoryBackgroundJobListInput = {
  projectId?: string;
  status?: MemoryBackgroundJobStatus;
  jobClass?: MemoryBackgroundJobClass;
  limit?: number;
};

export type MemoryBackgroundJobGetInput = {
  jobId: string;
};

export type MemoryBackgroundJobListAcceptedResult = {
  accepted: true;
  status: "ok";
  jobs: MemoryBackgroundJobRecord[];
};

export type MemoryBackgroundJobGetAcceptedResult = {
  accepted: true;
  status: "ok";
  job: MemoryBackgroundJobRecord;
};

export type MemoryBackgroundJobInspectionRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type MemoryBackgroundJobClaimedRecord = {
  jobId: string;
  jobClass: MemoryBackgroundJobClass;
  jobKind: "maintenance";
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  payloadFingerprint: string;
  maxActions?: number;
  limit?: number;
  maxFindings?: number;
  affectedIds?: string[];
  approvedFindings?: ConsolidationExecuteSelection[];
  reviewerAgentId?: string;
  includeValidatedProcedures?: boolean;
};

export type MemoryBackgroundJobFinalizeInput = {
  jobId: string;
  status: "succeeded" | "failed";
  lastError?: string;
  executionMetadata: Record<string, unknown>;
};

export type MemoryBackgroundJobRunNextAcceptedResult = {
  accepted: true;
  status: "executed" | "no_job" | "blocked";
  jobId?: string;
  jobClass?: MemoryBackgroundJobClass;
  jobStatus?: "succeeded" | "failed";
  rationale: string[];
  proactivePlanResult?: MemoryProactivePlanResult;
  proactiveExecuteResult?: MemoryProactiveExecuteResult;
  consolidationPlanResult?: ConsolidationPlanResult;
  consolidationExecuteResult?: ConsolidationExecuteResult;
};

export type MemoryBackgroundJobRunNextRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed";
  reason: string;
};

export type MemoryBackgroundJobRunNextResult =
  | MemoryBackgroundJobRunNextAcceptedResult
  | MemoryBackgroundJobRunNextRejectedResult;

export type MemoryBackgroundJobListResult =
  | MemoryBackgroundJobListAcceptedResult
  | MemoryBackgroundJobInspectionRejectedResult;

export type MemoryBackgroundJobGetResult =
  | MemoryBackgroundJobGetAcceptedResult
  | MemoryBackgroundJobInspectionRejectedResult;

export type MemoryMiddlewareQueryLayer = {
  healthcheck(): Promise<{
    driver: "postgres";
    configured: boolean;
    schema: string;
  }>;
  submitCandidate(input: CandidateSubmissionInput): Promise<CandidateSubmissionResult>;
  listCandidates(input: CandidateListInput): Promise<CandidateListResult>;
  getCandidate(input: CandidateGetInput): Promise<CandidateGetResult>;
  reviewCandidate(input: CandidateReviewInput): Promise<CandidateReviewResult>;
  planCandidatePromotion(input: CandidatePromotionPlanInput): Promise<CandidatePromotionPlanResult>;
  promoteCandidateToMemory(
    input: CandidateMemoryPromotionInput,
  ): Promise<CandidateMemoryPromotionResult>;
  promoteCandidateToProcedureDraft(
    input: CandidateProcedurePromotionInput,
  ): Promise<CandidateProcedurePromotionResult>;
  planProcedureValidation(
    input: ProcedureValidationPlanInput,
  ): Promise<ProcedureValidationPlanResult>;
  validateProcedure(input: ProcedureValidationInput): Promise<ProcedureValidationResult>;
  planSkillCandidate(input: SkillCandidatePlanInput): Promise<SkillCandidatePlanResult>;
  createSkillCandidate(input: SkillCandidateCreateInput): Promise<SkillCandidateCreateResult>;
  planSkillCandidateProcurement(
    input: SkillCandidateProcurementPlanInput,
  ): Promise<SkillCandidateProcurementPlanResult>;
  createSkillCandidateProcurementRecord(
    input: SkillCandidateProcurementRecordInput,
  ): Promise<SkillCandidateProcurementRecordResult>;
  planSkillCandidateSkillVetterHandoff(
    input: SkillCandidateSkillVetterHandoffInput,
  ): Promise<SkillCandidateSkillVetterHandoffResult>;
  createSkillCandidateVettingResult(
    input: SkillCandidateVettingResultInput,
  ): Promise<SkillCandidateVettingResultRecordResult>;
  planSkillCandidateApproval(
    input: SkillCandidateApprovalPlanInput,
  ): Promise<SkillCandidateApprovalPlanResult>;
  approveSkillCandidate(input: SkillCandidateApproveInput): Promise<SkillCandidateApproveResult>;
  planSkillCandidateInstallHandoff(
    input: SkillCandidateInstallHandoffInput,
  ): Promise<SkillCandidateInstallHandoffResult>;
  createSkillCandidateInstallRecord(
    input: SkillCandidateInstallRecordInput,
  ): Promise<SkillCandidateInstallRecordResult>;
  persistToolResult(input: ToolResultPersistInput): Promise<ToolResultPersistResult>;
  getToolResult(input: ToolResultGetInput): Promise<ToolResultGetResult>;
  planToolResultMicrocompaction(
    input: ToolResultMicrocompactPlanInput,
  ): Promise<ToolResultMicrocompactPlanResult>;
  executeToolResultMicrocompaction(
    input: ToolResultMicrocompactExecuteInput,
  ): Promise<ToolResultMicrocompactExecuteResult>;
  getSessionMemory(input: SessionMemoryGetInput): Promise<SessionMemoryGetResult>;
  updateSessionMemory(input: SessionMemoryUpdateInput): Promise<SessionMemoryUpdateResult>;
  planCompaction(input: CompactionPlanInput): Promise<CompactionPlanResult>;
  executeSessionMemoryCompaction(
    input: SessionMemoryCompactExecuteInput,
  ): Promise<SessionMemoryCompactExecuteResult>;
  executeFullCompactionFallback(
    input: FullCompactionFallbackExecuteInput,
  ): Promise<FullCompactionFallbackExecuteResult>;
  planConsolidation(input: ConsolidationPlanInput): Promise<ConsolidationPlanResult>;
  executeConsolidation(input: ConsolidationExecuteInput): Promise<ConsolidationExecuteResult>;
  executeDriftCheck(input: DriftCheckExecuteInput): Promise<DriftCheckExecuteResult>;
  planProactivity(input: MemoryProactivePlanInput): Promise<MemoryProactivePlanResult>;
  enqueueBackgroundJob(
    input: MemoryBackgroundJobEnqueueInput,
  ): Promise<MemoryBackgroundJobEnqueueResult>;
  listBackgroundJobs(input: MemoryBackgroundJobListInput): Promise<MemoryBackgroundJobListResult>;
  getBackgroundJob(input: MemoryBackgroundJobGetInput): Promise<MemoryBackgroundJobGetResult>;
  claimNextBackgroundJob(
    input: MemoryBackgroundJobRunNextInput,
  ): Promise<MemoryBackgroundJobClaimedRecord | undefined>;
  finalizeBackgroundJob(input: MemoryBackgroundJobFinalizeInput): Promise<void>;
  getMemoryObject(input: MemoryObjectGetInput): Promise<MemoryObjectGetResult>;
  listMemoryObjects(input: MemoryObjectListInput): Promise<MemoryObjectListResult>;
  searchMemoryObjectsBasic(
    input: MemoryObjectSearchBasicInput,
  ): Promise<MemoryObjectSearchBasicResult>;
  searchMemoryObjectsHybrid(
    input: MemoryObjectSearchHybridInput,
  ): Promise<MemoryObjectSearchHybridResult>;
  searchMemoryObjectsSemantic(
    input: MemoryObjectSearchSemanticInput,
  ): Promise<MemoryObjectSearchSemanticResult>;
};

export type MemoryMiddlewareDb = {
  driver: "postgres";
  config: MemoryMiddlewareDbConfig;
  queries: MemoryMiddlewareQueryLayer;
};

export function createMemoryMiddlewareDb(params: {
  config: MemoryMiddlewareDbConfig;
  logger: PluginLogger;
}): MemoryMiddlewareDb {
  const queries = createMemoryMiddlewareQueryLayer(params);

  return {
    driver: params.config.driver,
    config: params.config,
    queries,
  };
}
