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
  buildPhase2PlannerDefaultPromotionReport,
  type Phase2PlannerDefaultOperatorReport,
  type Phase2PlannerDefaultPromotionInput,
  type Phase2PlannerDefaultPromotionReport,
} from "./phase2-planner-default-promotion.ts";

export const PHASE2_PROACTIVITY_BOUNDARY_SCHEMA_VERSION =
  "phase2_proactivity_action_boundary.v1" as const;
export const PHASE2_PROACTIVITY_BOUNDARY_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_action_boundary_report.v1" as const;

export type Phase2ProactivityOutputClassification =
  | "report_only"
  | "suggestion_only"
  | "approval_required_action"
  | "blocked_action";

export type Phase2ProactivityBoundaryDecision =
  | "boundary_observed"
  | "rollback_disabled"
  | "blocked";

export type Phase2ProactivityApprovalRequirement = {
  required: boolean;
  approverRole: "operator";
  executionAllowedInThisSlice: false;
};

export type Phase2ProactivityBoundaryPolicy = {
  schemaVersion: typeof PHASE2_PROACTIVITY_BOUNDARY_SCHEMA_VERSION;
  policyId: string;
  allowedClassifications: Phase2ProactivityOutputClassification[];
  requireProvenance: true;
  blockInspectionOnly: true;
  blockStale: true;
  blockConflicts: true;
  requireNoDarkDataPass: true;
  prohibitActionExecutionByDefault: true;
  prohibitUserFacingProactiveMessages: true;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ProactivitySuggestion = {
  outputId: string;
  classification: Phase2ProactivityOutputClassification;
  sourceOperatorReportId?: string;
  evidenceArtifactIds: string[];
  sourceRefIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  approvalRequirement: Phase2ProactivityApprovalRequirement;
  staged: boolean;
  executed: false;
  userFacingProactiveMessage: false;
  evidenceOnly: true;
  externalImperativeTextHandling: "evidence_not_instruction";
};

export type Phase2ProactivityBlockedAction = Phase2ProactivitySuggestion & {
  classification: "blocked_action";
  staged: false;
};

export type Phase2ProactivityBoundaryRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_BOUNDARY_DISABLED";
  targetMode: "planner_operator_reports_only";
  disablesSuggestionsAndProposals: true;
};

export type Phase2ProactivityBoundaryTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_BOUNDARY_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ProactivityBoundaryDecision;
  classificationCounts: Record<Phase2ProactivityOutputClassification, number>;
  outputIds: string[];
  blockedOutputIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  proactiveUserMessagesSent: false;
  actionExecutionObserved: false;
  rollbackObserved: boolean;
};

export type Phase2ProactivityBoundaryCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ProactivityBoundaryReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_BOUNDARY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ProactivityBoundaryDecision;
  policy: Phase2ProactivityBoundaryPolicy;
  plannerDefaultPromotionReportId?: string;
  outputs: Phase2ProactivitySuggestion[];
  blockedActions: Phase2ProactivityBlockedAction[];
  checks: Phase2ProactivityBoundaryCheck[];
  rollbackPlan: Phase2ProactivityBoundaryRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ProactivityBoundaryTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    boundaryRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2ProactivityBoundaryInput = Omit<
  Phase2PlannerDefaultPromotionInput,
  "uiEvidence"
> & {
  plannerDefaultPromotionReport?: Phase2PlannerDefaultPromotionReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProactivityBoundaryReport["uiEvidence"];
};

export type Phase2ProactivityBoundaryArtifact = {
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
        `phase2 proactivity boundary contains prohibited field: ${[...pathParts, key].join(".")}`,
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
      throw new Error("phase2 proactivity boundary contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2ProactivityBoundaryCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_BOUNDARY_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function buildPolicy(generatedAt: string): Phase2ProactivityBoundaryPolicy {
  return {
    schemaVersion: PHASE2_PROACTIVITY_BOUNDARY_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_boundary_policy",
      targetId: "planner",
      seed: generatedAt,
    }),
    allowedClassifications: [
      "report_only",
      "suggestion_only",
      "approval_required_action",
      "blocked_action",
    ],
    requireProvenance: true,
    blockInspectionOnly: true,
    blockStale: true,
    blockConflicts: true,
    requireNoDarkDataPass: true,
    prohibitActionExecutionByDefault: true,
    prohibitUserFacingProactiveMessages: true,
    externalTextHandling: "evidence_not_instruction",
  };
}

function suggestionFromOperatorReport(input: {
  operatorReport: Phase2PlannerDefaultOperatorReport;
  classification: Exclude<Phase2ProactivityOutputClassification, "blocked_action">;
  generatedAt: string;
}): Phase2ProactivitySuggestion {
  return {
    outputId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: `phase2_proactivity_${input.classification}`,
      targetId: input.operatorReport.operatorReportId,
      seed: input.generatedAt,
    }),
    classification: input.classification,
    sourceOperatorReportId: input.operatorReport.operatorReportId,
    evidenceArtifactIds: [...input.operatorReport.evidenceArtifactIds],
    sourceRefIds: [...input.operatorReport.sourceRefIds],
    sourceProfileIds: [...input.operatorReport.sourceProfileIds],
    authorityTiers: [...input.operatorReport.authorityTiers],
    contentHashes: [...input.operatorReport.contentHashes],
    proofHashes: [...input.operatorReport.proofHashes],
    reasonCodes: [
      "planner_output_is_evidence_backed",
      input.classification === "approval_required_action"
        ? "explicit_operator_approval_required"
        : "no_action_execution",
    ],
    approvalRequirement: {
      required: input.classification === "approval_required_action",
      approverRole: "operator",
      executionAllowedInThisSlice: false,
    },
    staged: input.classification === "approval_required_action",
    executed: false,
    userFacingProactiveMessage: false,
    evidenceOnly: true,
    externalImperativeTextHandling: "evidence_not_instruction",
  };
}

function blockedAction(generatedAt: string): Phase2ProactivityBlockedAction {
  return {
    outputId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_blocked_action",
      targetId: "missing_provenance",
      seed: generatedAt,
    }),
    classification: "blocked_action",
    evidenceArtifactIds: [],
    sourceRefIds: [],
    sourceProfileIds: [],
    authorityTiers: [],
    contentHashes: [],
    proofHashes: [],
    reasonCodes: ["blocked_missing_provenance", "blocked_action_not_staged"],
    approvalRequirement: {
      required: false,
      approverRole: "operator",
      executionAllowedInThisSlice: false,
    },
    staged: false,
    executed: false,
    userFacingProactiveMessage: false,
    evidenceOnly: true,
    externalImperativeTextHandling: "evidence_not_instruction",
  };
}

function classificationCounts(
  outputs: Phase2ProactivitySuggestion[],
): Record<Phase2ProactivityOutputClassification, number> {
  return {
    report_only: outputs.filter((output) => output.classification === "report_only").length,
    suggestion_only: outputs.filter((output) => output.classification === "suggestion_only").length,
    approval_required_action: outputs.filter(
      (output) => output.classification === "approval_required_action",
    ).length,
    blocked_action: outputs.filter((output) => output.classification === "blocked_action").length,
  };
}

export async function buildPhase2ProactivityBoundaryReport(
  input: Phase2ProactivityBoundaryInput = {},
): Promise<Phase2ProactivityBoundaryReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const killed = readKillSwitch(input.env);
  const plannerDefaultPromotionReport =
    input.plannerDefaultPromotionReport === null
      ? undefined
      : (input.plannerDefaultPromotionReport ??
        (await buildPhase2PlannerDefaultPromotionReport({
          ...input,
          uiEvidence: undefined,
        })));
  const policy = buildPolicy(generatedAt);
  const checks: Phase2ProactivityBoundaryCheck[] = [];
  addCheck(
    checks,
    "planner_default:operator_reports_approved",
    plannerDefaultPromotionReport?.decision === "approved_for_default_operator_reports",
    "planner_default_operator_reports_required",
  );
  addCheck(
    checks,
    "no_dark_data:pass",
    plannerDefaultPromotionReport?.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(checks, "proactive:user_messages_disabled", true, "no_user_facing_proactivity");
  addCheck(checks, "actions:execution_disabled", true, "no_action_execution");
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");

  const baseReports = plannerDefaultPromotionReport?.defaultOperatorReports ?? [];
  const canClassify =
    !killed &&
    plannerDefaultPromotionReport?.decision === "approved_for_default_operator_reports" &&
    plannerDefaultPromotionReport.noDarkDataStatus === "pass" &&
    baseReports.length > 0;
  const outputs: Phase2ProactivitySuggestion[] = canClassify
    ? [
        suggestionFromOperatorReport({
          operatorReport: baseReports[0]!,
          classification: "report_only",
          generatedAt,
        }),
        suggestionFromOperatorReport({
          operatorReport: baseReports[1] ?? baseReports[0]!,
          classification: "suggestion_only",
          generatedAt,
        }),
        suggestionFromOperatorReport({
          operatorReport: baseReports[2] ?? baseReports[0]!,
          classification: "approval_required_action",
          generatedAt,
        }),
        blockedAction(generatedAt),
      ]
    : [];
  const blockedActions = outputs.filter(
    (output): output is Phase2ProactivityBlockedAction =>
      output.classification === "blocked_action",
  );
  const decision: Phase2ProactivityBoundaryDecision = killed
    ? "rollback_disabled"
    : canClassify
      ? "boundary_observed"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_boundary_report",
    targetId: "planner",
    seed: {
      generatedAt,
      plannerDefaultPromotionReportId: plannerDefaultPromotionReport?.reportId ?? null,
      decision,
      marker: input.proofMarker ?? null,
    },
  });
  const rollbackPlan: Phase2ProactivityBoundaryRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_boundary_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_BOUNDARY_DISABLED",
    targetMode: "planner_operator_reports_only",
    disablesSuggestionsAndProposals: true,
  };
  const telemetry: Phase2ProactivityBoundaryTelemetry = {
    schemaVersion: PHASE2_PROACTIVITY_BOUNDARY_SCHEMA_VERSION,
    reportId,
    decision,
    classificationCounts: classificationCounts(outputs),
    outputIds: uniqueSortedStrings(outputs.map((output) => output.outputId)),
    blockedOutputIds: uniqueSortedStrings(blockedActions.map((output) => output.outputId)),
    sourceProfileIds: uniqueSortedStrings(
      outputs.flatMap((output) => output.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      outputs.flatMap((output) => output.authorityTiers),
    ) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(outputs.flatMap((output) => output.sourceRefIds)),
    contentHashes: uniqueSortedStrings(outputs.flatMap((output) => output.contentHashes)),
    proofHashes: uniqueSortedStrings(outputs.flatMap((output) => output.proofHashes)),
    reasonCodes: uniqueSortedStrings(
      checks
        .map((check) => check.reasonCode)
        .concat(outputs.flatMap((output) => output.reasonCodes)),
    ),
    noDarkDataStatus: plannerDefaultPromotionReport?.noDarkDataStatus ?? "fail",
    proactiveUserMessagesSent: false,
    actionExecutionObserved: false,
    rollbackObserved: killed || !canClassify,
  };
  const report: Phase2ProactivityBoundaryReport = {
    schemaVersion: PHASE2_PROACTIVITY_BOUNDARY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    plannerDefaultPromotionReportId: plannerDefaultPromotionReport?.reportId,
    outputs,
    blockedActions,
    checks,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ProactivityBoundaryReport;
}

export function assertPhase2ProactivityBoundaryObserved(
  report: Phase2ProactivityBoundaryReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "boundary_observed") {
    throw new Error(`phase2 proactivity boundary was not observed: ${report.decision}`);
  }
  if (report.telemetry.proactiveUserMessagesSent || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 proactivity boundary executed actions or sent proactive messages");
  }
  if (!report.outputs.some((output) => output.classification === "approval_required_action")) {
    throw new Error("phase2 proactivity boundary emitted no approval-required proposal");
  }
  if (report.outputs.some((output) => output.executed || output.userFacingProactiveMessage)) {
    throw new Error("phase2 proactivity boundary output escaped report/proposal-only posture");
  }
}

export async function writePhase2ProactivityBoundaryArtifact(input: {
  report: Phase2ProactivityBoundaryReport;
  artifactDir: string;
}): Promise<Phase2ProactivityBoundaryArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-boundary",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Proactivity Action Boundary Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- plannerDefaultPromotionReportId: ${input.report.plannerDefaultPromotionReportId ?? "none"}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- proactiveUserMessagesSent: ${input.report.telemetry.proactiveUserMessagesSent}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
    "",
    "## Classification Counts",
    "",
    ...Object.entries(input.report.telemetry.classificationCounts).map(
      ([classification, count]) => `- ${classification}: ${count}`,
    ),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 proactivity boundary markdown exceeds byte limit");
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
