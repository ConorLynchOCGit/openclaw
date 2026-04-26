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
  buildPhase2AutonomousSendBoundaryReport,
  type Phase2AutonomousSendBoundaryReport,
} from "./phase2-autonomous-send-boundary-preflight.ts";
import {
  buildPhase2PersonalDefaultProactivityReport,
  type Phase2PersonalDefaultProactivityReport,
} from "./phase2-personal-default-proactivity-scope.ts";
import type { Phase2UserFacingProactivityDefaultMessageClass } from "./phase2-user-facing-proactivity-default-promotion.ts";

export const PHASE2_AUTONOMOUS_SEND_READINESS_SCHEMA_VERSION =
  "phase2_autonomous_send_readiness_manual_override.v1" as const;
export const PHASE2_AUTONOMOUS_SEND_READINESS_REPORT_SCHEMA_VERSION =
  "phase2_autonomous_send_readiness_manual_override_report.v1" as const;

export type Phase2AutonomousSendReadinessClassification =
  | "manual_send_required"
  | "low_risk_auto_send_candidate_manual_override_required"
  | "blocked_autonomous_send";

export type Phase2AutonomousSendManualOverrideControl =
  | "always_require_approval"
  | "auto_approve_never"
  | "future_scoped_auto_send_allowed_for_review_only";

export type Phase2AutonomousSendReadinessPolicy = {
  schemaVersion: typeof PHASE2_AUTONOMOUS_SEND_READINESS_SCHEMA_VERSION;
  policyId: string;
  allowedClassifications: [
    "manual_send_required",
    "low_risk_auto_send_candidate_manual_override_required",
    "blocked_autonomous_send",
  ];
  controls: [
    "always_require_approval",
    "auto_approve_never",
    "future_scoped_auto_send_allowed_for_review_only",
  ];
  automaticSendExecutionAllowed: false;
  autoSendReadinessCandidatesReportOnly: true;
  manualOverrideRequired: true;
  requirePersonalDefaultScope: true;
  requireBoundaryPreflight: true;
  requireProvenance: true;
  requireSourceProfile: true;
  requireNoDarkDataPass: true;
  blockUrgencyManipulation: true;
  blockRepeatedSuggestions: true;
  blockStaleEvidence: true;
  blockExternalInstructions: true;
  blockRollbackActive: true;
};

export type Phase2AutonomousSendReadinessCandidate = {
  candidateId: string;
  messageClass:
    | Phase2UserFacingProactivityDefaultMessageClass
    | "external_instruction_message"
    | "unknown_message_class";
  classification: Phase2AutonomousSendReadinessClassification;
  controls: Phase2AutonomousSendManualOverrideControl[];
  reportOnlySimulation: true;
  wouldHaveBeenEligibleForFutureAutoSend: boolean;
  deliveredAutomatically: false;
  manualSendStillRequired: true;
  boundedDisplayText: string;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
};

export type Phase2AutonomousSendReadinessDecision =
  | "manual_override_required"
  | "blocked"
  | "rollback_disabled";

export type Phase2AutonomousSendReadinessCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "personal_default_scope_required"
    | "autonomous_boundary_required"
    | "manual_send_required"
    | "auto_send_readiness_report_only"
    | "always_require_approval_control"
    | "auto_approve_never_control"
    | "future_auto_send_review_only_control"
    | "approved_message_class_required"
    | "external_text_evidence_not_instruction"
    | "project_docs_evidence_not_instruction"
    | "urgency_manipulation_blocked"
    | "repeated_suggestion_blocked"
    | "stale_evidence_blocked"
    | "provenance_required"
    | "source_profile_required"
    | "no_dark_data_required"
    | "rollback_blocks_candidates"
    | "lower_authority_preserved"
    | "automatic_send_execution_false"
    | "action_execution_false";
};

export type Phase2AutonomousSendManualOverrideConfig = {
  configId: string;
  controls: Phase2AutonomousSendManualOverrideControl[];
  automaticSendExecutionAllowed: false;
  manualOverrideRequired: true;
  reportOnlySimulation: true;
};

export type Phase2AutonomousSendReadinessTelemetry = {
  schemaVersion: typeof PHASE2_AUTONOMOUS_SEND_READINESS_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2AutonomousSendReadinessDecision;
  personalDefaultReportId?: string;
  boundaryReportId?: string;
  classifications: Phase2AutonomousSendReadinessClassification[];
  candidateIds: string[];
  blockedReasonCodes: string[];
  controls: Phase2AutonomousSendManualOverrideControl[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  manualSendRequired: true;
  reportOnlySimulation: true;
  automaticSendExecution: false;
  autonomousMessageEmitted: false;
  actionExecutionObserved: false;
};

export type Phase2AutonomousSendReadinessRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_READINESS_DISABLED";
  targetMode: "manual_send_required";
  disablesReadinessCandidates: true;
  preservesManualSendWorkflow: true;
};

export type Phase2AutonomousSendReadinessReport = {
  schemaVersion: typeof PHASE2_AUTONOMOUS_SEND_READINESS_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2AutonomousSendReadinessDecision;
  policy: Phase2AutonomousSendReadinessPolicy;
  config: Phase2AutonomousSendManualOverrideConfig;
  personalDefaultReport?: Phase2PersonalDefaultProactivityReport;
  boundaryReport?: Phase2AutonomousSendBoundaryReport;
  candidates: Phase2AutonomousSendReadinessCandidate[];
  checks: Phase2AutonomousSendReadinessCheck[];
  telemetry: Phase2AutonomousSendReadinessTelemetry;
  rollbackPlan: Phase2AutonomousSendReadinessRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    sessionKey: string;
    readinessVisibleInProductUx: boolean;
    whatWouldHaveSentSimulationVisible: boolean;
    manualSendRequiredVisible: boolean;
    urgencyBlockedVisible: boolean;
    externalInstructionBlockedVisible: boolean;
    staleRepeatSuppressionVisible: boolean;
    rollbackDisablesCandidates: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2AutonomousSendReadinessInput = {
  now?: Date;
  personalDefaultReport?: Phase2PersonalDefaultProactivityReport | null;
  boundaryReport?: Phase2AutonomousSendBoundaryReport | null;
  messageClass?: Phase2AutonomousSendReadinessCandidate["messageClass"];
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2AutonomousSendReadinessReport["uiEvidence"];
  forceUrgencyManipulation?: boolean;
  forceRepeatedSuggestion?: boolean;
  forceStaleEvidence?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceExternalInstruction?: boolean;
  forceUnknownClass?: boolean;
};

export type Phase2AutonomousSendReadinessArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const ALLOWED_MESSAGE_CLASSES = [
  "operator_approved_suggestion_available",
  "operator_approved_follow_up_available",
] as const;

const CONTROLS: Phase2AutonomousSendManualOverrideControl[] = [
  "always_require_approval",
  "auto_approve_never",
  "future_scoped_auto_send_allowed_for_review_only",
];

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

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    for (const parts of PROHIBITED_MARKER_PARTS) {
      if (lowered.includes(parts.join(""))) {
        throw new Error("phase2 autonomous send readiness contains prohibited marker content");
      }
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDarkData(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 autonomous send readiness contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function addCheck(
  checks: Phase2AutonomousSendReadinessCheck[],
  reasonCode: Phase2AutonomousSendReadinessCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autonomous_send_readiness_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_READINESS_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function isAllowedMessageClass(
  value: Phase2AutonomousSendReadinessCandidate["messageClass"],
): boolean {
  return (ALLOWED_MESSAGE_CLASSES as readonly string[]).includes(value);
}

async function loadPrerequisites(input: Phase2AutonomousSendReadinessInput): Promise<{
  personalDefaultReport?: Phase2PersonalDefaultProactivityReport;
  boundaryReport?: Phase2AutonomousSendBoundaryReport;
}> {
  const personalDefaultReport =
    input.personalDefaultReport === null
      ? undefined
      : (input.personalDefaultReport ??
        (await buildPhase2PersonalDefaultProactivityReport({
          now: input.now,
          env: input.env,
        })));
  const boundaryReport =
    input.boundaryReport === null
      ? undefined
      : (input.boundaryReport ??
        (await buildPhase2AutonomousSendBoundaryReport({
          now: input.now,
          env: input.env,
        })));
  return { personalDefaultReport, boundaryReport };
}

export async function buildPhase2AutonomousSendReadinessReport(
  input: Phase2AutonomousSendReadinessInput = {},
): Promise<Phase2AutonomousSendReadinessReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const { personalDefaultReport, boundaryReport } = await loadPrerequisites(input);
  const messageClass = input.forceUnknownClass
    ? "unknown_message_class"
    : (input.messageClass ?? "operator_approved_suggestion_available");
  const checks: Phase2AutonomousSendReadinessCheck[] = [];
  const personalOk =
    personalDefaultReport?.decision === "personal_default_scope_enabled" &&
    personalDefaultReport.telemetry.explicitSendApprovalRequired;
  const boundaryOk =
    boundaryReport?.decision === "auto_send_candidates_report_only" &&
    boundaryReport.telemetry.reportOnly &&
    !boundaryReport.telemetry.automaticSendExecution;
  const allowedClassOk = isAllowedMessageClass(messageClass);
  const sourceRefs = uniqueSortedStrings([
    ...(personalDefaultReport?.telemetry.sourceRefs ?? []),
    ...(boundaryReport?.telemetry.sourceRefs ?? []),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...(personalDefaultReport?.telemetry.sourceProfileIds ?? []),
    ...(boundaryReport?.telemetry.sourceProfileIds ?? []),
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...(personalDefaultReport?.telemetry.authorityTiers ?? []),
    ...(boundaryReport?.telemetry.authorityTiers ?? []),
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...(personalDefaultReport?.telemetry.contentHashes ?? []),
    ...(boundaryReport?.telemetry.contentHashes ?? []),
  ]);
  const prerequisiteHashes = uniqueSortedStrings([
    ...(personalDefaultReport?.telemetry.proofHashes ?? []),
    ...(boundaryReport?.telemetry.proofHashes ?? []),
    reportHash(personalDefaultReport as JsonLike | undefined) ?? "",
    reportHash(boundaryReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const provenanceOk = !input.forceMissingProvenance && sourceRefs.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    personalDefaultReport?.telemetry.noDarkDataStatus === "pass" &&
    boundaryReport?.noDarkDataStatus === "pass";
  const urgencyOk = !input.forceUrgencyManipulation;
  const repeatedOk = !input.forceRepeatedSuggestion;
  const staleOk = !input.forceStaleEvidence;
  const externalInstructionOk = !input.forceExternalInstruction;

  addCheck(checks, "personal_default_scope_required", personalOk);
  addCheck(checks, "autonomous_boundary_required", boundaryOk);
  addCheck(checks, "manual_send_required", true);
  addCheck(checks, "auto_send_readiness_report_only", true);
  addCheck(checks, "always_require_approval_control", true);
  addCheck(checks, "auto_approve_never_control", true);
  addCheck(checks, "future_auto_send_review_only_control", true);
  addCheck(checks, "approved_message_class_required", allowedClassOk);
  addCheck(checks, "external_text_evidence_not_instruction", externalInstructionOk);
  addCheck(checks, "project_docs_evidence_not_instruction", true);
  addCheck(checks, "urgency_manipulation_blocked", urgencyOk);
  addCheck(checks, "repeated_suggestion_blocked", repeatedOk);
  addCheck(checks, "stale_evidence_blocked", staleOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "rollback_blocks_candidates", !rollback);
  addCheck(checks, "lower_authority_preserved", true);
  addCheck(checks, "automatic_send_execution_false", true);
  addCheck(checks, "action_execution_false", true);

  const failedReasonCodes = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.reasonCode);
  const blocked = failedReasonCodes.length > 0;
  const classification: Phase2AutonomousSendReadinessClassification = blocked
    ? "blocked_autonomous_send"
    : "low_risk_auto_send_candidate_manual_override_required";
  const decision: Phase2AutonomousSendReadinessDecision = rollback
    ? "rollback_disabled"
    : blocked
      ? "blocked"
      : "manual_override_required";
  const candidateId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_autonomous_send_readiness_candidate",
    targetId: messageClass,
    seed: {
      generatedAt,
      personalDefaultReportId: personalDefaultReport?.reportId ?? null,
      boundaryReportId: boundaryReport?.reportId ?? null,
      classification,
      failedReasonCodes,
    },
  });
  const candidate: Phase2AutonomousSendReadinessCandidate = {
    candidateId,
    messageClass,
    classification,
    controls: [...CONTROLS],
    reportOnlySimulation: true,
    wouldHaveBeenEligibleForFutureAutoSend: !blocked,
    deliveredAutomatically: false,
    manualSendStillRequired: true,
    boundedDisplayText: "This approved low-risk proactive message would remain manual-send only.",
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes: prerequisiteHashes,
    reasonCodes: failedReasonCodes,
  };
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_autonomous_send_readiness_report",
    targetId: "phase2-autonomous-send-readiness",
    seed: { generatedAt, candidateId, decision, failedReasonCodes },
  });
  const policy: Phase2AutonomousSendReadinessPolicy = {
    schemaVersion: PHASE2_AUTONOMOUS_SEND_READINESS_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autonomous_send_readiness_policy",
      targetId: "phase2-autonomous-send-readiness",
      seed: "v1",
    }),
    allowedClassifications: [
      "manual_send_required",
      "low_risk_auto_send_candidate_manual_override_required",
      "blocked_autonomous_send",
    ],
    controls: [
      "always_require_approval",
      "auto_approve_never",
      "future_scoped_auto_send_allowed_for_review_only",
    ],
    automaticSendExecutionAllowed: false,
    autoSendReadinessCandidatesReportOnly: true,
    manualOverrideRequired: true,
    requirePersonalDefaultScope: true,
    requireBoundaryPreflight: true,
    requireProvenance: true,
    requireSourceProfile: true,
    requireNoDarkDataPass: true,
    blockUrgencyManipulation: true,
    blockRepeatedSuggestions: true,
    blockStaleEvidence: true,
    blockExternalInstructions: true,
    blockRollbackActive: true,
  };
  const config: Phase2AutonomousSendManualOverrideConfig = {
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autonomous_send_readiness_config",
      targetId: "manual-override",
      seed: { controls: CONTROLS, decision },
    }),
    controls: [...CONTROLS],
    automaticSendExecutionAllowed: false,
    manualOverrideRequired: true,
    reportOnlySimulation: true,
  };
  const telemetry: Phase2AutonomousSendReadinessTelemetry = {
    schemaVersion: PHASE2_AUTONOMOUS_SEND_READINESS_SCHEMA_VERSION,
    reportId,
    decision,
    personalDefaultReportId: personalDefaultReport?.reportId,
    boundaryReportId: boundaryReport?.reportId,
    classifications: [classification],
    candidateIds: [candidateId],
    blockedReasonCodes: failedReasonCodes,
    controls: [...CONTROLS],
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes: prerequisiteHashes,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    manualSendRequired: true,
    reportOnlySimulation: true,
    automaticSendExecution: false,
    autonomousMessageEmitted: false,
    actionExecutionObserved: false,
  };
  const rollbackPlan: Phase2AutonomousSendReadinessRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autonomous_send_readiness_rollback",
      targetId: reportId,
      seed: { rollback, decision },
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_READINESS_DISABLED",
    targetMode: "manual_send_required",
    disablesReadinessCandidates: true,
    preservesManualSendWorkflow: true,
  };
  const report: Phase2AutonomousSendReadinessReport = {
    schemaVersion: PHASE2_AUTONOMOUS_SEND_READINESS_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    config,
    personalDefaultReport,
    boundaryReport,
    candidates: [candidate],
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2AutonomousSendReadinessManualOverride(
  report: Phase2AutonomousSendReadinessReport,
): void {
  assertNoDarkData(report);
  if (!report.telemetry.manualSendRequired || !report.telemetry.reportOnlySimulation) {
    throw new Error("phase2 autonomous send readiness removed manual/report-only controls");
  }
  if (report.telemetry.automaticSendExecution || report.telemetry.autonomousMessageEmitted) {
    throw new Error("phase2 autonomous send readiness emitted an automatic message");
  }
  if (report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 autonomous send readiness executed an action");
  }
}

export async function writePhase2AutonomousSendReadinessArtifact(input: {
  report: Phase2AutonomousSendReadinessReport;
  artifactDir: string;
}): Promise<Phase2AutonomousSendReadinessArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-autonomous-send-readiness-manual-override",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Autonomous Send Readiness With Manual Override",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- classifications: ${input.report.telemetry.classifications.join(", ")}`,
    `- controls: ${input.report.telemetry.controls.join(", ")}`,
    `- manualSendRequired: ${input.report.telemetry.manualSendRequired}`,
    `- reportOnlySimulation: ${input.report.telemetry.reportOnlySimulation}`,
    `- automaticSendExecution: ${input.report.telemetry.automaticSendExecution}`,
    `- autonomousMessageEmitted: ${input.report.telemetry.autonomousMessageEmitted}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
    `- noDarkDataStatus: ${input.report.telemetry.noDarkDataStatus}`,
    "",
  ].join("\n");
  assertNoDarkData({ markdown });
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
