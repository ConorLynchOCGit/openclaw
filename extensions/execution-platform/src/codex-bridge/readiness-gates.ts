import {
  FUTURE_SUBAGENT_ROLE_CONTRACTS,
  MODEL_LANE_POLICIES,
  REQUIRED_LIVE_EXECUTION_SKILL_DOCS,
  listFutureSubagentRoleContracts,
  validateAlternativeModelCandidateForRole,
} from "./roles.ts";
import type {
  AlternativeModelCandidate,
  FutureSubagentRoleContract,
  ModelLanePolicy,
} from "./types.ts";

export const SLICE_8B_LIVE_EXECUTION_ENABLED = false;

export const REQUIRED_READINESS_GATE_IDS = [
  "role_docs_present",
  "required_skill_docs_present",
  "supervisor_protocol_accepted",
  "trust_handoff_accepted",
  "work_queue_oversight_semantics_accepted",
  "validation_policy_accepted",
  "rebuild_recovery_policy_accepted",
  "stream_artifact_capture_policy_accepted",
  "model_lane_policy_accepted",
  "alternative_model_qualification_policy_accepted",
] as const;

export type ReadinessGateId = (typeof REQUIRED_READINESS_GATE_IDS)[number];

export const ROLE_DOC_REQUIREMENT_IDS = [
  "orchestrator",
  "architect_spec_writer",
  "implementation_engineer",
  "test_engineer",
  "reviewer",
  "refactor_engineer",
  "rebuild_bailout_engineer",
  "observability_scribe",
  "docs_skills_writer",
  "guardrail_auditor",
] as const;

export type RoleDocRequirementId = (typeof ROLE_DOC_REQUIREMENT_IDS)[number];

export type ReadinessEvidence = {
  gateId: ReadinessGateId;
  accepted: boolean;
  evidenceRef: string;
  acceptedBy: string;
  acceptedAt: string;
  details: Record<string, unknown>;
};

export type ReadinessGateRequirement = {
  gateId: ReadinessGateId;
  title: string;
  requiredEvidenceFields: string[];
  blocksLiveExecution: true;
};

export type RoleDocRequirement = {
  roleId: RoleDocRequirementId;
  docPath: string;
  requiredSections: string[];
  roleContract: FutureSubagentRoleContract;
};

export type SkillDocRequirement = {
  skillDocId: (typeof REQUIRED_LIVE_EXECUTION_SKILL_DOCS)[number];
  docPath: string;
  requiredSections: string[];
};

export type ReadinessReport = {
  readyForLiveExecution: false;
  liveExecutionEnabled: false;
  allRequiredGateEvidencePresent: boolean;
  missingGates: ReadinessGateId[];
  missingRoleDocs: RoleDocRequirementId[];
  missingSkillDocs: Array<(typeof REQUIRED_LIVE_EXECUTION_SKILL_DOCS)[number]>;
  gateResults: Array<{
    gateId: ReadinessGateId;
    present: boolean;
    accepted: boolean;
    missingEvidenceFields: string[];
  }>;
  reason: string;
};

export type SupervisorProtocolEvidence = {
  restartResumeHandshake: boolean;
  idempotentEventReplay: boolean;
  heartbeat: boolean;
  streamEventDelivery: boolean;
  artifactPointers: boolean;
  cancellation: boolean;
  pauseRedirect: boolean;
  rebuildSemantics: boolean;
  autobailoutHandoff: boolean;
  failureTaxonomy: boolean;
  liveDaemonImplemented: false;
};

export type TrustHandoffEvidence = {
  explicitUserAcceptance: boolean;
  repoScope: string[];
  commandShellBoundaries: boolean;
  rebuildBoundaries: boolean;
  bailoutBoundaries: boolean;
  maxAttemptsAndStopConditions: boolean;
  auditArtifactsRequired: boolean;
  rollbackPath: boolean;
  livePermissionGrant: false;
};

export type WorkQueueOversightEvidence = {
  finalizedPromptsBecomeCandidates: boolean;
  streamAttachesToItemRunStep: boolean;
  runningRequiresRuntimeEvidence: boolean;
  completedRequiresRuntimeEvidence: boolean;
  executorCompletedDistinctFromValidationPassed: boolean;
  completedWorkArtifactPlacement: boolean;
  noFakeDisabledExecutionUi: boolean;
  pauseRedirectCancelServerBackedFutureOnly: boolean;
  attemptedFakeRunningOrCompleted?: boolean;
};

export type AlternativeModelQualificationPlan = {
  frontierGptRequiredForOrchestrationAndStrongCoding: boolean;
  cheaperCandidatesShadowOnly: boolean;
  candidateFamilies: Array<"DeepSeek" | "Qwen" | "MiniMax" | "OpenRouter-hosted candidates">;
  roleSpecificQualificationMatrix: boolean;
  manufacturedSoakFloodFixtureStrategy: {
    minimumFixtureCount: number;
    includesAdversarialFixtures: boolean;
    includesHistoricalOpenClawTasks: boolean;
  };
  frontierBaselineComparison: boolean;
  qualitativeRubric: string[];
  structuralRubric: string[];
  immediateDisqualificationRules: string[];
  promotionReviewGate: boolean;
  demotionRollbackCriteria: boolean;
  liveProviderCallsMade: false;
  livePromotionGranted: false;
};

const REQUIRED_DOC_SECTIONS = [
  "purpose",
  "authority level",
  "allowed actions",
  "prohibited actions",
  "required inputs",
  "required outputs",
  "required skills",
  "validation duties",
  "escalation triggers",
  "model lane",
  "handoff contract",
  "artifact contract",
  "failure behavior",
  "examples of good output",
  "examples of unacceptable output",
  "live-readiness checklist",
] as const;

const REQUIRED_SKILL_SECTIONS = [
  "trigger conditions",
  "required context to read",
  "required actions",
  "prohibited actions",
  "expected artifacts",
  "validation checklist",
  "escalation criteria",
  "examples",
  "live activation risk",
] as const;

const GATE_REQUIREMENTS: ReadinessGateRequirement[] = [
  gate("role_docs_present", "Role documentation present", ["roleDocs"]),
  gate("required_skill_docs_present", "Required skill/doc drafts present", ["skillDocs"]),
  gate("supervisor_protocol_accepted", "Execution supervisor protocol accepted", [
    "restartResumeHandshake",
    "idempotentEventReplay",
    "heartbeat",
    "streamEventDelivery",
    "artifactPointers",
    "cancellation",
    "pauseRedirect",
    "rebuildSemantics",
    "autobailoutHandoff",
    "failureTaxonomy",
    "liveDaemonImplemented",
  ]),
  gate("trust_handoff_accepted", "Trust handoff policy accepted", [
    "explicitUserAcceptance",
    "repoScope",
    "commandShellBoundaries",
    "rebuildBoundaries",
    "bailoutBoundaries",
    "maxAttemptsAndStopConditions",
    "auditArtifactsRequired",
    "rollbackPath",
    "livePermissionGrant",
  ]),
  gate("work_queue_oversight_semantics_accepted", "Work Queue oversight semantics accepted", [
    "finalizedPromptsBecomeCandidates",
    "streamAttachesToItemRunStep",
    "runningRequiresRuntimeEvidence",
    "completedRequiresRuntimeEvidence",
    "executorCompletedDistinctFromValidationPassed",
    "completedWorkArtifactPlacement",
    "noFakeDisabledExecutionUi",
    "pauseRedirectCancelServerBackedFutureOnly",
  ]),
  gate("validation_policy_accepted", "Validation policy accepted", ["validationCommands"]),
  gate("rebuild_recovery_policy_accepted", "Rebuild recovery policy accepted", [
    "restartRecovery",
    "failureBailout",
  ]),
  gate("stream_artifact_capture_policy_accepted", "Stream/artifact capture policy accepted", [
    "boundedStreams",
    "redaction",
    "artifactPointers",
  ]),
  gate("model_lane_policy_accepted", "Model lane policy accepted", ["modelLanes"]),
  gate("alternative_model_qualification_policy_accepted", "Alternative model policy accepted", [
    "soakFlood",
    "frontierBaseline",
    "promotionGate",
  ]),
];

function gate(
  gateId: ReadinessGateId,
  title: string,
  requiredEvidenceFields: string[],
): ReadinessGateRequirement {
  return {
    gateId,
    title,
    requiredEvidenceFields,
    blocksLiveExecution: true,
  };
}

export function listRequiredReadinessGates(): ReadinessGateRequirement[] {
  return GATE_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    requiredEvidenceFields: [...requirement.requiredEvidenceFields],
  }));
}

export function listRoleDocRequirements(): RoleDocRequirement[] {
  return listFutureSubagentRoleContracts().map((roleContract) => ({
    roleId: roleContract.roleId as RoleDocRequirementId,
    docPath: `/root/.openclaw/workspace/docs/projects/execution-platform/roles/${roleContract.roleId}.md`,
    requiredSections: [...REQUIRED_DOC_SECTIONS],
    roleContract,
  }));
}

export function listRequiredSkillDocRequirements(): SkillDocRequirement[] {
  return REQUIRED_LIVE_EXECUTION_SKILL_DOCS.map((skillDocId) => ({
    skillDocId,
    docPath: `/root/.openclaw/workspace/docs/projects/execution-platform/skills/${skillDocId}.md`,
    requiredSections: [...REQUIRED_SKILL_SECTIONS],
  }));
}

export function validateGateEvidenceMetadata(input: {
  evidence: ReadinessEvidence;
  requirement?: ReadinessGateRequirement;
}): { valid: boolean; missingEvidenceFields: string[] } {
  const requirement =
    input.requirement ??
    GATE_REQUIREMENTS.find((candidate) => candidate.gateId === input.evidence.gateId);
  if (!requirement) {
    throw new Error(`unknown readiness gate: ${input.evidence.gateId}`);
  }
  const missingEvidenceFields = requirement.requiredEvidenceFields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(input.evidence.details, field),
  );
  return {
    valid: input.evidence.accepted && missingEvidenceFields.length === 0,
    missingEvidenceFields,
  };
}

export function produceReadinessReport(input: {
  evidence: ReadinessEvidence[];
  presentRoleDocIds: string[];
  presentSkillDocIds: string[];
}): ReadinessReport {
  const roleRequirements = listRoleDocRequirements();
  const skillRequirements = listRequiredSkillDocRequirements();
  const missingRoleDocs = roleRequirements
    .filter((requirement) => !input.presentRoleDocIds.includes(requirement.roleId))
    .map((requirement) => requirement.roleId);
  const missingSkillDocs = skillRequirements
    .filter((requirement) => !input.presentSkillDocIds.includes(requirement.skillDocId))
    .map((requirement) => requirement.skillDocId);
  const gateResults = GATE_REQUIREMENTS.map((requirement) => {
    const evidence = input.evidence.find((candidate) => candidate.gateId === requirement.gateId);
    const validation = evidence
      ? validateGateEvidenceMetadata({ evidence, requirement })
      : { valid: false, missingEvidenceFields: requirement.requiredEvidenceFields };
    return {
      gateId: requirement.gateId,
      present: Boolean(evidence),
      accepted: Boolean(evidence?.accepted && validation.valid),
      missingEvidenceFields: validation.missingEvidenceFields,
    };
  });
  const missingGates = gateResults
    .filter((result) => !result.present || !result.accepted)
    .map((result) => result.gateId);
  const allRequiredGateEvidencePresent =
    missingGates.length === 0 && missingRoleDocs.length === 0 && missingSkillDocs.length === 0;
  return {
    readyForLiveExecution: false,
    liveExecutionEnabled: false,
    allRequiredGateEvidencePresent,
    missingGates,
    missingRoleDocs,
    missingSkillDocs,
    gateResults,
    reason: allRequiredGateEvidencePresent
      ? "all Slice 8B gates are documented, but live execution remains disabled until a later explicit implementation slice"
      : "live execution is blocked by missing or unaccepted readiness gates",
  };
}

export function produceMissingGateReport(report: ReadinessReport) {
  return {
    missingGates: report.missingGates,
    missingRoleDocs: report.missingRoleDocs,
    missingSkillDocs: report.missingSkillDocs,
    liveExecutionEnabled: false as const,
  };
}

export function validateSupervisorProtocolEvidence(evidence: SupervisorProtocolEvidence): {
  valid: boolean;
  missing: string[];
} {
  return requireTrueFields(evidence, [
    "restartResumeHandshake",
    "idempotentEventReplay",
    "heartbeat",
    "streamEventDelivery",
    "artifactPointers",
    "cancellation",
    "pauseRedirect",
    "rebuildSemantics",
    "autobailoutHandoff",
    "failureTaxonomy",
  ]);
}

export function validateTrustHandoffEvidence(evidence: TrustHandoffEvidence): {
  valid: boolean;
  missing: string[];
} {
  const base = requireTrueFields(evidence, [
    "explicitUserAcceptance",
    "commandShellBoundaries",
    "rebuildBoundaries",
    "bailoutBoundaries",
    "maxAttemptsAndStopConditions",
    "auditArtifactsRequired",
    "rollbackPath",
  ]);
  if (evidence.repoScope.length === 0) {
    base.missing.push("repoScope");
  }
  return {
    valid: base.missing.length === 0 && !evidence.livePermissionGrant,
    missing: base.missing,
  };
}

export function validateWorkQueueOversightEvidence(evidence: WorkQueueOversightEvidence): {
  valid: boolean;
  missing: string[];
  rejectsFakeExecutionState: boolean;
} {
  const base = requireTrueFields(evidence, [
    "finalizedPromptsBecomeCandidates",
    "streamAttachesToItemRunStep",
    "runningRequiresRuntimeEvidence",
    "completedRequiresRuntimeEvidence",
    "executorCompletedDistinctFromValidationPassed",
    "completedWorkArtifactPlacement",
    "noFakeDisabledExecutionUi",
    "pauseRedirectCancelServerBackedFutureOnly",
  ]);
  const rejectsFakeExecutionState = evidence.attemptedFakeRunningOrCompleted !== true;
  return {
    valid: base.missing.length === 0 && rejectsFakeExecutionState,
    missing: base.missing,
    rejectsFakeExecutionState,
  };
}

export function validateAlternativeModelQualificationPlan(
  plan: AlternativeModelQualificationPlan,
): { valid: boolean; missing: string[]; liveAuthorityGranted: false } {
  const missing: string[] = [];
  if (!plan.frontierGptRequiredForOrchestrationAndStrongCoding) {
    missing.push("frontierGptRequiredForOrchestrationAndStrongCoding");
  }
  if (!plan.cheaperCandidatesShadowOnly) {
    missing.push("cheaperCandidatesShadowOnly");
  }
  for (const family of ["DeepSeek", "Qwen", "MiniMax", "OpenRouter-hosted candidates"] as const) {
    if (!plan.candidateFamilies.includes(family)) {
      missing.push(`candidateFamily:${family}`);
    }
  }
  if (!plan.roleSpecificQualificationMatrix) {
    missing.push("roleSpecificQualificationMatrix");
  }
  if (plan.manufacturedSoakFloodFixtureStrategy.minimumFixtureCount <= 0) {
    missing.push("manufacturedSoakFloodFixtureStrategy.minimumFixtureCount");
  }
  if (!plan.manufacturedSoakFloodFixtureStrategy.includesAdversarialFixtures) {
    missing.push("manufacturedSoakFloodFixtureStrategy.includesAdversarialFixtures");
  }
  if (!plan.manufacturedSoakFloodFixtureStrategy.includesHistoricalOpenClawTasks) {
    missing.push("manufacturedSoakFloodFixtureStrategy.includesHistoricalOpenClawTasks");
  }
  if (!plan.frontierBaselineComparison) {
    missing.push("frontierBaselineComparison");
  }
  if (plan.qualitativeRubric.length === 0) {
    missing.push("qualitativeRubric");
  }
  if (plan.structuralRubric.length === 0) {
    missing.push("structuralRubric");
  }
  if (plan.immediateDisqualificationRules.length === 0) {
    missing.push("immediateDisqualificationRules");
  }
  if (!plan.promotionReviewGate) {
    missing.push("promotionReviewGate");
  }
  if (!plan.demotionRollbackCriteria) {
    missing.push("demotionRollbackCriteria");
  }
  if (plan.liveProviderCallsMade) {
    missing.push("liveProviderCallsMade:false");
  }
  if (plan.livePromotionGranted) {
    missing.push("livePromotionGranted:false");
  }
  return {
    valid: missing.length === 0,
    missing,
    liveAuthorityGranted: false,
  };
}

export function validateCandidateAuthorityForSlice8B(candidate: AlternativeModelCandidate): {
  shadowOrSoakOnly: boolean;
  liveAuthorityGranted: false;
  reasons: string[];
} {
  const eligibility = validateAlternativeModelCandidateForRole(candidate);
  return {
    shadowOrSoakOnly: eligibility.mode !== "promoted_for_role",
    liveAuthorityGranted: false,
    reasons: candidate.promotedForRole
      ? ["role_specific_promotion_evidence_is_metadata_only_in_slice_8b"]
      : eligibility.reasons,
  };
}

export function listReadinessModelLanePolicies(): ModelLanePolicy[] {
  return MODEL_LANE_POLICIES.map((policy) => ({
    ...policy,
    allowedFamilies: [...policy.allowedFamilies],
    liveAuthorityAllowed: false,
  }));
}

export function listReadinessRoleContracts(): FutureSubagentRoleContract[] {
  return FUTURE_SUBAGENT_ROLE_CONTRACTS.map((contract) => ({
    ...contract,
    liveAuthorityGranted: false,
    inputs: [...contract.inputs],
    outputs: [...contract.outputs],
    requiredSkills: [...contract.requiredSkills],
    validationDuties: [...contract.validationDuties],
    escalationTriggers: [...contract.escalationTriggers],
    prohibitedActions: [...contract.prohibitedActions],
  }));
}

function requireTrueFields<T extends Record<string, unknown>>(
  evidence: T,
  fields: Array<keyof T & string>,
): { valid: boolean; missing: string[] } {
  const missing = fields.filter((field) => evidence[field] !== true);
  return {
    valid: missing.length === 0,
    missing,
  };
}
