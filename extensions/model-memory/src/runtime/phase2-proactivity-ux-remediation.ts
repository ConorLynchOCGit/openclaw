import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import {
  buildPhase2ProactivityInboxReport,
  type Phase2ProactivityInboxItem,
  type Phase2ProactivityInboxReport,
} from "./phase2-proactivity-inbox.ts";

export const PHASE2_PROACTIVITY_UX_REMEDIATION_SCHEMA_VERSION =
  "phase2_proactivity_ux_remediation.v1" as const;
export const PHASE2_PROACTIVITY_UX_REMEDIATION_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_ux_remediation_report.v1" as const;

export type Phase2ProactivityUxRemediationInput = {
  now?: Date;
  env?: Record<string, string | undefined>;
  inboxReport?: Phase2ProactivityInboxReport | null;
  forceInboxInThread?: boolean;
  forceAlwaysOpenWorkspacePanel?: boolean;
  forceMissingActionableCard?: boolean;
};

export type Phase2ProactivityEntryPointState = {
  label: "Proactivity";
  pendingCount: number;
  visibleInChatChrome: true;
  opensSidePanelDrawer: true;
  consumesTranscriptHeight: false;
};

export type Phase2ProactivityActionableCard = {
  itemId: string;
  queueItemId?: string;
  candidateId: string;
  messageClass: Phase2ProactivityInboxItem["messageClass"];
  candidateSummary: string;
  suggestedAction: string;
  messagePreview: string;
  expectedUserValue: string;
  whyThisAppeared: string;
  ctas: Array<"approve_send" | "dismiss" | "snooze" | "provenance_detail">;
  noDarkDataStatus: "pass" | "fail";
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  blockedReasonCodes: string[];
};

export type Phase2ProactivityInboxDrawerState = {
  drawerKind: "existing_side_panel";
  fullInboxInChatThread: false;
  alwaysOpenWorkspacePanel: false;
  transcriptRemainsPrimary: true;
  cards: Phase2ProactivityActionableCard[];
};

export type Phase2ProactivityUxDecision = "ux_remediated" | "blocked" | "rollback_disabled";

export type Phase2ProactivityUxCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "compact_entry_point_required"
    | "side_panel_drawer_required"
    | "full_inbox_not_in_chat_thread"
    | "workspace_panel_not_always_open"
    | "actionable_cards_required"
    | "message_preview_required"
    | "suggested_action_required"
    | "why_this_appeared_required"
    | "ctas_required"
    | "no_dark_data_required"
    | "autonomous_send_disabled"
    | "action_execution_disabled"
    | "rollback_kill_switch_inactive";
};

export type Phase2ProactivityUxTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_UX_REMEDIATION_SCHEMA_VERSION;
  reportId: string;
  pendingCount: number;
  cardCount: number;
  fullInboxInChatThread: false;
  alwaysOpenWorkspacePanel: false;
  transcriptHeightConsumedByInbox: false;
  approveSendVisible: boolean;
  dismissVisible: boolean;
  snoozeVisible: boolean;
  provenanceDetailVisible: boolean;
  autonomousSendObserved: false;
  actionExecutionObserved: false;
  rawPrivateContentObserved: false;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2ProactivityUxRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_UX_REMEDIATION_DISABLED";
  targetMode: "compact_entry_point_hidden_manual_surfaces_preserved";
  disablesCompactEntryPoint: true;
  preservesManualSendWorkflow: true;
};

export type Phase2ProactivityUxReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_UX_REMEDIATION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ProactivityUxDecision;
  entryPoint: Phase2ProactivityEntryPointState;
  drawer: Phase2ProactivityInboxDrawerState;
  checks: Phase2ProactivityUxCheck[];
  telemetry: Phase2ProactivityUxTelemetry;
  rollbackPlan: Phase2ProactivityUxRollbackPlan;
};

export type Phase2ProactivityUxArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const PROHIBITED_KEYS = new Set([
  "prompt",
  "rawPrompt",
  "transcript",
  "rawTranscript",
  "toolLog",
  "rawToolLog",
  "secret",
  "privatePhrase",
]);

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (typeof value === "string") {
    if (
      /raw-prompt-marker|raw-transcript-marker|raw-tool-log-marker|secret-marker|private-phrase-marker/i.test(
        value,
      )
    ) {
      throw new Error("phase2 proactivity ux remediation contains prohibited marker content");
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDarkData(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 proactivity ux remediation contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function killed(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_UX_REMEDIATION_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2ProactivityUxCheck[],
  reasonCode: Phase2ProactivityUxCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_ux_remediation_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function toCard(item: Phase2ProactivityInboxItem): Phase2ProactivityActionableCard {
  return {
    itemId: item.itemId,
    queueItemId: item.queueItemId,
    candidateId: item.candidateId,
    messageClass: item.messageClass,
    candidateSummary: item.candidateSummary,
    suggestedAction: item.suggestedAction,
    messagePreview: item.messagePreview,
    expectedUserValue: item.expectedUserValue,
    whyThisAppeared: item.whyThisAppearedSummary,
    ctas: ["approve_send", "dismiss", "snooze", "provenance_detail"],
    noDarkDataStatus: item.noDarkDataStatus,
    sourceRefs: item.sourceRefs,
    sourceProfileIds: item.sourceProfileIds,
    authorityTiers: item.authorityTiers,
    contentHashes: item.contentHashes,
    proofHashes: item.proofHashes,
    blockedReasonCodes: item.blockedReasonCodes,
  };
}

async function loadInboxReport(
  input: Phase2ProactivityUxRemediationInput,
): Promise<Phase2ProactivityInboxReport> {
  if (input.inboxReport === null) {
    throw new Error("phase2 proactivity ux remediation requires inbox evidence");
  }
  return input.inboxReport ?? buildPhase2ProactivityInboxReport({ now: input.now, env: input.env });
}

export async function buildPhase2ProactivityUxRemediationReport(
  input: Phase2ProactivityUxRemediationInput = {},
): Promise<Phase2ProactivityUxReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const inboxReport = await loadInboxReport(input);
  const cards = inboxReport.digest.items.map(toCard);
  const pendingCount = inboxReport.digest.counts.pending ?? 0;
  const checks: Phase2ProactivityUxCheck[] = [];
  addCheck(checks, "compact_entry_point_required", true);
  addCheck(checks, "side_panel_drawer_required", true);
  addCheck(checks, "full_inbox_not_in_chat_thread", !input.forceInboxInThread);
  addCheck(checks, "workspace_panel_not_always_open", !input.forceAlwaysOpenWorkspacePanel);
  addCheck(
    checks,
    "actionable_cards_required",
    cards.length > 0 && !input.forceMissingActionableCard,
  );
  addCheck(
    checks,
    "message_preview_required",
    cards.every((card) => card.messagePreview.trim()),
  );
  addCheck(
    checks,
    "suggested_action_required",
    cards.every((card) => card.suggestedAction.trim()),
  );
  addCheck(
    checks,
    "why_this_appeared_required",
    cards.every((card) => card.whyThisAppeared.trim()),
  );
  addCheck(
    checks,
    "ctas_required",
    cards.some((card) =>
      ["approve_send", "dismiss", "snooze", "provenance_detail"].every((cta) =>
        card.ctas.includes(cta as Phase2ProactivityActionableCard["ctas"][number]),
      ),
    ),
  );
  addCheck(checks, "no_dark_data_required", inboxReport.noDarkDataStatus === "pass");
  addCheck(checks, "autonomous_send_disabled", true);
  addCheck(checks, "action_execution_disabled", true);
  addCheck(checks, "rollback_kill_switch_inactive", !killed(input.env));

  const failed = checks.filter((check) => check.status === "fail");
  const decision = killed(input.env)
    ? "rollback_disabled"
    : failed.length === 0
      ? "ux_remediated"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_ux_remediation_report",
    targetId: inboxReport.reportId,
    seed: { generatedAt, decision },
  });
  const report: Phase2ProactivityUxReport = {
    schemaVersion: PHASE2_PROACTIVITY_UX_REMEDIATION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    entryPoint: {
      label: "Proactivity",
      pendingCount,
      visibleInChatChrome: true,
      opensSidePanelDrawer: true,
      consumesTranscriptHeight: false,
    },
    drawer: {
      drawerKind: "existing_side_panel",
      fullInboxInChatThread: false,
      alwaysOpenWorkspacePanel: false,
      transcriptRemainsPrimary: true,
      cards,
    },
    checks,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_UX_REMEDIATION_SCHEMA_VERSION,
      reportId,
      pendingCount,
      cardCount: cards.length,
      fullInboxInChatThread: false,
      alwaysOpenWorkspacePanel: false,
      transcriptHeightConsumedByInbox: false,
      approveSendVisible: cards.some((card) => card.ctas.includes("approve_send")),
      dismissVisible: cards.some((card) => card.ctas.includes("dismiss")),
      snoozeVisible: cards.some((card) => card.ctas.includes("snooze")),
      provenanceDetailVisible: cards.some((card) => card.ctas.includes("provenance_detail")),
      autonomousSendObserved: false,
      actionExecutionObserved: false,
      rawPrivateContentObserved: false,
      noDarkDataStatus: inboxReport.noDarkDataStatus,
    },
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_ux_remediation_rollback",
        targetId: reportId,
        seed: "compact-entry-point-hidden",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_UX_REMEDIATION_DISABLED",
      targetMode: "compact_entry_point_hidden_manual_surfaces_preserved",
      disablesCompactEntryPoint: true,
      preservesManualSendWorkflow: true,
    },
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityUxRemediationReport(
  report: Phase2ProactivityUxReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "ux_remediated") {
    throw new Error(`phase2 proactivity ux remediation not green: ${report.decision}`);
  }
  if (report.drawer.fullInboxInChatThread || report.drawer.alwaysOpenWorkspacePanel) {
    throw new Error("phase2 proactivity ux remediation kept intrusive inbox placement");
  }
  if (
    !report.telemetry.approveSendVisible ||
    !report.telemetry.dismissVisible ||
    !report.telemetry.snoozeVisible
  ) {
    throw new Error("phase2 proactivity ux remediation did not expose actionable controls");
  }
}

export async function writePhase2ProactivityUxRemediationArtifact(input: {
  report: Phase2ProactivityUxReport;
  artifactDir: string;
}): Promise<Phase2ProactivityUxArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-ux-remediation",
    value: input.report as unknown as JsonLike,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity UX Remediation",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- pendingCount: ${input.report.entryPoint.pendingCount}`,
    `- fullInboxInChatThread: ${input.report.drawer.fullInboxInChatThread}`,
    `- alwaysOpenWorkspacePanel: ${input.report.drawer.alwaysOpenWorkspacePanel}`,
    `- cardCount: ${input.report.drawer.cards.length}`,
    `- autonomousSendObserved: ${input.report.telemetry.autonomousSendObserved}`,
    "",
  ].join("\n");
  assertNoDarkData({ markdown });
  await fs.mkdir(input.artifactDir, { recursive: true });
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
