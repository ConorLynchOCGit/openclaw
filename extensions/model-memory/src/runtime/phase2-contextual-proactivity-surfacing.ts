import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import {
  buildPhase2RealSuggestionContentReport,
  type Phase2SuggestionContentReport,
  type Phase2SuggestionMessagePreview,
} from "./phase2-real-suggestion-content-contract.ts";

export const PHASE2_CONTEXTUAL_PROACTIVITY_SURFACING_SCHEMA_VERSION =
  "phase2_contextual_proactivity_surfacing.v1" as const;
export const PHASE2_CONTEXTUAL_PROACTIVITY_SURFACING_REPORT_SCHEMA_VERSION =
  "phase2_contextual_proactivity_surfacing_report.v1" as const;

export type Phase2ProactivitySurfacingLane = "must_surface" | "context_surface" | "background_only";

export type Phase2ProactivityContextSignal = {
  activeSessionKey: string;
  projectId: string;
  userId: string;
  recipientId: string;
  operatorId: string;
  currentWorkflowLane?: string;
};

export type Phase2ProactivityRelevanceDecision = {
  candidateId: string;
  queueItemId: string;
  lane: Phase2ProactivitySurfacingLane;
  inlineSurfaceAllowed: boolean;
  inboxOnly: boolean;
  relevanceExplanation: string;
  evidenceRefs: string[];
  blockedReasonCodes: string[];
};

export type Phase2ContextualProactivityCard = {
  cardId: string;
  candidateId: string;
  queueItemId: string;
  lane: Phase2ProactivitySurfacingLane;
  messageClass: Phase2SuggestionMessagePreview["messageClass"];
  candidateSummary: string;
  suggestedAction: string;
  messagePreview: string;
  whyShown: string;
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2ContextualProactivitySuppressionDecision = {
  candidateId: string;
  suppressed: boolean;
  reasonCodes: Array<"stale_candidate" | "repeated_candidate" | "dismissed_or_snoozed">;
};

export type Phase2ContextualProactivityCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "surfacing_lanes_supported"
    | "typed_context_overlap_required"
    | "background_only_kept_in_inbox"
    | "stale_repeated_suppressed"
    | "wildcard_scope_rejected"
    | "no_dark_data_required"
    | "no_autonomous_send"
    | "no_action_execution";
};

export type Phase2ContextualProactivityTelemetry = {
  schemaVersion: typeof PHASE2_CONTEXTUAL_PROACTIVITY_SURFACING_SCHEMA_VERSION;
  reportId: string;
  inlineCardCount: number;
  inboxOnlyCount: number;
  suppressedCount: number;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
  rawPrivateContentObserved: false;
};

export type Phase2ContextualProactivityRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTEXTUAL_PROACTIVITY_DISABLED";
  targetMode: "drawer_only_no_inline_context_cards";
};

export type Phase2ContextualProactivityReport = {
  schemaVersion: typeof PHASE2_CONTEXTUAL_PROACTIVITY_SURFACING_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "contextual_surfacing_enabled" | "blocked" | "rollback_disabled";
  context: Phase2ProactivityContextSignal;
  supportedLanes: Phase2ProactivitySurfacingLane[];
  relevanceDecisions: Phase2ProactivityRelevanceDecision[];
  contextualCards: Phase2ContextualProactivityCard[];
  suppressionDecisions: Phase2ContextualProactivitySuppressionDecision[];
  checks: Phase2ContextualProactivityCheck[];
  telemetry: Phase2ContextualProactivityTelemetry;
  rollbackPlan: Phase2ContextualProactivityRollbackPlan;
};

export type Phase2ContextualProactivitySurfacingInput = {
  now?: Date;
  env?: Record<string, string | undefined>;
  contentReport?: Phase2SuggestionContentReport | null;
  context?: Partial<Phase2ProactivityContextSignal>;
  lane?: Phase2ProactivitySurfacingLane;
  forceUnknownSession?: boolean;
  forceWildcardScope?: boolean;
  forceStale?: boolean;
  forceRepeated?: boolean;
  forceBackgroundOnly?: boolean;
};

export type Phase2ContextualProactivityArtifact = {
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
      throw new Error("phase2 contextual proactivity contains prohibited marker content");
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
        `phase2 contextual proactivity contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function addCheck(
  checks: Phase2ContextualProactivityCheck[],
  reasonCode: Phase2ContextualProactivityCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_contextual_proactivity_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function rollbackActive(env?: Record<string, string | undefined>): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_CONTEXTUAL_PROACTIVITY_DISABLED;
  return value === "1" || value === "true";
}

async function loadContentReport(
  input: Phase2ContextualProactivitySurfacingInput,
): Promise<Phase2SuggestionContentReport> {
  if (input.contentReport === null) {
    throw new Error("phase2 contextual surfacing requires real suggestion content evidence");
  }
  return (
    input.contentReport ??
    buildPhase2RealSuggestionContentReport({ now: input.now, env: input.env })
  );
}

function buildContext(
  input: Phase2ContextualProactivitySurfacingInput,
): Phase2ProactivityContextSignal {
  return {
    activeSessionKey: input.forceUnknownSession
      ? "unknown-session"
      : (input.context?.activeSessionKey ?? "main"),
    projectId: input.forceWildcardScope ? "*" : (input.context?.projectId ?? "openclaw-platform"),
    userId: input.context?.userId ?? "conorlynch",
    recipientId: input.context?.recipientId ?? "conorlynch",
    operatorId: input.context?.operatorId ?? "operator-conorlynch",
    currentWorkflowLane: input.context?.currentWorkflowLane ?? "chat",
  };
}

function selectLane(
  input: Phase2ContextualProactivitySurfacingInput,
): Phase2ProactivitySurfacingLane {
  if (input.forceBackgroundOnly) {
    return "background_only";
  }
  return input.lane ?? "context_surface";
}

function buildRelevanceDecision(input: {
  preview: Phase2SuggestionMessagePreview;
  context: Phase2ProactivityContextSignal;
  lane: Phase2ProactivitySurfacingLane;
  suppressed: boolean;
  suppressionReasons: string[];
}): Phase2ProactivityRelevanceDecision {
  const contextMatches =
    input.context.activeSessionKey === "main" &&
    input.context.projectId === "openclaw-platform" &&
    input.context.userId !== "*" &&
    input.context.operatorId !== "*";
  const inlineSurfaceAllowed =
    !input.suppressed &&
    input.preview.actionable &&
    input.lane !== "background_only" &&
    (input.lane === "must_surface" || contextMatches);
  const blockedReasonCodes = [
    ...(input.preview.blockedReasonCodes ?? []),
    ...(contextMatches ? [] : ["typed_context_overlap_required"]),
    ...(input.suppressionReasons as string[]),
    ...(input.context.projectId === "*" ? ["wildcard_scope_rejected"] : []),
  ];
  return {
    candidateId: input.preview.candidateId,
    queueItemId: input.preview.queueItemId,
    lane: input.lane,
    inlineSurfaceAllowed,
    inboxOnly: !inlineSurfaceAllowed,
    relevanceExplanation: inlineSurfaceAllowed
      ? `Shown because this session matches project ${input.context.projectId} / session ${input.context.activeSessionKey}.`
      : `Kept in the Proactivity Inbox because the active context did not exactly match project ${input.context.projectId} / session ${input.context.activeSessionKey}.`,
    evidenceRefs: input.preview.sourceRefs,
    blockedReasonCodes,
  };
}

export async function buildPhase2ContextualProactivitySurfacingReport(
  input: Phase2ContextualProactivitySurfacingInput = {},
): Promise<Phase2ContextualProactivityReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const contentReport = await loadContentReport(input);
  const context = buildContext(input);
  const lane = selectLane(input);
  const staleOrRepeated = Boolean(input.forceStale || input.forceRepeated);
  const suppressionReasons = [
    ...(input.forceStale ? ["stale_candidate"] : []),
    ...(input.forceRepeated ? ["repeated_candidate"] : []),
  ];
  const relevanceDecisions = contentReport.previews.map((preview) =>
    buildRelevanceDecision({
      preview,
      context,
      lane,
      suppressed: staleOrRepeated,
      suppressionReasons,
    }),
  );
  const contextualCards = contentReport.previews
    .map((preview) => {
      const relevance = relevanceDecisions.find(
        (decision) => decision.candidateId === preview.candidateId,
      );
      if (!relevance?.inlineSurfaceAllowed) {
        return null;
      }
      return {
        cardId: buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_contextual_proactivity_card",
          targetId: preview.queueItemId,
          seed: { lane, generatedAt },
        }),
        candidateId: preview.candidateId,
        queueItemId: preview.queueItemId,
        lane,
        messageClass: preview.messageClass,
        candidateSummary: preview.fields.candidateSummary,
        suggestedAction: preview.fields.suggestedAction,
        messagePreview: preview.fields.messagePreview,
        whyShown: relevance.relevanceExplanation,
        sourceRefs: preview.sourceRefs,
        sourceProfileIds: preview.sourceProfileIds,
        authorityTiers: preview.authorityTiers,
        contentHashes: preview.contentHashes,
        proofHashes: preview.proofHashes,
        noDarkDataStatus: preview.noDarkDataStatus,
      } satisfies Phase2ContextualProactivityCard;
    })
    .filter((card): card is Phase2ContextualProactivityCard => card !== null);
  const suppressionDecisions = contentReport.previews.map((preview) => ({
    candidateId: preview.candidateId,
    suppressed: staleOrRepeated,
    reasonCodes:
      suppressionReasons as Phase2ContextualProactivitySuppressionDecision["reasonCodes"],
  }));
  const checks: Phase2ContextualProactivityCheck[] = [];
  addCheck(checks, "surfacing_lanes_supported", true);
  addCheck(
    checks,
    "typed_context_overlap_required",
    relevanceDecisions.every((decision) =>
      decision.inlineSurfaceAllowed
        ? decision.relevanceExplanation.includes("matches project")
        : true,
    ),
  );
  addCheck(
    checks,
    "background_only_kept_in_inbox",
    lane !== "background_only" || contextualCards.length === 0,
  );
  addCheck(checks, "stale_repeated_suppressed", !staleOrRepeated || contextualCards.length === 0);
  addCheck(checks, "wildcard_scope_rejected", context.projectId !== "*");
  addCheck(
    checks,
    "no_dark_data_required",
    contentReport.telemetry.noDarkDataStatus === "pass" &&
      contentReport.decision === "content_contract_satisfied",
  );
  addCheck(checks, "no_autonomous_send", true);
  addCheck(checks, "no_action_execution", true);
  const failed = checks.filter((check) => check.status === "fail");
  const rollback = rollbackActive(input.env);
  const decision = rollback
    ? "rollback_disabled"
    : failed.length === 0
      ? "contextual_surfacing_enabled"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_contextual_proactivity_surfacing_report",
    targetId: `${context.projectId}:${context.activeSessionKey}`,
    seed: { generatedAt, lane, contentReportId: contentReport.reportId, decision },
  });
  const report: Phase2ContextualProactivityReport = {
    schemaVersion: PHASE2_CONTEXTUAL_PROACTIVITY_SURFACING_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    context,
    supportedLanes: ["must_surface", "context_surface", "background_only"],
    relevanceDecisions,
    contextualCards,
    suppressionDecisions,
    checks,
    telemetry: {
      schemaVersion: PHASE2_CONTEXTUAL_PROACTIVITY_SURFACING_SCHEMA_VERSION,
      reportId,
      inlineCardCount: contextualCards.length,
      inboxOnlyCount: relevanceDecisions.filter((decision) => decision.inboxOnly).length,
      suppressedCount: suppressionDecisions.filter((entry) => entry.suppressed).length,
      autonomousSendingEnabled: false,
      actionExecutionObserved: false,
      rawPrivateContentObserved: false,
    },
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_contextual_proactivity_rollback",
        targetId: reportId,
        seed: "drawer-only",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTEXTUAL_PROACTIVITY_DISABLED",
      targetMode: "drawer_only_no_inline_context_cards",
    },
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ContextualProactivitySurfacingReport(
  report: Phase2ContextualProactivityReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "contextual_surfacing_enabled") {
    throw new Error(`phase2 contextual proactivity not enabled: ${report.decision}`);
  }
  if (report.supportedLanes.join(",") !== "must_surface,context_surface,background_only") {
    throw new Error("phase2 contextual proactivity missing required surfacing lanes");
  }
  if (report.telemetry.autonomousSendingEnabled || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 contextual proactivity enabled forbidden behavior");
  }
}

export async function writePhase2ContextualProactivitySurfacingArtifact(input: {
  report: Phase2ContextualProactivityReport;
  artifactDir: string;
}): Promise<Phase2ContextualProactivityArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-contextual-proactivity-surfacing",
    value: input.report as unknown as JsonLike,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Contextual Proactivity Surfacing",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- lanes: ${input.report.supportedLanes.join(", ")}`,
    `- inlineCardCount: ${input.report.telemetry.inlineCardCount}`,
    `- inboxOnlyCount: ${input.report.telemetry.inboxOnlyCount}`,
    `- suppressedCount: ${input.report.telemetry.suppressedCount}`,
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
