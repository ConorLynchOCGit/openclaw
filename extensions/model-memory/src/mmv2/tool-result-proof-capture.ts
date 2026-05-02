import { createHash } from "node:crypto";
import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import {
  createMemoryIngestionTelemetryEvent,
  type MemoryIngestionTelemetryEvent,
} from "../ingestion/shared-pipeline.ts";
import { adaptOrdinaryTurnSource } from "../source-adapters/ordinary-turn-source-adapter.ts";
import type {
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
} from "../storage-database-contract.ts";
import type {
  AdmissionDecision,
  AdmissionDecisionBatch,
  CanonicalCandidate,
  CanonicalCandidateBatch,
  ReconciliationDecision,
} from "./contracts.ts";
import { recordLiveMemoryBatch, type LiveMemoryBatch } from "./recording.ts";

const MAX_CAPTURED_PATHS = 6;
const MAX_CAPTURED_URLS = 4;
const MAX_CAPTURED_DOCS = 6;
const MAX_TEXT_SCAN_CHARS = 12_000;

export type ToolResultProofStatus =
  | "success"
  | "failure"
  | "timeout"
  | "approval_pending"
  | "unknown";

export type BoundedToolResultProofFact = {
  status: ToolResultProofStatus;
  toolName: string;
  toolCallId?: string;
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  artifactPaths: string[];
  urls: string[];
  docsOrRunbooks: string[];
  fileCount?: number;
  exitCode?: number;
  errorClass?: string;
  actionName?: string;
  pathCategory?: string;
  resultKind: string;
  rawOutputSha256?: string;
};

export type ToolResultProofCaptureInput = {
  toolName: string;
  toolCallId?: string;
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  result: unknown;
  isError?: boolean;
  observedAt?: Date;
};

export type ToolResultProofCaptureBuildResult = {
  source: ModelMemorySourceRecord;
  windows: ModelMemorySourceWindowRecord[];
  boundedFact: BoundedToolResultProofFact;
  canonicalBatch: CanonicalCandidateBatch;
  admissionBatch: AdmissionDecisionBatch;
  reconciliationDecisions: ReconciliationDecision[];
  liveMemoryBatch: LiveMemoryBatch;
  ingestionTelemetry: MemoryIngestionTelemetryEvent[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resultKind(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function collectStringLeaves(value: unknown, maxEntries = 80): string[] {
  const out: string[] = [];
  const stack: unknown[] = [value];
  while (stack.length > 0 && out.length < maxEntries) {
    const current = stack.pop();
    if (typeof current === "string") {
      const text = current.trim();
      if (text) {
        out.push(text.slice(0, MAX_TEXT_SCAN_CHARS));
      }
      continue;
    }
    if (Array.isArray(current)) {
      stack.push(...current.slice(0, 20));
      continue;
    }
    if (isRecord(current)) {
      stack.push(...Object.values(current).slice(0, 40));
    }
  }
  return out;
}

function normalizeUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function collectUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s"'<>]+/giu)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) {
      urls.add(normalized);
    }
    if (urls.size >= MAX_CAPTURED_URLS) {
      break;
    }
  }
  return [...urls];
}

function normalizeAllowedPath(value: string): string | undefined {
  const trimmed = value.trim().replace(/[),.;:]+$/u, "");
  if (!trimmed || trimmed.includes("@")) {
    return undefined;
  }
  const allowed =
    trimmed.startsWith(".artifacts/") ||
    trimmed.startsWith(".openclaw/") ||
    trimmed.startsWith("docs/") ||
    trimmed.startsWith("runbooks/") ||
    trimmed.startsWith("artifacts/") ||
    trimmed.startsWith("/root/.openclaw/workspace/.openclaw/") ||
    trimmed.startsWith("/root/.openclaw/workspace/docs/") ||
    trimmed.startsWith("/root/.openclaw/workspace/runbooks/") ||
    trimmed.startsWith("/root/.openclaw/workspace/artifacts/") ||
    trimmed.startsWith("/home/node/.openclaw/workspace/.openclaw/") ||
    trimmed.startsWith("/home/node/.openclaw/workspace/docs/") ||
    trimmed.startsWith("/home/node/.openclaw/workspace/runbooks/") ||
    trimmed.startsWith("/home/node/.openclaw/workspace/artifacts/");
  return allowed ? trimmed : undefined;
}

function collectPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(
    /(?:(?:\/root|\/home\/node)\/\.openclaw\/workspace\/(?:\.openclaw|docs|runbooks|artifacts)\/[^\s"'<>]+|(?:\.artifacts|\.openclaw|docs|runbooks|artifacts)\/[^\s"'<>]+)/giu,
  )) {
    const normalized = normalizeAllowedPath(match[0]);
    if (normalized) {
      paths.add(normalized);
    }
    if (paths.size >= MAX_CAPTURED_PATHS) {
      break;
    }
  }
  return [...paths];
}

function collectDocsOrRunbooks(paths: string[]): string[] {
  return paths
    .filter(
      (entry) =>
        entry.includes("/docs/") ||
        entry.startsWith("docs/") ||
        entry.includes("/runbooks/") ||
        entry.startsWith("runbooks/"),
    )
    .slice(0, MAX_CAPTURED_DOCS);
}

function extractFileCount(text: string): number | undefined {
  const patterns = [
    /\bfile\s+count\s*[:=]\s*(\d{1,6})\b/iu,
    /\b(\d{1,6})\s+files?\b/iu,
    /\bcount\s*[:=]\s*(\d{1,6})\b/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }
  return undefined;
}

function readDetails(result: unknown): Record<string, unknown> | undefined {
  if (!isRecord(result)) {
    return undefined;
  }
  const details = result.details;
  return isRecord(details) ? details : result;
}

function resolveExplicitToolResultStatus(input: {
  result: unknown;
  isError?: boolean;
}): ToolResultProofStatus {
  const details = readDetails(input.result);
  const status = readString(details?.status)?.toLowerCase();
  if (status === "approval-pending") {
    return "approval_pending";
  }
  if (status === "timeout" || status === "timed_out") {
    return "timeout";
  }
  if (input.isError === true) {
    return "failure";
  }
  if (status === "error" || status === "failed" || status === "failure") {
    return "failure";
  }
  if (status === "success" || status === "ok" || status === "completed") {
    return "success";
  }
  return input.result === undefined ? "unknown" : "success";
}

function readBoundedErrorClass(input: {
  result: unknown;
  status: ToolResultProofStatus;
}): string | undefined {
  if (input.status !== "failure" && input.status !== "timeout") {
    return undefined;
  }
  const details = readDetails(input.result);
  const candidate =
    readString(details?.errorClass) ??
    readString(details?.code) ??
    readString(details?.status) ??
    input.status;
  return candidate.replace(/[^a-z0-9_.:-]+/giu, "_").slice(0, 80);
}

function readDeclaredActionName(details: Record<string, unknown> | undefined): string | undefined {
  const input = readRecord(details?.input);
  const action = readString(input?.action);
  if (!action) {
    return undefined;
  }
  return action.replace(/[^a-z0-9_.:-]+/giu, "_").slice(0, 80);
}

function resolveAllowedPathCategory(
  details: Record<string, unknown> | undefined,
  scanText: string,
) {
  const input = readRecord(details?.input);
  const candidates = [
    readString(input?.path),
    readString(input?.sourcePath),
    readString(details?.path),
    readString(details?.filePath),
    scanText,
  ].filter((value): value is string => Boolean(value));
  const text = candidates.join("\n");
  if (/runtime-dirty|model-memory\/runtime-dirty|state\.json|events\.jsonl/iu.test(text)) {
    return "runtime_dirty_state";
  }
  if (/docs\/agents|docs\/projects|\.agents\/skills|\/skills\//iu.test(text)) {
    return "canonical_repo_approved_surface";
  }
  if (/imports\/|system\/hostfs|\.git|\.env|USER\.md|MEMORY\.md/iu.test(text)) {
    return "protected_or_readonly_surface";
  }
  if (/\/root\/\.openclaw\/workspace|\/home\/node\/\.openclaw\/workspace/iu.test(text)) {
    return "operator_workspace";
  }
  return undefined;
}

export function buildBoundedToolResultProofFact(
  input: ToolResultProofCaptureInput,
): BoundedToolResultProofFact {
  const strings = collectStringLeaves(input.result);
  const scanText = strings.join("\n").slice(0, MAX_TEXT_SCAN_CHARS);
  const details = readDetails(input.result);
  const explicitPathCandidates = [
    readString(details?.path),
    readString(details?.filePath),
    readString(details?.artifactPath),
    readString(details?.outputPath),
    readString(details?.relativePath),
  ].flatMap((value) => (value ? [value] : []));
  const paths = new Set<string>();
  for (const value of [...explicitPathCandidates, ...collectPaths(scanText)]) {
    const normalized = normalizeAllowedPath(value);
    if (normalized) {
      paths.add(normalized);
    }
    if (paths.size >= MAX_CAPTURED_PATHS) {
      break;
    }
  }
  const urls = collectUrls(scanText);
  const fileCount =
    readNumber(details?.fileCount) ?? readNumber(details?.count) ?? extractFileCount(scanText);
  const status = resolveExplicitToolResultStatus(input);
  const actionName = readDeclaredActionName(details);
  const pathCategory = resolveAllowedPathCategory(details, scanText);
  const errorClass = readBoundedErrorClass({ result: input.result, status });
  return {
    status,
    toolName: input.toolName,
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    artifactPaths: [...paths],
    urls,
    docsOrRunbooks: collectDocsOrRunbooks([...paths]),
    ...(fileCount !== undefined ? { fileCount } : {}),
    ...(readNumber(details?.exitCode) !== undefined
      ? { exitCode: readNumber(details?.exitCode) }
      : {}),
    ...(errorClass ? { errorClass } : {}),
    ...(actionName ? { actionName } : {}),
    ...(pathCategory ? { pathCategory } : {}),
    resultKind: resultKind(input.result),
    ...(scanText ? { rawOutputSha256: sha256(scanText) } : {}),
  };
}

export function shouldCaptureBoundedToolResultProof(fact: BoundedToolResultProofFact): boolean {
  return (
    fact.artifactPaths.length > 0 ||
    fact.urls.length > 0 ||
    fact.docsOrRunbooks.length > 0 ||
    typeof fact.fileCount === "number" ||
    fact.status === "failure" ||
    fact.status === "timeout"
  );
}

function renderBoundedFactText(fact: BoundedToolResultProofFact): string {
  const parts = [`Tool result proof: ${fact.toolName} completed with status ${fact.status}.`];
  if (fact.artifactPaths.length > 0) {
    parts.push(`Artifact paths: ${fact.artifactPaths.join(", ")}.`);
  }
  if (fact.urls.length > 0) {
    parts.push(`URLs: ${fact.urls.join(", ")}.`);
  }
  if (fact.docsOrRunbooks.length > 0) {
    parts.push(`Docs/runbooks found: ${fact.docsOrRunbooks.join(", ")}.`);
  }
  if (typeof fact.fileCount === "number") {
    parts.push(`File count: ${fact.fileCount}.`);
  }
  if (typeof fact.exitCode === "number") {
    parts.push(`Exit code: ${fact.exitCode}.`);
  }
  if (fact.errorClass) {
    parts.push(`Error class: ${fact.errorClass}.`);
  }
  if (fact.actionName) {
    parts.push(`Action: ${fact.actionName}.`);
  }
  if (fact.pathCategory) {
    parts.push(`Path category: ${fact.pathCategory}.`);
  }
  return parts.join(" ");
}

function buildScope(fact: BoundedToolResultProofFact): CanonicalCandidate["scope"] {
  return {
    tenant_id: "default",
    user_id: "default",
    project_id: null,
    workspace_id: "openclaw-workspace",
    subject_type: "workspace",
    subject_id: fact.sessionKey ?? fact.sessionId ?? null,
    applies_to: "current_workspace",
  };
}

function buildCandidate(input: {
  eventId: string;
  source: ModelMemorySourceRecord;
  window: ModelMemorySourceWindowRecord;
  fact: BoundedToolResultProofFact;
  evidenceText: string;
  createdAt: Date;
}): CanonicalCandidate {
  const factKey = sha256(
    JSON.stringify({
      toolName: input.fact.toolName,
      status: input.fact.status,
      artifactPaths: input.fact.artifactPaths,
      urls: input.fact.urls,
      docsOrRunbooks: input.fact.docsOrRunbooks,
      fileCount: input.fact.fileCount,
      errorClass: input.fact.errorClass,
      actionName: input.fact.actionName,
      pathCategory: input.fact.pathCategory,
    }),
  );
  const canonicalText = normalizeWhitespace(input.evidenceText);
  return {
    candidate_id: buildDeterministicUuid("mmv2-tool-result-candidate", factKey),
    unit_type: "atomic",
    kind:
      input.fact.artifactPaths.length > 0 || input.fact.urls.length > 0 ? "source_ref" : "episode",
    artifact_type: null,
    canonical_text: canonicalText,
    search_text: normalizeWhitespace(
      [
        input.fact.toolName,
        input.fact.status,
        ...input.fact.artifactPaths,
        ...input.fact.urls,
        ...input.fact.docsOrRunbooks,
        input.fact.errorClass,
        input.fact.actionName,
        input.fact.pathCategory,
        typeof input.fact.fileCount === "number" ? `file count ${input.fact.fileCount}` : undefined,
      ]
        .filter(Boolean)
        .join(" "),
    ).toLowerCase(),
    source: {
      event_id: input.eventId,
      source_type: "api_event",
      source_id: input.source.id,
      speaker: "system",
      created_at: input.createdAt.toISOString(),
      segment_id: input.window.id,
      start_char: 0,
      end_char: input.evidenceText.length,
      evidence_quote: canonicalText,
    },
    scope: buildScope(input.fact),
    validity: {
      valid_at: input.createdAt.toISOString(),
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    payload:
      input.fact.artifactPaths.length > 0
        ? {
            payload_type: "source_ref",
            ref_type: "file_path",
            locator: input.fact.artifactPaths[0],
            label: `Tool result artifact from ${input.fact.toolName}`,
            access_hint: null,
            when_to_use:
              "Use as bounded evidence that the tool produced or inspected this artifact.",
          }
        : input.fact.urls.length > 0
          ? {
              payload_type: "source_ref",
              ref_type: "url",
              locator: input.fact.urls[0],
              label: `Tool result URL from ${input.fact.toolName}`,
              access_hint: null,
              when_to_use: "Use as bounded evidence that the tool referenced this URL.",
            }
          : {
              payload_type: "episode",
              event_type: input.fact.status === "success" ? "task_completed" : "task_failed",
              actor: "tool",
              action: `${input.fact.toolName} completed`,
              object: "bounded tool result",
              outcome: input.fact.status,
              event_time: input.createdAt.toISOString(),
            },
    parent_candidate_id: null,
    component_candidate_id: null,
    promotion: "global",
    confidence: input.fact.status === "success" ? 0.86 : 0.78,
    quality: {
      atomicity: 0.9,
      specificity: 0.86,
      durability: 0.62,
      actionability: 0.72,
      grounding: 0.95,
    },
    risk_flags: ["none"],
    content_hash: sha256(canonicalText),
  };
}

function buildAdmission(candidate: CanonicalCandidate): AdmissionDecision {
  return {
    candidate_id: candidate.candidate_id,
    decision: "admit",
    scores: {
      future_utility: 0.72,
      durability: 0.62,
      confidence: candidate.confidence,
      novelty: 0.7,
      scope_clarity: 0.9,
      sensitivity_safety: 0.95,
      specificity: 0.86,
    },
    reason_codes: ["canonical_source", "useful_future_context", "durable"],
    rationale:
      "Bounded tool-result proof capture admitted only sanitized artifact/source/outcome facts.",
    recommended_ttl_seconds: null,
    requires_reconciliation: true,
  };
}

function buildReconciliation(
  eventId: string,
  candidate: CanonicalCandidate,
): ReconciliationDecision {
  return {
    schema_version: "reconciliation_decision.v1",
    event_id: eventId,
    candidate_id: candidate.candidate_id,
    decision: "insert_new",
    target_memory_ids: [],
    merged_canonical_text: null,
    conflict_type: "none",
    supersedes_memory_ids: [],
    rationale:
      "Tool-result proof capture uses deterministic fact identity and does not fuzzy-merge or supersede.",
    confidence: 0.78,
  };
}

export function buildToolResultProofLiveCapture(
  input: ToolResultProofCaptureInput,
): ToolResultProofCaptureBuildResult | undefined {
  const createdAt = input.observedAt ?? new Date();
  const boundedFact = buildBoundedToolResultProofFact(input);
  if (!shouldCaptureBoundedToolResultProof(boundedFact)) {
    return undefined;
  }

  const evidenceText = renderBoundedFactText(boundedFact);
  const envelope = adaptOrdinaryTurnSource({
    currentTurnText: evidenceText,
    currentTurnSpeaker: "system",
    sessionId: input.sessionId,
    sourceMetadata: {
      captureSeam: "tool_result_proof",
      toolName: input.toolName,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      rawPromptPersisted: false,
      rawTranscriptPersisted: false,
      rawToolLogPersisted: false,
      rawOutputSha256: boundedFact.rawOutputSha256 ?? null,
    },
    createdAt,
    maxWordsPerWindow: Number.MAX_SAFE_INTEGER,
  });
  const window = envelope.windows[0];
  if (!window) {
    return undefined;
  }
  const eventId = buildDeterministicUuid(
    "mmv2-tool-result-event",
    `${envelope.source.id}:${boundedFact.toolName}:${boundedFact.toolCallId ?? "none"}`,
  );
  const candidate = buildCandidate({
    eventId,
    source: envelope.source,
    window,
    fact: boundedFact,
    evidenceText,
    createdAt,
  });
  const canonicalBatch: CanonicalCandidateBatch = {
    schema_version: "canonical_candidates.v1",
    event_id: eventId,
    canonical_candidates: [candidate],
  };
  const admissionBatch: AdmissionDecisionBatch = {
    schema_version: "admission_decision.v1",
    event_id: eventId,
    decisions: [buildAdmission(candidate)],
  };
  const reconciliationDecisions = [buildReconciliation(eventId, candidate)];
  const liveMemoryBatch = recordLiveMemoryBatch({
    eventId,
    canonicalBatch,
    admissionBatch,
    reconciliationDecisions,
  });
  const ingestionTelemetry = [
    createMemoryIngestionTelemetryEvent({
      path: "tool_result_capture",
      stage: "semantic_contract_boundary",
      status: "completed",
      candidate_counts: {
        extracted: canonicalBatch.canonical_candidates.length,
        valid: canonicalBatch.canonical_candidates.length,
      },
      ids: {
        source_ids: [envelope.source.id],
        segment_ids: envelope.windows.map((entry) => entry.id),
      },
    }),
    createMemoryIngestionTelemetryEvent({
      path: "tool_result_capture",
      stage: "persistence_boundary",
      status: "completed",
      candidate_counts: {
        admitted: liveMemoryBatch.durableMemories.length,
        rejected: liveMemoryBatch.memoryEvents.filter(
          (entry) =>
            entry.event_type === "candidate_rejected" ||
            entry.event_type === "candidate_quarantined",
        ).length,
      },
      ids: {
        memory_ids: liveMemoryBatch.durableMemories.map((entry) => entry.memory_id),
        event_ids: liveMemoryBatch.memoryEvents.map((entry) => entry.memory_event_id),
      },
    }),
  ];

  return {
    source: envelope.source,
    windows: envelope.windows,
    boundedFact,
    canonicalBatch,
    admissionBatch,
    reconciliationDecisions,
    liveMemoryBatch,
    ingestionTelemetry,
  };
}
