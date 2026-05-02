import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import type { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import {
  ingestDocumentLive,
  type LiveDocumentIngestionResult,
} from "./live-document-ingestion-service.ts";
import {
  captureOrdinaryTurnLive,
  type LiveOrdinaryTurnCaptureResult,
} from "./live-ordinary-turn-capture-service.ts";
import type { OrdinaryTurnCaptureInput } from "./ordinary-turn-capture.ts";
import type {
  TurnContextMessage,
  TurnSpeaker,
} from "./source-adapters/ordinary-turn-source-adapter.ts";
import { buildSourceAuthorityMetadata, type SourceProfileId } from "./source-authority.ts";

export type CodexMemoryActivity = {
  ref: string;
  role: "user" | "assistant" | "tool_summary";
  boundedText: string;
  sessionId?: string;
  recordedAt?: string;
  kind?: "ask" | "final" | "result_summary" | "failure_summary";
  sourceMode?: "ordinary_turn" | "document_like";
  hash?: string;
  sourcePath?: string;
  lineNumber?: number;
};

export type CodexMemoryCaptureResult = {
  activityRef: string;
  role: CodexMemoryActivity["role"];
  sourceMode: "ordinary_turn" | "document_like";
  sourceProfileId: SourceProfileId;
  capture: LiveOrdinaryTurnCaptureResult | LiveDocumentIngestionResult;
};

export type CodexMemoryCaptureCadence = "manual" | "heartbeat" | "session_boundary" | "closeout";

export type CodexMemoryCaptureRunnerConfig = {
  enabled: boolean;
  cadence: CodexMemoryCaptureCadence;
  maxActivities: number;
  maxCharsPerActivity: number;
  maxWordsPerWindow: number;
  documentLikeWordThreshold: number;
  cooldownMs: number;
  maxPerRun: number;
  modelId: string;
};

export type CodexMemoryCaptureRunnerCapture = {
  activityRef: string;
  activityHash?: string;
  role: CodexMemoryActivity["role"];
  sourceMode: "ordinary_turn" | "document_like";
  sourceProfileId?: SourceProfileId;
  status: "captured" | "skipped" | "failed";
  reason?: string;
  windowCount?: number;
  writeCount?: number;
  rejectCount?: number;
  quarantineCount?: number;
  supportCount?: number;
  sourceHash?: string;
};

export type CodexMemoryCaptureRunnerReport = {
  status: "disabled" | "cooldown" | "loaded" | "degraded";
  reason?: string;
  config: CodexMemoryCaptureRunnerConfig & {
    semanticPruning: false;
    rawToolLogsIncluded: false;
  };
  sourceStatus?: CodexSessionSourceStatus;
  diagnostics?: CodexSessionWindowDiagnostics;
  activityCounts: {
    loaded: number;
    alreadyIngested: number;
    attempted: number;
    captured: number;
    failed: number;
    documentLike: number;
    ordinaryTurn: number;
    user: number;
    assistant: number;
    toolSummary: number;
  };
  writeCounts: {
    write: number;
    supersede: number;
    attachSupport: number;
    reject: number;
    quarantine: number;
  };
  idempotency: {
    skippedRefs: string[];
    skippedHashes: string[];
    capturedRefs: string[];
    capturedHashes: string[];
  };
  captures: CodexMemoryCaptureRunnerCapture[];
  safety: {
    rawFullTranscriptPersisted: false;
    rawToolLogPersisted: false;
    codexTranscriptExecutedAsInstruction: false;
    deterministicSemanticFallbackUsed: false;
  };
};

const DEFAULT_DOCUMENT_LIKE_WORD_THRESHOLD = 120;
const DEFAULT_CODEX_SESSION_MAX_ACTIVITIES = 12;
const DEFAULT_CODEX_ACTIVITY_MAX_CHARS = 12_000;
const DEFAULT_CODEX_CAPTURE_MAX_WORDS_PER_WINDOW = 500;
const DEFAULT_CODEX_CAPTURE_COOLDOWN_MS = 15 * 60 * 1_000;
const DEFAULT_CODEX_CAPTURE_MAX_PER_RUN = 6;
const DEFAULT_CODEX_CAPTURE_MODEL_ID = "openai-codex/gpt-5.4-mini";
const DEFAULT_CODEX_CAPTURE_CONTEXT_ACTIVITIES = 12;
const CODEX_CAPTURE_ENABLED_ENV = "MODEL_MEMORY_CODEX_CAPTURE_ENABLED";
const CODEX_CAPTURE_CADENCE_ENV = "MODEL_MEMORY_CODEX_CAPTURE_CADENCE";
const CODEX_CAPTURE_MAX_ACTIVITIES_ENV = "MODEL_MEMORY_CODEX_CAPTURE_MAX_ACTIVITIES";
const CODEX_CAPTURE_MAX_CHARS_PER_ACTIVITY_ENV =
  "MODEL_MEMORY_CODEX_CAPTURE_MAX_CHARS_PER_ACTIVITY";
const CODEX_CAPTURE_MAX_WORDS_PER_WINDOW_ENV = "MODEL_MEMORY_CODEX_CAPTURE_MAX_WORDS_PER_WINDOW";
const CODEX_CAPTURE_COOLDOWN_MS_ENV = "MODEL_MEMORY_CODEX_CAPTURE_COOLDOWN_MS";
const CODEX_CAPTURE_MAX_PER_RUN_ENV = "MODEL_MEMORY_CODEX_CAPTURE_MAX_PER_RUN";
const CODEX_CAPTURE_MODEL_ENV = "MODEL_MEMORY_CODEX_CAPTURE_MODEL";
const CODEX_CAPTURE_PROGRESS_PATH_ENV = "MODEL_MEMORY_CODEX_CAPTURE_PROGRESS_PATH";

export type CodexSessionWindowLoadResult =
  | {
      status: "loaded";
      reason?: undefined;
      sourceStatus: CodexSessionSourceStatus;
      selectionPolicy: {
        source: "session_jsonl_contiguous_recent";
        maxActivities: number;
        maxCharsPerActivity: number;
        documentLikeWordThreshold: number;
        semanticPruning: false;
        rawToolLogsIncluded: false;
      };
      activities: CodexMemoryActivity[];
      diagnostics: CodexSessionWindowDiagnostics;
    }
  | {
      status: "degraded";
      reason: string;
      sourceStatus: CodexSessionSourceStatus;
      selectionPolicy: {
        source: "session_jsonl_contiguous_recent";
        maxActivities: number;
        maxCharsPerActivity: number;
        documentLikeWordThreshold: number;
        semanticPruning: false;
        rawToolLogsIncluded: false;
      };
      activities: [];
      diagnostics: CodexSessionWindowDiagnostics;
    };

export type CodexSessionSourceStatus = {
  codexHome: string;
  sessionsPath: string;
  sessionsExists: boolean;
  historyPath: string;
  historyExists: boolean;
  selectedSessionPath?: string;
  selectedSessionExists?: boolean;
  selectedSessionBytes?: number;
  selectedSessionLineCount?: number;
};

export type CodexSessionWindowDiagnostics = {
  rawEventCount: number;
  activityCount: number;
  userActivityCount: number;
  assistantActivityCount: number;
  toolSummaryCount: number;
  documentLikeActivityCount: number;
  boundedActivityCharCount: number;
  rawFullTranscriptPersisted: false;
  rawToolLogPersisted: false;
};

function speakerForCodexRole(role: CodexMemoryActivity["role"]): TurnSpeaker {
  return role === "assistant" ? "assistant" : role === "user" ? "user" : "system";
}

function sourceProfileForCodexActivity(activity: CodexMemoryActivity): SourceProfileId {
  if (activity.role === "user") {
    return "explicit_user_turn";
  }
  if (activity.role === "assistant") {
    return "cited_assistant_answer";
  }
  return "tool_result_capture";
}

function contextFromActivities(activities: CodexMemoryActivity[]): TurnContextMessage[] {
  return activities.map((activity) => ({
    speaker: speakerForCodexRole(activity.role),
    text: activity.boundedText,
  }));
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeCodexCaptureProgress(
  env: NodeJS.ProcessEnv | undefined,
  entry: Record<string, unknown>,
): Promise<void> {
  const progressPath = env?.[CODEX_CAPTURE_PROGRESS_PATH_ENV]?.trim();
  if (!progressPath) {
    return;
  }
  try {
    await appendFile(
      progressPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    /* diagnostic-only */
  }
}

function readBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }
  if (/^(?:1|true|yes|on)$/iu.test(normalized)) {
    return true;
  }
  if (/^(?:0|false|no|off)$/iu.test(normalized)) {
    return false;
  }
  return fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readCadence(value: string | undefined): CodexMemoryCaptureCadence {
  const normalized = value?.trim();
  return normalized === "heartbeat" ||
    normalized === "session_boundary" ||
    normalized === "closeout" ||
    normalized === "manual"
    ? normalized
    : "manual";
}

function resolveCodexCaptureConfig(input: {
  env?: NodeJS.ProcessEnv;
  enabled?: boolean;
  cadence?: CodexMemoryCaptureCadence;
  maxActivities?: number;
  maxCharsPerActivity?: number;
  maxWordsPerWindow?: number;
  documentLikeWordThreshold?: number;
  cooldownMs?: number;
  maxPerRun?: number;
  modelId?: string;
}): CodexMemoryCaptureRunnerConfig {
  const env = input.env ?? process.env;
  return {
    enabled: input.enabled ?? readBooleanEnv(env[CODEX_CAPTURE_ENABLED_ENV], true),
    cadence: input.cadence ?? readCadence(env[CODEX_CAPTURE_CADENCE_ENV]),
    maxActivities:
      input.maxActivities ??
      readPositiveInteger(
        env[CODEX_CAPTURE_MAX_ACTIVITIES_ENV],
        DEFAULT_CODEX_SESSION_MAX_ACTIVITIES,
      ),
    maxCharsPerActivity:
      input.maxCharsPerActivity ??
      readPositiveInteger(
        env[CODEX_CAPTURE_MAX_CHARS_PER_ACTIVITY_ENV],
        DEFAULT_CODEX_ACTIVITY_MAX_CHARS,
      ),
    maxWordsPerWindow:
      input.maxWordsPerWindow ??
      readPositiveInteger(
        env[CODEX_CAPTURE_MAX_WORDS_PER_WINDOW_ENV],
        DEFAULT_CODEX_CAPTURE_MAX_WORDS_PER_WINDOW,
      ),
    documentLikeWordThreshold:
      input.documentLikeWordThreshold ?? DEFAULT_DOCUMENT_LIKE_WORD_THRESHOLD,
    cooldownMs:
      input.cooldownMs ??
      readNonNegativeInteger(env[CODEX_CAPTURE_COOLDOWN_MS_ENV], DEFAULT_CODEX_CAPTURE_COOLDOWN_MS),
    maxPerRun:
      input.maxPerRun ??
      readPositiveInteger(env[CODEX_CAPTURE_MAX_PER_RUN_ENV], DEFAULT_CODEX_CAPTURE_MAX_PER_RUN),
    modelId:
      input.modelId ??
      (typeof env[CODEX_CAPTURE_MODEL_ENV] === "string" && env[CODEX_CAPTURE_MODEL_ENV]?.trim()
        ? env[CODEX_CAPTURE_MODEL_ENV]!.trim()
        : DEFAULT_CODEX_CAPTURE_MODEL_ID),
  };
}

function redactBoundedText(value: string, maxChars: number): string {
  const text = value
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, "[redacted-api-key]")
    .replace(/ghp_[A-Za-z0-9_]{12,}/gu, "[redacted-token]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{12,}/gu, "[redacted-token]")
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/gu, "[redacted-long-token]");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[bounded-truncated]` : text;
}

function resolveCodexSourceMode(input: {
  activity: CodexMemoryActivity;
  documentLikeWordThreshold?: number;
}): CodexMemoryCaptureResult["sourceMode"] {
  if (input.activity.role === "user") {
    return "document_like";
  }
  if (input.activity.sourceMode) {
    return input.activity.sourceMode;
  }
  const threshold = input.documentLikeWordThreshold ?? DEFAULT_DOCUMENT_LIKE_WORD_THRESHOLD;
  return countWords(input.activity.boundedText) > threshold ? "document_like" : "ordinary_turn";
}

function activityHash(activity: CodexMemoryActivity): string {
  return activity.hash ?? sha256(activity.boundedText);
}

function codexActivityAuthorityRank(activity: CodexMemoryActivity): number {
  if (activity.role === "user") {
    return 0;
  }
  if (activity.role === "assistant") {
    return 1;
  }
  return 2;
}

function selectActivitiesForCapture(input: {
  activities: CodexMemoryActivity[];
  maxPerRun: number;
}): CodexMemoryActivity[] {
  return input.activities
    .map((activity, index) => ({ activity, index }))
    .toSorted((left, right) => {
      const authorityDelta =
        codexActivityAuthorityRank(left.activity) - codexActivityAuthorityRank(right.activity);
      if (authorityDelta !== 0) {
        return authorityDelta;
      }
      return left.index - right.index;
    })
    .slice(0, input.maxPerRun)
    .map((entry) => entry.activity);
}

function buildActivityContextWindow(input: {
  activities: CodexMemoryActivity[];
  activity: CodexMemoryActivity;
  maxContextActivities?: number;
}): CodexMemoryActivity[] {
  const index = input.activities.findIndex((entry) => entry.ref === input.activity.ref);
  if (index < 0) {
    return [];
  }
  const maxContextActivities =
    input.maxContextActivities ?? DEFAULT_CODEX_CAPTURE_CONTEXT_ACTIVITIES;
  const contextBudget = Math.max(0, maxContextActivities - 1);
  const beforeBudget = Math.floor(contextBudget * 0.75);
  const afterBudget = contextBudget - beforeBudget;
  const start = Math.max(0, index - beforeBudget);
  const end = Math.min(input.activities.length, index + afterBudget + 1);
  return input.activities.slice(start, end).filter((entry) => entry.ref !== input.activity.ref);
}

function getSourceMetadataString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.trim().length > 0 ? entry : undefined;
}

async function loadExistingCodexSourceKeys(
  canonicalRepository: ModelMemoryCanonicalRepository,
): Promise<{ refs: Set<string>; hashes: Set<string> }> {
  const refs = new Set<string>();
  const hashes = new Set<string>();
  const sourceReader = canonicalRepository as ModelMemoryCanonicalRepository & {
    listSources?: () => Promise<
      Array<{ externalSourceId?: string | null; sourceMetadata?: unknown }>
    >;
  };
  if (typeof sourceReader.listSources !== "function") {
    return { refs, hashes };
  }
  const sources = await sourceReader.listSources();
  for (const source of sources) {
    const metadata = source.sourceMetadata;
    if (getSourceMetadataString(metadata, "sourceRuntime") !== "codex") {
      continue;
    }
    const codexRef = getSourceMetadataString(metadata, "codexRef") ?? source.externalSourceId;
    if (codexRef) {
      refs.add(codexRef);
    }
    const hash = getSourceMetadataString(metadata, "codexActivityHash");
    if (hash) {
      hashes.add(hash);
    }
  }
  return { refs, hashes };
}

function emptyRunnerCounts(): CodexMemoryCaptureRunnerReport["activityCounts"] {
  return {
    loaded: 0,
    alreadyIngested: 0,
    attempted: 0,
    captured: 0,
    failed: 0,
    documentLike: 0,
    ordinaryTurn: 0,
    user: 0,
    assistant: 0,
    toolSummary: 0,
  };
}

function emptyWriteCounts(): CodexMemoryCaptureRunnerReport["writeCounts"] {
  return {
    write: 0,
    supersede: 0,
    attachSupport: 0,
    reject: 0,
    quarantine: 0,
  };
}

function buildRunnerConfigReport(
  config: CodexMemoryCaptureRunnerConfig,
): CodexMemoryCaptureRunnerReport["config"] {
  return {
    ...config,
    semanticPruning: false,
    rawToolLogsIncluded: false,
  };
}

function buildRunnerSafetyReport(): CodexMemoryCaptureRunnerReport["safety"] {
  return {
    rawFullTranscriptPersisted: false,
    rawToolLogPersisted: false,
    codexTranscriptExecutedAsInstruction: false,
    deterministicSemanticFallbackUsed: false,
  };
}

function countCaptureWrites(
  writeResults: CodexMemoryCaptureResult["capture"]["writeResults"],
): CodexMemoryCaptureRunnerReport["writeCounts"] {
  const counts = emptyWriteCounts();
  for (const entry of writeResults) {
    if (entry.decision === "write") {
      counts.write += 1;
    } else if (entry.decision === "supersede") {
      counts.supersede += 1;
    } else if (entry.decision === "attach_support") {
      counts.attachSupport += 1;
    } else if (entry.decision === "reject") {
      counts.reject += 1;
    } else if (entry.decision === "quarantine") {
      counts.quarantine += 1;
    }
  }
  return counts;
}

function addWriteCounts(
  target: CodexMemoryCaptureRunnerReport["writeCounts"],
  next: CodexMemoryCaptureRunnerReport["writeCounts"],
) {
  target.write += next.write;
  target.supersede += next.supersede;
  target.attachSupport += next.attachSupport;
  target.reject += next.reject;
  target.quarantine += next.quarantine;
}

function getStringPayloadText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as { type?: string; text?: string; message?: string };
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  return "";
}

function getAssistantMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as {
    role?: string;
    content?: Array<{ type?: string; text?: string }> | string;
  };
  if (record.role !== "assistant") {
    return "";
  }
  if (typeof record.content === "string") {
    return record.content;
  }
  if (!Array.isArray(record.content)) {
    return "";
  }
  return record.content
    .map((item) => (item.type === "output_text" && typeof item.text === "string" ? item.text : ""))
    .filter((text) => text.trim().length > 0)
    .join("\n");
}

function commandFamilyFromFunctionCall(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as { name?: string; arguments?: string };
  if (record.name !== "exec_command" || typeof record.arguments !== "string") {
    return record.name;
  }
  try {
    const parsed = JSON.parse(record.arguments) as { cmd?: string };
    const firstToken = (parsed.cmd ?? "").trim().split(/\s+/u)[0];
    return firstToken || "exec_command";
  } catch {
    return "exec_command";
  }
}

function extractStructuralTouchedAreas(output: string): string[] {
  const matches = output.match(
    /\b(?:extensions|src|scripts|docs|ui)\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gu,
  );
  return [...new Set(matches ?? [])].slice(0, 8);
}

function summarizeToolOutput(payload: unknown, commandFamily?: string): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as { type?: string; output?: string; call_id?: string };
  if (record.type !== "function_call_output" || typeof record.output !== "string") {
    return "";
  }
  const exitMatch = record.output.match(/Process exited with code\s+(-?\d+)/u);
  const status = exitMatch ? (exitMatch[1] === "0" ? "passed" : "failed") : "unknown";
  const touchedAreas = extractStructuralTouchedAreas(record.output);
  return [
    `Codex command summary: family=${commandFamily ?? "unknown"} status=${status}.`,
    touchedAreas.length > 0 ? `Touched areas: ${touchedAreas.join(", ")}.` : "",
    `Raw command output omitted; output hash=${sha256(record.output)}; outputChars=${record.output.length}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function activityFromSessionPayload(input: {
  payload: unknown;
  lineNumber: number;
  sourcePath: string;
  sessionId: string;
  maxChars: number;
  documentLikeWordThreshold: number;
  commandFamilyByCallId: Map<string, string | undefined>;
}): CodexMemoryActivity | null {
  if (!input.payload || typeof input.payload !== "object") {
    return null;
  }
  const payload = input.payload as {
    type?: string;
    timestamp?: string;
    call_id?: string;
    role?: string;
  };
  let role: CodexMemoryActivity["role"] | null = null;
  let kind: CodexMemoryActivity["kind"] | undefined;
  let text = "";
  if (payload.type === "user_message") {
    role = "user";
    kind = "ask";
    text = getStringPayloadText(payload);
  } else if (payload.type === "message") {
    const assistantText = getAssistantMessageText(payload);
    if (assistantText.trim().length > 0) {
      role = "assistant";
      kind = "final";
      text = assistantText;
    }
  } else if (payload.type === "function_call") {
    input.commandFamilyByCallId.set(
      payload.call_id ?? `${input.lineNumber}`,
      commandFamilyFromFunctionCall(payload),
    );
    return null;
  } else if (payload.type === "function_call_output") {
    role = "tool_summary";
    kind = "result_summary";
    text = summarizeToolOutput(
      payload,
      input.commandFamilyByCallId.get(payload.call_id ?? `${input.lineNumber}`),
    );
  }
  if (!role || text.trim().length === 0) {
    return null;
  }
  const boundedText = redactBoundedText(text, input.maxChars);
  const activity: CodexMemoryActivity = {
    ref: `codex-session:${input.sessionId}:${input.lineNumber}`,
    role,
    boundedText,
    sessionId: input.sessionId,
    recordedAt: (payload as { timestamp?: string }).timestamp,
    kind,
    sourceMode:
      countWords(boundedText) > input.documentLikeWordThreshold ? "document_like" : "ordinary_turn",
    hash: sha256(text),
    sourcePath: input.sourcePath,
    lineNumber: input.lineNumber,
  };
  return activity;
}

function sessionIdFromPath(sessionPath: string): string {
  const baseName = path.basename(sessionPath, ".jsonl");
  const match = baseName.match(/([0-9a-f]{8}-[0-9a-f-]{20,})$/iu);
  return match?.[1] ?? baseName;
}

async function collectSessionFiles(root: string, maxFiles = 1000): Promise<string[]> {
  const pending = [root];
  const files: string[] = [];
  while (pending.length > 0 && files.length < maxFiles) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    let entries: Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function readLatestHistorySessionId(historyPath: string): Promise<string | undefined> {
  if (!existsSync(historyPath)) {
    return undefined;
  }
  const raw = await readFile(historyPath, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean).slice(-100);
  for (const line of lines.toReversed()) {
    try {
      const parsed = JSON.parse(line) as { session_id?: string };
      if (typeof parsed.session_id === "string" && parsed.session_id.trim().length > 0) {
        return parsed.session_id;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

async function resolveCodexSessionPath(input: {
  codexHome: string;
  sessionsPath: string;
  historyPath: string;
  sessionId?: string;
  sessionPath?: string;
}): Promise<string | undefined> {
  if (input.sessionPath && existsSync(input.sessionPath)) {
    return input.sessionPath;
  }
  if (!existsSync(input.sessionsPath)) {
    return undefined;
  }
  const files = await collectSessionFiles(input.sessionsPath);
  const sessionId = input.sessionId ?? (await readLatestHistorySessionId(input.historyPath));
  if (sessionId) {
    const bySessionId = files.find((filePath) => filePath.includes(sessionId));
    if (bySessionId) {
      return bySessionId;
    }
  }
  const stats = await Promise.all(
    files.map(async (filePath) => ({ filePath, mtimeMs: (await stat(filePath)).mtimeMs })),
  );
  return stats.toSorted((a, b) => b.mtimeMs - a.mtimeMs)[0]?.filePath;
}

export async function loadRecentCodexSessionWindow(
  input: {
    codexHome?: string;
    historyPath?: string;
    sessionPath?: string;
    sessionId?: string;
    maxActivities?: number;
    maxCharsPerActivity?: number;
    documentLikeWordThreshold?: number;
  } = {},
): Promise<CodexSessionWindowLoadResult> {
  const codexHome = input.codexHome ?? process.env.CODEX_SESSION_HOME ?? "/root/.codex";
  const historyPath =
    input.historyPath ??
    process.env.OPENCLAW_CODEX_HISTORY_FILE ??
    path.join(codexHome, "history.jsonl");
  const sessionsPath = path.join(codexHome, "sessions");
  const maxActivities = input.maxActivities ?? DEFAULT_CODEX_SESSION_MAX_ACTIVITIES;
  const maxCharsPerActivity = input.maxCharsPerActivity ?? DEFAULT_CODEX_ACTIVITY_MAX_CHARS;
  const documentLikeWordThreshold =
    input.documentLikeWordThreshold ?? DEFAULT_DOCUMENT_LIKE_WORD_THRESHOLD;
  const selectionPolicy = {
    source: "session_jsonl_contiguous_recent" as const,
    maxActivities,
    maxCharsPerActivity,
    documentLikeWordThreshold,
    semanticPruning: false as const,
    rawToolLogsIncluded: false as const,
  };
  const sourceStatus: CodexSessionSourceStatus = {
    codexHome,
    sessionsPath,
    sessionsExists: existsSync(sessionsPath),
    historyPath,
    historyExists: existsSync(historyPath),
  };
  const emptyDiagnostics: CodexSessionWindowDiagnostics = {
    rawEventCount: 0,
    activityCount: 0,
    userActivityCount: 0,
    assistantActivityCount: 0,
    toolSummaryCount: 0,
    documentLikeActivityCount: 0,
    boundedActivityCharCount: 0,
    rawFullTranscriptPersisted: false,
    rawToolLogPersisted: false,
  };
  const selectedSessionPath = await resolveCodexSessionPath({
    codexHome,
    sessionsPath,
    historyPath,
    sessionId: input.sessionId,
    sessionPath: input.sessionPath,
  });
  if (!selectedSessionPath) {
    return {
      status: "degraded",
      reason: "codex_session_files_unavailable",
      sourceStatus,
      selectionPolicy,
      activities: [],
      diagnostics: emptyDiagnostics,
    };
  }
  const selectedStats = await stat(selectedSessionPath);
  const raw = await readFile(selectedSessionPath, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  const sessionId = input.sessionId ?? sessionIdFromPath(selectedSessionPath);
  const commandFamilyByCallId = new Map<string, string | undefined>();
  const allActivities: CodexMemoryActivity[] = [];
  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line) as { payload?: unknown };
      const activity = activityFromSessionPayload({
        payload: parsed.payload,
        lineNumber: index + 1,
        sourcePath: selectedSessionPath,
        sessionId,
        maxChars: maxCharsPerActivity,
        documentLikeWordThreshold,
        commandFamilyByCallId,
      });
      if (activity) {
        allActivities.push(activity);
      }
    } catch {
      return;
    }
  });
  const activities = allActivities.slice(-maxActivities);
  const diagnostics: CodexSessionWindowDiagnostics = {
    rawEventCount: lines.length,
    activityCount: activities.length,
    userActivityCount: activities.filter((activity) => activity.role === "user").length,
    assistantActivityCount: activities.filter((activity) => activity.role === "assistant").length,
    toolSummaryCount: activities.filter((activity) => activity.role === "tool_summary").length,
    documentLikeActivityCount: activities.filter(
      (activity) => activity.sourceMode === "document_like",
    ).length,
    boundedActivityCharCount: activities.reduce(
      (sum, activity) => sum + activity.boundedText.length,
      0,
    ),
    rawFullTranscriptPersisted: false,
    rawToolLogPersisted: false,
  };
  return activities.length > 0
    ? {
        status: "loaded",
        sourceStatus: {
          ...sourceStatus,
          selectedSessionPath,
          selectedSessionExists: true,
          selectedSessionBytes: selectedStats.size,
          selectedSessionLineCount: lines.length,
        },
        selectionPolicy,
        activities,
        diagnostics,
      }
    : {
        status: "degraded",
        reason: "codex_session_window_empty",
        sourceStatus: {
          ...sourceStatus,
          selectedSessionPath,
          selectedSessionExists: true,
          selectedSessionBytes: selectedStats.size,
          selectedSessionLineCount: lines.length,
        },
        selectionPolicy,
        activities: [],
        diagnostics,
      };
}

export async function captureCodexMemoryActivityLive(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository?: RuntimeContextRepository;
  activity: CodexMemoryActivity;
  recentContext?: CodexMemoryActivity[];
  projectId?: string | null;
  modelId: string;
  interpreter: OrdinaryTurnCaptureInput["interpreter"];
  rebuildRuntime?: boolean;
  closeoutJobId?: string;
  env?: NodeJS.ProcessEnv;
  maxWordsPerWindow?: number;
  documentLikeWordThreshold?: number;
}): Promise<CodexMemoryCaptureResult> {
  const sourceProfileId = sourceProfileForCodexActivity(input.activity);
  const sourceAuthority = buildSourceAuthorityMetadata(sourceProfileId);
  const sourceMode = resolveCodexSourceMode({
    activity: input.activity,
    documentLikeWordThreshold: input.documentLikeWordThreshold,
  });
  const sourceMetadata = {
    sourceRuntime: "codex",
    codexRef: input.activity.ref,
    codexActivityHash: activityHash(input.activity),
    codexRole: input.activity.role,
    codexKind: input.activity.kind,
    codexSourceMode: sourceMode,
    rawTranscriptPersisted: false,
    rawToolLogPersisted: false,
    sourceAuthority,
  };
  const capture =
    sourceMode === "document_like"
      ? await ingestDocumentLive({
          canonicalRepository: input.canonicalRepository,
          runtimeRepository: input.runtimeRepository,
          rebuildRuntime: input.rebuildRuntime,
          closeoutRunId: input.closeoutJobId,
          env: input.env,
          ingestion: {
            document: {
              externalSourceId: input.activity.ref,
              text: input.activity.boundedText,
              projectId: input.projectId ?? undefined,
              sourceMetadata,
              maxWordsPerWindow: input.maxWordsPerWindow,
              createdAt: input.activity.recordedAt
                ? new Date(input.activity.recordedAt)
                : undefined,
            },
            modelId: input.modelId,
            candidateModelId: input.modelId,
            interpreter: input.interpreter,
          },
        })
      : await captureOrdinaryTurnLive({
          canonicalRepository: input.canonicalRepository,
          runtimeRepository: input.runtimeRepository,
          rebuildRuntime: input.rebuildRuntime,
          closeoutJobId: input.closeoutJobId,
          env: input.env,
          capture: {
            turn: {
              currentTurnText: input.activity.boundedText,
              currentTurnSpeaker: speakerForCodexRole(input.activity.role),
              recentContext: contextFromActivities(input.recentContext ?? []),
              projectId: input.projectId ?? undefined,
              sessionId: input.activity.sessionId ?? "codex-session",
              maxWordsPerWindow: input.maxWordsPerWindow,
              createdAt: input.activity.recordedAt
                ? new Date(input.activity.recordedAt)
                : undefined,
              sourceMetadata,
            },
            modelId: input.modelId,
            candidateModelId: input.modelId,
            interpreter: input.interpreter,
          },
        });
  return {
    activityRef: input.activity.ref,
    role: input.activity.role,
    sourceMode,
    sourceProfileId,
    capture,
  };
}

export async function runCodexSessionMemoryCapture(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository?: RuntimeContextRepository;
  interpreter: OrdinaryTurnCaptureInput["interpreter"];
  env?: NodeJS.ProcessEnv;
  enabled?: boolean;
  cadence?: CodexMemoryCaptureCadence;
  codexHome?: string;
  historyPath?: string;
  sessionPath?: string;
  sessionId?: string;
  projectId?: string | null;
  modelId?: string;
  maxActivities?: number;
  maxCharsPerActivity?: number;
  maxWordsPerWindow?: number;
  documentLikeWordThreshold?: number;
  cooldownMs?: number;
  maxPerRun?: number;
  lastRunAtMs?: number;
  nowMs?: number;
  rebuildRuntime?: boolean;
  closeoutJobId?: string;
}): Promise<CodexMemoryCaptureRunnerReport> {
  const config = resolveCodexCaptureConfig(input);
  const configReport = buildRunnerConfigReport(config);
  if (!config.enabled) {
    return {
      status: "disabled",
      reason: "codex_memory_capture_disabled",
      config: configReport,
      activityCounts: emptyRunnerCounts(),
      writeCounts: emptyWriteCounts(),
      idempotency: {
        skippedRefs: [],
        skippedHashes: [],
        capturedRefs: [],
        capturedHashes: [],
      },
      captures: [],
      safety: buildRunnerSafetyReport(),
    };
  }
  if (
    input.lastRunAtMs !== undefined &&
    config.cooldownMs > 0 &&
    (input.nowMs ?? Date.now()) - input.lastRunAtMs < config.cooldownMs
  ) {
    return {
      status: "cooldown",
      reason: "codex_memory_capture_cooldown_active",
      config: configReport,
      activityCounts: emptyRunnerCounts(),
      writeCounts: emptyWriteCounts(),
      idempotency: {
        skippedRefs: [],
        skippedHashes: [],
        capturedRefs: [],
        capturedHashes: [],
      },
      captures: [],
      safety: buildRunnerSafetyReport(),
    };
  }

  const loaded = await loadRecentCodexSessionWindow({
    codexHome: input.codexHome,
    historyPath: input.historyPath,
    sessionPath: input.sessionPath,
    sessionId: input.sessionId,
    maxActivities: config.maxActivities,
    maxCharsPerActivity: config.maxCharsPerActivity,
    documentLikeWordThreshold: config.documentLikeWordThreshold,
  });
  if (loaded.status === "degraded") {
    await writeCodexCaptureProgress(input.env, {
      stage: "source_load",
      status: "degraded",
      reason: loaded.reason,
    });
    return {
      status: "degraded",
      reason: loaded.reason,
      config: configReport,
      sourceStatus: loaded.sourceStatus,
      diagnostics: loaded.diagnostics,
      activityCounts: emptyRunnerCounts(),
      writeCounts: emptyWriteCounts(),
      idempotency: {
        skippedRefs: [],
        skippedHashes: [],
        capturedRefs: [],
        capturedHashes: [],
      },
      captures: [],
      safety: buildRunnerSafetyReport(),
    };
  }
  await writeCodexCaptureProgress(input.env, {
    stage: "source_load",
    status: "loaded",
    activityCount: loaded.activities.length,
    userActivityCount: loaded.diagnostics.userActivityCount,
    assistantActivityCount: loaded.diagnostics.assistantActivityCount,
    toolSummaryCount: loaded.diagnostics.toolSummaryCount,
  });

  const existing = await loadExistingCodexSourceKeys(input.canonicalRepository);
  const activityCounts = emptyRunnerCounts();
  const writeCounts = emptyWriteCounts();
  const captures: CodexMemoryCaptureRunnerCapture[] = [];
  const skippedRefs: string[] = [];
  const skippedHashes: string[] = [];
  const capturedRefs: string[] = [];
  const capturedHashes: string[] = [];
  activityCounts.loaded = loaded.activities.length;
  activityCounts.user = loaded.activities.filter((activity) => activity.role === "user").length;
  activityCounts.assistant = loaded.activities.filter(
    (activity) => activity.role === "assistant",
  ).length;
  activityCounts.toolSummary = loaded.activities.filter(
    (activity) => activity.role === "tool_summary",
  ).length;

  const selectedActivities = loaded.activities.filter((activity) => {
    const hash = activityHash(activity);
    if (existing.refs.has(activity.ref) || existing.hashes.has(hash)) {
      activityCounts.alreadyIngested += 1;
      if (existing.refs.has(activity.ref)) {
        skippedRefs.push(activity.ref);
      }
      if (existing.hashes.has(hash)) {
        skippedHashes.push(hash);
      }
      captures.push({
        activityRef: activity.ref,
        activityHash: hash,
        role: activity.role,
        sourceMode: resolveCodexSourceMode({
          activity,
          documentLikeWordThreshold: config.documentLikeWordThreshold,
        }),
        status: "skipped",
        reason: "already_ingested",
      });
      return false;
    }
    return true;
  });

  const activitiesForRun = selectActivitiesForCapture({
    activities: selectedActivities,
    maxPerRun: config.maxPerRun,
  });
  await writeCodexCaptureProgress(input.env, {
    stage: "activity_selection",
    status: "completed",
    alreadyIngested: activityCounts.alreadyIngested,
    selectedForRun: activitiesForRun.length,
    maxPerRun: config.maxPerRun,
  });

  for (const [index, activity] of activitiesForRun.entries()) {
    const hash = activityHash(activity);
    const sourceMode = resolveCodexSourceMode({
      activity,
      documentLikeWordThreshold: config.documentLikeWordThreshold,
    });
    await writeCodexCaptureProgress(input.env, {
      stage: "activity_capture",
      status: "started",
      index,
      role: activity.role,
      sourceMode,
      activityHash: hash,
    });
    activityCounts.attempted += 1;
    if (sourceMode === "document_like") {
      activityCounts.documentLike += 1;
    } else {
      activityCounts.ordinaryTurn += 1;
    }
    try {
      const capture = await captureCodexMemoryActivityLive({
        canonicalRepository: input.canonicalRepository,
        runtimeRepository: input.runtimeRepository,
        activity,
        recentContext: buildActivityContextWindow({
          activities: loaded.activities,
          activity,
        }),
        projectId: input.projectId ?? undefined,
        modelId: config.modelId,
        interpreter: input.interpreter,
        rebuildRuntime: input.rebuildRuntime,
        closeoutJobId: input.closeoutJobId,
        env: input.env,
        maxWordsPerWindow: config.maxWordsPerWindow,
        documentLikeWordThreshold: config.documentLikeWordThreshold,
      });
      const nextWriteCounts = countCaptureWrites(capture.capture.writeResults);
      addWriteCounts(writeCounts, nextWriteCounts);
      activityCounts.captured += 1;
      capturedRefs.push(activity.ref);
      capturedHashes.push(hash);
      captures.push({
        activityRef: activity.ref,
        activityHash: hash,
        role: activity.role,
        sourceMode: capture.sourceMode,
        sourceProfileId: capture.sourceProfileId,
        status: "captured",
        windowCount: capture.capture.windows.length,
        writeCount: nextWriteCounts.write + nextWriteCounts.supersede,
        rejectCount: nextWriteCounts.reject,
        quarantineCount: nextWriteCounts.quarantine,
        supportCount: nextWriteCounts.attachSupport,
        sourceHash: capture.capture.source.sourceFingerprint,
      });
      await writeCodexCaptureProgress(input.env, {
        stage: "activity_capture",
        status: "completed",
        index,
        role: activity.role,
        sourceMode: capture.sourceMode,
        writeCount: nextWriteCounts.write + nextWriteCounts.supersede,
        rejectCount: nextWriteCounts.reject,
        quarantineCount: nextWriteCounts.quarantine,
        supportCount: nextWriteCounts.attachSupport,
      });
    } catch (error) {
      activityCounts.failed += 1;
      captures.push({
        activityRef: activity.ref,
        activityHash: hash,
        role: activity.role,
        sourceMode,
        status: "failed",
        reason: error instanceof Error ? error.message : "codex_capture_failed",
      });
      await writeCodexCaptureProgress(input.env, {
        stage: "activity_capture",
        status: "failed",
        index,
        role: activity.role,
        sourceMode,
        reason: error instanceof Error ? error.message : "codex_capture_failed",
      });
    }
  }

  return {
    status: activityCounts.failed > 0 ? "degraded" : "loaded",
    reason: activityCounts.failed > 0 ? "codex_memory_capture_partial_failure" : undefined,
    config: configReport,
    sourceStatus: loaded.sourceStatus,
    diagnostics: loaded.diagnostics,
    activityCounts,
    writeCounts,
    idempotency: {
      skippedRefs,
      skippedHashes,
      capturedRefs,
      capturedHashes,
    },
    captures,
    safety: buildRunnerSafetyReport(),
  };
}
