import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPhase2HeartbeatProactivityReliabilityReport,
  type Phase2HeartbeatProactivityReport,
} from "../../extensions/model-memory/src/runtime/phase2-heartbeat-proactivity-reliability.js";
import {
  buildPhase2LiveProactivityDetectionReport,
  type Phase2LiveProactivitySignalSource,
} from "../../extensions/model-memory/src/runtime/phase2-live-proactivity-signals.js";
import {
  classifySystemEventForProactivity,
  convertCoverageSourceToLiveSignalSource,
  type Phase2LiveSignalCoverageSource,
} from "../../extensions/model-memory/src/runtime/phase2-live-signal-coverage-expansion.js";
import {
  buildPhase2ProactivityAutonomousInternalDraftingReport,
  type Phase2AutonomousDraftReport,
} from "../../extensions/model-memory/src/runtime/phase2-proactivity-autonomous-internal-drafting.js";
import { buildPhase2ProactivityInboxReport } from "../../extensions/model-memory/src/runtime/phase2-proactivity-inbox.js";
import {
  buildPhase2ProactivityOpportunityExtractionReport,
  type Phase2OpportunityExtractionSourceKind,
} from "../../extensions/model-memory/src/runtime/phase2-proactivity-opportunity-extraction.js";
import {
  buildPhase2ProactivityOpportunityLedgerReport,
  type Phase2OpportunityLedgerLifecycleOverride,
  type Phase2OpportunityLedgerReport,
  type Phase2OpportunityLedgerSource,
} from "../../extensions/model-memory/src/runtime/phase2-proactivity-opportunity-ledger.js";
import { buildPhase2ProactivityOutcomeFollowupReport } from "../../extensions/model-memory/src/runtime/phase2-proactivity-outcome-followup-loop.js";
import { buildPhase2ProactivityRecurringPatternReport } from "../../extensions/model-memory/src/runtime/phase2-proactivity-recurring-pattern-loop.js";
import { buildPhase2ProactivityNoiseBudgetReport } from "../../extensions/model-memory/src/runtime/phase2-proactivity-signal-noise-budget.js";
import { buildPhase2ProductProactivitySurfacingReport } from "../../extensions/model-memory/src/runtime/phase2-product-proactivity-surfacing.js";
import type {
  SourceAuthorityTier,
  SourceProfileId,
} from "../../extensions/model-memory/src/source-authority.js";
import { loadConfig } from "../config/config.js";
import { loadSessionStore } from "../config/sessions/store-load.js";
import {
  resolveFreshestSessionEntryFromStoreKeys,
  resolveGatewaySessionStoreTarget,
  readSessionMessages,
} from "../gateway/session-utils.js";
import {
  extractFirstTextBlock,
  extractAssistantVisibleText,
  parseAssistantTextSignature,
} from "../shared/chat-message-content.js";
import { getLastHeartbeatEvent } from "./heartbeat-events.js";
import { peekSystemEventEntries } from "./system-events.js";

export type Phase2PersistedProactivityActivityRecord = {
  sourceId: string;
  sourceKind: Phase2OpportunityExtractionSourceKind;
  sourceMessageId: string;
  sourceRunId?: string;
  projectId: string;
  sessionKey: string;
  boundedText: string;
  userPromptSummary?: string;
  sourceRefs: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash?: string;
  proofHash?: string;
  noDarkDataStatus?: "pass" | "fail";
  recordedAt: string;
  updatedAt: string;
  sourceLabel: "authoritative_transcript" | "ui_callback";
};

export type Phase2ProactivityAuthoritativeCaptureSource = {
  sessionKey: string;
  projectId: string;
  sourceMessageId: string;
  sourceRunId?: string;
  boundedText: string;
  userPromptSummary?: string;
  sourceRefs: string[];
};

export type Phase2ProactivityActivityStore = {
  schemaVersion: "phase2_proactivity_activity_store.v1";
  records: Phase2PersistedProactivityActivityRecord[];
  liveEvents: Array<
    Phase2LiveProactivitySignalSource & {
      recordedAt: string;
      updatedAt: string;
    }
  >;
  lifecycleOverrides: Array<
    Phase2OpportunityLedgerLifecycleOverride & {
      projectId: string;
      sessionKey: string;
      updatedAt: string;
    }
  >;
  authoritativeSyncBySessionKey: Record<string, string>;
};

export type Phase2ProactivityActivityStoreDecision =
  | "activity_store_ready"
  | "activity_store_updated"
  | "rollback_disabled";

export type Phase2ProactivityActivityStoreTelemetry = {
  schemaVersion: Phase2ProactivityActivityStore["schemaVersion"];
  recordCount: number;
  overrideCount: number;
  sessionCount: number;
};

export type Phase2ProactivityActivityStoreRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_ACTIVITY_STORE_DISABLED";
  targetMode: "ui_callback_only";
};

export type Phase2ProactivityActivityStoreCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "bounded_records_only"
    | "deterministic_ids_required"
    | "provenance_required"
    | "no_dark_data_required";
};

export type Phase2ProactivityActivityStoreReport = {
  decision: Phase2ProactivityActivityStoreDecision;
  storePath: string;
  store: Phase2ProactivityActivityStore;
  telemetry: Phase2ProactivityActivityStoreTelemetry;
  rollbackPlan: Phase2ProactivityActivityStoreRollbackPlan;
  checks: Phase2ProactivityActivityStoreCheck[];
};

type GatewayProactivityBuildInput = {
  sessionKey: string;
  projectId: string;
  operatorId: string;
  userId: string;
  recipientId: string;
  cfg?: ReturnType<typeof loadConfig>;
};

type GatewayProactivityBuildState = {
  activityStoreReport: Phase2ProactivityActivityStoreReport;
  liveDetectionReport: Awaited<ReturnType<typeof buildPhase2LiveProactivityDetectionReport>>;
  extractionReport: Awaited<ReturnType<typeof buildPhase2ProactivityOpportunityExtractionReport>>;
  recurringPatternReport: Awaited<ReturnType<typeof buildPhase2ProactivityRecurringPatternReport>>;
  ledgerReport: Phase2OpportunityLedgerReport;
  followupReport: Awaited<ReturnType<typeof buildPhase2ProactivityOutcomeFollowupReport>>;
  draftReport: Phase2AutonomousDraftReport;
  productSurfacingReport: Awaited<ReturnType<typeof buildPhase2ProductProactivitySurfacingReport>>;
  heartbeatReport: Phase2HeartbeatProactivityReport;
};

const ACTIVITY_STORE_SCHEMA_VERSION = "phase2_proactivity_activity_store.v1" as const;
const MAX_ACTIVITY_RECORDS = 400;
const MAX_LIVE_EVENTS = 120;
const MAX_LIFECYCLE_OVERRIDES = 200;
const PROACTIVITY_STORE_FILE = "model-memory-proactivity-state.json";

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function resolveProactivityStorePath(storePath: string): string {
  return path.join(path.dirname(storePath), PROACTIVITY_STORE_FILE);
}

async function loadActivityStore(storePath: string): Promise<Phase2ProactivityActivityStore> {
  try {
    const raw = await fs.readFile(resolveProactivityStorePath(storePath), "utf8");
    const parsed = JSON.parse(raw) as Phase2ProactivityActivityStore;
    if (
      parsed?.schemaVersion === ACTIVITY_STORE_SCHEMA_VERSION &&
      Array.isArray(parsed.records) &&
      Array.isArray(parsed.lifecycleOverrides)
    ) {
      return {
        schemaVersion: ACTIVITY_STORE_SCHEMA_VERSION,
        records: parsed.records,
        liveEvents: Array.isArray(parsed.liveEvents) ? parsed.liveEvents : [],
        lifecycleOverrides: parsed.lifecycleOverrides,
        authoritativeSyncBySessionKey: parsed.authoritativeSyncBySessionKey ?? {},
      };
    }
  } catch {
    // empty
  }
  return {
    schemaVersion: ACTIVITY_STORE_SCHEMA_VERSION,
    records: [],
    liveEvents: [],
    lifecycleOverrides: [],
    authoritativeSyncBySessionKey: {},
  };
}

async function saveActivityStore(
  storePath: string,
  store: Phase2ProactivityActivityStore,
): Promise<void> {
  const filePath = resolveProactivityStorePath(storePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function dedupeRecords(
  records: Phase2PersistedProactivityActivityRecord[],
): Phase2PersistedProactivityActivityRecord[] {
  const byKey = new Map<string, Phase2PersistedProactivityActivityRecord>();
  for (const record of records) {
    const key = `${record.projectId}\t${record.sessionKey}\t${record.sourceKind}\t${record.sourceMessageId}\t${record.contentHash ?? ""}`;
    const existing = byKey.get(key);
    if (!existing || existing.updatedAt < record.updatedAt) {
      byKey.set(key, record);
    }
  }
  return [...byKey.values()]
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_ACTIVITY_RECORDS);
}

function dedupeOverrides(
  overrides: Phase2ProactivityActivityStore["lifecycleOverrides"],
): Phase2ProactivityActivityStore["lifecycleOverrides"] {
  const byId = new Map<string, Phase2ProactivityActivityStore["lifecycleOverrides"][number]>();
  for (const override of overrides) {
    const existing = byId.get(override.opportunityId);
    if (!existing || existing.updatedAt < override.updatedAt) {
      byId.set(override.opportunityId, override);
    }
  }
  return [...byId.values()]
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_LIFECYCLE_OVERRIDES);
}

function summarizePrompt(text: string): string {
  return boundedMultilineSummary(text).slice(0, 240);
}

function readTextSignatureId(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const parsed = parseAssistantTextSignature(
      (block as { textSignature?: unknown }).textSignature,
    );
    if (parsed?.id) {
      return parsed.id;
    }
  }
  return undefined;
}

function transcriptMessagesToAuthoritativeRecords(input: {
  messages: unknown[];
  projectId: string;
  sessionKey: string;
}): Phase2PersistedProactivityActivityRecord[] {
  const records: Phase2PersistedProactivityActivityRecord[] = [];
  let lastUserPromptSummary: string | undefined;
  for (const message of input.messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const role = readString((message as { role?: unknown }).role);
    const timestampValue = (message as { timestamp?: unknown }).timestamp;
    const messageTimestamp =
      typeof timestampValue === "number" && Number.isFinite(timestampValue)
        ? new Date(timestampValue).toISOString()
        : new Date().toISOString();
    if (role === "user") {
      const text = boundedMultilineSummary(extractFirstTextBlock(message));
      if (!text) {
        continue;
      }
      const sourceMessageId =
        readString((message as { __openclaw?: { id?: unknown } }).__openclaw?.id) ??
        `user:${sha256({ sessionKey: input.sessionKey, text, timestamp: messageTimestamp }).slice(0, 16)}`;
      lastUserPromptSummary = summarizePrompt(text);
      records.push({
        sourceId: `chat-activity-${sha256({ sourceMessageId, role, projectId: input.projectId }).slice(0, 16)}`,
        sourceKind: "user_turn",
        sourceMessageId,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        boundedText: text,
        userPromptSummary: lastUserPromptSummary,
        sourceRefs: [`chat://${input.sessionKey}/user_turn/${sourceMessageId}`],
        sourceProfileId: "explicit_user_turn",
        authorityTier: "user_authoritative",
        contentHash: sha256({ sourceMessageId, text, role }),
        proofHash: sha256({ sessionKey: input.sessionKey, sourceMessageId, role }),
        noDarkDataStatus: "pass",
        recordedAt: messageTimestamp,
        updatedAt: messageTimestamp,
        sourceLabel: "authoritative_transcript",
      });
      continue;
    }
    if (role !== "assistant") {
      continue;
    }
    const text = boundedMultilineSummary(extractAssistantVisibleText(message));
    if (!text || !isSafeBoundedSummary(text)) {
      continue;
    }
    const sourceMessageId =
      readTextSignatureId(message) ??
      readString((message as { __openclaw?: { id?: unknown } }).__openclaw?.id) ??
      `assistant:${sha256({ sessionKey: input.sessionKey, text, timestamp: messageTimestamp }).slice(0, 16)}`;
    const sourceRunId =
      readString((message as { responseId?: unknown }).responseId) ??
      readString((message as { runId?: unknown }).runId);
    records.push({
      sourceId: `chat-activity-${sha256({ sourceMessageId, role, projectId: input.projectId }).slice(0, 16)}`,
      sourceKind: "assistant_turn",
      sourceMessageId,
      sourceRunId,
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      boundedText: text,
      userPromptSummary: lastUserPromptSummary,
      sourceRefs: [`chat://${input.sessionKey}/assistant_turn/${sourceMessageId}`],
      sourceProfileId: "manual_note",
      authorityTier: "tool_grounded",
      contentHash: sha256({ sourceMessageId, text, role }),
      proofHash: sha256({ sessionKey: input.sessionKey, sourceMessageId, role, sourceRunId }),
      noDarkDataStatus: "pass",
      recordedAt: messageTimestamp,
      updatedAt: messageTimestamp,
      sourceLabel: "authoritative_transcript",
    });
  }
  return dedupeRecords(records);
}

function buildChecks(store: Phase2ProactivityActivityStore): Phase2ProactivityActivityStoreCheck[] {
  return [
    {
      checkId: "phase2_proactivity_activity_store:bounded_records_only:1",
      status: store.records.every((record) => record.boundedText.length <= 480) ? "pass" : "fail",
      reasonCode: "bounded_records_only",
    },
    {
      checkId: "phase2_proactivity_activity_store:deterministic_ids_required:1",
      status: store.records.every((record) => Boolean(record.sourceMessageId && record.sourceId))
        ? "pass"
        : "fail",
      reasonCode: "deterministic_ids_required",
    },
    {
      checkId: "phase2_proactivity_activity_store:provenance_required:1",
      status: store.records.every((record) => record.sourceRefs.length > 0) ? "pass" : "fail",
      reasonCode: "provenance_required",
    },
    {
      checkId: "phase2_proactivity_activity_store:no_dark_data_required:1",
      status: store.records.every((record) => record.noDarkDataStatus === "pass") ? "pass" : "fail",
      reasonCode: "no_dark_data_required",
    },
  ];
}

export async function recordPersistedProactivityChatActivity(params: {
  cfg?: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
  sourceKind: Phase2OpportunityExtractionSourceKind;
  sourceMessageId: string;
  boundedText: string;
  sourceRunId?: string;
  userPromptSummary?: string;
}): Promise<Phase2PersistedProactivityActivityRecord> {
  const cfg = params.cfg ?? loadConfig();
  const target = resolveGatewaySessionStoreTarget({ cfg, key: params.sessionKey });
  const store = await loadActivityStore(target.storePath);
  const now = new Date().toISOString();
  const record: Phase2PersistedProactivityActivityRecord = {
    sourceId: `chat-activity-${sha256({
      sessionKey: params.sessionKey,
      projectId: params.projectId,
      sourceKind: params.sourceKind,
      sourceMessageId: params.sourceMessageId,
    }).slice(0, 16)}`,
    sourceKind: params.sourceKind,
    sourceMessageId: params.sourceMessageId,
    sourceRunId: params.sourceRunId,
    projectId: params.projectId,
    sessionKey: params.sessionKey,
    boundedText: boundedMultilineSummary(params.boundedText),
    userPromptSummary: readString(params.userPromptSummary),
    sourceRefs: [`chat://${params.sessionKey}/${params.sourceKind}/${params.sourceMessageId}`],
    sourceProfileId: params.sourceKind === "user_turn" ? "explicit_user_turn" : "manual_note",
    authorityTier: params.sourceKind === "user_turn" ? "user_authoritative" : "tool_grounded",
    contentHash: sha256({
      sourceKind: params.sourceKind,
      sourceMessageId: params.sourceMessageId,
      boundedText: boundedMultilineSummary(params.boundedText),
    }),
    proofHash: sha256({
      sessionKey: params.sessionKey,
      sourceKind: params.sourceKind,
      sourceMessageId: params.sourceMessageId,
      sourceRunId: params.sourceRunId ?? null,
    }),
    noDarkDataStatus: "pass",
    recordedAt: now,
    updatedAt: now,
    sourceLabel: "ui_callback",
  };
  store.records = dedupeRecords([...store.records, record]);
  await saveActivityStore(target.storePath, store);
  return record;
}

export async function updatePersistedProactivityLifecycleOverride(params: {
  cfg?: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
  override: Phase2OpportunityLedgerLifecycleOverride;
}): Promise<void> {
  const cfg = params.cfg ?? loadConfig();
  const target = resolveGatewaySessionStoreTarget({ cfg, key: params.sessionKey });
  const store = await loadActivityStore(target.storePath);
  store.lifecycleOverrides = dedupeOverrides([
    ...store.lifecycleOverrides,
    {
      ...params.override,
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      updatedAt: params.override.updatedAt ?? new Date().toISOString(),
    },
  ]);
  await saveActivityStore(target.storePath, store);
}

export async function recordPersistedProactivityLiveEvent(params: {
  cfg?: ReturnType<typeof loadConfig>;
  event: Phase2LiveProactivitySignalSource;
}): Promise<void> {
  const cfg = params.cfg ?? loadConfig();
  const target = resolveGatewaySessionStoreTarget({ cfg, key: params.event.sessionKey });
  const store = await loadActivityStore(target.storePath);
  store.liveEvents = [
    ...store.liveEvents.filter(
      (entry) =>
        !(
          entry.projectId === params.event.projectId &&
          entry.sessionKey === params.event.sessionKey &&
          entry.sourceId === params.event.sourceId
        ),
    ),
    {
      ...params.event,
      recordedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_LIVE_EVENTS);
  await saveActivityStore(target.storePath, store);
}

export async function syncAuthoritativeProactivityActivities(params: {
  cfg?: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
}): Promise<Phase2ProactivityActivityStoreReport> {
  const cfg = params.cfg ?? loadConfig();
  const target = resolveGatewaySessionStoreTarget({ cfg, key: params.sessionKey });
  const sessionStore = loadSessionStore(target.storePath);
  const entry = resolveFreshestSessionEntryFromStoreKeys(sessionStore, target.storeKeys);
  const persisted = await loadActivityStore(target.storePath);
  if (entry?.sessionId) {
    const messages = readSessionMessages(entry.sessionId, target.storePath, entry.sessionFile);
    const derived = transcriptMessagesToAuthoritativeRecords({
      messages,
      projectId: params.projectId,
      sessionKey: params.sessionKey,
    });
    const preservedOtherSessions = persisted.records.filter(
      (record) =>
        !(record.projectId === params.projectId && record.sessionKey === params.sessionKey),
    );
    persisted.records = dedupeRecords([...preservedOtherSessions, ...derived]);
    persisted.authoritativeSyncBySessionKey[params.sessionKey] = new Date().toISOString();
    await saveActivityStore(target.storePath, persisted);
  }
  const checks = buildChecks(persisted);
  return {
    decision: entry?.sessionId ? "activity_store_updated" : "activity_store_ready",
    storePath: resolveProactivityStorePath(target.storePath),
    store: persisted,
    telemetry: {
      schemaVersion: ACTIVITY_STORE_SCHEMA_VERSION,
      recordCount: persisted.records.length,
      overrideCount: persisted.lifecycleOverrides.length,
      sessionCount: new Set(persisted.records.map((record) => record.sessionKey)).size,
    },
    rollbackPlan: {
      rollbackId: `phase2-proactivity-activity-store:${sha256(target.storePath).slice(0, 12)}`,
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_ACTIVITY_STORE_DISABLED",
      targetMode: "ui_callback_only",
    },
    checks,
  };
}

function eventsForScope(input: {
  projectId: string;
  sessionKey: string;
  persistedLiveEvents?: Phase2ProactivityActivityStore["liveEvents"];
}): Phase2LiveProactivitySignalSource[] {
  const persistedSources = (input.persistedLiveEvents ?? [])
    .filter((event) => event.projectId === input.projectId && event.sessionKey === input.sessionKey)
    .slice(-10);
  const systemEventSources = peekSystemEventEntries(input.sessionKey)
    .slice(-5)
    .filter((event) => isSafeBoundedSummary(boundedSummary(event.text)))
    .map((event, index): Phase2LiveProactivitySignalSource => {
      const summary = boundedSummary(event.text);
      const classification = classifySystemEventForProactivity({
        text: summary,
        contextKey: event.contextKey,
      });
      const sourceId = `system-event-${sha256({
        sessionKey: input.sessionKey,
        projectId: input.projectId,
        ts: event.ts,
        contextKey: event.contextKey ?? null,
        summary,
      }).slice(0, 16)}`;
      const sourceRef = `gateway://system-events/${input.sessionKey}/${classification.seam}/${sourceId}`;
      const coverageSource: Phase2LiveSignalCoverageSource = {
        sourceId,
        seam: classification.seam,
        reasonCode: classification.reasonCode,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
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
        proofHash: sha256({ sourceRef, sessionKey: input.sessionKey, projectId: input.projectId }),
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
              sessionKey: input.sessionKey,
            }).slice(0, 16)}`,
            sourceType:
              heartbeat.status === "failed"
                ? "gateway_delivery_or_error_event"
                : "session_runtime_event",
            signalKind: heartbeat.status === "failed" ? "recent_failure" : "session_event",
            projectId: input.projectId,
            sessionKey: input.sessionKey,
            boundedSummary: heartbeatSummary,
            sourceRefs: [`gateway://heartbeat/last/${heartbeat.ts}`],
            sourceProfileId: "daily_continuity",
            authorityTier: "cited_soft",
            contentHash: sha256({
              heartbeat,
              projectId: input.projectId,
              sessionKey: input.sessionKey,
            }),
            proofHash: sha256({
              ts: heartbeat.ts,
              status: heartbeat.status,
              sessionKey: input.sessionKey,
            }),
            freshness: "recent",
            conflictState: "clear",
            inspectionOnly: false,
            noDarkDataStatus: "pass",
            limitations: ["bounded_heartbeat_event_summary_only"],
          },
        ]
      : [];
  return [...persistedSources, ...systemEventSources, ...heartbeatSources].slice(-10);
}

export async function buildModelMemoryProactivityRuntimeState(
  params: GatewayProactivityBuildInput,
): Promise<GatewayProactivityBuildState> {
  const cfg = params.cfg ?? loadConfig();
  const activityStoreReport = await syncAuthoritativeProactivityActivities({
    cfg,
    sessionKey: params.sessionKey,
    projectId: params.projectId,
  });
  const eligibleSources = (
    await buildPhase2ProactivityNoiseBudgetReport({
      sources: eventsForScope({
        projectId: params.projectId,
        sessionKey: params.sessionKey,
        persistedLiveEvents: activityStoreReport.store.liveEvents,
      }),
      env: process.env,
    })
  ).eligibleSources;
  const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
    sources: eligibleSources,
    env: process.env,
  });
  const extractionSources = activityStoreReport.store.records.filter(
    (source) => source.projectId === params.projectId && source.sessionKey === params.sessionKey,
  );
  const projectActivitySources = activityStoreReport.store.records.filter(
    (source) => source.projectId === params.projectId,
  );
  const extractionReport = await buildPhase2ProactivityOpportunityExtractionReport({
    sources: extractionSources,
    env: process.env,
  });
  const recurringPatternReport = await buildPhase2ProactivityRecurringPatternReport({
    sources: projectActivitySources,
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
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      generatedAt: new Date().toISOString(),
    })),
  ];
  const ledgerReport = await buildPhase2ProactivityOpportunityLedgerReport({
    repoRoot: process.cwd(),
    opportunities: ledgerSources,
    activitySources: projectActivitySources,
    lifecycleOverrides: activityStoreReport.store.lifecycleOverrides.filter(
      (override) => override.projectId === params.projectId,
    ),
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
  const inboxReport = await buildPhase2ProactivityInboxReport({
    env: process.env,
    productSurfacingReport,
  });
  const heartbeatReport = await buildPhase2HeartbeatProactivityReliabilityReport({
    queueItems: productSurfacingReport.queue.items,
    inboxWorkItemIds: inboxReport.digest?.counts.actionable
      ? inboxReport.digest.items
          .filter((item) => item.layer === "actionable")
          .map((item) => item.workItemId ?? "")
          .filter(Boolean)
      : productSurfacingReport.queue.items.map((item) => item.workItemId).filter(Boolean),
    activeContextWorkItemIds: productSurfacingReport.queue.items
      .filter(
        (item) =>
          item.eligibleScope.projectId === params.projectId &&
          item.eligibleScope.sessionKey === params.sessionKey,
      )
      .map((item) => item.workItemId),
    env: process.env,
  });
  return {
    activityStoreReport,
    liveDetectionReport,
    extractionReport,
    recurringPatternReport,
    ledgerReport: effectiveLedgerReport,
    followupReport,
    draftReport,
    productSurfacingReport,
    heartbeatReport,
  };
}

export async function buildHeartbeatProactivityReviewText(params: {
  cfg?: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
  operatorId?: string;
  userId?: string;
  recipientId?: string;
}): Promise<{ text: string; state: GatewayProactivityBuildState } | null> {
  const state = await buildModelMemoryProactivityRuntimeState({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    projectId: params.projectId,
    operatorId: params.operatorId ?? process.env.USER ?? "local-openclaw-operator",
    userId: params.userId ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user",
    recipientId:
      params.recipientId ??
      process.env.OPENCLAW_RECIPIENT_ID ??
      process.env.OPENCLAW_USER_ID ??
      "local-openclaw-recipient",
  });
  const topItems = state.heartbeatReport.surface.topItems;
  if (topItems.length === 0) {
    return null;
  }
  const lines = [
    "What would help this user today?",
    ...topItems.flatMap((item, index) => [
      `${index + 1}. ${item.title}`,
      `Why now: ${item.whyNow}`,
      `Next step: ${item.proposedNextStep}`,
      `Expected value: ${item.expectedUserValue}`,
      `Confidence: ${item.confidence}${state.productSurfacingReport.queue.items.find((queueItem) => queueItem.workItemId === item.workItemId)?.draftReady ? " · Draft ready" : ""}`,
    ]),
    "Use this as a bounded proactive review only. Do not edit files, execute actions, or send outbound messages without approval.",
  ];
  return { text: boundedMultilineSummary(lines.join("\n")), state };
}
