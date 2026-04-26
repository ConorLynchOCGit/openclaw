import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import {
  buildPhase2StagedActionApprovalReport,
  type Phase2StagedActionApprovalReport,
  type Phase2StagedActionProposal,
} from "./phase2-staged-action-approval-workflow.ts";

export const PHASE2_CONTROLLED_ACTION_EXECUTION_SCHEMA_VERSION =
  "phase2_controlled_action_execution.v1" as const;
export const PHASE2_CONTROLLED_ACTION_EXECUTION_REPORT_SCHEMA_VERSION =
  "phase2_controlled_action_execution_report.v1" as const;

export type Phase2ControlledActionKind =
  | "write_bounded_proof_artifact"
  | "unsafe_external_command"
  | "unsafe_network_call"
  | "unsafe_db_mutation"
  | "unsafe_user_message";

export type Phase2ControlledActionExecutionDecision =
  | "executed_controlled_harmless_action"
  | "blocked_missing_approval"
  | "blocked_scope"
  | "blocked_no_dark_data"
  | "blocked_provenance"
  | "blocked_rollback"
  | "blocked_unsafe_action_kind";

export type Phase2ControlledActionExecutionScope = {
  sessionKey: string;
  operatorId: string;
  projectId: string;
  purpose: "operator_eval" | "operator_proof";
};

export type Phase2ControlledActionExecutionPolicy = {
  schemaVersion: typeof PHASE2_CONTROLLED_ACTION_EXECUTION_SCHEMA_VERSION;
  policyId: string;
  allowedActionKinds: ["write_bounded_proof_artifact"];
  requireApprovedProposal: true;
  requireExplicitExecutionApproval: true;
  requireApprovedOperatorEvalScope: true;
  requireProvenance: true;
  requireNoDarkDataPass: true;
  actionExecutionScope: "controlled_operator_eval_only";
  artifactWriteScope: ".artifacts/model-memory/phase2-controlled-action-execution-proof";
  userFacingProactiveMessagesAllowed: false;
  externalCommandExecutionAllowed: false;
  networkExecutionAllowed: false;
  databaseMutationAllowed: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ControlledActionExecutionResult = {
  resultId: string;
  actionKind: Phase2ControlledActionKind;
  proposalId: string;
  operatorId: string;
  status: "executed" | "blocked";
  boundedArtifactOnly: boolean;
  resultHash: string;
  reasonCodes: string[];
  sourceRefIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  externalImperativeTextHandling: "evidence_not_instruction";
  userFacingProactiveMessage: false;
  externalCommandExecuted: false;
  networkCallExecuted: false;
  databaseMutationExecuted: false;
};

export type Phase2ControlledActionExecutionAuditEntry = {
  auditId: string;
  proposalId: string;
  approvalReportId: string;
  operatorId: string;
  actionKind: Phase2ControlledActionKind;
  decision: Phase2ControlledActionExecutionDecision;
  resultId?: string;
  evidenceHashes: string[];
  reasonCodes: string[];
  explicitExecutionApproval: boolean;
  actionExecution: boolean;
};

export type Phase2ControlledActionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXECUTION_DISABLED";
  targetMode: "approval_workflow_only";
  disablesControlledActionExecution: true;
};

export type Phase2ControlledActionExecutionTelemetry = {
  schemaVersion: typeof PHASE2_CONTROLLED_ACTION_EXECUTION_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ControlledActionExecutionDecision;
  approvalReportId?: string;
  proposalId?: string;
  actionKind: Phase2ControlledActionKind;
  resultId?: string;
  auditIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  explicitExecutionApproval: boolean;
  userFacingProactiveMessagesSent: false;
  externalCommandExecuted: false;
  networkCallExecuted: false;
  databaseMutationExecuted: false;
  actionExecutionObserved: boolean;
};

export type Phase2ControlledActionExecutionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ControlledActionExecutionReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_ACTION_EXECUTION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ControlledActionExecutionDecision;
  policy: Phase2ControlledActionExecutionPolicy;
  approvalReportId?: string;
  approvedScope: Omit<Phase2ControlledActionExecutionScope, "purpose">;
  requestScope: Phase2ControlledActionExecutionScope;
  actionKind: Phase2ControlledActionKind;
  proposal?: Phase2StagedActionProposal;
  result?: Phase2ControlledActionExecutionResult;
  auditTrail: Phase2ControlledActionExecutionAuditEntry[];
  checks: Phase2ControlledActionExecutionCheck[];
  rollbackPlan: Phase2ControlledActionRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ControlledActionExecutionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    blockedRunId?: string | null;
    approvalRunId?: string | null;
    executionRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2ControlledActionExecutionInput = {
  now?: Date;
  proofMarker?: string;
  approvalReport?: Phase2StagedActionApprovalReport | null;
  approvedScope?: Omit<Phase2ControlledActionExecutionScope, "purpose">;
  requestScope?: Phase2ControlledActionExecutionScope;
  actionKind?: Phase2ControlledActionKind;
  explicitExecutionApproval?: boolean;
  operatorId?: string;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ControlledActionExecutionReport["uiEvidence"];
};

export type Phase2ControlledActionExecutionArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const PROHIBITED_KEYS = new Set([
  "raw_prompt",
  "rawPrompt",
  "promptText",
  "full_transcript",
  "fullTranscript",
  "raw_transcript",
  "rawTranscript",
  "raw_tool_log",
  "rawToolLog",
  "secret",
  "secrets",
  "private_phrase",
  "privatePhrase",
]);

const PROHIBITED_MARKER_PARTS = [
  ["raw", "-", "prompt", "-", "marker"],
  ["raw", "-", "transcript", "-", "marker"],
  ["raw", "-", "tool", "-", "log", "-", "marker"],
  ["secret", "-", "marker"],
  ["private", "-", "phrase", "-", "marker"],
] as const;

function clone<T extends JsonLike>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNoProhibitedKeys(value: unknown, pathParts: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedKeys(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 controlled action execution contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoProhibitedKeys(nested, [...pathParts, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value).toLowerCase();
  for (const parts of PROHIBITED_MARKER_PARTS) {
    if (serialized.includes(parts.join(""))) {
      throw new Error("phase2 controlled action execution contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2ControlledActionExecutionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXECUTION_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function scopeMatches(input: {
  approvedScope: Omit<Phase2ControlledActionExecutionScope, "purpose">;
  requestScope: Phase2ControlledActionExecutionScope;
}): boolean {
  return (
    input.approvedScope.sessionKey === input.requestScope.sessionKey &&
    input.approvedScope.operatorId === input.requestScope.operatorId &&
    input.approvedScope.projectId === input.requestScope.projectId &&
    (input.requestScope.purpose === "operator_eval" ||
      input.requestScope.purpose === "operator_proof")
  );
}

function hasProvenance(
  proposal: Phase2StagedActionProposal | undefined,
): proposal is Phase2StagedActionProposal {
  return Boolean(
    proposal &&
    proposal.sourceRefIds.length > 0 &&
    proposal.sourceProfileIds.length > 0 &&
    proposal.authorityTiers.length > 0 &&
    (proposal.contentHashes.length > 0 || proposal.proofHashes.length > 0),
  );
}

function buildPolicy(generatedAt: string): Phase2ControlledActionExecutionPolicy {
  return {
    schemaVersion: PHASE2_CONTROLLED_ACTION_EXECUTION_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_action_execution_policy",
      targetId: "planner",
      seed: generatedAt,
    }),
    allowedActionKinds: ["write_bounded_proof_artifact"],
    requireApprovedProposal: true,
    requireExplicitExecutionApproval: true,
    requireApprovedOperatorEvalScope: true,
    requireProvenance: true,
    requireNoDarkDataPass: true,
    actionExecutionScope: "controlled_operator_eval_only",
    artifactWriteScope: ".artifacts/model-memory/phase2-controlled-action-execution-proof",
    userFacingProactiveMessagesAllowed: false,
    externalCommandExecutionAllowed: false,
    networkExecutionAllowed: false,
    databaseMutationAllowed: false,
    externalTextHandling: "evidence_not_instruction",
  };
}

function decisionFromChecks(input: {
  killed: boolean;
  scopeOk: boolean;
  actionKind: Phase2ControlledActionKind;
  approvalReport: Phase2StagedActionApprovalReport | undefined;
  proposal: Phase2StagedActionProposal | undefined;
  explicitExecutionApproval: boolean;
  provenanceOk: boolean;
}): Phase2ControlledActionExecutionDecision {
  if (input.killed) {
    return "blocked_rollback";
  }
  if (!input.scopeOk) {
    return "blocked_scope";
  }
  if (input.actionKind !== "write_bounded_proof_artifact") {
    return "blocked_unsafe_action_kind";
  }
  if (input.approvalReport && input.approvalReport.noDarkDataStatus !== "pass") {
    return "blocked_no_dark_data";
  }
  if (
    input.approvalReport?.decision !== "approval_workflow_observed" ||
    !input.proposal ||
    !input.explicitExecutionApproval ||
    !input.proposal.approved
  ) {
    return "blocked_missing_approval";
  }
  if (!input.provenanceOk) {
    return "blocked_provenance";
  }
  return "executed_controlled_harmless_action";
}

function buildResult(input: {
  generatedAt: string;
  actionKind: Phase2ControlledActionKind;
  proposal: Phase2StagedActionProposal;
  decision: Phase2ControlledActionExecutionDecision;
}): Phase2ControlledActionExecutionResult {
  const resultId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_action_execution_result",
    targetId: input.proposal.proposalId,
    seed: { generatedAt: input.generatedAt, actionKind: input.actionKind },
  });
  const executed = input.decision === "executed_controlled_harmless_action";
  const reasonCodes = uniqueSortedStrings([
    ...input.proposal.reasonCodes,
    executed ? "controlled_harmless_action_executed" : input.decision,
    "bounded_proof_artifact_only",
  ]);
  const resultHash = sha256JsonValue({
    actionKind: input.actionKind,
    proposalId: input.proposal.proposalId,
    contentHashes: input.proposal.contentHashes,
    proofHashes: input.proposal.proofHashes,
    status: executed ? "executed" : "blocked",
  });
  return {
    resultId,
    actionKind: input.actionKind,
    proposalId: input.proposal.proposalId,
    operatorId: input.proposal.operatorId,
    status: executed ? "executed" : "blocked",
    boundedArtifactOnly: true,
    resultHash,
    reasonCodes,
    sourceRefIds: [...input.proposal.sourceRefIds],
    sourceProfileIds: [...input.proposal.sourceProfileIds],
    authorityTiers: [...input.proposal.authorityTiers],
    contentHashes: [...input.proposal.contentHashes],
    proofHashes: [...input.proposal.proofHashes],
    externalImperativeTextHandling: "evidence_not_instruction",
    userFacingProactiveMessage: false,
    externalCommandExecuted: false,
    networkCallExecuted: false,
    databaseMutationExecuted: false,
  };
}

function audit(input: {
  generatedAt: string;
  approvalReportId: string;
  proposal: Phase2StagedActionProposal | undefined;
  actionKind: Phase2ControlledActionKind;
  decision: Phase2ControlledActionExecutionDecision;
  result: Phase2ControlledActionExecutionResult | undefined;
  explicitExecutionApproval: boolean;
  operatorId: string;
}): Phase2ControlledActionExecutionAuditEntry {
  const proposalId = input.proposal?.proposalId ?? "missing-proposal";
  return {
    auditId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_action_execution_audit_entry",
      targetId: proposalId,
      seed: { generatedAt: input.generatedAt, decision: input.decision },
    }),
    proposalId,
    approvalReportId: input.approvalReportId,
    operatorId: input.proposal?.operatorId ?? input.operatorId,
    actionKind: input.actionKind,
    decision: input.decision,
    resultId: input.result?.resultId,
    evidenceHashes: uniqueSortedStrings(
      (input.proposal?.contentHashes ?? []).concat(input.proposal?.proofHashes ?? []),
    ),
    reasonCodes: input.result?.reasonCodes ?? [input.decision],
    explicitExecutionApproval: input.explicitExecutionApproval,
    actionExecution: input.decision === "executed_controlled_harmless_action",
  };
}

export async function buildPhase2ControlledActionExecutionReport(
  input: Phase2ControlledActionExecutionInput = {},
): Promise<Phase2ControlledActionExecutionReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const approvedScope = input.approvedScope ?? {
    sessionKey: "main",
    operatorId: input.operatorId ?? "phase2-operator",
    projectId: "openclaw",
  };
  const requestScope = input.requestScope ?? {
    ...approvedScope,
    purpose: "operator_eval",
  };
  const actionKind = input.actionKind ?? "write_bounded_proof_artifact";
  const explicitExecutionApproval = input.explicitExecutionApproval === true;
  const killed = readKillSwitch(input.env);
  const approvalReport =
    input.approvalReport === null
      ? undefined
      : (input.approvalReport ??
        (await buildPhase2StagedActionApprovalReport({
          now: input.now,
          proofMarker: input.proofMarker,
          approvedScope,
          requestScope: { ...approvedScope, purpose: "operator_eval" },
          env: input.env,
          operatorDecision: "approve",
          operatorId: approvedScope.operatorId,
          uiEvidence: undefined,
        })));
  const proposal = approvalReport?.proposals.find((candidate) => candidate.approved);
  const scopeOk = scopeMatches({ approvedScope, requestScope });
  const provenanceOk = hasProvenance(proposal);
  const policy = buildPolicy(generatedAt);
  const checks: Phase2ControlledActionExecutionCheck[] = [];
  addCheck(checks, "scope:approved", scopeOk, "approved_operator_eval_scope_required");
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");
  addCheck(
    checks,
    "action_kind:harmless",
    actionKind === "write_bounded_proof_artifact",
    "harmless_action_kind_required",
  );
  addCheck(
    checks,
    "approval_report:observed",
    approvalReport?.decision === "approval_workflow_observed",
    "approval_workflow_required",
  );
  addCheck(
    checks,
    "proposal:approved_not_executed",
    proposal?.status === "approved_not_executed" && proposal.approved && !proposal.executed,
    "approved_non_executed_proposal_required",
  );
  addCheck(
    checks,
    "execution_approval:explicit",
    explicitExecutionApproval,
    "explicit_execution_approval_required",
  );
  addCheck(
    checks,
    "no_dark_data:pass",
    approvalReport?.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");

  const decision = decisionFromChecks({
    killed,
    scopeOk,
    actionKind,
    approvalReport,
    proposal,
    explicitExecutionApproval,
    provenanceOk,
  });
  const result =
    proposal && actionKind === "write_bounded_proof_artifact"
      ? buildResult({ generatedAt, actionKind, proposal, decision })
      : undefined;
  const approvalReportId = approvalReport?.reportId ?? "missing-approval-report";
  const auditEntry = audit({
    generatedAt,
    approvalReportId,
    proposal,
    actionKind,
    decision,
    result,
    explicitExecutionApproval,
    operatorId: approvedScope.operatorId,
  });
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_action_execution_report",
    targetId: approvedScope.operatorId,
    seed: {
      generatedAt,
      approvalReportId,
      proposalId: proposal?.proposalId ?? null,
      actionKind,
      decision,
      marker: input.proofMarker ?? null,
    },
  });
  const rollbackPlan: Phase2ControlledActionRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_action_execution_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXECUTION_DISABLED",
    targetMode: "approval_workflow_only",
    disablesControlledActionExecution: true,
  };
  const noDarkDataStatus = approvalReport?.noDarkDataStatus === "pass" ? "pass" : "fail";
  const telemetry: Phase2ControlledActionExecutionTelemetry = {
    schemaVersion: PHASE2_CONTROLLED_ACTION_EXECUTION_SCHEMA_VERSION,
    reportId,
    decision,
    approvalReportId: approvalReport?.reportId,
    proposalId: proposal?.proposalId,
    actionKind,
    resultId: result?.resultId,
    auditIds: [auditEntry.auditId],
    sourceProfileIds: uniqueSortedStrings(result?.sourceProfileIds ?? []) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(result?.authorityTiers ?? []) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(result?.sourceRefIds ?? []),
    contentHashes: uniqueSortedStrings(result?.contentHashes ?? []),
    proofHashes: uniqueSortedStrings(result?.proofHashes ?? []),
    reasonCodes: uniqueSortedStrings(
      checks.map((check) => check.reasonCode).concat(result?.reasonCodes ?? [decision]),
    ),
    noDarkDataStatus,
    rollbackObserved: killed || decision === "blocked_rollback",
    explicitExecutionApproval,
    userFacingProactiveMessagesSent: false,
    externalCommandExecuted: false,
    networkCallExecuted: false,
    databaseMutationExecuted: false,
    actionExecutionObserved: decision === "executed_controlled_harmless_action",
  };
  const report: Phase2ControlledActionExecutionReport = {
    schemaVersion: PHASE2_CONTROLLED_ACTION_EXECUTION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    approvalReportId: approvalReport?.reportId,
    approvedScope,
    requestScope,
    actionKind,
    proposal,
    result,
    auditTrail: [auditEntry],
    checks,
    rollbackPlan,
    noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ControlledActionExecutionReport;
}

export function assertPhase2ControlledActionExecutionObserved(
  report: Phase2ControlledActionExecutionReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "executed_controlled_harmless_action") {
    throw new Error(`phase2 controlled action execution not observed: ${report.decision}`);
  }
  if (!report.result || report.result.status !== "executed") {
    throw new Error("phase2 controlled action execution emitted no executed harmless result");
  }
  if (
    report.telemetry.userFacingProactiveMessagesSent ||
    report.result.userFacingProactiveMessage ||
    report.result.externalCommandExecuted ||
    report.result.networkCallExecuted ||
    report.result.databaseMutationExecuted
  ) {
    throw new Error("phase2 controlled action execution escaped harmless boundary");
  }
  if (!report.auditTrail.every((entry) => entry.explicitExecutionApproval)) {
    throw new Error("phase2 controlled action execution lacked explicit approval audit");
  }
}

export async function writePhase2ControlledActionExecutionArtifact(input: {
  report: Phase2ControlledActionExecutionReport;
  artifactDir: string;
}): Promise<Phase2ControlledActionExecutionArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-controlled-action-execution",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Controlled Action Execution Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- approvalReportId: ${input.report.approvalReportId ?? "none"}`,
    `- actionKind: ${input.report.actionKind}`,
    `- resultId: ${input.report.result?.resultId ?? "none"}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
    `- userFacingProactiveMessagesSent: ${input.report.telemetry.userFacingProactiveMessagesSent}`,
    "",
    "## Audit IDs",
    "",
    ...input.report.auditTrail.map((entry) => `- ${entry.auditId}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 controlled action execution markdown exceeds byte limit");
  }
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
