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
  buildCandidateReviewPrefilterDecision,
  buildCandidateReviewPrefilterEvent,
  buildCandidateReviewTriggerPacket,
  buildProactivityReviewEpisodePacket,
  convertCandidateReviewProposalsToLedgerSources,
  evaluateCandidateReviewTrigger,
  loadCodexSessionActivityForCandidateReview,
  reviewEpisodeForCandidates,
  type CandidateReviewCodexAdapterReport,
  type CandidateReviewModelOptions,
  type CandidateReviewProposal,
  type CandidateReviewRecentActivity,
  type CandidateReviewReport,
  type CandidateReviewTriggerDecision,
  type CandidateReviewTriggerReport,
} from "../../extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.js";
import {
  buildPhase2ProactivityAutonomousInternalDraftingReport,
  type Phase2AutonomousDraftReport,
} from "../../extensions/model-memory/src/runtime/phase2-proactivity-autonomous-internal-drafting.js";
import {
  buildPhase2ProactivityGrowthLoopReport,
  type Phase2AutonomousMaintenanceJob,
  type Phase2GrowthLoopReport,
  type Phase2GrowthLoopState,
  type Phase2ProactivityCompactionRecoveryState,
  type Phase2ProactivityWorkingBuffer,
} from "../../extensions/model-memory/src/runtime/phase2-proactivity-growth-loops.js";
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
import {
  buildPhase2ProductProactivitySurfacingReport,
  type Phase2ProductProactivitySurfacingInput,
} from "../../extensions/model-memory/src/runtime/phase2-product-proactivity-surfacing.js";
import {
  buildPhase2SkillCandidateLedgerReport,
  type Phase2SkillCandidateActivitySource,
  type Phase2SkillCandidateLedgerReport,
  type Phase2SkillCandidateOpportunity,
  type Phase2SkillCandidateRecord,
} from "../../extensions/model-memory/src/runtime/phase2-skill-candidate-ledger.js";
import {
  createPhase2SkillifierDraft,
  type Phase2SkillPackageDraft,
  type Phase2SkillifierDraftTargetKind,
  type Phase2SkillifierReport,
} from "../../extensions/model-memory/src/runtime/phase2-skillifier-draft.js";
import type { Phase2UserFacingProactivityExistingSkill } from "../../extensions/model-memory/src/runtime/phase2-user-facing-proactivity-briefs.js";
import type {
  SourceAuthorityTier,
  SourceProfileId,
} from "../../extensions/model-memory/src/source-authority.js";
import { resolveAgentWorkspaceDir, resolveSessionAgentId } from "../agents/agent-scope.js";
import { OpenAICompatibleLiveJsonExecutor } from "../agents/model-memory.live-json-executor.js";
import { loadWorkspaceSkillEntries } from "../agents/skills.js";
import { stripInboundMetadata } from "../auto-reply/reply/strip-inbound-meta.js";
import { loadConfig } from "../config/config.js";
import { loadSessionStore } from "../config/sessions/store-load.js";
import {
  resolveFreshestSessionEntryFromStoreKeys,
  resolveGatewaySessionStoreTarget,
  readSessionMessages,
} from "../gateway/session-utils.js";
import {
  cleanProactivityUserFacingText,
  extractAssistantTextForPhase,
  extractAssistantTextSignatureId,
  extractFirstTextBlock,
  extractAssistantVisibleText,
  isInternalProactivityWorkflowText,
  isOperationalProactivityUserFacingText,
  parseAssistantTextSignature,
  resolveAssistantMessagePhase,
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
  growthLoopState?: Phase2GrowthLoopState | null;
  workingBuffer?: Phase2ProactivityWorkingBuffer | null;
  maintenanceJobs?: Phase2AutonomousMaintenanceJob[];
  recoveryState?: Phase2ProactivityCompactionRecoveryState | null;
  skillCandidates?: Phase2SkillCandidateRecord[];
  skillPackageDrafts?: Phase2SkillPackageDraft[];
  candidateReviewEpisodeKeys?: Array<{
    episodeKey: string;
    reviewedAt: string;
    reportHash?: string;
  }>;
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
  skillCandidateReport: Phase2SkillCandidateLedgerReport;
  skillifierDrafts: Phase2SkillPackageDraft[];
  growthLoopReport: Phase2GrowthLoopReport;
  ledgerReport: Phase2OpportunityLedgerReport;
  followupReport: Awaited<ReturnType<typeof buildPhase2ProactivityOutcomeFollowupReport>>;
  draftReport: Phase2AutonomousDraftReport;
  productSurfacingReport: Awaited<ReturnType<typeof buildPhase2ProductProactivitySurfacingReport>>;
  heartbeatReport: Phase2HeartbeatProactivityReport;
  candidateReviewReport?: CandidateReviewReport | null;
  candidateReviewTriggerDecision?: CandidateReviewTriggerDecision | null;
  candidateReviewTriggerReport?: CandidateReviewTriggerReport | null;
  candidateReviewProposals?: CandidateReviewProposal[];
  candidateReviewCodexAdapterReport?: CandidateReviewCodexAdapterReport | null;
};

const ACTIVITY_STORE_SCHEMA_VERSION = "phase2_proactivity_activity_store.v1" as const;
const MAX_ACTIVITY_RECORDS = 400;
const MAX_LIVE_EVENTS = 120;
const MAX_LIFECYCLE_OVERRIDES = 200;
const MAX_RECENT_ASSISTANT_EXTRACTION_RECORDS = 8;
const PROACTIVITY_STORE_FILE = "model-memory-proactivity-state.json";
const MODEL_AUTHORED_BRIEFS_ENABLED_ENV = "MODEL_MEMORY_PHASE2_MODEL_AUTHORED_BRIEFS_ENABLED";
const MODEL_AUTHORED_BRIEFS_DISABLED_ENV = "MODEL_MEMORY_PHASE2_MODEL_AUTHORED_BRIEFS_DISABLED";
const MODEL_AUTHORED_BRIEFS_MODEL_ENV = "MODEL_MEMORY_PHASE2_MODEL_AUTHORED_BRIEFS_MODEL";
const MODEL_AUTHORED_BRIEFS_REASONING_ENV =
  "MODEL_MEMORY_PHASE2_MODEL_AUTHORED_BRIEFS_REASONING_EFFORT";
const MODEL_AUTHORED_BRIEFS_VERBOSITY_ENV = "MODEL_MEMORY_PHASE2_MODEL_AUTHORED_BRIEFS_VERBOSITY";
const MODEL_AUTHORED_BRIEFS_TIMEOUT_ENV = "MODEL_MEMORY_PHASE2_MODEL_AUTHORED_BRIEFS_TIMEOUT_MS";
const DEFAULT_MODEL_AUTHORED_BRIEFS_TIMEOUT_MS = 45_000;
const CANDIDATE_TRIGGER_ENABLED_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_TRIGGER_ENABLED";
const CANDIDATE_TRIGGER_MODEL_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_TRIGGER_MODEL";
const CANDIDATE_TRIGGER_REASONING_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_TRIGGER_REASONING_EFFORT";
const CANDIDATE_TRIGGER_TIMEOUT_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_TRIGGER_TIMEOUT_MS";
const CANDIDATE_REVIEW_ENABLED_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED";
const CANDIDATE_REVIEW_MODEL_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL";
const CANDIDATE_REVIEW_REASONING_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_REASONING_EFFORT";
const CANDIDATE_REVIEW_TIMEOUT_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_TIMEOUT_MS";
const CANDIDATE_REVIEW_MAX_PER_SESSION_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_PER_SESSION";
const CANDIDATE_REVIEW_COOLDOWN_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_COOLDOWN_MS";
const CODEX_SESSION_REVIEW_ENABLED_ENV = "MODEL_MEMORY_PHASE2_CODEX_SESSION_REVIEW_ENABLED";
const DEFAULT_CANDIDATE_TRIGGER_TIMEOUT_MS = 30_000;
const DEFAULT_CANDIDATE_REVIEW_TIMEOUT_MS = 60_000;
const DEFAULT_CANDIDATE_REVIEW_MAX_PER_SESSION = 48;
const DEFAULT_CANDIDATE_REVIEW_COOLDOWN_MS = 5 * 60 * 1_000;

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readAllowedValue<const TValue extends string>(
  value: string | undefined,
  allowed: readonly TValue[],
  fallback: TValue,
): TValue {
  const normalized = value?.trim();
  return allowed.find((entry) => entry === normalized) ?? fallback;
}

function shouldEnableModelAuthoredBriefs(env: NodeJS.ProcessEnv): boolean {
  const enabled = readString(env[MODEL_AUTHORED_BRIEFS_ENABLED_ENV]);
  if (enabled) {
    return /^(?:1|true|yes|on)$/i.test(enabled);
  }
  const disabled = readString(env[MODEL_AUTHORED_BRIEFS_DISABLED_ENV]);
  if (disabled && /^(?:1|true|yes|on)$/i.test(disabled)) {
    return false;
  }
  if (
    env.VITEST ||
    env.VITEST_WORKER_ID ||
    env.VITEST_POOL_ID ||
    env.NODE_ENV === "test" ||
    env.npm_lifecycle_event === "test:file" ||
    process.argv.some((arg) => /\b(?:vitest|test-projects)\b/u.test(arg))
  ) {
    return false;
  }
  return false;
}

function readBooleanEnv(value: string | undefined): boolean {
  return /^(?:1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function buildModelAuthoredBriefOptions(params: {
  cfg: ReturnType<typeof loadConfig>;
  env: NodeJS.ProcessEnv;
}): NonNullable<Phase2ProductProactivitySurfacingInput["modelBriefOptions"]> {
  const enabled = shouldEnableModelAuthoredBriefs(params.env);
  const timeoutMs = readPositiveInteger(
    params.env[MODEL_AUTHORED_BRIEFS_TIMEOUT_ENV],
    DEFAULT_MODEL_AUTHORED_BRIEFS_TIMEOUT_MS,
  );
  return {
    enabled,
    executor: enabled
      ? new OpenAICompatibleLiveJsonExecutor({
          config: params.cfg,
          requestTimeoutMs: timeoutMs,
        })
      : null,
    modelId: readString(params.env[MODEL_AUTHORED_BRIEFS_MODEL_ENV]) ?? "openai-codex/gpt-5.4",
    reasoningEffort: readAllowedValue(
      params.env[MODEL_AUTHORED_BRIEFS_REASONING_ENV],
      ["none", "minimal", "low", "medium"] as const,
      "medium",
    ),
    verbosity: readAllowedValue(
      params.env[MODEL_AUTHORED_BRIEFS_VERBOSITY_ENV],
      ["low", "medium"] as const,
      "low",
    ),
    maxOutputTokens: 900,
    maxItemsPerReport: 3,
  };
}

function shouldEnableCandidateModelRoute(params: {
  env: NodeJS.ProcessEnv;
  enabledEnv: string;
}): boolean {
  if (readBooleanEnv(params.env[params.enabledEnv])) {
    return true;
  }
  if (
    params.env.VITEST ||
    params.env.VITEST_WORKER_ID ||
    params.env.VITEST_POOL_ID ||
    params.env.NODE_ENV === "test" ||
    params.env.npm_lifecycle_event === "test:file" ||
    process.argv.some((arg) => /\b(?:vitest|test-projects)\b/u.test(arg))
  ) {
    return false;
  }
  return false;
}

function buildCandidateTriggerOptions(params: {
  cfg: ReturnType<typeof loadConfig>;
  env: NodeJS.ProcessEnv;
}): CandidateReviewModelOptions {
  const enabled = shouldEnableCandidateModelRoute({
    env: params.env,
    enabledEnv: CANDIDATE_TRIGGER_ENABLED_ENV,
  });
  const timeoutMs = readPositiveInteger(
    params.env[CANDIDATE_TRIGGER_TIMEOUT_ENV],
    DEFAULT_CANDIDATE_TRIGGER_TIMEOUT_MS,
  );
  return {
    enabled,
    executor: enabled
      ? new OpenAICompatibleLiveJsonExecutor({
          config: params.cfg,
          requestTimeoutMs: timeoutMs,
        })
      : null,
    modelId: readString(params.env[CANDIDATE_TRIGGER_MODEL_ENV]) ?? "openai-codex/gpt-5.4-mini",
    reasoningEffort: readAllowedValue(
      params.env[CANDIDATE_TRIGGER_REASONING_ENV],
      ["none", "minimal", "low", "medium"] as const,
      "low",
    ),
    verbosity: "low",
    maxOutputTokens: 700,
  };
}

function buildCandidateReviewOptions(params: {
  cfg: ReturnType<typeof loadConfig>;
  env: NodeJS.ProcessEnv;
}): CandidateReviewModelOptions {
  const enabled = shouldEnableCandidateModelRoute({
    env: params.env,
    enabledEnv: CANDIDATE_REVIEW_ENABLED_ENV,
  });
  const timeoutMs = readPositiveInteger(
    params.env[CANDIDATE_REVIEW_TIMEOUT_ENV],
    DEFAULT_CANDIDATE_REVIEW_TIMEOUT_MS,
  );
  return {
    enabled,
    executor: enabled
      ? new OpenAICompatibleLiveJsonExecutor({
          config: params.cfg,
          requestTimeoutMs: timeoutMs,
        })
      : null,
    modelId: readString(params.env[CANDIDATE_REVIEW_MODEL_ENV]) ?? "openai-codex/gpt-5.4",
    reasoningEffort: readAllowedValue(
      params.env[CANDIDATE_REVIEW_REASONING_ENV],
      ["low", "medium", "high"] as const,
      "medium",
    ),
    verbosity: "low",
    maxOutputTokens: 1_600,
  };
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
        growthLoopState: parsed.growthLoopState ?? null,
        workingBuffer: parsed.workingBuffer ?? null,
        maintenanceJobs: Array.isArray(parsed.maintenanceJobs) ? parsed.maintenanceJobs : [],
        recoveryState: parsed.recoveryState ?? null,
        skillCandidates: Array.isArray(parsed.skillCandidates) ? parsed.skillCandidates : [],
        skillPackageDrafts: Array.isArray(parsed.skillPackageDrafts)
          ? parsed.skillPackageDrafts
          : [],
        candidateReviewEpisodeKeys: Array.isArray(parsed.candidateReviewEpisodeKeys)
          ? parsed.candidateReviewEpisodeKeys
          : [],
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
    growthLoopState: null,
    workingBuffer: null,
    maintenanceJobs: [],
    recoveryState: null,
    skillCandidates: [],
    skillPackageDrafts: [],
    candidateReviewEpisodeKeys: [],
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

async function updatePersistedOperatingState(params: {
  storePath: string;
  growthLoopState: Phase2GrowthLoopState;
  workingBuffer: Phase2ProactivityWorkingBuffer;
  maintenanceJobs: Phase2AutonomousMaintenanceJob[];
  recoveryState: Phase2ProactivityCompactionRecoveryState;
  skillCandidates: Phase2SkillCandidateRecord[];
  candidateReviewEpisodeKey?: string | null;
  candidateReviewReportHash?: string | null;
}): Promise<Phase2ProactivityActivityStore> {
  const store = await loadActivityStore(params.storePath);
  store.growthLoopState = params.growthLoopState;
  store.workingBuffer = params.workingBuffer;
  store.maintenanceJobs = params.maintenanceJobs.slice(0, 6);
  store.recoveryState = params.recoveryState;
  store.skillCandidates = params.skillCandidates;
  if (params.candidateReviewEpisodeKey) {
    store.candidateReviewEpisodeKeys = [
      ...(store.candidateReviewEpisodeKeys ?? []).filter(
        (entry) => entry.episodeKey !== params.candidateReviewEpisodeKey,
      ),
      {
        episodeKey: params.candidateReviewEpisodeKey,
        reviewedAt: new Date().toISOString(),
        reportHash: params.candidateReviewReportHash ?? undefined,
      },
    ].slice(-80);
  }
  await saveActivityStore(params.storePath, store);
  return store;
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

function dedupeSkillCandidates(
  records: Phase2SkillCandidateRecord[],
): Phase2SkillCandidateRecord[] {
  const byId = new Map<string, Phase2SkillCandidateRecord>();
  for (const record of records) {
    const existing = byId.get(record.skillCandidateId);
    if (!existing || existing.updatedAt < record.updatedAt) {
      byId.set(record.skillCandidateId, record);
    }
  }
  return [...byId.values()]
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_LIFECYCLE_OVERRIDES);
}

function dedupeSkillPackageDrafts(records: Phase2SkillPackageDraft[]): Phase2SkillPackageDraft[] {
  const byId = new Map<string, Phase2SkillPackageDraft>();
  for (const record of records) {
    const existing = byId.get(record.skillPackageId);
    if (!existing || existing.updatedAt < record.updatedAt) {
      byId.set(record.skillPackageId, record);
    }
  }
  return [...byId.values()]
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_LIFECYCLE_OVERRIDES);
}

function loadExistingSkillBriefs(params: {
  cfg: ReturnType<typeof loadConfig>;
  sessionKey: string;
}): Phase2UserFacingProactivityExistingSkill[] {
  const agentId = resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: params.cfg,
  });
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
  return loadWorkspaceSkillEntries(workspaceDir, {
    config: params.cfg,
    agentId,
  })
    .map((entry) => ({
      name: entry.skill.name,
      description: entry.skill.description,
      source: entry.skill.source,
    }))
    .filter((entry) => entry.name.trim().length > 0)
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

function summarizePrompt(text: string): string | undefined {
  return cleanProactivityUserFacingText(stripInboundMetadata(boundedMultilineSummary(text)), {
    maxLength: 240,
  });
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

function isOperationalAssistantText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith("turn activity:") ||
    normalized.startsWith("[memory activity]") ||
    normalized === "heartbeat_ok"
  );
}

function isOperationalAssistantMessage(message: unknown, text: string): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const record = message as {
    model?: unknown;
    __openclaw?: {
      kind?: unknown;
    };
  };
  const kind = readString(record.__openclaw?.kind);
  const model = readString(record.model);
  return (
    kind === "turn_activity" ||
    kind === "model_memory_activity" ||
    model === "turn-activity" ||
    model === "memory-activity" ||
    isOperationalAssistantText(text)
  );
}

function transcriptMessagesToAuthoritativeRecords(input: {
  messages: unknown[];
  projectId: string;
  sessionKey: string;
}): Phase2PersistedProactivityActivityRecord[] {
  const records: Phase2PersistedProactivityActivityRecord[] = [];
  let lastUserPromptSummary: string | undefined;
  let lastUserPromptOperational = false;
  let lastUserPromptSuppressed = false;
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
      const visibleText = stripInboundMetadata(text) || text;
      const sourceMessageId =
        readString((message as { __openclaw?: { id?: unknown } }).__openclaw?.id) ??
        `user:${sha256({ sessionKey: input.sessionKey, text, timestamp: messageTimestamp }).slice(0, 16)}`;
      lastUserPromptSummary = summarizePrompt(visibleText);
      lastUserPromptOperational =
        !lastUserPromptSummary && isOperationalProactivityUserFacingText(visibleText);
      lastUserPromptSuppressed =
        lastUserPromptOperational ||
        isInternalProactivityWorkflowText(visibleText) ||
        isInternalProactivityWorkflowText(lastUserPromptSummary);
      if (lastUserPromptSuppressed) {
        continue;
      }
      records.push({
        sourceId: `chat-activity-${sha256({ sourceMessageId, role, projectId: input.projectId }).slice(0, 16)}`,
        sourceKind: "user_turn",
        sourceMessageId,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        boundedText: visibleText,
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
    const messagePhase = resolveAssistantMessagePhase(message);
    if (messagePhase === "commentary") {
      continue;
    }
    const finalAnswerText = extractAssistantTextForPhase(message, { phase: "final_answer" });
    const assistantVisibleText = finalAnswerText ?? extractAssistantVisibleText(message);
    if (!assistantVisibleText) {
      continue;
    }
    const text = boundedMultilineSummary(assistantVisibleText);
    if (
      !text ||
      !isSafeBoundedSummary(text) ||
      isOperationalAssistantMessage(message, text) ||
      lastUserPromptOperational ||
      lastUserPromptSuppressed ||
      isInternalProactivityWorkflowText(text) ||
      isInternalProactivityWorkflowText(lastUserPromptSummary)
    ) {
      continue;
    }
    const sourceMessageId =
      extractAssistantTextSignatureId(message, { phase: "final_answer" }) ??
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
  const cleanedPromptSummary = readString(params.userPromptSummary);
  const boundedText = boundedMultilineSummary(params.boundedText);
  const shouldSuppressRecord =
    isInternalProactivityWorkflowText(boundedText) ||
    isInternalProactivityWorkflowText(cleanedPromptSummary) ||
    ((params.sourceKind === "assistant_turn" || params.sourceKind === "planning_output") &&
      isOperationalProactivityUserFacingText(cleanedPromptSummary));
  if (shouldSuppressRecord) {
    return {
      sourceId: `chat-activity-${sha256({
        sessionKey: params.sessionKey,
        projectId: params.projectId,
        sourceKind: params.sourceKind,
        sourceMessageId: params.sourceMessageId,
        suppressed: true,
      }).slice(0, 16)}`,
      sourceKind: params.sourceKind,
      sourceMessageId: params.sourceMessageId,
      sourceRunId: params.sourceRunId,
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      boundedText,
      userPromptSummary: cleanedPromptSummary,
      sourceRefs: [`chat://${params.sessionKey}/${params.sourceKind}/${params.sourceMessageId}`],
      sourceProfileId: params.sourceKind === "user_turn" ? "explicit_user_turn" : "manual_note",
      authorityTier: params.sourceKind === "user_turn" ? "user_authoritative" : "tool_grounded",
      contentHash: sha256({
        sourceKind: params.sourceKind,
        sourceMessageId: params.sourceMessageId,
        boundedText,
        suppressed: true,
      }),
      proofHash: sha256({
        sessionKey: params.sessionKey,
        sourceKind: params.sourceKind,
        sourceMessageId: params.sourceMessageId,
        sourceRunId: params.sourceRunId ?? null,
        suppressed: true,
      }),
      noDarkDataStatus: "pass",
      recordedAt: now,
      updatedAt: now,
      sourceLabel: "ui_callback",
    };
  }
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
    boundedText,
    userPromptSummary: cleanedPromptSummary,
    sourceRefs: [`chat://${params.sessionKey}/${params.sourceKind}/${params.sourceMessageId}`],
    sourceProfileId: params.sourceKind === "user_turn" ? "explicit_user_turn" : "manual_note",
    authorityTier: params.sourceKind === "user_turn" ? "user_authoritative" : "tool_grounded",
    contentHash: sha256({
      sourceKind: params.sourceKind,
      sourceMessageId: params.sourceMessageId,
      boundedText,
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

function recentAssistantExtractionSources(
  records: Phase2PersistedProactivityActivityRecord[],
): Phase2PersistedProactivityActivityRecord[] {
  const assistantRecords = records.filter(
    (record) => record.sourceKind === "assistant_turn" || record.sourceKind === "planning_output",
  );
  if (assistantRecords.length <= MAX_RECENT_ASSISTANT_EXTRACTION_RECORDS) {
    return assistantRecords;
  }
  const keepAssistantKeys = new Set(
    assistantRecords
      .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(-MAX_RECENT_ASSISTANT_EXTRACTION_RECORDS)
      .map(
        (record) => `${record.sourceKind}\t${record.sourceMessageId}\t${record.contentHash ?? ""}`,
      ),
  );
  return assistantRecords.filter((record) => {
    const key = `${record.sourceKind}\t${record.sourceMessageId}\t${record.contentHash ?? ""}`;
    return keepAssistantKeys.has(key);
  });
}

function candidateReviewActivityFromRecord(
  record: Phase2PersistedProactivityActivityRecord,
): CandidateReviewRecentActivity {
  return {
    ref: record.sourceRefs[0] ?? `${record.sourceKind}:${record.sourceMessageId}`,
    role:
      record.sourceKind === "user_turn"
        ? "user"
        : record.sourceKind === "assistant_turn" || record.sourceKind === "planning_output"
          ? "assistant"
          : "system_event",
    kind:
      record.sourceKind === "user_turn"
        ? "ask"
        : record.sourceKind === "assistant_turn" || record.sourceKind === "planning_output"
          ? "final"
          : "result_summary",
    boundedText: record.boundedText,
    sourceRuntime: record.sourceRefs.some((sourceRef) => sourceRef.startsWith("codex://"))
      ? "codex"
      : "openclaw",
    recordedAt: record.recordedAt,
  };
}

function candidateReviewEventTypeForLatestActivity(
  latest: CandidateReviewRecentActivity | undefined,
): Parameters<typeof buildCandidateReviewPrefilterEvent>[0]["eventType"] {
  if (latest?.role === "tool_summary" && latest.kind === "failure_summary") {
    return "validation_or_proof_failed";
  }
  if (latest?.role === "card" && latest.kind === "card_summary") {
    return "card_quality_failed";
  }
  return "assistant_final_completed";
}

async function buildModelReviewedCandidateSources(input: {
  cfg: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
  projectActivitySources: Phase2PersistedProactivityActivityRecord[];
  skillCandidateReport: Phase2SkillCandidateLedgerReport;
  recurringPatternReport: Awaited<ReturnType<typeof buildPhase2ProactivityRecurringPatternReport>>;
  existingSkills: Phase2UserFacingProactivityExistingSkill[];
  previousEpisodeKeys: Phase2ProactivityActivityStore["candidateReviewEpisodeKeys"];
}): Promise<{
  episodeKey: string | null;
  triggerDecision: CandidateReviewTriggerDecision | null;
  triggerReport: CandidateReviewTriggerReport | null;
  reviewReport: CandidateReviewReport | null;
  codexAdapterReport: CandidateReviewCodexAdapterReport | null;
  proposals: CandidateReviewProposal[];
  skillCandidates: Phase2SkillCandidateRecord[];
  opportunities: Phase2OpportunityLedgerSource[];
}> {
  const triggerOptions = buildCandidateTriggerOptions({ cfg: input.cfg, env: process.env });
  const reviewOptions = buildCandidateReviewOptions({ cfg: input.cfg, env: process.env });
  const reviewCooldownMs = readNonNegativeInteger(
    process.env[CANDIDATE_REVIEW_COOLDOWN_ENV],
    DEFAULT_CANDIDATE_REVIEW_COOLDOWN_MS,
  );
  const maxReviewsPerSession = readPositiveInteger(
    process.env[CANDIDATE_REVIEW_MAX_PER_SESSION_ENV],
    DEFAULT_CANDIDATE_REVIEW_MAX_PER_SESSION,
  );
  const nowMs = Date.now();
  const recentReviewEntries = (input.previousEpisodeKeys ?? []).filter((entry) => {
    const reviewedAtMs = Date.parse(entry.reviewedAt);
    return Number.isFinite(reviewedAtMs) && nowMs - reviewedAtMs < reviewCooldownMs;
  });
  const reviewsInLastHour = (input.previousEpisodeKeys ?? []).filter((entry) => {
    const reviewedAtMs = Date.parse(entry.reviewedAt);
    return Number.isFinite(reviewedAtMs) && nowMs - reviewedAtMs < 60 * 60 * 1_000;
  }).length;
  if (!triggerOptions.enabled && !reviewOptions.enabled) {
    return {
      episodeKey: null,
      triggerDecision: null,
      triggerReport: null,
      reviewReport: null,
      codexAdapterReport: null,
      proposals: [],
      skillCandidates: [],
      opportunities: [],
    };
  }
  if (reviewsInLastHour >= maxReviewsPerSession) {
    return {
      episodeKey: null,
      triggerDecision: null,
      triggerReport: null,
      reviewReport: null,
      codexAdapterReport: null,
      proposals: [],
      skillCandidates: [],
      opportunities: [],
    };
  }
  const recentOpenClawActivities = input.projectActivitySources
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-10)
    .map(candidateReviewActivityFromRecord);
  const codexAdapter = readBooleanEnv(process.env[CODEX_SESSION_REVIEW_ENABLED_ENV])
    ? await loadCodexSessionActivityForCandidateReview()
    : null;
  const codexActivities = codexAdapter?.activities ?? [];
  const recentActivities = [...recentOpenClawActivities, ...codexActivities].slice(-14);
  if (recentActivities.length === 0) {
    return {
      episodeKey: null,
      triggerDecision: null,
      triggerReport: null,
      reviewReport: null,
      codexAdapterReport: codexAdapter?.report ?? null,
      proposals: [],
      skillCandidates: [],
      opportunities: [],
    };
  }
  const latest = recentActivities.at(-1);
  if (latest?.role === "user") {
    return {
      episodeKey: null,
      triggerDecision: null,
      triggerReport: null,
      reviewReport: null,
      codexAdapterReport: codexAdapter?.report ?? null,
      proposals: [],
      skillCandidates: [],
      opportunities: [],
    };
  }
  const event = buildCandidateReviewPrefilterEvent({
    eventType: candidateReviewEventTypeForLatestActivity(latest),
    runtime: latest?.sourceRuntime === "codex" ? "codex" : "openclaw",
    sessionKey: input.sessionKey,
    refs: recentActivities.map((activity) => activity.ref).slice(-8),
    boundedSummary: recentActivities
      .slice(-3)
      .map((activity) => activity.boundedText)
      .join("\n"),
  });
  const prefilter = buildCandidateReviewPrefilterDecision({
    event,
    recentEpisodeKeys: recentReviewEntries.map((entry) => entry.episodeKey),
  });
  if (!prefilter.shouldAskModel) {
    return {
      episodeKey: prefilter.episodeKey,
      triggerDecision: null,
      triggerReport: null,
      reviewReport: null,
      codexAdapterReport: codexAdapter?.report ?? null,
      proposals: [],
      skillCandidates: [],
      opportunities: [],
    };
  }
  const recentProactivityItems = [
    ...input.skillCandidateReport.opportunities.map((opportunity) => ({
      id: opportunity.opportunityId,
      kind: "skill_candidate",
      title: opportunity.title,
      status: "detected",
      quality: opportunity.confidence,
    })),
    ...input.recurringPatternReport.opportunities.map((opportunity) => ({
      id: opportunity.opportunityId,
      kind: "proactive_plan",
      title: opportunity.title,
      status: "detected",
      quality: opportunity.confidence,
    })),
  ].slice(-10);
  const triggerPacket = buildCandidateReviewTriggerPacket({
    event,
    recentActivities,
    recentCardSummaries: recentProactivityItems,
    recentActivitySignals: [
      `stage1_event:${event.eventType}`,
      `stage1:${prefilter.reasonCodes.join(",")}`,
    ],
  });
  const trigger = await evaluateCandidateReviewTrigger(triggerPacket, triggerOptions);
  if (!trigger.decision.shouldRun || trigger.decision.reviewGoal === "none") {
    return {
      episodeKey: prefilter.episodeKey,
      triggerDecision: trigger.decision,
      triggerReport: trigger.report,
      reviewReport: null,
      codexAdapterReport: codexAdapter?.report ?? null,
      proposals: [],
      skillCandidates: [],
      opportunities: [],
    };
  }
  const episodePacket = buildProactivityReviewEpisodePacket({
    triggerPacket,
    triggerDecision: trigger.decision,
    recentActivities,
    loadedSkills: input.existingSkills,
    recentProactivityItems,
    recentCandidateIds: input.skillCandidateReport.records.map((record) => record.skillCandidateId),
    possibleDuplicateTitles: [
      ...input.skillCandidateReport.opportunities.map((opportunity) => opportunity.title),
      ...input.recurringPatternReport.opportunities.map((opportunity) => opportunity.title),
    ],
    rejectedOrDemotedSummary: input.skillCandidateReport.records
      .filter(
        (record) => record.lifecycleStatus === "rejected" || record.lifecycleStatus === "disabled",
      )
      .map((record) => `${record.lifecycleStatus}: ${record.suggestedSkillName}`),
    activeMilestone: "pre-Milestone-4 model-reviewed candidate discovery",
    activeDocsOrBranches: ["phase2-model-reviewed-candidate-discovery"],
  });
  const review = await reviewEpisodeForCandidates(episodePacket, reviewOptions);
  const converted = convertCandidateReviewProposalsToLedgerSources({
    proposals: review.proposals,
    projectId: input.projectId,
    sessionKey: input.sessionKey,
    previousSkillCandidates: input.skillCandidateReport.records,
  });
  return {
    episodeKey: prefilter.episodeKey,
    triggerDecision: trigger.decision,
    triggerReport: trigger.report,
    reviewReport: review.report,
    codexAdapterReport: codexAdapter?.report ?? null,
    proposals: review.proposals,
    skillCandidates: converted.skillCandidates,
    opportunities: converted.opportunities,
  };
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
  const extractionSources = recentAssistantExtractionSources(
    activityStoreReport.store.records.filter(
      (source) => source.projectId === params.projectId && source.sessionKey === params.sessionKey,
    ),
  );
  const projectActivitySources = activityStoreReport.store.records.filter(
    (source) => source.projectId === params.projectId,
  );
  const existingSkills = loadExistingSkillBriefs({ cfg, sessionKey: params.sessionKey });
  const extractionReport = await buildPhase2ProactivityOpportunityExtractionReport({
    sources: extractionSources,
    env: process.env,
  });
  const recurringPatternReport = await buildPhase2ProactivityRecurringPatternReport({
    sources: projectActivitySources,
    env: process.env,
  });
  const projectAssistantCandidates = (
    await buildPhase2ProactivityOpportunityExtractionReport({
      sources: projectActivitySources.filter(
        (source) =>
          source.sourceKind === "assistant_turn" || source.sourceKind === "planning_output",
      ),
      env: process.env,
    })
  ).candidates;
  const skillCandidateReport = await buildPhase2SkillCandidateLedgerReport({
    now: new Date(),
    activities: projectActivitySources as Phase2SkillCandidateActivitySource[],
    assistantCandidates: projectAssistantCandidates,
    previousRecords: activityStoreReport.store.skillCandidates ?? [],
  });
  const modelReviewedCandidates = await buildModelReviewedCandidateSources({
    cfg,
    sessionKey: params.sessionKey,
    projectId: params.projectId,
    projectActivitySources,
    skillCandidateReport,
    recurringPatternReport,
    existingSkills,
    previousEpisodeKeys: activityStoreReport.store.candidateReviewEpisodeKeys ?? [],
  });
  const modelReviewedSkillOpportunities = modelReviewedCandidates.opportunities.filter(
    (opportunity): opportunity is Phase2SkillCandidateOpportunity =>
      opportunity.sourceFamily === "skill_candidate" && "skillCandidate" in opportunity,
  );
  const effectiveSkillCandidateReport: Phase2SkillCandidateLedgerReport = {
    ...skillCandidateReport,
    decision:
      skillCandidateReport.opportunities.length > 0 || modelReviewedSkillOpportunities.length > 0
        ? "skill_candidates_ready"
        : "no_skill_candidates",
    records: dedupeSkillCandidates([
      ...skillCandidateReport.records,
      ...modelReviewedCandidates.skillCandidates,
    ]),
    opportunities: [
      ...skillCandidateReport.opportunities,
      ...modelReviewedSkillOpportunities,
    ].filter(
      (opportunity, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.skillCandidate.skillCandidateId ===
            opportunity.skillCandidate.skillCandidateId,
        ) === index,
    ),
  };
  const baseLedgerSources: Phase2OpportunityLedgerSource[] = [
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
    ...effectiveSkillCandidateReport.opportunities,
    ...modelReviewedCandidates.opportunities.filter(
      (opportunity) => opportunity.sourceFamily !== "skill_candidate",
    ),
    ...recurringPatternReport.opportunities.map((opportunity) => ({
      ...opportunity,
      sourceFamily: "pattern_or_followup" as const,
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      generatedAt: new Date().toISOString(),
    })),
  ];
  const baseLedgerReport = await buildPhase2ProactivityOpportunityLedgerReport({
    repoRoot: process.cwd(),
    opportunities: baseLedgerSources,
    activitySources: projectActivitySources,
    lifecycleOverrides: activityStoreReport.store.lifecycleOverrides.filter(
      (override) => override.projectId === params.projectId,
    ),
    env: process.env,
  });
  const baseFollowupReport = await buildPhase2ProactivityOutcomeFollowupReport({
    entries: baseLedgerReport.ledger.entries,
    env: process.env,
  });
  const baseEffectiveLedgerReport =
    baseFollowupReport.decisions.length === 0
      ? baseLedgerReport
      : {
          ...baseLedgerReport,
          ledger: {
            ...baseLedgerReport.ledger,
            entries: baseLedgerReport.ledger.entries.map((entry) => {
              const decision = baseFollowupReport.decisions.find(
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
  const growthLoopReport = await buildPhase2ProactivityGrowthLoopReport({
    now: new Date(),
    projectId: params.projectId,
    sessionKey: params.sessionKey,
    activitySources: projectActivitySources,
    recurringPatternReport,
    ledgerEntries: baseEffectiveLedgerReport.ledger.entries,
    previousState: activityStoreReport.store.growthLoopState ?? null,
    previousWorkingBuffer: activityStoreReport.store.workingBuffer ?? null,
  });
  const ledgerSources: Phase2OpportunityLedgerSource[] = [
    ...baseLedgerSources,
    ...growthLoopReport.opportunities,
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
    skillPackageDrafts: activityStoreReport.store.skillPackageDrafts ?? [],
    existingSkills,
    modelBriefOptions: buildModelAuthoredBriefOptions({ cfg, env: process.env }),
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
  await updatePersistedOperatingState({
    storePath: activityStoreReport.storePath,
    growthLoopState: growthLoopReport.state,
    workingBuffer: growthLoopReport.workingBuffer,
    maintenanceJobs: growthLoopReport.maintenanceJobs,
    recoveryState: growthLoopReport.recoveryState,
    skillCandidates: dedupeSkillCandidates(effectiveSkillCandidateReport.records),
    candidateReviewEpisodeKey: modelReviewedCandidates.reviewReport
      ? modelReviewedCandidates.episodeKey
      : null,
    candidateReviewReportHash: modelReviewedCandidates.reviewReport
      ? sha256(modelReviewedCandidates.reviewReport)
      : null,
  });
  return {
    activityStoreReport,
    liveDetectionReport,
    extractionReport,
    recurringPatternReport,
    skillCandidateReport: effectiveSkillCandidateReport,
    skillifierDrafts: activityStoreReport.store.skillPackageDrafts ?? [],
    growthLoopReport,
    ledgerReport: effectiveLedgerReport,
    followupReport,
    draftReport,
    productSurfacingReport,
    heartbeatReport,
    candidateReviewReport: modelReviewedCandidates.reviewReport,
    candidateReviewTriggerDecision: modelReviewedCandidates.triggerDecision,
    candidateReviewTriggerReport: modelReviewedCandidates.triggerReport,
    candidateReviewProposals: modelReviewedCandidates.proposals,
    candidateReviewCodexAdapterReport: modelReviewedCandidates.codexAdapterReport,
  };
}

export async function createSkillifierDraftForCandidate(params: {
  cfg?: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
  operatorId: string;
  userId: string;
  recipientId: string;
  skillCandidateId: string;
  requestedTargetKind?: Phase2SkillifierDraftTargetKind;
}): Promise<{
  activityStoreReport: Phase2ProactivityActivityStoreReport;
  report: Phase2SkillifierReport;
}> {
  const cfg = params.cfg ?? loadConfig();
  const state = await buildModelMemoryProactivityRuntimeState({
    cfg,
    sessionKey: params.sessionKey,
    projectId: params.projectId,
    operatorId: params.operatorId,
    userId: params.userId,
    recipientId: params.recipientId,
  });
  const skillCandidate = state.skillCandidateReport.records.find(
    (record) => record.skillCandidateId === params.skillCandidateId,
  );
  if (!skillCandidate) {
    throw new Error(`unknown skill candidate: ${params.skillCandidateId}`);
  }
  const ledgerEntry = state.ledgerReport.ledger.entries.find(
    (entry) => entry.skillCandidate?.skillCandidateId === params.skillCandidateId,
  );
  if (!ledgerEntry) {
    throw new Error(
      `missing proactivity ledger entry for skill candidate: ${params.skillCandidateId}`,
    );
  }
  const sessionAgentId = resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: cfg,
  });
  const workspaceDir = resolveAgentWorkspaceDir(cfg, sessionAgentId);
  const report = await createPhase2SkillifierDraft({
    workspaceDir,
    skillCandidate,
    ledgerEntry,
    requestedTargetKind: params.requestedTargetKind,
  });
  const store = await loadActivityStore(state.activityStoreReport.storePath);
  store.skillPackageDrafts = dedupeSkillPackageDrafts([
    ...(store.skillPackageDrafts ?? []),
    report.draft,
  ]);
  await saveActivityStore(state.activityStoreReport.storePath, store);
  if (report.decision === "draft_ready") {
    await updatePersistedProactivityLifecycleOverride({
      sessionKey: params.sessionKey,
      projectId: params.projectId,
      override: {
        opportunityId: skillCandidate.proactivityOpportunityId,
        status: "draft_ready",
        updatedAt: new Date().toISOString(),
      },
    });
  }
  const activityStoreReport = await syncAuthoritativeProactivityActivities({
    cfg,
    sessionKey: params.sessionKey,
    projectId: params.projectId,
  });
  return { activityStoreReport, report };
}

export async function buildHeartbeatProactivityReviewText(params: {
  cfg?: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
  operatorId?: string;
  userId?: string;
  recipientId?: string;
}): Promise<{
  prompt: string;
  items: Array<{
    workItemId: string;
    queueItemId: string;
    opportunityClass?:
      | "skill_candidate"
      | "reverse_prompt"
      | "followup"
      | "delight"
      | "self_healing"
      | "recovery"
      | "standard";
    skillCandidateId?: string;
    title: string;
    whyNow: string;
    proposedNextStep: string;
    expectedUserValue: string;
    confidence: "high" | "medium" | "low";
    draftReady: boolean;
    evidenceSummary: string;
    sourceRefs: string[];
  }>;
  reversePromptItems: string[];
  followupItems: string[];
  delightItems: string[];
  selfHealingItems: string[];
  draftReadyItems: string[];
  state: GatewayProactivityBuildState;
} | null> {
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
  const items: NonNullable<
    Awaited<ReturnType<typeof buildHeartbeatProactivityReviewText>>
  >["items"] = topItems.map((item) => {
    const queueItem = state.productSurfacingReport.queue.items.find(
      (candidate) => candidate.workItemId === item.workItemId,
    );
    return {
      workItemId: item.workItemId,
      queueItemId: item.queueItemId,
      opportunityClass: queueItem?.opportunityClass ?? "standard",
      skillCandidateId: queueItem?.skillCandidate?.skillCandidateId,
      title: item.title,
      whyNow: item.whyNow,
      proposedNextStep: item.proposedNextStep,
      expectedUserValue: item.expectedUserValue,
      confidence: item.confidence,
      draftReady: queueItem?.draftReady === true,
      evidenceSummary: queueItem?.evidenceSummary ?? "",
      sourceRefs: item.sourceRefs,
    };
  });
  return {
    prompt: boundedMultilineSummary(
      [
        "What would help this user today?",
        "Reply with up to 3 concise items.",
        "For each item include a short title, why now, and next step.",
        "A useful follow-up question is allowed when it would help more than another ordinary task.",
        "Keep it user-facing. Do not include timestamps, source refs, or system text.",
        "If nothing needs attention, reply HEARTBEAT_OK.",
      ].join("\n"),
    ),
    items,
    reversePromptItems: state.growthLoopReport.reversePrompts
      .filter((prompt) =>
        ["missing_context_question", "adjacent_investigation_prompt"].includes(prompt.kind),
      )
      .map((prompt) => prompt.question)
      .slice(0, 3),
    followupItems: state.growthLoopReport.reversePrompts
      .filter((prompt) => ["stale_outcome_prompt", "recovery_prompt"].includes(prompt.kind))
      .map((prompt) => prompt.question)
      .slice(0, 3),
    delightItems: state.growthLoopReport.reversePrompts
      .filter((prompt) => prompt.kind === "delight_prompt")
      .map((prompt) => prompt.question)
      .slice(0, 2),
    selfHealingItems: state.growthLoopReport.reversePrompts
      .filter((prompt) => prompt.kind === "self_healing_prompt")
      .map((prompt) => prompt.question)
      .slice(0, 2),
    draftReadyItems: items.filter((item) => item.draftReady).map((item) => item.title),
    state,
  };
}
