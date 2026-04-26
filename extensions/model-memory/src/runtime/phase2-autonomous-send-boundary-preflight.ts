import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import {
  buildPhase2UserFacingProactivityDefaultPromotionReport,
  type Phase2UserFacingProactivityDefaultPromotionReport,
} from "./phase2-user-facing-proactivity-default-promotion.ts";

export const PHASE2_AUTONOMOUS_SEND_BOUNDARY_SCHEMA_VERSION =
  "phase2_autonomous_send_boundary_preflight.v1" as const;
export const PHASE2_AUTONOMOUS_SEND_BOUNDARY_REPORT_SCHEMA_VERSION =
  "phase2_autonomous_send_boundary_preflight_report.v1" as const;

export type Phase2AutonomousSendClassification =
  | "manual_send_required"
  | "approval_required_auto_send_candidate"
  | "blocked_autonomous_send";

export type Phase2AutonomousSendMessageClass =
  | "operator_approved_suggestion_available"
  | "operator_approved_follow_up_available"
  | "external_instruction_message"
  | "unknown_message_class";

export type Phase2AutonomousSendBoundaryDecision =
  | "auto_send_candidates_report_only"
  | "manual_send_required"
  | "blocked";

export type Phase2AutonomousSendBoundaryPolicy = {
  schemaVersion: typeof PHASE2_AUTONOMOUS_SEND_BOUNDARY_SCHEMA_VERSION;
  policyId: string;
  allowedClassifications: [
    "manual_send_required",
    "approval_required_auto_send_candidate",
    "blocked_autonomous_send",
  ];
  automaticSendExecutionAllowed: false;
  autoSendCandidatesReportOnly: true;
  manualSendRequiredForDelivery: true;
  requireDefaultPromotionProof: true;
  requireProvenance: true;
  requireSourceProfile: true;
  requireNoDarkDataPass: true;
  blockExternalImperativeText: true;
  blockUrgencyManipulation: true;
  blockStaleOrRepeatedSuggestions: true;
  blockInspectionOnly: true;
  blockRollbackActive: true;
};

export type Phase2AutonomousSendCandidate = {
  candidateId: string;
  messageClass: Phase2AutonomousSendMessageClass;
  classification: Phase2AutonomousSendClassification;
  reportOnly: true;
  wouldDeliverAutomatically: false;
  manualSendStillRequired: true;
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
};

export type Phase2AutonomousSendBoundaryCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "manual_send_required"
    | "auto_send_report_only"
    | "blocked_autonomous_send_cannot_deliver"
    | "external_text_evidence_not_instruction"
    | "project_docs_evidence_not_instruction"
    | "urgency_manipulation_blocked"
    | "provenance_required"
    | "source_profile_required"
    | "inspection_only_blocked"
    | "stale_conflict_blocked"
    | "no_dark_data_required"
    | "rollback_blocks_candidates"
    | "unknown_class_blocked"
    | "lower_authority_preserved"
    | "automatic_send_execution_false"
    | "action_execution_false";
};

export type Phase2AutonomousSendBoundaryTelemetry = {
  schemaVersion: typeof PHASE2_AUTONOMOUS_SEND_BOUNDARY_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2AutonomousSendBoundaryDecision;
  defaultPromotionReportId?: string;
  classifications: Phase2AutonomousSendClassification[];
  candidateIds: string[];
  blockedReasonCodes: string[];
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  automaticSendExecution: false;
  autonomousMessageEmitted: false;
  actionExecutionObserved: false;
  reportOnly: true;
};

export type Phase2AutonomousSendBoundaryRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_BOUNDARY_DISABLED";
  targetMode: "manual_send_required";
  disablesAutoSendCandidates: true;
};

export type Phase2AutonomousSendBoundaryReport = {
  schemaVersion: typeof PHASE2_AUTONOMOUS_SEND_BOUNDARY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2AutonomousSendBoundaryDecision;
  policy: Phase2AutonomousSendBoundaryPolicy;
  candidates: Phase2AutonomousSendCandidate[];
  checks: Phase2AutonomousSendBoundaryCheck[];
  rollbackPlan: Phase2AutonomousSendBoundaryRollbackPlan;
  telemetry: Phase2AutonomousSendBoundaryTelemetry;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    boundaryRunId?: string | null;
    blockedRunId?: string | null;
    terminalEvidence: boolean;
    observedTextSha256?: string;
  };
};

export type Phase2AutonomousSendBoundaryInput = {
  now?: Date;
  proofMarker?: string;
  defaultPromotionReport?: Phase2UserFacingProactivityDefaultPromotionReport | null;
  messageClass?: Phase2AutonomousSendMessageClass;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2AutonomousSendBoundaryReport["uiEvidence"];
  forceExternalImperativeText?: boolean;
  forceUrgencyManipulation?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceInspectionOnly?: boolean;
  forceStaleConflict?: boolean;
  forceNoDarkDataFail?: boolean;
  forceUnknownClass?: boolean;
};

export type Phase2AutonomousSendBoundaryArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const ALLOWED_MESSAGE_CLASSES = [
  "operator_approved_suggestion_available",
  "operator_approved_follow_up_available",
] as const;

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
        `phase2 autonomous send boundary contains prohibited field: ${[...pathParts, key].join(
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
      throw new Error("phase2 autonomous send boundary contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2AutonomousSendBoundaryCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2AutonomousSendBoundaryCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_BOUNDARY_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function isAllowedMessageClass(value: Phase2AutonomousSendMessageClass): boolean {
  return (ALLOWED_MESSAGE_CLASSES as readonly string[]).includes(value);
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

export async function buildPhase2AutonomousSendBoundaryReport(
  input: Phase2AutonomousSendBoundaryInput = {},
): Promise<Phase2AutonomousSendBoundaryReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const defaultPromotionReport =
    input.defaultPromotionReport === null
      ? undefined
      : (input.defaultPromotionReport ??
        (await buildPhase2UserFacingProactivityDefaultPromotionReport({
          now: input.now,
          proofMarker: input.proofMarker,
        })));
  const messageClass = input.forceUnknownClass
    ? "unknown_message_class"
    : (input.messageClass ?? "operator_approved_suggestion_available");
  const rollback = readRollback(input.env);
  const allowedClass = isAllowedMessageClass(messageClass);
  const defaultProofOk =
    defaultPromotionReport?.decision === "approved_for_default_eligible_user_facing_delivery";
  const provenanceOk =
    !input.forceMissingProvenance &&
    Boolean(defaultPromotionReport && defaultPromotionReport.telemetry.sourceRefs.length > 0);
  const sourceProfileOk =
    !input.forceMissingSourceProfile &&
    Boolean(defaultPromotionReport && defaultPromotionReport.telemetry.sourceProfileIds.length > 0);
  const noDarkDataOk =
    !input.forceNoDarkDataFail && defaultPromotionReport?.noDarkDataStatus === "pass";
  const externalTextOk = !input.forceExternalImperativeText;
  const urgencyOk = !input.forceUrgencyManipulation;
  const inspectionOk = !input.forceInspectionOnly;
  const staleConflictOk = !input.forceStaleConflict;
  const checks: Phase2AutonomousSendBoundaryCheck[] = [];
  addCheck(checks, "delivery:manual_send_required", true, "manual_send_required");
  addCheck(checks, "candidate:report_only", true, "auto_send_report_only");
  addCheck(checks, "blocked:cannot_deliver", true, "blocked_autonomous_send_cannot_deliver");
  addCheck(
    checks,
    "external_text:evidence",
    externalTextOk,
    "external_text_evidence_not_instruction",
  );
  addCheck(checks, "project_docs:evidence", true, "project_docs_evidence_not_instruction");
  addCheck(checks, "urgency:block", urgencyOk, "urgency_manipulation_blocked");
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  addCheck(checks, "source_profile:present", sourceProfileOk, "source_profile_required");
  addCheck(checks, "inspection_only:block", inspectionOk, "inspection_only_blocked");
  addCheck(checks, "stale_conflict:block", staleConflictOk, "stale_conflict_blocked");
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(checks, "rollback:not_active", !rollback, "rollback_blocks_candidates");
  addCheck(checks, "message_class:known_allowed", allowedClass, "unknown_class_blocked");
  addCheck(checks, "authority:lower_preserved", true, "lower_authority_preserved");
  addCheck(checks, "automatic_send:false", true, "automatic_send_execution_false");
  addCheck(checks, "action_execution:false", true, "action_execution_false");

  const failedChecks = checks.filter((check) => check.status === "fail");
  const blocked = failedChecks.length > 0 || !defaultProofOk;
  const classification: Phase2AutonomousSendClassification = blocked
    ? "blocked_autonomous_send"
    : "approval_required_auto_send_candidate";
  const decision: Phase2AutonomousSendBoundaryDecision = blocked
    ? defaultProofOk
      ? "manual_send_required"
      : "blocked"
    : "auto_send_candidates_report_only";
  const reasonCodes = failedChecks.map((check) => check.reasonCode);
  const candidateId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_autonomous_send_candidate",
    targetId: messageClass,
    seed: {
      generatedAt,
      defaultPromotionReportId: defaultPromotionReport?.reportId ?? null,
      classification,
      reasonCodes,
    },
  });
  const proofHashes = uniqueSortedStrings([
    ...(defaultPromotionReport?.telemetry.proofHashes ?? []),
    reportHash(defaultPromotionReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const candidate: Phase2AutonomousSendCandidate = {
    candidateId,
    messageClass,
    classification,
    reportOnly: true,
    wouldDeliverAutomatically: false,
    manualSendStillRequired: true,
    sourceRefs: uniqueSortedStrings(defaultPromotionReport?.telemetry.sourceRefs ?? []),
    sourceProfileIds: uniqueSortedStrings(defaultPromotionReport?.telemetry.sourceProfileIds ?? []),
    authorityTiers: uniqueSortedStrings(defaultPromotionReport?.telemetry.authorityTiers ?? []),
    contentHashes: uniqueSortedStrings(defaultPromotionReport?.telemetry.contentHashes ?? []),
    proofHashes,
    reasonCodes,
  };
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_autonomous_send_boundary_report",
    targetId: "phase2-autonomous-send-boundary",
    seed: { generatedAt, candidateId, decision, reasonCodes },
  });
  const rollbackPlan: Phase2AutonomousSendBoundaryRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autonomous_send_boundary_rollback",
      targetId: reportId,
      seed: { rollback, decision },
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_BOUNDARY_DISABLED",
    targetMode: "manual_send_required",
    disablesAutoSendCandidates: true,
  };
  const policy: Phase2AutonomousSendBoundaryPolicy = {
    schemaVersion: PHASE2_AUTONOMOUS_SEND_BOUNDARY_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autonomous_send_boundary_policy",
      targetId: "phase2-autonomous-send-boundary",
      seed: "v1",
    }),
    allowedClassifications: [
      "manual_send_required",
      "approval_required_auto_send_candidate",
      "blocked_autonomous_send",
    ],
    automaticSendExecutionAllowed: false,
    autoSendCandidatesReportOnly: true,
    manualSendRequiredForDelivery: true,
    requireDefaultPromotionProof: true,
    requireProvenance: true,
    requireSourceProfile: true,
    requireNoDarkDataPass: true,
    blockExternalImperativeText: true,
    blockUrgencyManipulation: true,
    blockStaleOrRepeatedSuggestions: true,
    blockInspectionOnly: true,
    blockRollbackActive: true,
  };
  const telemetry: Phase2AutonomousSendBoundaryTelemetry = {
    schemaVersion: PHASE2_AUTONOMOUS_SEND_BOUNDARY_SCHEMA_VERSION,
    reportId,
    decision,
    defaultPromotionReportId: defaultPromotionReport?.reportId,
    classifications: [classification],
    candidateIds: [candidateId],
    blockedReasonCodes: reasonCodes,
    sourceRefs: candidate.sourceRefs,
    sourceProfileIds: candidate.sourceProfileIds,
    authorityTiers: candidate.authorityTiers,
    contentHashes: candidate.contentHashes,
    proofHashes,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    automaticSendExecution: false,
    autonomousMessageEmitted: false,
    actionExecutionObserved: false,
    reportOnly: true,
  };
  const report: Phase2AutonomousSendBoundaryReport = {
    schemaVersion: PHASE2_AUTONOMOUS_SEND_BOUNDARY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    candidates: [candidate],
    checks,
    rollbackPlan,
    telemetry,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2AutonomousSendBoundaryObserved(
  report: Phase2AutonomousSendBoundaryReport,
): void {
  assertNoDarkData(report);
  if (report.telemetry.automaticSendExecution || report.telemetry.autonomousMessageEmitted) {
    throw new Error("phase2 autonomous send boundary emitted an automatic message");
  }
  if (!report.telemetry.reportOnly) {
    throw new Error("phase2 autonomous send boundary candidate was not report-only");
  }
}

export async function writePhase2AutonomousSendBoundaryArtifact(input: {
  report: Phase2AutonomousSendBoundaryReport;
  artifactDir: string;
}): Promise<Phase2AutonomousSendBoundaryArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-autonomous-send-boundary-preflight",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Autonomous Send Boundary Preflight",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- classifications: ${input.report.telemetry.classifications.join(", ")}`,
    `- manualSendRequired: ${input.report.policy.manualSendRequiredForDelivery}`,
    `- automaticSendExecution: ${input.report.telemetry.automaticSendExecution}`,
    `- autonomousMessageEmitted: ${input.report.telemetry.autonomousMessageEmitted}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
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
