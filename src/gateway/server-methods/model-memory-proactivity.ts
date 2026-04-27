import { createHash } from "node:crypto";
import { buildPhase2LiveProactivityDetectionReport } from "../../../extensions/model-memory/src/runtime/phase2-live-proactivity-signals.js";
import type {
  Phase2LiveProactivitySignalKind,
  Phase2LiveProactivitySignalSource,
  Phase2LiveProactivitySignalSourceType,
} from "../../../extensions/model-memory/src/runtime/phase2-live-proactivity-signals.js";
import {
  classifySystemEventForProactivity,
  convertCoverageSourceToLiveSignalSource,
  type Phase2LiveSignalCoverageSource,
} from "../../../extensions/model-memory/src/runtime/phase2-live-signal-coverage-expansion.js";
import { buildPhase2PersonalAutoSendProductUxReport } from "../../../extensions/model-memory/src/runtime/phase2-personal-autosend-product-ux.js";
import { buildPhase2ProactivityAutonomousInternalDraftingReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-autonomous-internal-drafting.js";
import { buildPhase2ProactivityInboxReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-inbox.js";
import {
  buildPhase2ProactivityOpportunityExtractionReport,
  type Phase2OpportunityExtractionSource,
  type Phase2OpportunityExtractionSourceKind,
} from "../../../extensions/model-memory/src/runtime/phase2-proactivity-opportunity-extraction.js";
import {
  buildPhase2ProactivityOpportunityLedgerReport,
  type Phase2OpportunityLedgerLifecycleOverride,
  type Phase2OpportunityLedgerSource,
} from "../../../extensions/model-memory/src/runtime/phase2-proactivity-opportunity-ledger.js";
import { buildPhase2ProactivityOutcomeFollowupReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-outcome-followup-loop.js";
import { buildPhase2ProactivityRecurringPatternReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-recurring-pattern-loop.js";
import { buildPhase2ProactivityNoiseBudgetReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-signal-noise-budget.js";
import { buildPhase2ProactivityUxRemediationReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-ux-remediation.js";
import { buildPhase2ProductProactivitySurfacingReport } from "../../../extensions/model-memory/src/runtime/phase2-product-proactivity-surfacing.js";
import { getLastHeartbeatEvent } from "../../infra/heartbeat-events.js";
import { peekSystemEventEntries } from "../../infra/system-events.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveOperatorId(params: Record<string, unknown>, clientId: string | undefined): string {
  return readString(params.operatorId) ?? clientId ?? process.env.USER ?? "local-openclaw-operator";
}

type RecordedLiveProactivityEvent = Phase2LiveProactivitySignalSource & {
  recordedAt: string;
};

const liveProactivityEvents: RecordedLiveProactivityEvent[] = [];
const MAX_LIVE_PROACTIVITY_EVENTS = 50;

type RecordedChatActivity = Phase2OpportunityExtractionSource & {
  recordedAt: string;
};

const chatActivitySources: RecordedChatActivity[] = [];
const MAX_CHAT_ACTIVITY_SOURCES = 200;

type StoredLifecycleOverride = Phase2OpportunityLedgerLifecycleOverride & {
  projectId: string;
  sessionKey: string;
};

const opportunityLifecycleOverrides = new Map<string, StoredLifecycleOverride>();

function readSignalKind(value: unknown): Phase2LiveProactivitySignalKind {
  const kind = readString(value);
  if (
    kind === "active_work_state" ||
    kind === "unresolved_question" ||
    kind === "recent_failure" ||
    kind === "repeated_friction" ||
    kind === "incomplete_follow_up" ||
    kind === "stale_decision" ||
    kind === "maintenance_candidate" ||
    kind === "project_state_capsule" ||
    kind === "recent_memory_update" ||
    kind === "session_event"
  ) {
    return kind;
  }
  return "session_event";
}

function readSourceType(value: unknown): Phase2LiveProactivitySignalSourceType {
  const type = readString(value);
  if (
    type === "ordinary_turn_capture" ||
    type === "session_runtime_event" ||
    type === "task_or_queue_state" ||
    type === "maintenance_loop_output" ||
    type === "project_state_capsule" ||
    type === "derived_memory_artifact" ||
    type === "operator_feedback_event" ||
    type === "gateway_delivery_or_error_event"
  ) {
    return type;
  }
  return "session_runtime_event";
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundedSummary(value: unknown): string {
  const summary = readString(value) ?? "A bounded OpenClaw runtime event is ready for review.";
  return summary.replace(/\s+/gu, " ").slice(0, 480).trim();
}

function boundedMultilineSummary(value: unknown): string {
  const raw = readString(value) ?? "A bounded OpenClaw chat activity is ready for review.";
  return raw
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 480)
    .trim();
}

function isSafeBoundedSummary(value: string): boolean {
  const lower = value.toLowerCase();
  return !(
    lower.includes("raw-prompt-marker") ||
    lower.includes("raw-transcript-marker") ||
    lower.includes("raw-tool-log-marker") ||
    lower.includes("secret-marker") ||
    lower.includes("private-phrase-marker")
  );
}

function readSourceKind(value: unknown): Phase2OpportunityExtractionSourceKind {
  const kind = readString(value);
  if (
    kind === "assistant_turn" ||
    kind === "planning_output" ||
    kind === "user_turn" ||
    kind === "system_followup"
  ) {
    return kind;
  }
  return "assistant_turn";
}

function eventsForScope(
  projectId: string,
  sessionKey: string,
): Phase2LiveProactivitySignalSource[] {
  const recordedSources = liveProactivityEvents
    .filter((event) => event.projectId === projectId && event.sessionKey === sessionKey)
    .slice(-10);
  const systemEventSources = peekSystemEventEntries(sessionKey)
    .slice(-5)
    .filter((event) => isSafeBoundedSummary(boundedSummary(event.text)))
    .map((event, index): Phase2LiveProactivitySignalSource => {
      const summary = boundedSummary(event.text);
      const classification = classifySystemEventForProactivity({
        text: summary,
        contextKey: event.contextKey,
      });
      const sourceId = `system-event-${sha256({
        sessionKey,
        projectId,
        ts: event.ts,
        contextKey: event.contextKey ?? null,
        summary,
      }).slice(0, 16)}`;
      const sourceRef = `gateway://system-events/${sessionKey}/${classification.seam}/${sourceId}`;
      const coverageSource: Phase2LiveSignalCoverageSource = {
        sourceId,
        seam: classification.seam,
        reasonCode: classification.reasonCode,
        projectId,
        sessionKey,
        boundedSummary: summary,
        sourceRefs: [sourceRef],
        sourceProfileId:
          classification.seam === "ordinary_chat_turn"
            ? "explicit_user_turn"
            : event.trusted === false
              ? "daily_continuity"
              : "tool_result_capture",
        authorityTier:
          classification.seam === "ordinary_chat_turn"
            ? "user_authoritative"
            : event.trusted === false
              ? "cited_soft"
              : "tool_grounded",
        contentHash: sha256({ sourceId, summary, index }),
        proofHash: sha256({ sourceRef, sessionKey, projectId }),
        freshness: "recent",
        conflictState: "clear",
      };
      return convertCoverageSourceToLiveSignalSource(coverageSource);
    });
  const heartbeat = getLastHeartbeatEvent();
  const heartbeatSummary = heartbeat
    ? boundedSummary(
        heartbeat.preview ??
          heartbeat.reason ??
          `Heartbeat ${heartbeat.status.replace(/-/g, " ")} for current OpenClaw session.`,
      )
    : null;
  const heartbeatSources: Phase2LiveProactivitySignalSource[] =
    heartbeat && heartbeatSummary && isSafeBoundedSummary(heartbeatSummary)
      ? [
          {
            sourceId: `heartbeat-${sha256({
              ts: heartbeat.ts,
              status: heartbeat.status,
              preview: heartbeat.preview ?? "",
              reason: heartbeat.reason ?? "",
              sessionKey,
            }).slice(0, 16)}`,
            sourceType:
              heartbeat.status === "failed"
                ? "gateway_delivery_or_error_event"
                : "session_runtime_event",
            signalKind: heartbeat.status === "failed" ? "recent_failure" : "session_event",
            projectId,
            sessionKey,
            boundedSummary: heartbeatSummary,
            sourceRefs: [`gateway://heartbeat/last/${heartbeat.ts}`],
            sourceProfileId: "daily_continuity",
            authorityTier: "cited_soft",
            contentHash: sha256({ heartbeat, projectId, sessionKey }),
            proofHash: sha256({ ts: heartbeat.ts, status: heartbeat.status, sessionKey }),
            freshness: "recent",
            conflictState: "clear",
            inspectionOnly: false,
            noDarkDataStatus: "pass",
            limitations: ["bounded_heartbeat_event_summary_only"],
          },
        ]
      : [];
  return [...recordedSources, ...systemEventSources, ...heartbeatSources].slice(-10);
}

function chatActivitiesForScope(
  projectId: string,
  sessionKey: string,
): Phase2OpportunityExtractionSource[] {
  return chatActivitySources
    .filter((source) => source.projectId === projectId && source.sessionKey === sessionKey)
    .slice(-40);
}

function lifecycleOverridesForScope(projectId: string, sessionKey: string) {
  return [...opportunityLifecycleOverrides.values()].filter(
    (override) => override.projectId === projectId && override.sessionKey === sessionKey,
  );
}

async function buildGeneratorResetProactivityState(params: {
  projectId: string;
  sessionKey: string;
  operatorId: string;
  userId: string;
  recipientId: string;
}) {
  const eligibleSources = (
    await buildPhase2ProactivityNoiseBudgetReport({
      sources: eventsForScope(params.projectId, params.sessionKey),
      env: process.env,
    })
  ).eligibleSources;
  const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
    sources: eligibleSources,
    env: process.env,
  });
  const extractionSources = chatActivitiesForScope(params.projectId, params.sessionKey);
  const extractionReport = await buildPhase2ProactivityOpportunityExtractionReport({
    sources: extractionSources,
    env: process.env,
  });
  const recurringPatternReport = await buildPhase2ProactivityRecurringPatternReport({
    sources: extractionSources,
    env: process.env,
  });
  const ledgerSources: Phase2OpportunityLedgerSource[] = [
    ...liveDetectionReport.opportunities.map((opportunity) => ({
      ...opportunity,
      sourceFamily: "live_signal" as const,
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      generatedAt: new Date().toISOString(),
    })),
    ...extractionReport.candidates.map((candidate) => ({
      ...candidate,
      sourceFamily: "assistant_output" as const,
    })),
    ...recurringPatternReport.opportunities.map((opportunity) => ({
      ...opportunity,
      sourceFamily: "pattern_or_followup" as const,
      generatedAt: new Date().toISOString(),
    })),
  ];
  const ledgerReport = await buildPhase2ProactivityOpportunityLedgerReport({
    repoRoot: process.cwd(),
    opportunities: ledgerSources,
    activitySources: extractionSources,
    lifecycleOverrides: lifecycleOverridesForScope(params.projectId, params.sessionKey),
    env: process.env,
  });
  const followupReport = await buildPhase2ProactivityOutcomeFollowupReport({
    entries: ledgerReport.ledger.entries,
    env: process.env,
  });
  const effectiveLedgerReport =
    followupReport.decisions.length === 0
      ? ledgerReport
      : {
          ...ledgerReport,
          ledger: {
            ...ledgerReport.ledger,
            entries: ledgerReport.ledger.entries.map((entry) => {
              const decision = followupReport.decisions.find(
                (candidate) => candidate.opportunityId === entry.opportunityId,
              );
              return decision
                ? {
                    ...entry,
                    status: decision.nextStatus,
                    updatedAt: new Date().toISOString(),
                  }
                : entry;
            }),
          },
        };
  const topDraftEntries = effectiveLedgerReport.ledger.entries
    .filter(
      (entry) =>
        entry.status === "open" ||
        entry.status === "surfaced" ||
        entry.status === "planning_started",
    )
    .toSorted(
      (left, right) =>
        Number(right.attentionRequired) - Number(left.attentionRequired) ||
        right.generatedAt.localeCompare(left.generatedAt),
    )
    .slice(0, 3);
  const draftReport = await buildPhase2ProactivityAutonomousInternalDraftingReport({
    topEntries: topDraftEntries,
    env: process.env,
  });
  const productSurfacingReport = await buildPhase2ProductProactivitySurfacingReport({
    eligibilityScope: {
      userId: params.userId,
      recipientId: params.recipientId,
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      operatorId: params.operatorId,
    },
    liveDetectionReport,
    ledgerReport: effectiveLedgerReport,
    draftReport,
    env: process.env,
  });
  return {
    liveDetectionReport,
    extractionReport,
    recurringPatternReport,
    ledgerReport: effectiveLedgerReport,
    followupReport,
    draftReport,
    productSurfacingReport,
  };
}

export const modelMemoryProactivityHandlers: GatewayRequestHandlers = {
  "modelMemory.proactivity.recordChatActivity": async ({ params, respond }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    const boundedText = boundedMultilineSummary(params.boundedText);
    const sourceKind = readSourceKind(params.sourceKind);
    const sourceMessageId =
      readString(params.sourceMessageId) ??
      `chat-message-${sha256({ sessionKey, projectId, sourceKind, boundedText }).slice(0, 16)}`;
    const sourceRunId = readString(params.sourceRunId);
    const sourceId =
      readString(params.sourceId) ??
      `chat-activity-${sha256({ projectId, sessionKey, sourceKind, sourceMessageId }).slice(0, 16)}`;
    const sourceRef = `chat://${sessionKey}/${sourceKind}/${sourceMessageId}`;
    const source: RecordedChatActivity = {
      sourceId,
      sourceKind,
      sourceMessageId,
      sourceRunId,
      projectId,
      sessionKey,
      boundedText,
      userPromptSummary: readString(params.userPromptSummary),
      sourceRefs: [sourceRef],
      sourceProfileId: sourceKind === "user_turn" ? "explicit_user_turn" : "manual_note",
      authorityTier: sourceKind === "user_turn" ? "user_authoritative" : "tool_grounded",
      contentHash: sha256({ sourceMessageId, boundedText, sourceKind, projectId, sessionKey }),
      proofHash: sha256({ sourceRef, sourceRunId, sourceKind }),
      noDarkDataStatus: "pass",
      recordedAt: new Date().toISOString(),
    };
    chatActivitySources.push(source);
    if (chatActivitySources.length > MAX_CHAT_ACTIVITY_SOURCES) {
      chatActivitySources.splice(0, chatActivitySources.length - MAX_CHAT_ACTIVITY_SOURCES);
    }
    respond(true, {
      ok: true,
      sourceId,
      sourceMessageId,
      sourceKind,
      sourceRef,
    });
  },
  "modelMemory.proactivity.updateOpportunityState": async ({ params, respond }) => {
    const opportunityId = readString(params.opportunityId);
    const status = readString(params.status);
    if (!opportunityId || !status) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid opportunity state update params"),
      );
      return;
    }
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    const sessionKey = readString(params.sessionKey) ?? "main";
    opportunityLifecycleOverrides.set(opportunityId, {
      opportunityId,
      projectId,
      sessionKey,
      status: status as StoredLifecycleOverride["status"],
      updatedAt: new Date().toISOString(),
      resolvedByChatMessageId: readString(params.resolvedByChatMessageId) ?? null,
      supersededByOpportunityId: readString(params.supersededByOpportunityId) ?? null,
    });
    respond(true, { ok: true, opportunityId, status });
  },
  "modelMemory.proactivity.recordLiveEvent": async ({ params, respond }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    const summary = boundedSummary(params.boundedSummary);
    const sourceType = readSourceType(params.sourceType);
    const signalKind = readSignalKind(params.signalKind);
    const sourceId =
      readString(params.sourceId) ??
      `gateway-live-event-${sha256({ projectId, sessionKey, sourceType, signalKind, summary }).slice(0, 16)}`;
    const sourceRef = `gateway://model-memory/proactivity/live-event/${sourceId}`;
    const event: RecordedLiveProactivityEvent = {
      sourceId,
      sourceType,
      signalKind,
      projectId,
      sessionKey,
      boundedSummary: summary,
      sourceRefs: [sourceRef],
      sourceProfileId:
        sourceType === "ordinary_turn_capture" ? "explicit_user_turn" : "manual_note",
      authorityTier:
        sourceType === "ordinary_turn_capture" ? "user_authoritative" : "tool_grounded",
      contentHash: sha256({ sourceId, projectId, sessionKey, sourceType, signalKind, summary }),
      proofHash: sha256({ sourceRef, sourceId, signalKind }),
      freshness: "recent",
      conflictState: "clear",
      inspectionOnly: false,
      noDarkDataStatus: "pass",
      limitations: ["bounded_runtime_event_summary_only"],
      recordedAt: new Date().toISOString(),
    };
    liveProactivityEvents.push(event);
    if (liveProactivityEvents.length > MAX_LIVE_PROACTIVITY_EVENTS) {
      liveProactivityEvents.splice(0, liveProactivityEvents.length - MAX_LIVE_PROACTIVITY_EVENTS);
    }
    respond(true, {
      ok: true,
      sourceId: event.sourceId,
      sourceRef,
      signalKind: event.signalKind,
      sourceType: event.sourceType,
      projectId,
      sessionKey,
    });
  },
  "modelMemory.proactivity.queue": async ({ params, respond, client }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const operatorId = resolveOperatorId(params, client?.connect?.device?.id);
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    try {
      const userId =
        readString(params.userId) ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user";
      const recipientId =
        readString(params.recipientId) ??
        process.env.OPENCLAW_RECIPIENT_ID ??
        process.env.OPENCLAW_USER_ID ??
        "local-openclaw-recipient";
      const state = await buildGeneratorResetProactivityState({
        sessionKey,
        projectId,
        operatorId,
        userId,
        recipientId,
      });
      const report = state.productSurfacingReport;
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        config: report.config,
        liveDetectionReport: {
          reportId: state.liveDetectionReport.reportId,
          decision: state.liveDetectionReport.decision,
          telemetry: state.liveDetectionReport.telemetry,
        },
        extractionReport: {
          reportId: state.extractionReport.reportId,
          decision: state.extractionReport.decision,
          candidateCount: state.extractionReport.telemetry.candidateCount,
        },
        ledgerReport: {
          reportId: state.ledgerReport.reportId,
          decision: state.ledgerReport.decision,
          entryCount: state.ledgerReport.telemetry.entryCount,
        },
        draftReport: {
          reportId: state.draftReport.reportId,
          decision: state.draftReport.decision,
          draftCount: state.draftReport.telemetry.draftCount,
        },
        queue: report.queue,
        rollbackPlan: report.rollbackPlan,
        telemetry: report.telemetry,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory proactivity queue unavailable: ${message}`,
        ),
      );
    }
  },
  "modelMemory.proactivity.personalAutosendUx": async ({ params, respond }) => {
    try {
      const report = await buildPhase2PersonalAutoSendProductUxReport({
        env: process.env,
        userDisabled: params.userDisabled === true,
      });
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        settings: report.settings,
        telemetry: report.telemetry,
        rollbackPlan: report.rollbackPlan,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory personal autosend UX unavailable: ${message}`,
        ),
      );
    }
  },
  "modelMemory.proactivity.inbox": async ({ params, respond, client }) => {
    try {
      const sessionKey = readString(params.sessionKey) ?? "main";
      const operatorId = resolveOperatorId(params, client?.connect?.device?.id);
      const projectId =
        readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
      const userId =
        readString(params.userId) ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user";
      const recipientId =
        readString(params.recipientId) ??
        process.env.OPENCLAW_RECIPIENT_ID ??
        process.env.OPENCLAW_USER_ID ??
        "local-openclaw-recipient";
      const state = await buildGeneratorResetProactivityState({
        sessionKey,
        projectId,
        operatorId,
        userId,
        recipientId,
      });
      const report = await buildPhase2ProactivityInboxReport({
        env: process.env,
        productSurfacingReport: state.productSurfacingReport,
      });
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        state: report.state,
        digest: report.digest,
        telemetry: report.telemetry,
        rollbackPlan: report.rollbackPlan,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory proactivity inbox unavailable: ${message}`,
        ),
      );
    }
  },
  "modelMemory.proactivity.uxRemediation": async ({ respond }) => {
    try {
      const report = await buildPhase2ProactivityUxRemediationReport({ env: process.env });
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        entryPoint: report.entryPoint,
        drawer: report.drawer,
        telemetry: report.telemetry,
        rollbackPlan: report.rollbackPlan,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory proactivity UX remediation unavailable: ${message}`,
        ),
      );
    }
  },
};
