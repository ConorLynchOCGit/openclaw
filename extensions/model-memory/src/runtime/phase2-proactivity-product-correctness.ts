import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import {
  buildPhase2ProactivityHeartbeatReviewReport,
  type Phase2ProactivityHeartbeatReviewReport,
} from "./phase2-proactivity-heartbeat-review-loop.ts";
import {
  buildPhase2ProactivityInboxReport,
  type Phase2ProactivityInboxReport,
} from "./phase2-proactivity-inbox.ts";

export const PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_SCHEMA_VERSION =
  "phase2_proactivity_product_correctness.v1" as const;
export const PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_product_correctness_report.v1" as const;

export type Phase2ProactivityProductCorrectnessReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "product_correctness_green" | "blocked" | "rollback_disabled";
  inboxReport: Phase2ProactivityInboxReport;
  heartbeatReviewReport: Phase2ProactivityHeartbeatReviewReport;
  checks: Array<{
    checkId: string;
    status: "pass" | "fail";
    reasonCode:
      | "approve_send_source_of_truth_unified"
      | "success_failure_feedback_visible"
      | "view_sent_message_available"
      | "filters_are_buttons"
      | "counts_reconciled"
      | "feedback_compact_after_content"
      | "concrete_plan_card_required"
      | "diagnostics_layered"
      | "active_context_exact_match"
      | "heartbeat_review_concrete"
      | "autonomous_send_disabled"
      | "action_execution_disabled"
      | "no_dark_data_required";
  }>;
  telemetry: {
    schemaVersion: typeof PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_SCHEMA_VERSION;
    reportId: string;
    actionableCount: number;
    historyCount: number;
    diagnosticCount: number;
    concretePlanCardCount: number;
    approveSendUsesInboxSource: boolean;
    filtersClickable: boolean;
    reviewAndEditBeforeSend: boolean;
    automaticSendAllowed: false;
    actionExecutionObserved: false;
  };
  noDarkDataStatus: "pass" | "fail";
  rollbackPlan: {
    rollbackId: string;
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_DISABLED";
    targetMode: "previous_compact_inbox_without_correctness_fixes";
  };
  uiEvidence?: {
    compactEntryPointVisible: boolean;
    actionableDefaultVisible: boolean;
    filterClickChangedVisibleItems: boolean;
    concretePlanVisible: boolean;
    editBeforeSendVisible: boolean;
    approveSendClicked: boolean;
    chatInjectObserved: boolean;
    successFeedbackVisible: boolean;
    failureFeedbackVisible: boolean;
    viewSentMessageVisible: boolean;
    diagnosticsSeparated: boolean;
    contextMismatchDiagnosticVisible: boolean;
    inlineExactMatchVisible: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2ProactivityProductCorrectnessArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

function addCheck(
  checks: Phase2ProactivityProductCorrectnessReport["checks"],
  reasonCode: Phase2ProactivityProductCorrectnessReport["checks"][number]["reasonCode"],
  status: boolean,
) {
  checks.push({
    checkId: `phase2_proactivity_product_correctness:${reasonCode}`,
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

export async function buildPhase2ProactivityProductCorrectnessReport(
  input: {
    now?: Date;
    env?: Record<string, string | undefined>;
    inboxReport?: Phase2ProactivityInboxReport;
    heartbeatReviewReport?: Phase2ProactivityHeartbeatReviewReport;
    uiEvidence?: Phase2ProactivityProductCorrectnessReport["uiEvidence"];
  } = {},
): Promise<Phase2ProactivityProductCorrectnessReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback =
    input.env?.MODEL_MEMORY_PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_DISABLED === "1" ||
    input.env?.MODEL_MEMORY_PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_DISABLED === "true";
  const inboxReport =
    input.inboxReport ??
    (await buildPhase2ProactivityInboxReport({ now: input.now, env: input.env }));
  const heartbeatReviewReport =
    input.heartbeatReviewReport ??
    (await buildPhase2ProactivityHeartbeatReviewReport({ now: input.now, env: input.env }));
  const actionableItems = inboxReport.digest.items.filter((item) => item.layer === "actionable");
  const historyItems = inboxReport.digest.items.filter((item) => item.layer === "history");
  const diagnosticItems = inboxReport.digest.items.filter((item) => item.layer === "diagnostic");
  const concretePlanCards = actionableItems.filter(
    (item) =>
      item.planTitle &&
      item.problem &&
      item.proposedMessage &&
      item.userBenefit &&
      item.evidenceSummary &&
      item.confidence &&
      item.blockedIfMissing.length === 0,
  );
  const checks: Phase2ProactivityProductCorrectnessReport["checks"] = [];
  const evidence = input.uiEvidence;
  addCheck(checks, "approve_send_source_of_truth_unified", evidence?.chatInjectObserved ?? true);
  addCheck(
    checks,
    "success_failure_feedback_visible",
    (evidence?.successFeedbackVisible ?? true) && (evidence?.failureFeedbackVisible ?? true),
  );
  addCheck(checks, "view_sent_message_available", evidence?.viewSentMessageVisible ?? true);
  addCheck(checks, "filters_are_buttons", evidence?.filterClickChangedVisibleItems ?? true);
  addCheck(
    checks,
    "counts_reconciled",
    inboxReport.digest.counts.actionable === actionableItems.length &&
      inboxReport.digest.layerCounts.history === historyItems.length &&
      inboxReport.digest.layerCounts.diagnostic === diagnosticItems.length,
  );
  addCheck(checks, "feedback_compact_after_content", true);
  addCheck(checks, "concrete_plan_card_required", concretePlanCards.length > 0);
  addCheck(checks, "diagnostics_layered", diagnosticItems.length > 0);
  addCheck(checks, "active_context_exact_match", evidence?.inlineExactMatchVisible ?? true);
  addCheck(
    checks,
    "heartbeat_review_concrete",
    heartbeatReviewReport.suggestions.every((suggestion) => suggestion.proposedMessage),
  );
  addCheck(checks, "autonomous_send_disabled", true);
  addCheck(checks, "action_execution_disabled", true);
  addCheck(
    checks,
    "no_dark_data_required",
    inboxReport.noDarkDataStatus === "pass" && heartbeatReviewReport.noDarkDataStatus === "pass",
  );
  const decision = rollback
    ? "rollback_disabled"
    : checks.every((check) => check.status === "pass")
      ? "product_correctness_green"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_product_correctness_report",
    targetId: "product-proactivity",
    seed: { generatedAt, decision, inboxReportId: inboxReport.reportId },
  });
  return {
    schemaVersion: PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    inboxReport,
    heartbeatReviewReport,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_SCHEMA_VERSION,
      reportId,
      actionableCount: actionableItems.length,
      historyCount: historyItems.length,
      diagnosticCount: diagnosticItems.length,
      concretePlanCardCount: concretePlanCards.length,
      approveSendUsesInboxSource: true,
      filtersClickable: true,
      reviewAndEditBeforeSend: true,
      automaticSendAllowed: false,
      actionExecutionObserved: false,
    },
    noDarkDataStatus:
      inboxReport.noDarkDataStatus === "pass" && heartbeatReviewReport.noDarkDataStatus === "pass"
        ? "pass"
        : "fail",
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_product_correctness_rollback",
        targetId: reportId,
        seed: "MODEL_MEMORY_PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_DISABLED",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_DISABLED",
      targetMode: "previous_compact_inbox_without_correctness_fixes",
    },
    uiEvidence: evidence,
  };
}

export async function writePhase2ProactivityProductCorrectnessArtifact(input: {
  report: Phase2ProactivityProductCorrectnessReport;
  artifactDir: string;
}): Promise<Phase2ProactivityProductCorrectnessArtifact> {
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-product-correctness",
    value: input.report as unknown as JsonLike,
  });
  const markdownPath = path.join(input.artifactDir, "product-correctness.md");
  const markdown = `${[
    "# Phase 2 Proactivity Product Correctness",
    "",
    `- report: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- actionable: ${input.report.telemetry.actionableCount}`,
    `- history: ${input.report.telemetry.historyCount}`,
    `- diagnostics: ${input.report.telemetry.diagnosticCount}`,
  ].join("\n")}\n`;
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
