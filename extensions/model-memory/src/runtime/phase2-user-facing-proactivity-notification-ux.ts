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
  buildPhase2ProductProactivitySurfacingReport,
  type Phase2ProductProactivityQueueItem,
  type Phase2ProductProactivityQueueItemStatus,
  type Phase2ProductProactivitySurfacingReport,
} from "./phase2-product-proactivity-presentation.ts";

export const PHASE2_PROACTIVITY_NOTIFICATION_UX_SCHEMA_VERSION =
  "phase2_proactivity_notification_ux.v1" as const;
export const PHASE2_PROACTIVITY_NOTIFICATION_UX_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_notification_ux_report.v1" as const;

export type Phase2ProactivityNotificationItem = {
  notificationId: string;
  queueItemId: string;
  candidateId: string;
  messageClass: Phase2ProductProactivityQueueItem["messageClass"];
  status: "visible" | "dismissed" | "snoozed" | "blocked" | "rollback_disabled";
  boundedDisplayText: string;
  detail: Phase2ProactivityNotificationDetail;
  generatedAt: string;
  updatedAt: string;
};

export type Phase2ProactivityNotificationState = {
  stateId: string;
  surface: "chat_banner";
  items: Phase2ProactivityNotificationItem[];
  generatedAt: string;
};

export type Phase2ProactivityNotificationAction = {
  notificationId: string;
  action: "render" | "dismiss" | "snooze" | "block";
  explicitUserControl: true;
  reasonCodes: string[];
};

export type Phase2ProactivityNotificationDetail = {
  whyThisAppeared: "approved_memory_proactivity_candidate";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  staleLabels: string[];
  conflictLabels: string[];
  noDarkDataStatus: "pass" | "fail";
  blockedReasonCodes: string[];
  rawPromptShown: false;
  transcriptShown: false;
  rawToolLogShown: false;
  privateContentShown: false;
};

export type Phase2ProactivityNotificationTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_NOTIFICATION_UX_SCHEMA_VERSION;
  reportId: string;
  notificationCount: number;
  visibleCount: number;
  blockedCount: number;
  dismissedCount: number;
  snoozedCount: number;
  beforeApprovalVisibleCount: number;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  transcriptDeliveryStillAvailable: true;
  notificationSurfaceIsTranscriptOnly: false;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
  rollbackObserved: boolean;
};

export type Phase2ProactivityNotificationReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_NOTIFICATION_UX_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "notification_ux_enabled" | "blocked" | "rollback_disabled";
  productSurfacingReport: Phase2ProductProactivitySurfacingReport;
  notificationState: Phase2ProactivityNotificationState;
  actions: Phase2ProactivityNotificationAction[];
  telemetry: Phase2ProactivityNotificationTelemetry;
  rollbackPlan: {
    rollbackId: string;
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_NOTIFICATION_UX_DISABLED";
    targetMode: "chat_inject_transcript_only";
    disablesNotificationSurface: true;
  };
  uiEvidence?: {
    sessionKey: string;
    notificationVisible: boolean;
    noNotificationBeforeApproval: boolean;
    detailVisible: boolean;
    dismissWorks: boolean;
    snoozeWorks: boolean;
    chatInjectStillObserved: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2ProactivityNotificationInput = {
  now?: Date;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport | null;
  queueItemStatus?: Phase2ProductProactivityQueueItemStatus;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProactivityNotificationReport["uiEvidence"];
  forceNoDarkDataFail?: boolean;
  forceAutonomousSending?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2ProactivityNotificationArtifact = {
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
  "privatePhrase",
]);

const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
];

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    for (const marker of PROHIBITED_MARKERS) {
      if (lowered.includes(marker)) {
        throw new Error("phase2 proactivity notification ux contains prohibited marker content");
      }
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoDarkData(item, [...pathParts, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 proactivity notification ux contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function reportHash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function statusIsNotificationVisible(status: Phase2ProductProactivityQueueItemStatus): boolean {
  return status === "sent" || status === "approved_not_sent";
}

function itemWithStatus(
  item: Phase2ProductProactivityQueueItem,
  status: Phase2ProductProactivityQueueItemStatus,
  nowIso: string,
): Phase2ProductProactivityQueueItem {
  return {
    ...item,
    status,
    updatedAt: nowIso,
  };
}

async function loadProductSurfacingReport(input: {
  now?: Date;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport | null;
  queueItemStatus?: Phase2ProductProactivityQueueItemStatus;
  env?: Record<string, string | undefined>;
}): Promise<Phase2ProductProactivitySurfacingReport> {
  const nowIso = (input.now ?? new Date()).toISOString();
  if (input.productSurfacingReport === null) {
    throw new Error("product surfacing report is required for notification ux");
  }
  const report =
    input.productSurfacingReport ??
    (await buildPhase2ProductProactivitySurfacingReport({ now: input.now, env: input.env }));
  if (!input.queueItemStatus) {
    return report;
  }
  return {
    ...report,
    queue: {
      ...report.queue,
      items: report.queue.items.map((item) => itemWithStatus(item, input.queueItemStatus!, nowIso)),
    },
  };
}

function buildDetail(item: Phase2ProductProactivityQueueItem): Phase2ProactivityNotificationDetail {
  return {
    whyThisAppeared: "approved_memory_proactivity_candidate",
    sourceRefs: uniqueSortedStrings(item.sourceRefs),
    sourceProfileIds: uniqueSortedStrings(item.sourceProfileIds) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(item.authorityTiers) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(item.contentHashes),
    proofHashes: uniqueSortedStrings(item.proofHashes),
    staleLabels: uniqueSortedStrings(item.staleLabels),
    conflictLabels: uniqueSortedStrings(item.conflictLabels),
    noDarkDataStatus: item.noDarkDataStatus,
    blockedReasonCodes: uniqueSortedStrings(item.blockedReasonCodes),
    rawPromptShown: false,
    transcriptShown: false,
    rawToolLogShown: false,
    privateContentShown: false,
  };
}

function notificationForItem(input: {
  item: Phase2ProductProactivityQueueItem;
  reportId: string;
  generatedAt: string;
  rollback: boolean;
}): Phase2ProactivityNotificationItem {
  const { item, reportId, generatedAt, rollback } = input;
  const visible = statusIsNotificationVisible(item.status);
  return {
    notificationId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_notification_item",
      targetId: item.queueItemId,
      seed: { reportId, status: item.status },
    }),
    queueItemId: item.queueItemId,
    candidateId: item.candidateId,
    messageClass: item.messageClass,
    status: rollback
      ? "rollback_disabled"
      : visible
        ? "visible"
        : item.status === "dismissed"
          ? "dismissed"
          : item.status === "snoozed"
            ? "snoozed"
            : "blocked",
    boundedDisplayText: item.boundedDisplayText,
    detail: buildDetail(item),
    generatedAt,
    updatedAt: generatedAt,
  };
}

function buildActions(
  items: Phase2ProactivityNotificationItem[],
): Phase2ProactivityNotificationAction[] {
  return items.map((item) => ({
    notificationId: item.notificationId,
    action:
      item.status === "visible"
        ? "render"
        : item.status === "dismissed"
          ? "dismiss"
          : item.status === "snoozed"
            ? "snooze"
            : "block",
    explicitUserControl: true,
    reasonCodes:
      item.status === "visible"
        ? ["approved_send_required_before_notification"]
        : item.status === "rollback_disabled"
          ? ["rollback_disabled_notification_surface"]
          : ["notification_not_visible_before_approval"],
  }));
}

export async function buildPhase2ProactivityNotificationReport(
  input: Phase2ProactivityNotificationInput = {},
): Promise<Phase2ProactivityNotificationReport> {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const rollback = input.env?.MODEL_MEMORY_PHASE2_PROACTIVITY_NOTIFICATION_UX_DISABLED === "1";
  const productSurfacingReport = await loadProductSurfacingReport({
    now,
    productSurfacingReport: input.productSurfacingReport,
    queueItemStatus: input.queueItemStatus,
    env: input.env,
  });
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_notification_ux_report",
    targetId: productSurfacingReport.reportId,
    seed: {
      generatedAt,
      rollback,
      queue: productSurfacingReport.queue.items.map((item) => ({
        id: item.queueItemId,
        status: item.status,
      })),
    },
  });
  const items = productSurfacingReport.queue.items.map((item) =>
    notificationForItem({ item, reportId, generatedAt, rollback }),
  );
  const actions = buildActions(items);
  const noDarkDataStatus = input.forceNoDarkDataFail
    ? "fail"
    : productSurfacingReport.noDarkDataStatus;
  const visibleItems = items.filter((item) => item.status === "visible");
  const beforeApprovalVisibleCount = productSurfacingReport.queue.items.filter(
    (item, index) =>
      !statusIsNotificationVisible(item.status) && items[index]?.status === "visible",
  ).length;
  const forbiddenBehavior =
    input.forceAutonomousSending === true ||
    input.forceActionExecution === true ||
    beforeApprovalVisibleCount > 0;
  const decision = rollback
    ? "rollback_disabled"
    : productSurfacingReport.decision !== "product_queue_enabled" ||
        noDarkDataStatus !== "pass" ||
        forbiddenBehavior
      ? "blocked"
      : visibleItems.length > 0
        ? "notification_ux_enabled"
        : "blocked";
  const telemetry: Phase2ProactivityNotificationTelemetry = {
    schemaVersion: PHASE2_PROACTIVITY_NOTIFICATION_UX_SCHEMA_VERSION,
    reportId,
    notificationCount: items.length,
    visibleCount: visibleItems.length,
    blockedCount: items.filter((item) => item.status === "blocked").length,
    dismissedCount: items.filter((item) => item.status === "dismissed").length,
    snoozedCount: items.filter((item) => item.status === "snoozed").length,
    beforeApprovalVisibleCount,
    sourceRefs: uniqueSortedStrings(items.flatMap((item) => item.detail.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      items.flatMap((item) => item.detail.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      items.flatMap((item) => item.detail.authorityTiers),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(items.flatMap((item) => item.detail.contentHashes)),
    proofHashes: uniqueSortedStrings([
      ...items.flatMap((item) => item.detail.proofHashes),
      reportHash(productSurfacingReport as JsonLike),
    ]),
    noDarkDataStatus,
    transcriptDeliveryStillAvailable: true,
    notificationSurfaceIsTranscriptOnly: false,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
    rollbackObserved: rollback,
  };
  const state: Phase2ProactivityNotificationState = {
    stateId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_notification_state",
      targetId: reportId,
      seed: items.map((item) => [item.notificationId, item.status]),
    }),
    surface: "chat_banner",
    items,
    generatedAt,
  };
  const rollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_notification_rollback",
      targetId: reportId,
      seed: "MODEL_MEMORY_PHASE2_PROACTIVITY_NOTIFICATION_UX_DISABLED",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_NOTIFICATION_UX_DISABLED" as const,
    targetMode: "chat_inject_transcript_only" as const,
    disablesNotificationSurface: true as const,
  };
  const report: Phase2ProactivityNotificationReport = {
    schemaVersion: PHASE2_PROACTIVITY_NOTIFICATION_UX_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    productSurfacingReport,
    notificationState: state,
    actions,
    telemetry,
    rollbackPlan,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityNotificationUxEnabled(
  report: Phase2ProactivityNotificationReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "notification_ux_enabled") {
    throw new Error(`phase2 proactivity notification ux not enabled: ${report.decision}`);
  }
  if (report.telemetry.beforeApprovalVisibleCount !== 0) {
    throw new Error("phase2 proactivity notification appeared before approval");
  }
  if (report.telemetry.notificationSurfaceIsTranscriptOnly) {
    throw new Error("phase2 proactivity notification is transcript-only");
  }
  if (report.telemetry.autonomousSendingEnabled || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 proactivity notification enabled forbidden behavior");
  }
}

export async function writePhase2ProactivityNotificationArtifact(input: {
  report: Phase2ProactivityNotificationReport;
  artifactDir: string;
}): Promise<Phase2ProactivityNotificationArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-user-facing-proactivity-notification-ux",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 User-Facing Proactivity Notification UX",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- surface: ${input.report.notificationState.surface}`,
    `- visibleCount: ${input.report.telemetry.visibleCount}`,
    `- transcriptDeliveryStillAvailable: ${input.report.telemetry.transcriptDeliveryStillAvailable}`,
    `- notificationSurfaceIsTranscriptOnly: ${input.report.telemetry.notificationSurfaceIsTranscriptOnly}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
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
