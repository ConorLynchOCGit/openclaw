import { createHash } from "node:crypto";
import { buildPhase2LiveProactivityDetectionReport } from "../../../extensions/model-memory/src/runtime/phase2-live-proactivity-signals.js";
import type {
  Phase2LiveProactivitySignalKind,
  Phase2LiveProactivitySignalSource,
  Phase2LiveProactivitySignalSourceType,
} from "../../../extensions/model-memory/src/runtime/phase2-live-proactivity-signals.js";
import { buildPhase2PersonalAutoSendProductUxReport } from "../../../extensions/model-memory/src/runtime/phase2-personal-autosend-product-ux.js";
import { buildPhase2ProactivityInboxReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-inbox.js";
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
      const sourceId = `system-event-${sha256({
        sessionKey,
        projectId,
        ts: event.ts,
        contextKey: event.contextKey ?? null,
        summary,
      }).slice(0, 16)}`;
      const sourceRef = `gateway://system-events/${sessionKey}/${sourceId}`;
      return {
        sourceId,
        sourceType: "session_runtime_event",
        signalKind: "active_work_state",
        projectId,
        sessionKey,
        boundedSummary: summary,
        sourceRefs: [sourceRef],
        sourceProfileId: event.trusted === false ? "daily_continuity" : "tool_result_capture",
        authorityTier: event.trusted === false ? "cited_soft" : "tool_grounded",
        contentHash: sha256({ sourceId, summary, index }),
        proofHash: sha256({ sourceRef, sessionKey, projectId }),
        freshness: "recent",
        conflictState: "clear",
        inspectionOnly: false,
        noDarkDataStatus: "pass",
        limitations: ["bounded_system_event_summary_only"],
      };
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

export const modelMemoryProactivityHandlers: GatewayRequestHandlers = {
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
      const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
        sources: eventsForScope(projectId, sessionKey),
        env: process.env,
      });
      const report = await buildPhase2ProductProactivitySurfacingReport({
        eligibilityScope: {
          userId:
            readString(params.userId) ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user",
          recipientId:
            readString(params.recipientId) ??
            process.env.OPENCLAW_RECIPIENT_ID ??
            process.env.OPENCLAW_USER_ID ??
            "local-openclaw-recipient",
          projectId,
          sessionKey,
          operatorId,
        },
        liveDetectionReport,
        env: process.env,
      });
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        config: report.config,
        liveDetectionReport: {
          reportId: liveDetectionReport.reportId,
          decision: liveDetectionReport.decision,
          telemetry: liveDetectionReport.telemetry,
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
      const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
        sources: eventsForScope(projectId, sessionKey),
        env: process.env,
      });
      const productSurfacingReport = await buildPhase2ProductProactivitySurfacingReport({
        eligibilityScope: {
          userId:
            readString(params.userId) ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user",
          recipientId:
            readString(params.recipientId) ??
            process.env.OPENCLAW_RECIPIENT_ID ??
            process.env.OPENCLAW_USER_ID ??
            "local-openclaw-recipient",
          projectId,
          sessionKey,
          operatorId,
        },
        liveDetectionReport,
        env: process.env,
      });
      const report = await buildPhase2ProactivityInboxReport({
        env: process.env,
        productSurfacingReport,
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
