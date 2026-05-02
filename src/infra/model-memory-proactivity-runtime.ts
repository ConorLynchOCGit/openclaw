import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPhase2HeartbeatProactivityReliabilityReport,
  buildPhase2LiveProactivityDetectionReport,
  buildPhase2ProactivityAutonomousInternalDraftingReport,
  buildPhase2ProactivityGrowthLoopReport,
  buildPhase2ProactivityInboxReport,
  buildPhase2ProactivityNoiseBudgetReport,
  buildPhase2ProactivityOpportunityExtractionReport,
  buildPhase2ProactivityOpportunityLedgerReport,
  buildPhase2ProactivityOutcomeFollowupReport,
  buildPhase2ProactivityRecurringPatternReport,
  buildPhase2ProductProactivitySurfacingReport,
  buildPhase2SkillCandidateLedgerReport,
  buildProactivityReviewEpisodePacketFromOutcomePack,
  classifySystemEventForProactivity,
  convertCoverageSourceToLiveSignalSource,
  convertCandidateReviewProposalsToLedgerSources,
  createPhase2SkillifierDraft,
  adjudicateNewProactivityOpportunityMerge,
  discoverWorkEpisodeOutcomePackArtifacts,
  reviewEpisodeForCandidates,
  writeProactivityReviewEpisodePacketArtifact,
  type CandidateReviewCodexAdapterReport,
  type CandidateReviewModelOptions,
  type CandidateReviewProposal,
  type CandidateReviewRecentActivity,
  type CandidateReviewReport,
  type CandidateReviewRuntime,
  type CandidateReviewTriggerDecision,
  type CandidateReviewTriggerReport,
  type Phase2AutonomousDraftReport,
  type Phase2HeartbeatProactivityReport,
  type Phase2LiveProactivitySignalSource,
  type Phase2LiveSignalCoverageSource,
  type Phase2AutonomousMaintenanceJob,
  type Phase2GrowthLoopReport,
  type Phase2GrowthLoopState,
  type Phase2ProactivityCompactionRecoveryState,
  type Phase2ProactivityWorkingBuffer,
  type Phase2ProactivityInboxReport,
  Phase2ProactivityMergeAdjudicationCache,
  Phase2ProactivityMergeAdjudicationReport,
  Phase2ProactivityNewOpportunityMergeReport,
  type Phase2OpportunityExtractionSourceKind,
  type Phase2OpportunityLedgerLifecycleOverride,
  type Phase2OpportunityLedgerReport,
  type Phase2OpportunityLedgerSource,
  type Phase2ProductProactivitySurfacingInput,
  type Phase2ProductProactivitySurfacingReport,
  type Phase2SkillCandidateActivitySource,
  type Phase2SkillCandidateLedgerReport,
  type Phase2SkillCandidateOpportunity,
  type Phase2SkillCandidateRecord,
  type Phase2SkillPackageDraft,
  type Phase2SkillifierDraftTargetKind,
  type Phase2SkillifierReport,
  type Phase2UserFacingProactivityExistingSkill,
  type SourceAuthorityTier,
  type SourceProfileId,
  type WorkEpisodeOutcomePack,
  type WorkEpisodeOutcomePackDiscoveryRecord,
  type WorkEpisodeOutcomePackEligibilityStatus,
  type WorkEpisodeOutcomePackOutcomeStatus,
  type WorkEpisodeOutcomePackRuntime,
  type WorkEpisodeOutcomePackWorkType,
} from "../../extensions/model-memory/runtime-api.js";
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
  modelReviewedOpportunities?: Phase2OpportunityLedgerSource[];
  skillPackageDrafts?: Phase2SkillPackageDraft[];
  candidateReviewEpisodeKeys?: Array<{
    episodeKey: string;
    reviewedAt: string;
    reportHash?: string;
  }>;
  workEpisodeOutcomePacks?: Phase2WorkEpisodeOutcomePackIndexEntry[];
  proactivityMergeAdjudicationCache?: Phase2ProactivityMergeAdjudicationCache | null;
  readProjection?: Phase2ProactivityReadProjection | null;
};

export type Phase2ProactivityReadProjection = {
  schemaVersion: "phase2_proactivity_read_projection.v1";
  generatedAt: string;
  projectId: string;
  sessionKey: string;
  productSurfacingReport: Phase2ProductProactivitySurfacingReport;
  inboxReport: Phase2ProactivityInboxReport;
  heartbeatReport: Phase2HeartbeatProactivityReport;
};

export type Phase2ProactivityReadProjectionReport = {
  schemaVersion: "phase2_proactivity_read_projection_read.v1";
  reportId: string;
  generatedAt: string;
  decision: "projection_ready" | "projection_missing" | "scope_mismatch";
  storePath: string;
  projectId: string;
  sessionKey: string;
  projection: Phase2ProactivityReadProjection | null;
  workEpisodeOutcomePackIndex: Phase2WorkEpisodeOutcomePackIndexEntry[];
};

export type Phase2WorkEpisodeOutcomePackReviewStatus =
  | "unreviewed"
  | "reviewed"
  | "skipped"
  | "quarantined"
  | "failed";

export type Phase2WorkEpisodeOutcomePackIndexEntry = {
  episodeId: string;
  contentHash: string;
  packPath: string;
  projectId: string;
  sessionKey?: string;
  branch?: string;
  runtime: WorkEpisodeOutcomePackRuntime;
  outcomeStatus: WorkEpisodeOutcomePackOutcomeStatus;
  workType?: WorkEpisodeOutcomePackWorkType;
  completedAt: string;
  indexedAt: string;
  reviewStatus: Phase2WorkEpisodeOutcomePackReviewStatus;
  eligibilityStatus: WorkEpisodeOutcomePackEligibilityStatus;
  eligibilityReasonCodes: string[];
  reviewArtifactPath?: string;
  reviewedAt?: string;
  errorSummary?: string;
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
  candidateReviewOverride?: {
    cooldownMs?: number;
    forceRun?: boolean;
    codexSessionRoot?: string;
    codexHistoryPath?: string;
  };
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
  mergeAdjudicationReport?: Phase2ProactivityMergeAdjudicationReport | null;
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
const CANDIDATE_REVIEW_ENABLED_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED";
const CANDIDATE_REVIEW_MODEL_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL";
const CANDIDATE_REVIEW_REASONING_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_REASONING_EFFORT";
const CANDIDATE_REVIEW_VERBOSITY_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_VERBOSITY";
const CANDIDATE_REVIEW_TIMEOUT_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_TIMEOUT_MS";
const CANDIDATE_REVIEW_MAX_OUTPUT_TOKENS_ENV =
  "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_OUTPUT_TOKENS";
const CANDIDATE_REVIEW_MAX_PER_SESSION_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_PER_SESSION";
const CANDIDATE_REVIEW_MAX_PER_DAY_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_PER_DAY";
const CANDIDATE_REVIEW_ARTIFACT_ROOT_ENV = "MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ARTIFACT_ROOT";
const WORK_EPISODE_OUTCOME_PACK_ROOT_ENV = "MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT";
const PACK_REVIEW_MAX_PER_RUN_ENV = "MODEL_MEMORY_PHASE2_PACK_REVIEW_MAX_PER_RUN";
const DEFAULT_CANDIDATE_REVIEW_TIMEOUT_MS = 120_000;
const DEFAULT_CANDIDATE_REVIEW_MAX_OUTPUT_TOKENS = 6_000;
const DEFAULT_CANDIDATE_REVIEW_MAX_PER_SESSION = 12;
const DEFAULT_CANDIDATE_REVIEW_MAX_PER_DAY = 24;
const DEFAULT_PACK_REVIEW_MAX_PER_RUN = 3;
const CANDIDATE_REVIEW_CROSS_RUNTIME_EPISODE_PAD_MS = 45 * 60 * 1_000;
const MAX_HIGH_CONTEXT_USER_TURN_CHARS = 8_000;
const MAX_HIGH_CONTEXT_ASSISTANT_TURN_CHARS = 12_000;
const MAX_HIGH_CONTEXT_SESSION_ACTIVITIES = 36;
const CANDIDATE_REVIEW_ARTIFACT_RELATIVE_DIR = path.join(
  ".artifacts",
  "model-memory",
  "phase2-contiguous-candidate-packets-and-model-cards",
);

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
      "high",
    ),
    verbosity: readAllowedValue(
      params.env[CANDIDATE_REVIEW_VERBOSITY_ENV],
      ["low", "medium"] as const,
      "medium",
    ),
    maxOutputTokens: readPositiveInteger(
      params.env[CANDIDATE_REVIEW_MAX_OUTPUT_TOKENS_ENV],
      DEFAULT_CANDIDATE_REVIEW_MAX_OUTPUT_TOKENS,
    ),
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

function boundedHighContextTurnText(value: unknown, maxChars: number): string {
  const raw = readString(value) ?? "";
  return raw
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars)
    .trim();
}

function capCandidateReviewActivitiesByChars(
  activities: CandidateReviewRecentActivity[],
  maxChars: number,
): CandidateReviewRecentActivity[] {
  const selected: CandidateReviewRecentActivity[] = [];
  let totalChars = 0;
  for (const activity of activities.toReversed()) {
    const nextTotal = totalChars + activity.boundedText.length;
    if (selected.length > 0 && nextTotal > maxChars) {
      continue;
    }
    selected.push(activity);
    totalChars = nextTotal;
  }
  return selected.toReversed();
}

function candidateReviewActivityMs(activity: CandidateReviewRecentActivity): number | null {
  const parsed = activity.recordedAt ? Date.parse(activity.recordedAt) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function compareCandidateReviewActivities(
  left: CandidateReviewRecentActivity,
  right: CandidateReviewRecentActivity,
): number {
  const leftMs = candidateReviewActivityMs(left);
  const rightMs = candidateReviewActivityMs(right);
  if (leftMs !== null && rightMs !== null) {
    return leftMs - rightMs;
  }
  if (leftMs !== null) {
    return -1;
  }
  if (rightMs !== null) {
    return 1;
  }
  return left.ref.localeCompare(right.ref);
}

function uniqueCandidateReviewActivities(
  activities: CandidateReviewRecentActivity[],
): CandidateReviewRecentActivity[] {
  const seen = new Set<string>();
  return activities.filter((activity) => {
    if (seen.has(activity.ref)) {
      return false;
    }
    seen.add(activity.ref);
    return true;
  });
}

function exactPresentationKey(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function uniqueByExactPresentationKey<TValue>(
  values: TValue[],
  keyForValue: (value: TValue) => string | undefined,
): TValue[] {
  const selected = new Map<string, TValue>();
  for (const value of values) {
    const key = exactPresentationKey(keyForValue(value) ?? "");
    if (!key) {
      continue;
    }
    selected.set(key, value);
  }
  return [...selected.values()];
}

function activityWithinEpisodeTimeWindow(
  activity: CandidateReviewRecentActivity,
  window: { startMs: number | null; endMs: number | null },
): boolean {
  const activityMs = candidateReviewActivityMs(activity);
  if (activityMs === null || window.startMs === null || window.endMs === null) {
    return false;
  }
  return (
    activityMs >= window.startMs - CANDIDATE_REVIEW_CROSS_RUNTIME_EPISODE_PAD_MS &&
    activityMs <= window.endMs + CANDIDATE_REVIEW_CROSS_RUNTIME_EPISODE_PAD_MS
  );
}

function episodeTimeWindow(activities: CandidateReviewRecentActivity[]): {
  startMs: number | null;
  endMs: number | null;
} {
  const times = activities
    .map(candidateReviewActivityMs)
    .filter((value): value is number => typeof value === "number");
  if (times.length === 0) {
    return { startMs: null, endMs: null };
  }
  return { startMs: Math.min(...times), endMs: Math.max(...times) };
}

export type CandidateReviewRecentEpisodeAssemblyReport = {
  primaryRuntime: Exclude<CandidateReviewRuntime, "mixed">;
  reasonCodes: string[];
  inputCounts: {
    openclaw: number;
    codex: number;
    heartbeat: number;
  };
  selectedCounts: {
    openclaw: number;
    codex: number;
    heartbeat: number;
    total: number;
  };
  droppedCounts: {
    codexOutsideEpisode: number;
    openclawOutsideEpisode: number;
  };
  refs: string[];
};

export function buildCandidateReviewRecentEpisodeActivities(input: {
  openClawActivities: CandidateReviewRecentActivity[];
  codexActivities: CandidateReviewRecentActivity[];
  heartbeatActivities?: CandidateReviewRecentActivity[];
  openClawTurnWindow: number;
  codexTurnWindow: number;
  packetMaxChars: number;
  heartbeatIsReviewTrigger?: boolean;
}): {
  activities: CandidateReviewRecentActivity[];
  report: CandidateReviewRecentEpisodeAssemblyReport;
} {
  const openClawNarrative = input.openClawActivities
    .filter((activity) => activity.role === "user" || activity.role === "assistant")
    .toSorted(compareCandidateReviewActivities);
  const codexActivities = input.codexActivities.toSorted(compareCandidateReviewActivities);
  const heartbeatActivities = (input.heartbeatActivities ?? []).toSorted(
    compareCandidateReviewActivities,
  );
  const latestOpenClaw = openClawNarrative.at(-1);
  const latestCodex = codexActivities.at(-1);
  const latestOpenClawMs = latestOpenClaw ? candidateReviewActivityMs(latestOpenClaw) : null;
  const latestCodexMs = latestCodex ? candidateReviewActivityMs(latestCodex) : null;
  const primaryRuntime: Exclude<CandidateReviewRuntime, "mixed"> =
    (input.heartbeatIsReviewTrigger && latestOpenClawMs !== null) || latestCodexMs === null
      ? "openclaw"
      : latestOpenClawMs === null || latestCodexMs > latestOpenClawMs
        ? "codex"
        : "openclaw";
  const primaryActivities =
    primaryRuntime === "openclaw"
      ? openClawNarrative.slice(-input.openClawTurnWindow)
      : codexActivities.slice(-input.codexTurnWindow);
  const primaryWindow = episodeTimeWindow(primaryActivities);
  const secondaryOpenClaw =
    primaryRuntime === "codex"
      ? openClawNarrative
          .filter((activity) => activityWithinEpisodeTimeWindow(activity, primaryWindow))
          .slice(-input.openClawTurnWindow)
      : [];
  const secondaryCodex =
    primaryRuntime === "openclaw"
      ? codexActivities
          .filter((activity) => activityWithinEpisodeTimeWindow(activity, primaryWindow))
          .slice(-input.codexTurnWindow)
      : [];
  const droppedCounts = {
    codexOutsideEpisode:
      primaryRuntime === "openclaw" ? codexActivities.length - secondaryCodex.length : 0,
    openclawOutsideEpisode:
      primaryRuntime === "codex" ? openClawNarrative.length - secondaryOpenClaw.length : 0,
  };
  const selectedBeforeCap = uniqueCandidateReviewActivities([
    ...primaryActivities,
    ...secondaryOpenClaw,
    ...secondaryCodex,
    ...heartbeatActivities,
  ]).toSorted(compareCandidateReviewActivities);
  const activities = capCandidateReviewActivitiesByChars(selectedBeforeCap, input.packetMaxChars);
  const selectedCounts = {
    openclaw: activities.filter(
      (activity) => activity.sourceRuntime !== "codex" && activity.role !== "system_event",
    ).length,
    codex: activities.filter((activity) => activity.sourceRuntime === "codex").length,
    heartbeat: activities.filter((activity) => activity.role === "system_event").length,
    total: activities.length,
  };
  return {
    activities,
    report: {
      primaryRuntime,
      reasonCodes: [
        "bounded_primary_episode",
        primaryRuntime === "openclaw" ? "openclaw_primary" : "codex_primary",
        input.heartbeatIsReviewTrigger ? "heartbeat_anchor" : "latest_activity_anchor",
        selectedCounts.codex > 0 ? "codex_within_episode_window" : "codex_not_in_episode_window",
      ],
      inputCounts: {
        openclaw: openClawNarrative.length,
        codex: codexActivities.length,
        heartbeat: heartbeatActivities.length,
      },
      selectedCounts,
      droppedCounts,
      refs: activities.map((activity) => activity.ref),
    },
  };
}

export function selectCandidateReviewEventActivities(input: {
  recentActivities: CandidateReviewRecentActivity[];
  heartbeatIsReviewTrigger?: boolean;
}): CandidateReviewRecentActivity[] {
  if (!input.heartbeatIsReviewTrigger) {
    return input.recentActivities;
  }
  const contentActivities = input.recentActivities.filter(
    (activity) =>
      activity.role !== "system_event" && !activity.ref.startsWith("gateway://heartbeat/"),
  );
  return contentActivities.length > 0 ? contentActivities : input.recentActivities;
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
        modelReviewedOpportunities: Array.isArray(parsed.modelReviewedOpportunities)
          ? parsed.modelReviewedOpportunities
          : [],
        skillPackageDrafts: Array.isArray(parsed.skillPackageDrafts)
          ? parsed.skillPackageDrafts
          : [],
        candidateReviewEpisodeKeys: Array.isArray(parsed.candidateReviewEpisodeKeys)
          ? parsed.candidateReviewEpisodeKeys
          : [],
        workEpisodeOutcomePacks: Array.isArray(parsed.workEpisodeOutcomePacks)
          ? parsed.workEpisodeOutcomePacks
          : [],
        proactivityMergeAdjudicationCache: parsed.proactivityMergeAdjudicationCache ?? null,
        readProjection: parsed.readProjection ?? null,
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
    modelReviewedOpportunities: [],
    skillPackageDrafts: [],
    candidateReviewEpisodeKeys: [],
    workEpisodeOutcomePacks: [],
    proactivityMergeAdjudicationCache: null,
    readProjection: null,
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
  skillPackageDrafts?: Phase2SkillPackageDraft[];
  modelReviewedOpportunities: Phase2OpportunityLedgerSource[];
  modelMergeLifecycleOverrides?: Phase2ProactivityActivityStore["lifecycleOverrides"];
  workEpisodeOutcomePacks?: Phase2WorkEpisodeOutcomePackIndexEntry[];
  proactivityMergeAdjudicationCache?: Phase2ProactivityMergeAdjudicationCache | null;
  readProjection?: Phase2ProactivityReadProjection;
  candidateReviewEpisodeKey?: string | null;
  candidateReviewReportHash?: string | null;
}): Promise<Phase2ProactivityActivityStore> {
  const store = await loadActivityStore(params.storePath);
  store.growthLoopState = params.growthLoopState;
  store.workingBuffer = params.workingBuffer;
  store.maintenanceJobs = params.maintenanceJobs.slice(0, 6);
  store.recoveryState = params.recoveryState;
  store.skillCandidates = params.skillCandidates;
  if (params.skillPackageDrafts) {
    store.skillPackageDrafts = dedupeSkillPackageDrafts(params.skillPackageDrafts);
  }
  store.modelReviewedOpportunities = dedupeModelReviewedOpportunities([
    ...(store.modelReviewedOpportunities ?? []),
    ...params.modelReviewedOpportunities,
  ]);
  store.lifecycleOverrides = dedupeOverrides([
    ...store.lifecycleOverrides,
    ...(params.modelMergeLifecycleOverrides ?? []),
  ]);
  if (params.workEpisodeOutcomePacks) {
    store.workEpisodeOutcomePacks = dedupeWorkEpisodeOutcomePackIndexEntries(
      params.workEpisodeOutcomePacks,
    );
  }
  if (params.proactivityMergeAdjudicationCache !== undefined) {
    store.proactivityMergeAdjudicationCache = params.proactivityMergeAdjudicationCache;
  }
  if (params.readProjection) {
    store.readProjection = params.readProjection;
  }
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

export async function readPersistedModelMemoryProactivityProjection(params: {
  cfg?: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
}): Promise<Phase2ProactivityReadProjectionReport> {
  const cfg = params.cfg ?? loadConfig();
  const target = resolveGatewaySessionStoreTarget({ cfg, key: params.sessionKey });
  const store = await loadActivityStore(target.storePath);
  const projection = store.readProjection ?? null;
  const decision = !projection
    ? "projection_missing"
    : projection.projectId === params.projectId && projection.sessionKey === params.sessionKey
      ? "projection_ready"
      : "scope_mismatch";
  return {
    schemaVersion: "phase2_proactivity_read_projection_read.v1",
    reportId: `phase2-proactivity-read-projection:${sha256({
      storePath: target.storePath,
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      decision,
      projectionGeneratedAt: projection?.generatedAt ?? null,
    }).slice(0, 16)}`,
    generatedAt: new Date().toISOString(),
    decision,
    storePath: resolveProactivityStorePath(target.storePath),
    projectId: params.projectId,
    sessionKey: params.sessionKey,
    projection: decision === "projection_ready" ? projection : null,
    workEpisodeOutcomePackIndex: store.workEpisodeOutcomePacks ?? [],
  };
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

function readOpportunityUpdatedAt(source: Phase2OpportunityLedgerSource): string {
  if ("generatedAt" in source && typeof source.generatedAt === "string") {
    return source.generatedAt;
  }
  if (
    source.sourceFamily === "skill_candidate" &&
    typeof source.skillCandidate.updatedAt === "string"
  ) {
    return source.skillCandidate.updatedAt;
  }
  return "";
}

function dedupeModelReviewedOpportunities(
  records: Phase2OpportunityLedgerSource[],
): Phase2OpportunityLedgerSource[] {
  const byId = new Map<string, Phase2OpportunityLedgerSource>();
  for (const record of records) {
    if (!record.blockedReasonCodes.includes("model_reviewed_candidate")) {
      continue;
    }
    const existing = byId.get(record.opportunityId);
    if (!existing || readOpportunityUpdatedAt(existing) < readOpportunityUpdatedAt(record)) {
      byId.set(record.opportunityId, record);
    }
  }
  return [...byId.values()]
    .toSorted((left, right) =>
      readOpportunityUpdatedAt(left).localeCompare(readOpportunityUpdatedAt(right)),
    )
    .slice(-MAX_LIFECYCLE_OVERRIDES);
}

function packIndexKey(
  entry: Pick<Phase2WorkEpisodeOutcomePackIndexEntry, "episodeId" | "contentHash">,
): string {
  return `${entry.episodeId}\t${entry.contentHash}`;
}

function dedupeWorkEpisodeOutcomePackIndexEntries(
  records: Phase2WorkEpisodeOutcomePackIndexEntry[],
): Phase2WorkEpisodeOutcomePackIndexEntry[] {
  const byKey = new Map<string, Phase2WorkEpisodeOutcomePackIndexEntry>();
  for (const record of records) {
    const key = packIndexKey(record);
    const existing = byKey.get(key);
    if (
      !existing ||
      (existing.reviewedAt ?? existing.indexedAt) < (record.reviewedAt ?? record.indexedAt)
    ) {
      byKey.set(key, record);
    }
  }
  return [...byKey.values()].toSorted((left, right) => {
    const leftMs = Date.parse(left.completedAt);
    const rightMs = Date.parse(right.completedAt);
    if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
      return leftMs - rightMs;
    }
    return left.packPath.localeCompare(right.packPath);
  });
}

function filterModelMergeLifecycleOverrides(params: {
  existingOverrides: Phase2ProactivityActivityStore["lifecycleOverrides"];
  mergeOverrides: Phase2ProactivityActivityStore["lifecycleOverrides"];
}): Phase2ProactivityActivityStore["lifecycleOverrides"] {
  const userControlledStatuses = new Set<Phase2OpportunityLedgerLifecycleOverride["status"]>([
    "planning_started",
    "planned",
    "in_progress",
    "done",
    "dismissed",
    "snoozed",
  ]);
  const protectedOpportunityIds = new Set(
    params.existingOverrides
      .filter((override) => userControlledStatuses.has(override.status))
      .map((override) => override.opportunityId),
  );
  return params.mergeOverrides.filter(
    (override) =>
      override.status === "superseded" && !protectedOpportunityIds.has(override.opportunityId),
  );
}

function buildAutoPlanDraftArtifact(params: {
  opportunity: Phase2OpportunityLedgerSource;
  projectId: string;
  sessionKey: string;
}): Phase2ProactivityActivityStore["lifecycleOverrides"][number] | null {
  const { opportunity } = params;
  if (opportunity.sourceFamily === "skill_candidate") {
    return null;
  }
  if (!("opportunityClass" in opportunity) || opportunity.opportunityClass !== "proactive_plan") {
    return null;
  }
  const generatedAt = new Date().toISOString();
  const compiledPlan = [
    `# ${opportunity.title}`,
    "",
    "## Objective",
    opportunity.whyNow,
    "",
    "## Proposed Approach",
    opportunity.proposedNextStep,
    "",
    "## Expected User Value",
    opportunity.expectedUserValue,
    "",
    "## Evidence",
    opportunity.evidenceSummary,
    "",
    "## Validation",
    "Review this draft in Work Queue, request revisions if needed, then finalize to produce a Codex-ready prompt. Do not execute automatically.",
    "",
    "## Codex-Ready Prompt Draft",
    [
      `Implement this bounded plan: ${opportunity.title}.`,
      `Context: ${opportunity.whyNow}`,
      `Approach: ${opportunity.proposedNextStep}`,
      `Expected value: ${opportunity.expectedUserValue}`,
      "Do not perform outbound sending, autonomous execution, skill installation, or skill promotion.",
    ].join("\n"),
  ].join("\n");
  return {
    opportunityId: opportunity.opportunityId,
    projectId: params.projectId,
    sessionKey: params.sessionKey,
    status: "draft_ready",
    updatedAt: generatedAt,
    reviewStatus: "pending_review",
    plannedArtifact: {
      status: "compiled",
      reviewStatus: "pending_review",
      title: opportunity.title,
      requestSummary: opportunity.proposedNextStep,
      compiledPlan,
      generatedAt,
      updatedAt: generatedAt,
      contentHash: sha256({
        opportunityId: opportunity.opportunityId,
        compiledPlan,
        sourceRefs: opportunity.sourceRefs,
      }),
    },
  };
}

function buildAutoPlanDraftOverrides(params: {
  opportunities: Phase2OpportunityLedgerSource[];
  existingOverrides: Phase2ProactivityActivityStore["lifecycleOverrides"];
  projectId: string;
  sessionKey: string;
}): Phase2ProactivityActivityStore["lifecycleOverrides"] {
  const existingDrafted = new Set(
    params.existingOverrides
      .filter((override) => override.status === "draft_ready" || override.plannedArtifact)
      .map((override) => override.opportunityId),
  );
  return params.opportunities
    .filter((opportunity) => !existingDrafted.has(opportunity.opportunityId))
    .map((opportunity) =>
      buildAutoPlanDraftArtifact({
        opportunity,
        projectId: params.projectId,
        sessionKey: params.sessionKey,
      }),
    )
    .filter((override): override is Phase2ProactivityActivityStore["lifecycleOverrides"][number] =>
      Boolean(override),
    );
}

function aggregateNewOpportunityMergeReports(params: {
  reports: Phase2ProactivityNewOpportunityMergeReport[];
  generatedAt: string;
  enabled: boolean;
  modelId: string | null;
}): Phase2ProactivityMergeAdjudicationReport {
  const inputHash = sha256({
    reportKind: "write_time_new_opportunity_merge_adjudication",
    reports: params.reports.map((report) => ({
      candidateOpportunityId: report.candidateOpportunityId,
      inputHash: report.inputHash,
      decision: report.newCandidateDecision,
      targetOpportunityId: report.targetOpportunityId,
    })),
  });
  const decisions = params.reports.flatMap((report) => report.decisions);
  const lifecycleOverrides = params.reports.flatMap((report) => report.lifecycleOverrides);
  const reasonCodes = [
    ...new Set(
      params.reports
        .flatMap((report) => report.reasonCodes)
        .concat(
          params.reports.length > 0
            ? ["write_time_candidate_merge_adjudication"]
            : ["no_new_model_reviewed_opportunities"],
        ),
    ),
  ].toSorted();
  const decision = params.reports.some((report) => report.decision === "model_adjudicated")
    ? "model_adjudicated"
    : params.reports.some((report) => report.decision === "model_unavailable")
      ? "model_unavailable"
      : params.reports.some((report) => report.decision === "skipped")
        ? "skipped"
        : "not_needed";
  return {
    schemaVersion: "phase2_proactivity_merge_adjudication.v1",
    reportId: sha256({ generatedAt: params.generatedAt, inputHash }),
    inputHash,
    generatedAt: params.generatedAt,
    enabled: params.enabled,
    modelId: params.modelId,
    decision,
    recallRows: params.reports.flatMap((report) => report.recallRows),
    decisions,
    lifecycleOverrides,
    reasonCodes,
    promptPersisted: false,
    rawResponsePersisted: false,
  };
}

async function adjudicateNewModelReviewedOpportunities(params: {
  newOpportunities: Phase2OpportunityLedgerSource[];
  persistedOpportunities: Phase2OpportunityLedgerSource[];
  existingOverrides: Phase2ProactivityActivityStore["lifecycleOverrides"];
  projectId: string;
  sessionKey: string;
  mergeOptions: ReturnType<typeof buildCandidateReviewOptions>;
}): Promise<{
  acceptedOpportunities: Phase2OpportunityLedgerSource[];
  mergeLifecycleOverrides: Phase2ProactivityActivityStore["lifecycleOverrides"];
  report: Phase2ProactivityMergeAdjudicationReport;
}> {
  const generatedAt = new Date().toISOString();
  const persistedIds = new Set(params.persistedOpportunities.map((source) => source.opportunityId));
  const acceptedOpportunities: Phase2OpportunityLedgerSource[] = [];
  const mergeReports: Phase2ProactivityNewOpportunityMergeReport[] = [];
  const recallPool = [...params.persistedOpportunities];
  for (const opportunity of dedupeModelReviewedOpportunities(params.newOpportunities)) {
    if (persistedIds.has(opportunity.opportunityId)) {
      continue;
    }
    const report = await adjudicateNewProactivityOpportunityMerge(opportunity, recallPool, {
      enabled: params.mergeOptions.enabled,
      executor: params.mergeOptions.executor,
      modelId: params.mergeOptions.modelId,
      reasoningEffort: params.mergeOptions.reasoningEffort,
      maxOutputTokens: Math.min(params.mergeOptions.maxOutputTokens ?? 900, 900),
    });
    mergeReports.push(report);
    if (report.acceptedForSurfacing) {
      acceptedOpportunities.push(opportunity);
      if (
        report.newCandidateDecision === "distinct" ||
        report.newCandidateDecision === "not_applicable"
      ) {
        recallPool.push(opportunity);
      }
    }
  }
  const report = aggregateNewOpportunityMergeReports({
    reports: mergeReports,
    generatedAt,
    enabled: params.mergeOptions.enabled === true,
    modelId: params.mergeOptions.enabled === true ? (params.mergeOptions.modelId ?? null) : null,
  });
  const scopedMergeLifecycleOverrides = report.lifecycleOverrides.map((override) => ({
    ...override,
    projectId: params.projectId,
    sessionKey: params.sessionKey,
    updatedAt: override.updatedAt ?? generatedAt,
  }));
  return {
    acceptedOpportunities,
    mergeLifecycleOverrides: filterModelMergeLifecycleOverrides({
      existingOverrides: params.existingOverrides,
      mergeOverrides: scopedMergeLifecycleOverrides,
    }),
    report,
  };
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

function isInternalHighContextUserPrompt(text: string): boolean {
  const normalized = text.replace(/\s+/gu, " ").trim().toLowerCase();
  return (
    isInternalProactivityWorkflowText(text) ||
    (normalized.includes("what would help this user today") &&
      normalized.includes("reply with up to 3 concise items")) ||
    normalized.includes("untrusted heartbeat context includes proactivityitems") ||
    normalized.includes("safety constraint for this chat response") ||
    normalized.includes("reply with one short acknowledgement only") ||
    normalized.includes("live gateway proof label:") ||
    normalized.includes("for candidate review evidence only") ||
    normalized.includes("use model_memory_search to answer from mmv2 memory only") ||
    normalized.includes("start a bounded open in current chat for this proactive work item")
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

export function transcriptMessagesToHighContextCandidateReviewActivities(input: {
  messages: unknown[];
  sessionKey: string;
}): CandidateReviewRecentActivity[] {
  const activities: CandidateReviewRecentActivity[] = [];
  let lastUserPromptSuppressed = false;
  for (const message of input.messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const role = readString((message as { role?: unknown }).role);
    const timestampValue = (message as { timestamp?: unknown }).timestamp;
    const timestampText = readString(timestampValue);
    const parsedTimestampTextMs = timestampText ? Date.parse(timestampText) : NaN;
    const recordedAt =
      typeof timestampValue === "number" && Number.isFinite(timestampValue)
        ? new Date(timestampValue).toISOString()
        : Number.isFinite(parsedTimestampTextMs)
          ? new Date(parsedTimestampTextMs).toISOString()
          : new Date().toISOString();
    if (role === "user") {
      const rawText = extractFirstTextBlock(message) ?? "";
      const visibleText = stripInboundMetadata(rawText) || rawText;
      const text = boundedHighContextTurnText(visibleText, MAX_HIGH_CONTEXT_USER_TURN_CHARS);
      lastUserPromptSuppressed =
        !text ||
        !isSafeBoundedSummary(text) ||
        isOperationalProactivityUserFacingText(text) ||
        isInternalHighContextUserPrompt(text);
      if (lastUserPromptSuppressed) {
        continue;
      }
      const sourceMessageId =
        readString((message as { __openclaw?: { id?: unknown } }).__openclaw?.id) ??
        `user:${sha256({ sessionKey: input.sessionKey, text, timestamp: recordedAt }).slice(0, 16)}`;
      activities.push({
        ref: `chat://${input.sessionKey}/user_turn/${sourceMessageId}`,
        role: "user",
        kind: "ask",
        boundedText: text,
        sourceRuntime: "openclaw",
        recordedAt,
      });
      continue;
    }
    if (role !== "assistant") {
      continue;
    }
    if (lastUserPromptSuppressed) {
      continue;
    }
    const finalAnswerText = extractAssistantTextForPhase(message, { phase: "final_answer" });
    const assistantVisibleText =
      finalAnswerText ??
      extractAssistantVisibleText(message) ??
      extractAssistantTextForPhase(message, { phase: "commentary" }) ??
      extractFirstTextBlock(message);
    const text = boundedHighContextTurnText(
      assistantVisibleText,
      MAX_HIGH_CONTEXT_ASSISTANT_TURN_CHARS,
    );
    if (
      !text ||
      !isSafeBoundedSummary(text) ||
      isOperationalAssistantMessage(message, text) ||
      isInternalProactivityWorkflowText(text)
    ) {
      continue;
    }
    const sourceMessageId =
      extractAssistantTextSignatureId(message, { phase: "final_answer" }) ??
      readTextSignatureId(message) ??
      readString((message as { __openclaw?: { id?: unknown } }).__openclaw?.id) ??
      `assistant:${sha256({ sessionKey: input.sessionKey, text, timestamp: recordedAt }).slice(0, 16)}`;
    activities.push({
      ref: `chat://${input.sessionKey}/assistant_turn/${sourceMessageId}`,
      role: "assistant",
      kind: "final",
      boundedText: text,
      sourceRuntime: "openclaw",
      recordedAt,
    });
  }
  return activities
    .toSorted((left, right) => (left.recordedAt ?? "").localeCompare(right.recordedAt ?? ""))
    .slice(-MAX_HIGH_CONTEXT_SESSION_ACTIVITIES);
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "EACCES" ||
      (error as { code?: unknown }).code === "EPERM")
  );
}

function candidateReviewArtifactRoots(): string[] {
  const configuredRoot = readString(process.env[CANDIDATE_REVIEW_ARTIFACT_ROOT_ENV]);
  const hostRepoRoot = readString(process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT);
  const workspaceRoot =
    readString(process.env.OPENCLAW_HOST_OPERATOR_WORKSPACE_ROOT) ??
    readString(process.env.OPENCLAW_WORKSPACE_ROOT) ??
    path.join(process.env.HOME ?? "/home/node", ".openclaw", "workspace");
  return [
    configuredRoot,
    hostRepoRoot ? path.join(hostRepoRoot, CANDIDATE_REVIEW_ARTIFACT_RELATIVE_DIR) : undefined,
    path.join(workspaceRoot, CANDIDATE_REVIEW_ARTIFACT_RELATIVE_DIR),
    path.join(process.cwd(), CANDIDATE_REVIEW_ARTIFACT_RELATIVE_DIR),
  ].filter(
    (entry, index, entries): entry is string => Boolean(entry) && entries.indexOf(entry) === index,
  );
}

function workEpisodeOutcomePackRoots(): string[] {
  const configuredRoot = readString(process.env[WORK_EPISODE_OUTCOME_PACK_ROOT_ENV]);
  if (configuredRoot) {
    return [configuredRoot];
  }
  const hostRepoRoot = readString(process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT);
  const workspaceRoot =
    readString(process.env.OPENCLAW_HOST_OPERATOR_WORKSPACE_ROOT) ??
    readString(process.env.OPENCLAW_WORKSPACE_ROOT) ??
    path.join(process.env.HOME ?? "/home/node", ".openclaw", "workspace");
  return [
    hostRepoRoot
      ? path.join(hostRepoRoot, ".artifacts", "model-memory", "work-episode-outcome-pack")
      : undefined,
    path.join(workspaceRoot, ".artifacts", "model-memory", "work-episode-outcome-pack"),
    path.join(process.cwd(), ".artifacts", "model-memory", "work-episode-outcome-pack"),
  ].filter(
    (entry, index, entries): entry is string => Boolean(entry) && entries.indexOf(entry) === index,
  );
}

export async function loadLatestWorkEpisodeOutcomePack(): Promise<WorkEpisodeOutcomePack | null> {
  const candidates = await discoverWorkEpisodeOutcomePackArtifacts(workEpisodeOutcomePackRoots());
  return candidates.at(-1)?.pack ?? null;
}

async function discoverIndexedOutcomePacks(params: {
  existingEntries: Phase2WorkEpisodeOutcomePackIndexEntry[];
}): Promise<{
  discoveries: WorkEpisodeOutcomePackDiscoveryRecord[];
  entries: Phase2WorkEpisodeOutcomePackIndexEntry[];
}> {
  const discoveries = await discoverWorkEpisodeOutcomePackArtifacts(workEpisodeOutcomePackRoots());
  const existingByKey = new Map(
    params.existingEntries.map((entry) => [packIndexKey(entry), entry]),
  );
  const indexedAt = new Date().toISOString();
  const discoveredEntries = discoveries.map((record): Phase2WorkEpisodeOutcomePackIndexEntry => {
    const contentHash = record.pack.contentHashes[0] ?? record.contentHash;
    const key = `${record.pack.episodeId}\t${contentHash}`;
    const existing = existingByKey.get(key);
    return {
      episodeId: record.pack.episodeId,
      contentHash,
      packPath: record.packPath,
      projectId: record.pack.projectId,
      sessionKey: record.pack.sessionKey,
      branch: record.pack.branch,
      runtime: record.pack.runtime,
      outcomeStatus: record.pack.outcomeStatus,
      workType: record.pack.workType,
      completedAt: record.pack.completedAt,
      indexedAt: existing?.indexedAt ?? indexedAt,
      reviewStatus: existing?.reviewStatus ?? "unreviewed",
      eligibilityStatus: record.eligibility.status,
      eligibilityReasonCodes: record.eligibility.reasonCodes,
      reviewArtifactPath: existing?.reviewArtifactPath,
      reviewedAt: existing?.reviewedAt,
      errorSummary: existing?.errorSummary,
    };
  });
  return {
    discoveries,
    entries: dedupeWorkEpisodeOutcomePackIndexEntries([
      ...params.existingEntries,
      ...discoveredEntries,
    ]),
  };
}

async function writeCandidateReviewEpisodePacketArtifact(
  episodePacket: Parameters<typeof writeProactivityReviewEpisodePacketArtifact>[0],
): ReturnType<typeof writeProactivityReviewEpisodePacketArtifact> {
  const roots = candidateReviewArtifactRoots();
  let lastError: unknown = null;
  for (const artifactRoot of roots) {
    try {
      await fs.mkdir(artifactRoot, { recursive: true });
      await fs.access(artifactRoot, fsConstants.W_OK);
      return await writeProactivityReviewEpisodePacketArtifact(episodePacket, { artifactRoot });
    } catch (error) {
      lastError = error;
      if (!isPermissionDenied(error)) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("candidate review artifact root is not writable");
}

async function buildModelReviewedCandidateSources(input: {
  cfg: ReturnType<typeof loadConfig>;
  sessionKey: string;
  projectId: string;
  candidateReviewOverride?: GatewayProactivityBuildInput["candidateReviewOverride"];
  projectActivitySources: Phase2PersistedProactivityActivityRecord[];
  skillCandidateReport: Phase2SkillCandidateLedgerReport;
  recurringPatternReport: Awaited<ReturnType<typeof buildPhase2ProactivityRecurringPatternReport>>;
  existingSkills: Phase2UserFacingProactivityExistingSkill[];
  previousModelReviewedOpportunities: Phase2OpportunityLedgerSource[];
  previousEpisodeKeys: Phase2ProactivityActivityStore["candidateReviewEpisodeKeys"];
  outcomePackDiscoveries: WorkEpisodeOutcomePackDiscoveryRecord[];
  workEpisodeOutcomePackIndex: Phase2WorkEpisodeOutcomePackIndexEntry[];
}): Promise<{
  episodeKey: string | null;
  episodeKeys: string[];
  triggerDecision: CandidateReviewTriggerDecision | null;
  triggerReport: CandidateReviewTriggerReport | null;
  reviewReport: CandidateReviewReport | null;
  codexAdapterReport: CandidateReviewCodexAdapterReport | null;
  proposals: CandidateReviewProposal[];
  skillCandidates: Phase2SkillCandidateRecord[];
  opportunities: Phase2OpportunityLedgerSource[];
  workEpisodeOutcomePackIndex: Phase2WorkEpisodeOutcomePackIndexEntry[];
}> {
  const reviewOptions = buildCandidateReviewOptions({ cfg: input.cfg, env: process.env });
  const forceReviewRun = input.candidateReviewOverride?.forceRun === true;
  const emptyResult = (
    packIndex = input.workEpisodeOutcomePackIndex,
  ): Awaited<ReturnType<typeof buildModelReviewedCandidateSources>> => ({
    episodeKey: null,
    episodeKeys: [],
    triggerDecision: null,
    triggerReport: null,
    reviewReport: null,
    codexAdapterReport: null,
    proposals: [],
    skillCandidates: [],
    opportunities: [],
    workEpisodeOutcomePackIndex: packIndex,
  });
  const maxReviewsPerSession = readPositiveInteger(
    process.env[CANDIDATE_REVIEW_MAX_PER_SESSION_ENV],
    DEFAULT_CANDIDATE_REVIEW_MAX_PER_SESSION,
  );
  const maxReviewsPerDay = readPositiveInteger(
    process.env[CANDIDATE_REVIEW_MAX_PER_DAY_ENV],
    DEFAULT_CANDIDATE_REVIEW_MAX_PER_DAY,
  );
  const maxPacksPerRun = readPositiveInteger(
    process.env[PACK_REVIEW_MAX_PER_RUN_ENV],
    DEFAULT_PACK_REVIEW_MAX_PER_RUN,
  );
  const nowMs = Date.now();
  const reviewsInLastHour = (input.previousEpisodeKeys ?? []).filter((entry) => {
    const reviewedAtMs = Date.parse(entry.reviewedAt);
    return Number.isFinite(reviewedAtMs) && nowMs - reviewedAtMs < 60 * 60 * 1_000;
  }).length;
  const reviewsInLastDay = (input.previousEpisodeKeys ?? []).filter((entry) => {
    const reviewedAtMs = Date.parse(entry.reviewedAt);
    return Number.isFinite(reviewedAtMs) && nowMs - reviewedAtMs < 24 * 60 * 60 * 1_000;
  }).length;
  if (!reviewOptions.enabled) {
    return emptyResult();
  }
  if (
    !forceReviewRun &&
    (reviewsInLastHour >= maxReviewsPerSession || reviewsInLastDay >= maxReviewsPerDay)
  ) {
    return emptyResult();
  }
  const discoveryByKey = new Map<string, WorkEpisodeOutcomePackDiscoveryRecord>(
    input.outcomePackDiscoveries.map((record) => {
      const contentHash = record.pack.contentHashes[0] ?? record.contentHash;
      return [`${record.pack.episodeId}\t${contentHash}`, record] as const;
    }),
  );
  const packIndex = input.workEpisodeOutcomePackIndex.map((entry) => ({ ...entry }));
  const selectedPackEntries = packIndex
    .filter((entry) => {
      if (entry.projectId !== input.projectId) {
        return false;
      }
      if (entry.eligibilityStatus !== "eligible") {
        return false;
      }
      if (entry.reviewStatus !== "unreviewed" && !forceReviewRun) {
        return false;
      }
      return discoveryByKey.has(packIndexKey(entry));
    })
    .toSorted((left, right) => left.completedAt.localeCompare(right.completedAt))
    .slice(0, maxPacksPerRun);
  if (selectedPackEntries.length === 0) {
    return emptyResult(packIndex);
  }
  const allProposals: CandidateReviewProposal[] = [];
  const allSkillCandidates: Phase2SkillCandidateRecord[] = [];
  const allOpportunities: Phase2OpportunityLedgerSource[] = [];
  const episodeKeys: string[] = [];
  let lastReviewReport: CandidateReviewReport | null = null;
  for (const packEntry of selectedPackEntries) {
    const packRecord = discoveryByKey.get(packIndexKey(packEntry));
    if (!packRecord) {
      continue;
    }
    const latestOutcomePack = packRecord.pack;
    const outcomePackEpisodeKey = `work_episode_outcome_pack:${latestOutcomePack.episodeId}:${
      latestOutcomePack.contentHashes[0] ?? packRecord.contentHash
    }`;
    const recentProactivityItemsForPack = uniqueByExactPresentationKey(
      [
        ...input.previousModelReviewedOpportunities.map((opportunity) => ({
          id: opportunity.opportunityId,
          kind:
            opportunity.sourceFamily === "skill_candidate"
              ? "skill_candidate"
              : "opportunityClass" in opportunity &&
                  opportunity.opportunityClass === "proactive_plan"
                ? "proactive_plan"
                : "model_reviewed_opportunity",
          title: opportunity.title,
          status: "model_reviewed",
          quality: opportunity.confidence,
        })),
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
      ],
      (item) => `${item.kind}:${item.title}`,
    ).slice(-10);
    const episodePacket = buildProactivityReviewEpisodePacketFromOutcomePack({
      outcomePack: latestOutcomePack,
      loadedSkills: input.existingSkills,
      recentProactivityItems: recentProactivityItemsForPack,
      recentCandidateIds: input.skillCandidateReport.records.map(
        (record) => record.skillCandidateId,
      ),
      possibleDuplicateTitles: uniqueByExactPresentationKey(
        [
          ...input.previousModelReviewedOpportunities.map((opportunity) => opportunity.title),
          ...input.skillCandidateReport.opportunities.map((opportunity) => opportunity.title),
          ...input.recurringPatternReport.opportunities.map((opportunity) => opportunity.title),
        ],
        (title) => title,
      ),
      rejectedOrDemotedSummary: input.skillCandidateReport.records
        .filter(
          (record) =>
            record.lifecycleStatus === "rejected" || record.lifecycleStatus === "disabled",
        )
        .map((record) => `${record.lifecycleStatus}: ${record.suggestedSkillName}`),
      activeMilestone: "pre-Milestone-4 work episode outcome pack review",
      activeDocsOrBranches: ["phase2-work-episode-outcome-pack"],
    });
    try {
      const episodeArtifact = await writeCandidateReviewEpisodePacketArtifact(episodePacket);
      const review = await reviewEpisodeForCandidates(episodePacket, reviewOptions);
      const reviewReport: CandidateReviewReport = {
        ...review.report,
        episodePacketHash: episodeArtifact.packetHash,
        episodePacketPath: episodeArtifact.jsonPath,
        episodeTurnCount: episodePacket.episodeTurns.length,
        codexAdapterStatus: episodePacket.codexActivitySummary.status,
        sourceRuntimes: [...new Set(episodePacket.episodeTurns.map((turn) => turn.sourceRuntime))],
      };
      const converted = convertCandidateReviewProposalsToLedgerSources({
        proposals: review.proposals,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        previousSkillCandidates: [...input.skillCandidateReport.records, ...allSkillCandidates],
        episodePacketHash: episodeArtifact.packetHash,
        episodePacketPath: episodeArtifact.jsonPath,
      });
      allProposals.push(...review.proposals);
      allSkillCandidates.push(...converted.skillCandidates);
      allOpportunities.push(...converted.opportunities);
      episodeKeys.push(outcomePackEpisodeKey);
      lastReviewReport = reviewReport;
      const targetIndex = packIndex.findIndex(
        (entry) => packIndexKey(entry) === packIndexKey(packEntry),
      );
      if (targetIndex >= 0) {
        packIndex[targetIndex] = {
          ...packIndex[targetIndex],
          reviewStatus: "reviewed",
          reviewedAt: new Date().toISOString(),
          reviewArtifactPath: episodeArtifact.jsonPath,
          errorSummary: undefined,
        };
      }
    } catch (error) {
      const targetIndex = packIndex.findIndex(
        (entry) => packIndexKey(entry) === packIndexKey(packEntry),
      );
      if (targetIndex >= 0) {
        packIndex[targetIndex] = {
          ...packIndex[targetIndex],
          reviewStatus: "failed",
          reviewedAt: new Date().toISOString(),
          errorSummary:
            error instanceof Error ? error.message.slice(0, 500) : "unknown pack review failure",
        };
      }
    }
  }
  return {
    episodeKey: episodeKeys[0] ?? null,
    episodeKeys,
    triggerDecision: null,
    triggerReport: null,
    reviewReport: lastReviewReport,
    codexAdapterReport: null,
    proposals: allProposals,
    skillCandidates: allSkillCandidates,
    opportunities: allOpportunities,
    workEpisodeOutcomePackIndex: packIndex,
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
  const indexedOutcomePacks = await discoverIndexedOutcomePacks({
    existingEntries: activityStoreReport.store.workEpisodeOutcomePacks ?? [],
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
    candidateReviewOverride: params.candidateReviewOverride,
    projectActivitySources,
    skillCandidateReport,
    recurringPatternReport,
    existingSkills,
    previousModelReviewedOpportunities: activityStoreReport.store.modelReviewedOpportunities ?? [],
    previousEpisodeKeys: activityStoreReport.store.candidateReviewEpisodeKeys ?? [],
    outcomePackDiscoveries: indexedOutcomePacks.discoveries,
    workEpisodeOutcomePackIndex: indexedOutcomePacks.entries,
  });
  const mergeReviewOptions = buildCandidateReviewOptions({ cfg, env: process.env });
  const persistedModelReviewedOpportunities =
    activityStoreReport.store.modelReviewedOpportunities ?? [];
  const writeTimeMerge = await adjudicateNewModelReviewedOpportunities({
    newOpportunities: modelReviewedCandidates.opportunities,
    persistedOpportunities: persistedModelReviewedOpportunities,
    existingOverrides: activityStoreReport.store.lifecycleOverrides,
    projectId: params.projectId,
    sessionKey: params.sessionKey,
    mergeOptions: mergeReviewOptions,
  });
  const acceptedModelReviewedOpportunities = writeTimeMerge.acceptedOpportunities;
  const autoPlanDraftOverrides = buildAutoPlanDraftOverrides({
    opportunities: acceptedModelReviewedOpportunities,
    existingOverrides: activityStoreReport.store.lifecycleOverrides,
    projectId: params.projectId,
    sessionKey: params.sessionKey,
  });
  const modelReviewedSkillOpportunities = acceptedModelReviewedOpportunities.filter(
    (opportunity): opportunity is Phase2SkillCandidateOpportunity =>
      opportunity.sourceFamily === "skill_candidate" && "skillCandidate" in opportunity,
  );
  const persistedModelReviewedSkillCandidates = persistedModelReviewedOpportunities
    .filter(
      (opportunity): opportunity is Phase2SkillCandidateOpportunity =>
        opportunity.sourceFamily === "skill_candidate" && "skillCandidate" in opportunity,
    )
    .map((opportunity) => opportunity.skillCandidate);
  const highContextCandidateReviewEnabled = readBooleanEnv(
    process.env[CANDIDATE_REVIEW_ENABLED_ENV],
  );
  const rawTranscriptOpportunitySurfacingEnabled = !highContextCandidateReviewEnabled;
  const baselineSkillOpportunities = highContextCandidateReviewEnabled
    ? []
    : skillCandidateReport.opportunities;
  const effectiveSkillCandidateReport: Phase2SkillCandidateLedgerReport = {
    ...skillCandidateReport,
    decision:
      baselineSkillOpportunities.length > 0 || modelReviewedSkillOpportunities.length > 0
        ? "skill_candidates_ready"
        : "no_skill_candidates",
    records: dedupeSkillCandidates([
      ...skillCandidateReport.records,
      ...persistedModelReviewedSkillCandidates,
      ...modelReviewedCandidates.skillCandidates,
    ]),
    opportunities: [...baselineSkillOpportunities, ...modelReviewedSkillOpportunities].filter(
      (opportunity, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.skillCandidate.skillCandidateId ===
            opportunity.skillCandidate.skillCandidateId,
        ) === index,
    ),
  };
  const effectiveLifecycleOverrides = dedupeOverrides([
    ...activityStoreReport.store.lifecycleOverrides,
    ...writeTimeMerge.mergeLifecycleOverrides,
    ...autoPlanDraftOverrides,
  ]);
  const baseLedgerSources: Phase2OpportunityLedgerSource[] = [
    ...persistedModelReviewedOpportunities,
    ...liveDetectionReport.opportunities.map((opportunity) => ({
      ...opportunity,
      sourceFamily: "live_signal" as const,
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      generatedAt: new Date().toISOString(),
    })),
    ...(rawTranscriptOpportunitySurfacingEnabled
      ? extractionReport.candidates.map((candidate) => ({
          ...candidate,
          sourceFamily: "assistant_output" as const,
        }))
      : []),
    ...effectiveSkillCandidateReport.opportunities,
    ...acceptedModelReviewedOpportunities.filter(
      (opportunity) => opportunity.sourceFamily !== "skill_candidate",
    ),
    ...(rawTranscriptOpportunitySurfacingEnabled
      ? recurringPatternReport.opportunities.map((opportunity) => ({
          ...opportunity,
          sourceFamily: "pattern_or_followup" as const,
          projectId: params.projectId,
          sessionKey: params.sessionKey,
          generatedAt: new Date().toISOString(),
        }))
      : []),
  ];
  const mergeAdjudicationReport = writeTimeMerge.report;
  const baseLedgerReport = await buildPhase2ProactivityOpportunityLedgerReport({
    repoRoot: process.cwd(),
    opportunities: baseLedgerSources,
    activitySources: projectActivitySources,
    lifecycleOverrides: effectiveLifecycleOverrides.filter(
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
  const existingSkillDraftOpportunityIds = new Set(
    (activityStoreReport.store.skillPackageDrafts ?? []).map(
      (draft) => draft.proactivityOpportunityId,
    ),
  );
  const sessionAgentId = resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: cfg,
  });
  const workspaceDir = resolveAgentWorkspaceDir(cfg, sessionAgentId);
  const autoSkillDraftEntries = baseEffectiveLedgerReport.ledger.entries.filter(
    (entry) =>
      entry.sourceFamily === "skill_candidate" &&
      entry.skillCandidate &&
      acceptedModelReviewedOpportunities.some(
        (opportunity) => opportunity.opportunityId === entry.opportunityId,
      ) &&
      !existingSkillDraftOpportunityIds.has(entry.opportunityId),
  );
  const autoSkillDraftReports: Awaited<ReturnType<typeof createPhase2SkillifierDraft>>[] = [];
  const autoSkillDraftFailureOverrides: Phase2ProactivityActivityStore["lifecycleOverrides"] = [];
  for (const entry of autoSkillDraftEntries) {
    try {
      autoSkillDraftReports.push(
        await createPhase2SkillifierDraft({
          workspaceDir,
          skillCandidate: entry.skillCandidate!,
          ledgerEntry: entry,
        }),
      );
    } catch {
      const generatedAt = new Date().toISOString();
      autoSkillDraftFailureOverrides.push({
        opportunityId: entry.opportunityId,
        projectId: params.projectId,
        sessionKey: params.sessionKey,
        status: "draft_ready",
        updatedAt: generatedAt,
        reviewStatus: "pending_review",
        plannedArtifact: {
          status: "failed",
          reviewStatus: "pending_review",
          title: entry.title,
          requestSummary:
            "Skill draft generation failed before a review-only package was created. Review from Work Queue detail and retry when the workspace/destination issue is resolved.",
          generatedAt,
          updatedAt: generatedAt,
          contentHash: sha256({
            opportunityId: entry.opportunityId,
            failure: "skillifier_auto_draft_failed",
          }),
        },
      });
    }
  }
  const autoSkillDrafts = autoSkillDraftReports.map((report) => report.draft);
  const autoSkillDraftOverrides: Phase2ProactivityActivityStore["lifecycleOverrides"] =
    autoSkillDrafts
      .filter((draft) => draft.decision === "draft_ready")
      .map((draft) => ({
        opportunityId: draft.proactivityOpportunityId,
        projectId: params.projectId,
        sessionKey: params.sessionKey,
        status: "draft_ready" as const,
        updatedAt: draft.updatedAt,
        reviewStatus: "pending_review" as const,
      }));
  const finalLifecycleOverrides = dedupeOverrides([
    ...effectiveLifecycleOverrides,
    ...autoSkillDraftOverrides,
    ...autoSkillDraftFailureOverrides,
  ]);
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
    ...(rawTranscriptOpportunitySurfacingEnabled ? growthLoopReport.opportunities : []),
  ];
  const ledgerReport = await buildPhase2ProactivityOpportunityLedgerReport({
    repoRoot: process.cwd(),
    opportunities: ledgerSources,
    activitySources: projectActivitySources,
    lifecycleOverrides: finalLifecycleOverrides.filter(
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
    skillPackageDrafts: dedupeSkillPackageDrafts([
      ...(activityStoreReport.store.skillPackageDrafts ?? []),
      ...autoSkillDrafts,
    ]),
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
    skillPackageDrafts: dedupeSkillPackageDrafts([
      ...(activityStoreReport.store.skillPackageDrafts ?? []),
      ...autoSkillDrafts,
    ]),
    modelReviewedOpportunities: dedupeModelReviewedOpportunities(
      acceptedModelReviewedOpportunities,
    ),
    modelMergeLifecycleOverrides: [
      ...writeTimeMerge.mergeLifecycleOverrides,
      ...autoPlanDraftOverrides,
      ...autoSkillDraftOverrides,
      ...autoSkillDraftFailureOverrides,
    ],
    workEpisodeOutcomePacks: modelReviewedCandidates.workEpisodeOutcomePackIndex,
    readProjection: {
      schemaVersion: "phase2_proactivity_read_projection.v1",
      generatedAt: new Date().toISOString(),
      projectId: params.projectId,
      sessionKey: params.sessionKey,
      productSurfacingReport,
      inboxReport,
      heartbeatReport,
    },
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
    skillifierDrafts: dedupeSkillPackageDrafts([
      ...(activityStoreReport.store.skillPackageDrafts ?? []),
      ...autoSkillDrafts,
    ]),
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
    mergeAdjudicationReport,
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
    await buildModelMemoryProactivityRuntimeState({
      cfg,
      sessionKey: params.sessionKey,
      projectId: params.projectId,
      operatorId: params.operatorId,
      userId: params.userId,
      recipientId: params.recipientId,
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
      | "proactive_plan"
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
  const promptLines = [
    "What would help this user today?",
    "Reply with up to 3 concise items.",
    "For each item include a short title, why now, and next step.",
    "If proactivity items are provided, choose from those model-authored items and do not reply HEARTBEAT_OK.",
    "A useful follow-up question is allowed when it would help more than another ordinary task.",
    "Keep it user-facing. Do not include timestamps, source refs, or system text.",
    "If nothing needs attention, reply HEARTBEAT_OK.",
  ];
  if (items.length > 0) {
    promptLines.push(
      "",
      "Model-authored proactivity items available:",
      ...items.flatMap((item, index) => [
        `${index + 1}. ${item.title}`,
        `Why now: ${item.whyNow}`,
        `Next step: ${item.proposedNextStep}`,
      ]),
    );
  }
  return {
    prompt: boundedMultilineSummary(promptLines.join("\n")),
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
