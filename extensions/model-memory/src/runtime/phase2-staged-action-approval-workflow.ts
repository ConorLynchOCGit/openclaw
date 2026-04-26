import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import {
  buildPhase2ControlledProactivitySuggestionReport,
  type Phase2ControlledProactivitySuggestionInput,
  type Phase2ControlledProactivitySuggestionReport,
} from "./phase2-controlled-proactivity-suggestions.ts";
import {
  buildPhase2ProactivityBoundaryReport,
  type Phase2ProactivityBoundaryReport,
  type Phase2ProactivitySuggestion,
} from "./phase2-proactivity-action-boundary.ts";

export const PHASE2_STAGED_ACTION_APPROVAL_SCHEMA_VERSION =
  "phase2_staged_action_approval_workflow.v1" as const;
export const PHASE2_STAGED_ACTION_APPROVAL_REPORT_SCHEMA_VERSION =
  "phase2_staged_action_approval_workflow_report.v1" as const;

export type Phase2StagedActionApprovalStatus =
  | "staged_for_review"
  | "approved_not_executed"
  | "rejected"
  | "blocked"
  | "rollback_disabled";

export type Phase2StagedActionApprovalDecision =
  | "approval_workflow_observed"
  | "rollback_disabled"
  | "blocked";

export type Phase2StagedActionApprovalPolicy = {
  schemaVersion: typeof PHASE2_STAGED_ACTION_APPROVAL_SCHEMA_VERSION;
  policyId: string;
  requireControlledSuggestionScope: true;
  requireApprovalRequiredClassification: true;
  requireOperatorDecision: true;
  requireProvenance: true;
  requireNoDarkDataPass: true;
  blockStale: true;
  blockConflicts: true;
  blockInspectionOnly: true;
  blockedActionsCannotBeStaged: true;
  actionExecutionAllowed: false;
  userFacingProactiveMessagesAllowed: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2StagedActionProposal = {
  proposalId: string;
  sourceOutputId: string;
  status: Phase2StagedActionApprovalStatus;
  operatorId: string;
  evidenceArtifactIds: string[];
  sourceRefIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  externalImperativeTextHandling: "evidence_not_instruction";
  staged: boolean;
  approved: boolean;
  rejected: boolean;
  executed: false;
  userFacingProactiveMessage: false;
};

export type Phase2StagedActionAuditEntry = {
  auditId: string;
  proposalId: string;
  operatorId: string;
  decision: "stage" | "approve" | "reject" | "block" | "rollback";
  status: Phase2StagedActionApprovalStatus;
  evidenceHashes: string[];
  reasonCodes: string[];
  actionExecution: false;
};

export type Phase2StagedActionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_STAGED_ACTION_APPROVAL_DISABLED";
  targetMode: "controlled_suggestions_only";
  disablesProposalStagingAndApproval: true;
};

export type Phase2StagedActionApprovalTelemetry = {
  schemaVersion: typeof PHASE2_STAGED_ACTION_APPROVAL_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2StagedActionApprovalDecision;
  controlledSuggestionReportId?: string;
  boundaryReportId?: string;
  proposalIds: string[];
  approvedProposalIds: string[];
  rejectedProposalIds: string[];
  blockedProposalIds: string[];
  auditIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  userFacingProactiveMessagesSent: false;
  actionExecutionObserved: false;
};

export type Phase2StagedActionApprovalCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2StagedActionApprovalReport = {
  schemaVersion: typeof PHASE2_STAGED_ACTION_APPROVAL_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2StagedActionApprovalDecision;
  policy: Phase2StagedActionApprovalPolicy;
  controlledSuggestionReportId?: string;
  boundaryReportId?: string;
  proposals: Phase2StagedActionProposal[];
  auditTrail: Phase2StagedActionAuditEntry[];
  checks: Phase2StagedActionApprovalCheck[];
  rollbackPlan: Phase2StagedActionRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2StagedActionApprovalTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    stageRunId?: string | null;
    approvalRunId?: string | null;
    rejectionRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2StagedActionApprovalInput = Omit<
  Phase2ControlledProactivitySuggestionInput,
  "uiEvidence"
> & {
  controlledSuggestionReport?: Phase2ControlledProactivitySuggestionReport | null;
  boundaryReport?: Phase2ProactivityBoundaryReport | null;
  operatorDecision?: "approve" | "reject";
  operatorId?: string;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2StagedActionApprovalReport["uiEvidence"];
};

export type Phase2StagedActionApprovalArtifact = {
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
        `phase2 staged action approval contains prohibited field: ${[...pathParts, key].join(".")}`,
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
      throw new Error("phase2 staged action approval contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2StagedActionApprovalCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_STAGED_ACTION_APPROVAL_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function buildPolicy(generatedAt: string): Phase2StagedActionApprovalPolicy {
  return {
    schemaVersion: PHASE2_STAGED_ACTION_APPROVAL_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_staged_action_approval_policy",
      targetId: "planner",
      seed: generatedAt,
    }),
    requireControlledSuggestionScope: true,
    requireApprovalRequiredClassification: true,
    requireOperatorDecision: true,
    requireProvenance: true,
    requireNoDarkDataPass: true,
    blockStale: true,
    blockConflicts: true,
    blockInspectionOnly: true,
    blockedActionsCannotBeStaged: true,
    actionExecutionAllowed: false,
    userFacingProactiveMessagesAllowed: false,
    externalTextHandling: "evidence_not_instruction",
  };
}

function proposalFromOutput(input: {
  output: Phase2ProactivitySuggestion;
  generatedAt: string;
  operatorId: string;
  decision: "approve" | "reject";
}): Phase2StagedActionProposal {
  const approved = input.decision === "approve";
  return {
    proposalId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_staged_action_proposal",
      targetId: input.output.outputId,
      seed: { generatedAt: input.generatedAt, decision: input.decision },
    }),
    sourceOutputId: input.output.outputId,
    status: approved ? "approved_not_executed" : "rejected",
    operatorId: input.operatorId,
    evidenceArtifactIds: [...input.output.evidenceArtifactIds],
    sourceRefIds: [...input.output.sourceRefIds],
    sourceProfileIds: [...input.output.sourceProfileIds],
    authorityTiers: [...input.output.authorityTiers],
    contentHashes: [...input.output.contentHashes],
    proofHashes: [...input.output.proofHashes],
    reasonCodes: uniqueSortedStrings([
      ...input.output.reasonCodes,
      "approval_required_action_staged_for_review",
      approved ? "operator_approved_but_not_executed" : "operator_rejected",
    ]),
    externalImperativeTextHandling: "evidence_not_instruction",
    staged: true,
    approved,
    rejected: !approved,
    executed: false,
    userFacingProactiveMessage: false,
  };
}

function blockedProposal(input: {
  output: Phase2ProactivitySuggestion;
  generatedAt: string;
  operatorId: string;
}): Phase2StagedActionProposal {
  return {
    proposalId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_staged_action_blocked_proposal",
      targetId: input.output.outputId,
      seed: input.generatedAt,
    }),
    sourceOutputId: input.output.outputId,
    status: "blocked",
    operatorId: input.operatorId,
    evidenceArtifactIds: [...input.output.evidenceArtifactIds],
    sourceRefIds: [...input.output.sourceRefIds],
    sourceProfileIds: [...input.output.sourceProfileIds],
    authorityTiers: [...input.output.authorityTiers],
    contentHashes: [...input.output.contentHashes],
    proofHashes: [...input.output.proofHashes],
    reasonCodes: uniqueSortedStrings([
      ...input.output.reasonCodes,
      "blocked_action_not_staged",
      "blocked_actions_cannot_be_approved",
    ]),
    externalImperativeTextHandling: "evidence_not_instruction",
    staged: false,
    approved: false,
    rejected: false,
    executed: false,
    userFacingProactiveMessage: false,
  };
}

function audit(input: {
  proposal: Phase2StagedActionProposal;
  generatedAt: string;
  decision: Phase2StagedActionAuditEntry["decision"];
}): Phase2StagedActionAuditEntry {
  return {
    auditId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_staged_action_audit_entry",
      targetId: input.proposal.proposalId,
      seed: { generatedAt: input.generatedAt, decision: input.decision },
    }),
    proposalId: input.proposal.proposalId,
    operatorId: input.proposal.operatorId,
    decision: input.decision,
    status: input.proposal.status,
    evidenceHashes: uniqueSortedStrings(
      input.proposal.contentHashes.concat(input.proposal.proofHashes),
    ),
    reasonCodes: [...input.proposal.reasonCodes],
    actionExecution: false,
  };
}

export async function buildPhase2StagedActionApprovalReport(
  input: Phase2StagedActionApprovalInput = {},
): Promise<Phase2StagedActionApprovalReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const killed = readKillSwitch(input.env);
  const operatorId = input.operatorId ?? input.approvedScope?.operatorId ?? "phase2-operator";
  const controlledSuggestionReport =
    input.controlledSuggestionReport === null
      ? undefined
      : (input.controlledSuggestionReport ??
        (await buildPhase2ControlledProactivitySuggestionReport({
          ...input,
          uiEvidence: undefined,
        })));
  const boundaryReport =
    input.boundaryReport === null
      ? undefined
      : (input.boundaryReport ??
        (controlledSuggestionReport?.boundaryReportId
          ? await buildPhase2ProactivityBoundaryReport({ ...input, uiEvidence: undefined })
          : undefined));
  const policy = buildPolicy(generatedAt);
  const checks: Phase2StagedActionApprovalCheck[] = [];
  addCheck(
    checks,
    "controlled_suggestions:observed",
    controlledSuggestionReport?.decision === "controlled_suggestions_observed",
    "controlled_suggestions_required",
  );
  addCheck(
    checks,
    "boundary:observed",
    boundaryReport?.decision === "boundary_observed",
    "proactivity_boundary_required",
  );
  addCheck(
    checks,
    "no_dark_data:pass",
    controlledSuggestionReport?.noDarkDataStatus === "pass" &&
      boundaryReport?.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");

  const canStage =
    !killed &&
    controlledSuggestionReport?.decision === "controlled_suggestions_observed" &&
    boundaryReport?.decision === "boundary_observed" &&
    controlledSuggestionReport.noDarkDataStatus === "pass" &&
    boundaryReport.noDarkDataStatus === "pass";
  const decision = input.operatorDecision ?? "approve";
  const approvalOutput = boundaryReport?.outputs.find(
    (output) => output.classification === "approval_required_action",
  );
  const blockedOutput = boundaryReport?.outputs.find(
    (output) => output.classification === "blocked_action",
  );
  const proposals: Phase2StagedActionProposal[] = [];
  if (canStage && approvalOutput) {
    proposals.push(
      proposalFromOutput({ output: approvalOutput, generatedAt, operatorId, decision }),
    );
  }
  if (blockedOutput) {
    proposals.push(blockedProposal({ output: blockedOutput, generatedAt, operatorId }));
  }
  const auditTrail = proposals.flatMap((proposal) => {
    if (proposal.status === "blocked") {
      return [audit({ proposal, generatedAt, decision: "block" })];
    }
    return [
      audit({ proposal, generatedAt, decision: "stage" }),
      audit({ proposal, generatedAt, decision: proposal.approved ? "approve" : "reject" }),
    ];
  });
  const reportDecision: Phase2StagedActionApprovalDecision = killed
    ? "rollback_disabled"
    : proposals.some((proposal) => proposal.approved || proposal.rejected)
      ? "approval_workflow_observed"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_staged_action_approval_report",
    targetId: operatorId,
    seed: {
      generatedAt,
      controlledSuggestionReportId: controlledSuggestionReport?.reportId ?? null,
      boundaryReportId: boundaryReport?.reportId ?? null,
      decision: reportDecision,
      marker: input.proofMarker ?? null,
    },
  });
  const rollbackPlan: Phase2StagedActionRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_staged_action_approval_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_STAGED_ACTION_APPROVAL_DISABLED",
    targetMode: "controlled_suggestions_only",
    disablesProposalStagingAndApproval: true,
  };
  const telemetry: Phase2StagedActionApprovalTelemetry = {
    schemaVersion: PHASE2_STAGED_ACTION_APPROVAL_SCHEMA_VERSION,
    reportId,
    decision: reportDecision,
    controlledSuggestionReportId: controlledSuggestionReport?.reportId,
    boundaryReportId: boundaryReport?.reportId,
    proposalIds: uniqueSortedStrings(proposals.map((proposal) => proposal.proposalId)),
    approvedProposalIds: uniqueSortedStrings(
      proposals.filter((proposal) => proposal.approved).map((proposal) => proposal.proposalId),
    ),
    rejectedProposalIds: uniqueSortedStrings(
      proposals.filter((proposal) => proposal.rejected).map((proposal) => proposal.proposalId),
    ),
    blockedProposalIds: uniqueSortedStrings(
      proposals
        .filter((proposal) => proposal.status === "blocked")
        .map((proposal) => proposal.proposalId),
    ),
    auditIds: uniqueSortedStrings(auditTrail.map((entry) => entry.auditId)),
    sourceProfileIds: uniqueSortedStrings(
      proposals.flatMap((proposal) => proposal.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      proposals.flatMap((proposal) => proposal.authorityTiers),
    ) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(proposals.flatMap((proposal) => proposal.sourceRefIds)),
    contentHashes: uniqueSortedStrings(proposals.flatMap((proposal) => proposal.contentHashes)),
    proofHashes: uniqueSortedStrings(proposals.flatMap((proposal) => proposal.proofHashes)),
    reasonCodes: uniqueSortedStrings(
      checks
        .map((check) => check.reasonCode)
        .concat(proposals.flatMap((proposal) => proposal.reasonCodes)),
    ),
    noDarkDataStatus:
      controlledSuggestionReport?.noDarkDataStatus === "pass" &&
      boundaryReport?.noDarkDataStatus === "pass"
        ? "pass"
        : "fail",
    rollbackObserved: killed || reportDecision === "blocked",
    userFacingProactiveMessagesSent: false,
    actionExecutionObserved: false,
  };
  const report: Phase2StagedActionApprovalReport = {
    schemaVersion: PHASE2_STAGED_ACTION_APPROVAL_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision: reportDecision,
    policy,
    controlledSuggestionReportId: controlledSuggestionReport?.reportId,
    boundaryReportId: boundaryReport?.reportId,
    proposals: killed ? [] : proposals,
    auditTrail: killed ? [] : auditTrail,
    checks,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2StagedActionApprovalReport;
}

export function assertPhase2StagedActionApprovalObserved(
  report: Phase2StagedActionApprovalReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "approval_workflow_observed") {
    throw new Error(`phase2 staged action approval not observed: ${report.decision}`);
  }
  if (!report.proposals.some((proposal) => proposal.approved || proposal.rejected)) {
    throw new Error("phase2 staged action approval emitted no reviewed proposal");
  }
  if (
    report.telemetry.actionExecutionObserved ||
    report.telemetry.userFacingProactiveMessagesSent
  ) {
    throw new Error("phase2 staged action approval executed action or sent proactive message");
  }
  if (
    report.proposals.some((proposal) => proposal.executed || proposal.userFacingProactiveMessage)
  ) {
    throw new Error("phase2 staged action proposal escaped non-executing posture");
  }
}

export async function writePhase2StagedActionApprovalArtifact(input: {
  report: Phase2StagedActionApprovalReport;
  artifactDir: string;
}): Promise<Phase2StagedActionApprovalArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-staged-action-approval-workflow",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Staged Action Approval Workflow Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- controlledSuggestionReportId: ${input.report.controlledSuggestionReportId ?? "none"}`,
    `- boundaryReportId: ${input.report.boundaryReportId ?? "none"}`,
    `- proposals: ${input.report.proposals.length}`,
    `- auditEntries: ${input.report.auditTrail.length}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
    "",
    "## Proposal IDs",
    "",
    ...input.report.telemetry.proposalIds.map((proposalId) => `- ${proposalId}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 staged action approval markdown exceeds byte limit");
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
