import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";

export const SINGLE_JOB_CODING_TEAM_QUALITY_GATE_ID =
  "single_job_coding_team_end_to_end_quality_proof" as const;

export type AgentTeamRoleExecutionTransportKind =
  | "live_model"
  | "codex_app_server"
  | "codex_parity_runtime_adapter"
  | "acp_codex"
  | "injected"
  | "fixture";

export type AgentTeamRoleExecutionEvidence = {
  roleId: AgentTeamRoleId;
  agentId: string;
  modelRef: string;
  providerPath: string;
  transportKind: AgentTeamRoleExecutionTransportKind;
  modelRunRef: string;
  responseHash: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  assignedTaskSummary: string;
  producedArtifactRefs: string[];
  inlineRoleReportRef?: string;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type AgentTeamRoleCloseoutQualityReport = {
  roleId: string;
  modelRef: string | null;
  modelRunRef: string | null;
  actuallyDid: string | null;
  whatIActuallyDid: string | null;
  evidenceRefs: string[];
  filesOrArtifactsTouched: string[];
  validationIPerformed: string | null;
  confidence: string | null;
  limitations: string[];
  source: string | null;
};

export type SingleJobCodingTeamQualityProofEvaluation = {
  artifactKind: "single_job_coding_team_quality_proof_evaluation";
  accepted: boolean;
  reasonCodes: string[];
  requiredRoles: AgentTeamRoleId[];
  completedRoleCount: number;
  roleExecutionCount: number;
  roleCloseoutCount: number;
  v4ProScopedRolesCompleted: boolean;
  implementationBridgeCompleted: boolean;
  changedFileCount: number;
  validationRefCount: number;
  reviewAccepted: boolean;
  securityAccepted: boolean;
  targetScopeRequiresSkillifierRuntimeEvidence: boolean;
  skillifierRuntimeEvidencePresent: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

const REQUIRED_SINGLE_JOB_QUALITY_ROLES: AgentTeamRoleId[] = [
  "orchestrator",
  "context_scout",
  "implementation_engineer",
  "test_engineer",
  "security_privacy_reviewer",
  "reviewer",
  "docs_skills_writer",
  "observability_scribe",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isValidationLikeRef(value: string): boolean {
  return value.startsWith("validation://") || /^pnpm test:file\b/u.test(value);
}

function validationLikeRefs(value: unknown): string[] {
  return stringArray(value).filter((item) => isValidationLikeRef(item.trim()));
}

function nestedValidationRefs(value: unknown): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => nestedValidationRefs(item));
  }
  if (!isRecord(value)) {
    return [];
  }
  return [
    stringValue(value.validationRef),
    stringValue(value.command),
    stringValue(value.ref),
  ].filter((item): item is string => Boolean(item));
}

function boundedIncludesSkillifier(value: string | null): boolean {
  return value?.toLowerCase().includes("skillifier") ?? false;
}

function refsIncludeSkillifier(refs: string[]): boolean {
  return refs.some((ref) => boundedIncludesSkillifier(ref));
}

function skillifierObjectiveScopeRequired(objectiveSummary: string | null | undefined): boolean {
  const objective = stringValue(objectiveSummary);
  if (!objective) {
    return false;
  }
  const scope = resolveCodingTeamObjectiveScope({
    objectiveForModel: objective,
    objectiveForEvidence: objective,
    fallbackRepoScopePaths: [],
    fallbackValidationCommands: [],
  });
  return (
    scope.targetActiveQueueId === "openclaw-convergence.active-queue-08" ||
    (scope.ownerSystemArea === "model-memory" && boundedIncludesSkillifier(scope.targetTitle))
  );
}

function hasBoundedSkillifierRuntimeEvidence(input: {
  runtimeResult?: unknown;
  closeoutCapsule?: unknown;
  artifactRefs?: string[] | null;
  validationRefs?: string[] | null;
}): boolean {
  const artifactRefs = [...(input.artifactRefs ?? []), ...(input.validationRefs ?? [])];
  if (refsIncludeSkillifier(artifactRefs)) {
    return true;
  }
  const records = [
    isRecord(input.runtimeResult) ? input.runtimeResult : null,
    isRecord(input.closeoutCapsule) ? input.closeoutCapsule : null,
  ].filter((value): value is Record<string, unknown> => value !== null);
  for (const record of records) {
    const skillifierRecord = isRecord(record.skillifier) ? record.skillifier : null;
    const workflow = isRecord(record.workflow) ? record.workflow : null;
    const workflowExtension = isRecord(workflow?.extension) ? workflow.extension : null;
    const workflowExtensionSkillifier = isRecord(workflowExtension?.skillifier)
      ? workflowExtension.skillifier
      : null;
    const factualRefs = isRecord(record.factualRefs) ? record.factualRefs : null;
    const middleware = isRecord(record.middleware) ? record.middleware : null;
    const modelTask = middleware && isRecord(middleware.modelTask) ? middleware.modelTask : null;
    const candidateId =
      stringValue(record.candidateId) ??
      stringValue(skillifierRecord?.candidateId) ??
      stringValue(workflowExtensionSkillifier?.candidateId);
    const candidateTyped =
      stringValue(record.candidateType) ??
      stringValue(skillifierRecord?.candidateType) ??
      stringValue(skillifierRecord?.targetSkillRef) ??
      stringValue(skillifierRecord?.targetSkillPath) ??
      stringValue(skillifierRecord?.opportunitySeedRef) ??
      stringValue(workflowExtensionSkillifier?.candidateType) ??
      stringValue(workflowExtensionSkillifier?.targetSkillRef) ??
      stringValue(workflowExtensionSkillifier?.targetSkillPath) ??
      stringValue(workflowExtensionSkillifier?.opportunitySeedRef);
    if (candidateId && candidateTyped) {
      return true;
    }
    const directSignals = [
      stringValue(record.workflowId),
      stringValue(record.jobType),
      stringValue(record.contractId),
      stringValue(record.modelTaskContractId),
      stringValue(skillifierRecord?.workflowId),
      stringValue(skillifierRecord?.jobType),
      stringValue(skillifierRecord?.targetSkillRef),
      stringValue(skillifierRecord?.targetSkillPath),
      stringValue(skillifierRecord?.opportunitySeedRef),
      stringValue(workflowExtension?.extensionKind),
      stringValue(workflowExtensionSkillifier?.targetSkillRef),
      stringValue(workflowExtensionSkillifier?.targetSkillPath),
      stringValue(workflowExtensionSkillifier?.opportunitySeedRef),
      stringValue(factualRefs?.workflowId),
      stringValue(modelTask?.contractId),
    ];
    if (directSignals.some((value) => boundedIncludesSkillifier(value))) {
      return true;
    }
    const nestedRefs = [
      ...stringArray(record.artifactRefs),
      ...stringArray(record.modelTaskRefs),
      ...stringArray(record.dbOperationRefs),
      ...stringArray(record.validationRefs),
      ...stringArray(record.reviewRefs),
      ...stringArray(skillifierRecord?.artifactRefs),
      ...stringArray(skillifierRecord?.modelTaskRefs),
      ...stringArray(skillifierRecord?.dbOperationRefs),
      ...stringArray(skillifierRecord?.validationRefs),
      ...stringArray(skillifierRecord?.reviewRefs),
      ...stringArray(workflowExtensionSkillifier?.artifactRefs),
      ...stringArray(workflowExtensionSkillifier?.modelTaskRefs),
      ...stringArray(workflowExtensionSkillifier?.dbOperationRefs),
      ...stringArray(workflowExtensionSkillifier?.validationRefs),
      ...stringArray(workflowExtensionSkillifier?.reviewRefs),
      ...stringArray(factualRefs?.artifactRefs),
      ...stringArray(factualRefs?.validationRefs),
      ...stringArray(modelTask?.artifactRefs),
    ];
    if (refsIncludeSkillifier(nestedRefs)) {
      return true;
    }
  }
  return false;
}

function roleCloseoutQualityReports(capsule: unknown): AgentTeamRoleCloseoutQualityReport[] {
  const record = isRecord(capsule) ? capsule : {};
  const roleCloseouts = Array.isArray(record.roleCloseouts) ? record.roleCloseouts : [];
  return roleCloseouts.filter(isRecord).map((item) => ({
    roleId: stringValue(item.roleId) ?? "unknown",
    modelRef: stringValue(item.modelRef),
    modelRunRef: stringValue(item.modelRunRef),
    actuallyDid: stringValue(item.actuallyDid),
    whatIActuallyDid: stringValue(item.whatIActuallyDid),
    evidenceRefs: stringArray(item.evidenceRefs),
    filesOrArtifactsTouched: stringArray(item.filesOrArtifactsTouched),
    validationIPerformed: stringValue(item.validationIPerformed),
    confidence: stringValue(item.confidence),
    limitations: stringArray(item.limitations),
    source: stringValue(item.source),
  }));
}

function hasConcreteRoleCloseout(report: AgentTeamRoleCloseoutQualityReport): boolean {
  const genericFallbackPattern =
    /produced bounded inline role evidence for the single-job quality proof/iu;
  return (
    report.source === "model" &&
    Boolean(report.modelRef) &&
    Boolean(report.modelRunRef) &&
    report.evidenceRefs.length > 0 &&
    report.filesOrArtifactsTouched.length > 0 &&
    Boolean(report.validationIPerformed) &&
    Boolean(report.actuallyDid ?? report.whatIActuallyDid) &&
    !genericFallbackPattern.test(JSON.stringify(report))
  );
}

function looksGenericOrDuplicate(closeouts: AgentTeamRoleCloseoutQualityReport[]): boolean {
  const signatures = closeouts.map((item) =>
    [
      item.modelRunRef ?? "missing-run",
      item.evidenceRefs.join("|") || "missing-evidence",
      item.filesOrArtifactsTouched.join("|") || "missing-files",
      item.validationIPerformed ?? "missing-validation",
    ].join("::"),
  );
  return new Set(signatures).size !== signatures.length;
}

function validRoleExecutionEvidence(evidence: AgentTeamRoleExecutionEvidence | undefined): boolean {
  if (!evidence) {
    return false;
  }
  return (
    evidence.transportKind !== "injected" &&
    evidence.transportKind !== "fixture" &&
    Boolean(evidence.modelRunRef.trim()) &&
    Boolean(evidence.modelRef.trim()) &&
    Boolean(evidence.providerPath.trim()) &&
    Boolean(evidence.responseHash.trim()) &&
    evidence.latencyMs >= 0 &&
    evidence.producedArtifactRefs.length > 0 &&
    Boolean(evidence.inlineRoleReportRef?.trim())
  );
}

function implementationBridgeCompleted(
  evidence: AgentTeamRoleExecutionEvidence | undefined,
): boolean {
  if (!evidence || !validRoleExecutionEvidence(evidence)) {
    return false;
  }
  return (
    evidence.roleId === "implementation_engineer" &&
    (evidence.transportKind === "codex_app_server" ||
      evidence.transportKind === "acp_codex" ||
      evidence.transportKind === "codex_parity_runtime_adapter") &&
    evidence.producedArtifactRefs.some(
      (ref) =>
        ref.includes("/codex-bridge/code-writing-pilot-live/") ||
        ref.includes("/codex-direct-main-repo/"),
    )
  );
}

export function evaluateSingleJobCodingTeamQualityProof(input: {
  roleExecutionEvidence?: AgentTeamRoleExecutionEvidence[] | null;
  closeoutCapsule?: unknown;
  changedFileRefs?: string[] | null;
  validationRefs?: string[] | null;
  reviewAccepted?: boolean | null;
  securityAccepted?: boolean | null;
  requiredRoles?: AgentTeamRoleId[];
  objectiveSummary?: string | null;
  runtimeResult?: unknown;
  artifactRefs?: string[] | null;
}): SingleJobCodingTeamQualityProofEvaluation {
  const requiredRoles = input.requiredRoles ?? REQUIRED_SINGLE_JOB_QUALITY_ROLES;
  const roleEvidence = input.roleExecutionEvidence ?? [];
  const closeoutReports = roleCloseoutQualityReports(input.closeoutCapsule);
  const changedFileRefs = input.changedFileRefs ?? [];
  const validationRefs = input.validationRefs ?? [];
  const reasonCodes: string[] = [];

  const evidenceByRole = new Map(roleEvidence.map((item) => [item.roleId, item]));
  const closeoutByRole = new Map(closeoutReports.map((item) => [item.roleId, item]));

  for (const roleId of requiredRoles) {
    const evidence = evidenceByRole.get(roleId);
    const closeout = closeoutByRole.get(roleId);
    if (!evidence) {
      reasonCodes.push(`role_execution_evidence_missing:${roleId}`);
    } else if (!validRoleExecutionEvidence(evidence)) {
      reasonCodes.push(`role_execution_evidence_invalid:${roleId}`);
    }
    if (!closeout) {
      reasonCodes.push(`role_closeout_missing:${roleId}`);
    } else if (!hasConcreteRoleCloseout(closeout)) {
      reasonCodes.push(`role_closeout_not_concrete:${roleId}`);
    }
    if (evidence && closeout?.modelRunRef && evidence.modelRunRef !== closeout.modelRunRef) {
      reasonCodes.push(`role_closeout_model_run_mismatch:${roleId}`);
    }
  }

  if (looksGenericOrDuplicate(closeoutReports)) {
    reasonCodes.push("role_closeouts_generic_or_duplicate");
  }

  const v4ProScopedRolesCompleted = ["context_scout", "security_privacy_reviewer"].every(
    (roleId) => {
      const evidence = evidenceByRole.get(roleId as AgentTeamRoleId);
      const closeout = closeoutByRole.get(roleId);
      return (
        evidence?.modelRef === "deepseek/deepseek-v4-pro" &&
        validRoleExecutionEvidence(evidence) &&
        closeout?.modelRef === "deepseek/deepseek-v4-pro" &&
        hasConcreteRoleCloseout(closeout)
      );
    },
  );
  if (!v4ProScopedRolesCompleted) {
    reasonCodes.push("v4_pro_scoped_roles_not_completed");
  }

  const implementationEvidence = evidenceByRole.get("implementation_engineer");
  const implementationBridgeReady = implementationBridgeCompleted(implementationEvidence);
  if (!implementationBridgeReady) {
    reasonCodes.push("implementation_codex_file_editing_bridge_evidence_missing");
  }

  if (changedFileRefs.length === 0) {
    reasonCodes.push("implementation_changed_file_refs_missing");
  }
  if (validationRefs.length === 0) {
    reasonCodes.push("validation_refs_missing");
  }
  if (input.reviewAccepted !== true) {
    reasonCodes.push("review_acceptance_missing");
  }
  if (input.securityAccepted !== true) {
    reasonCodes.push("security_privacy_acceptance_missing");
  }

  const targetScopeRequiresSkillifierRuntimeEvidence = skillifierObjectiveScopeRequired(
    input.objectiveSummary,
  );
  const skillifierRuntimeEvidencePresent = hasBoundedSkillifierRuntimeEvidence({
    runtimeResult: input.runtimeResult,
    closeoutCapsule: input.closeoutCapsule,
    artifactRefs: input.artifactRefs,
    validationRefs,
  });
  if (targetScopeRequiresSkillifierRuntimeEvidence && !skillifierRuntimeEvidencePresent) {
    reasonCodes.push("skillifier_runtime_evidence_missing_for_target_scope");
  }

  const completedRoleCount = requiredRoles.filter((roleId) =>
    validRoleExecutionEvidence(evidenceByRole.get(roleId)),
  ).length;

  return {
    artifactKind: "single_job_coding_team_quality_proof_evaluation",
    accepted: reasonCodes.length === 0,
    reasonCodes: reasonCodes.slice(0, 60),
    requiredRoles,
    completedRoleCount,
    roleExecutionCount: roleEvidence.length,
    roleCloseoutCount: closeoutReports.length,
    v4ProScopedRolesCompleted,
    implementationBridgeCompleted: implementationBridgeReady,
    changedFileCount: changedFileRefs.length,
    validationRefCount: validationRefs.length,
    reviewAccepted: input.reviewAccepted === true,
    securityAccepted: input.securityAccepted === true,
    targetScopeRequiresSkillifierRuntimeEvidence,
    skillifierRuntimeEvidencePresent,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function readSingleJobQualityProofPayloadFlag(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }
  return (
    payload.qualityGateId === SINGLE_JOB_CODING_TEAM_QUALITY_GATE_ID ||
    payload.requireSingleJobCodingTeamQualityProof === true
  );
}

export function changedFileRefsFromResult(result: unknown): string[] {
  const record = isRecord(result) ? result : {};
  return [
    ...stringArray(record.changedFileRefs),
    ...stringArray(record.filesChanged),
    ...stringArray(record.filesTouched),
  ].slice(0, 40);
}

export function validationRefsFromResult(result: unknown): string[] {
  const record = isRecord(result) ? result : {};
  const runtimeGraph = isRecord(record.runtimeGraph) ? record.runtimeGraph : {};
  const childActions = Array.isArray(runtimeGraph.childActions) ? runtimeGraph.childActions : [];
  const validationRepairLoops = Array.isArray(runtimeGraph.validationRepairLoops)
    ? runtimeGraph.validationRepairLoops
    : [];
  return [
    ...new Set([
      ...stringArray(record.validationRefs),
      ...stringArray(record.testsRun),
      ...stringArray(record.testRefs),
      ...nestedValidationRefs(record.validationEvidence),
      ...childActions.flatMap((entry) =>
        isRecord(entry) ? validationLikeRefs(entry.evidenceRefs) : [],
      ),
      ...validationRepairLoops.flatMap((entry) =>
        isRecord(entry) ? nestedValidationRefs(entry.validationRef) : [],
      ),
    ]),
  ].slice(0, 40);
}
