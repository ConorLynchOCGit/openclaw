import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginToolContext } from "../../api.js";
import type { CandidateSubmissionInput } from "../db/runtime.js";
import {
  resolveProjectFactIngestion,
  resolveRecurringProcedureIngestion,
  resolveResponseStyleIngestion,
  resolveWorkflowImprovementIngestion,
} from "../memory-ingestion-resolver.js";
import {
  type OrdinaryTurnAutoCaptureMatch,
  toOrdinaryTurnResponseStyleMatch,
} from "../memory-ingestion-types.js";
import {
  parseAutoCaptureManagedCandidateContent,
  parseManagedCorrectionCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
} from "../ordinary-turn-auto-capture.js";
import {
  type ProjectFactFamily,
  type ProjectFactFieldKey,
  type ProjectFactSemanticConfidence,
} from "../project-fact-semantic.js";
import {
  type RecurringProcedureFamily,
  type RecurringProcedureKey,
  type RecurringProcedureSemanticConfidence,
} from "../recurring-procedure-semantic.js";
import {
  detectResponseStyleSemanticDecision,
  type ResponseStyleFamily,
  type ResponseStyleSemanticConfidence,
} from "../response-style-semantic.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import type {
  WorkflowImprovementGuidancePattern,
  WorkflowImprovementLessonFamily,
  WorkflowImprovementSemanticConfidence,
} from "../workflow-improvement-semantic.js";

type TranscriptUserMessage = {
  role?: unknown;
  content?: unknown;
};

type SessionStoreEntry = {
  sessionId?: unknown;
  sessionFile?: unknown;
};

export type ManagedResponseStyleResolution = {
  action: "capture";
  familyId: "response_style";
  parsed: OrdinaryTurnAutoCaptureMatch;
  responseStyleFamily: ResponseStyleFamily;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ResponseStyleSemanticConfidence;
  evidence: string[];
  observedText: string;
};

export type ManagedProjectFactResolution = {
  familyId: "project_fact";
  parsed: OrdinaryTurnAutoCaptureMatch;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ProjectFactSemanticConfidence;
  evidence: string[];
  observedText: string;
};

export type ManagedRecurringProcedureResolution = {
  familyId: "recurring_procedure";
  parsed: OrdinaryTurnAutoCaptureMatch;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "semantic";
  confidence: "high" | RecurringProcedureSemanticConfidence;
  evidence: string[];
  observedText: string;
};

export type ManagedWorkflowImprovementResolution = {
  familyId: "workflow_improvement";
  captureCategory: "workflow_improvement" | "project_rule" | "unmet_need";
  parsed: OrdinaryTurnAutoCaptureMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  guidancePattern?: WorkflowImprovementGuidancePattern;
  source: "content" | "raw";
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  observedText: string;
};

export type ManagedCorrectionSubmissionResolution = {
  parsed: NonNullable<ReturnType<typeof parseManagedCorrectionCandidateContent>>;
  source: "content" | "raw";
  detectionSource?: "semantic";
  confidence?: ResponseStyleSemanticConfidence;
  evidence?: string[];
};

function readDirectAutoCaptureKey(metadata: Record<string, unknown> | undefined): string | null {
  const autoCapture = metadata?.autoCapture;
  if (!autoCapture || typeof autoCapture !== "object" || Array.isArray(autoCapture)) {
    return null;
  }
  const key = (autoCapture as { key?: unknown }).key;
  return typeof key === "string" && key.trim().length > 0 ? key : null;
}

function stripTranscriptTimestampPrefix(value: string): string {
  return value.replace(/^\[[^\]\n]{1,80}\]\s*/, "");
}

function stripGatewaySenderMetadataPrefix(value: string): string {
  return value.replace(/^Sender \(untrusted metadata\):\n```json[\s\S]*?```\n\n/, "");
}

function normalizeTranscriptUserText(value: string): string | null {
  const stripped = stripTranscriptTimestampPrefix(
    stripGatewaySenderMetadataPrefix(value).trim(),
  ).trim();
  return stripped.length > 0 ? stripped : null;
}

function extractTranscriptUserText(message: TranscriptUserMessage | null): string | null {
  if (!message || message.role !== "user") {
    return null;
  }
  if (typeof message.content === "string") {
    return normalizeTranscriptUserText(message.content);
  }
  if (!Array.isArray(message.content)) {
    return null;
  }
  const parts = message.content
    .map((block) =>
      block && typeof block === "object" && "text" in block
        ? (block as { text?: unknown }).text
        : undefined,
    )
    .filter((text): text is string => typeof text === "string")
    .map((text) => normalizeTranscriptUserText(text))
    .filter((text): text is string => typeof text === "string");
  return parts.length > 0 ? parts.join(" ") : null;
}

function parseSessionHeaderId(raw: string): string | null {
  const firstLine = raw
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return null;
  }
  try {
    const parsed = JSON.parse(firstLine) as { type?: unknown; id?: unknown };
    return parsed.type === "session" && typeof parsed.id === "string" && parsed.id.trim().length > 0
      ? parsed.id.trim()
      : null;
  } catch {
    return null;
  }
}

function readLatestTranscriptUserTextFromRaw(raw: string): string | null {
  const lines = raw.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as { message?: TranscriptUserMessage | null };
      const text = extractTranscriptUserText(parsed.message ?? null);
      if (text) {
        return text;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveLatestUserTurnFromContext(
  context: OpenClawPluginToolContext | undefined,
): Promise<string | null> {
  const agentDir = context?.agentDir?.trim();
  const sessionId = context?.sessionId?.trim();
  const sessionKey = context?.sessionKey?.trim();
  if (!agentDir || (!sessionId && !sessionKey)) {
    return null;
  }
  const sessionsDir = path.join(agentDir, "sessions");

  if (sessionKey) {
    try {
      const rawStore = await readFile(path.join(sessionsDir, "sessions.json"), "utf8");
      const parsedStore = JSON.parse(rawStore) as Record<string, SessionStoreEntry>;
      const entry = parsedStore[sessionKey];
      const sessionFile =
        typeof entry?.sessionFile === "string" && entry.sessionFile.trim().length > 0
          ? entry.sessionFile.trim()
          : null;
      if (sessionFile) {
        const candidatePaths = [sessionFile, path.join(sessionsDir, path.basename(sessionFile))];
        for (const candidatePath of candidatePaths) {
          try {
            const raw = await readFile(candidatePath, "utf8");
            const text = readLatestTranscriptUserTextFromRaw(raw);
            if (text) {
              return text;
            }
          } catch {
            continue;
          }
        }
      }
    } catch {
      // Fall through to sessionId scan when the session registry is unavailable.
    }
  }

  if (!agentDir || !sessionId) {
    return null;
  }
  let entries: string[];
  try {
    entries = await readdir(sessionsDir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".jsonl") || entry === "sessions.json") {
      continue;
    }
    const sessionFile = path.join(sessionsDir, entry);
    let raw: string;
    try {
      raw = await readFile(sessionFile, "utf8");
    } catch {
      continue;
    }
    if (parseSessionHeaderId(raw) !== sessionId) {
      continue;
    }
    return readLatestTranscriptUserTextFromRaw(raw);
  }
  return null;
}

async function collectManagedRawCandidates(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<string[]> {
  const rawCandidates: string[] = [];
  if (
    typeof params.input.metadata?.raw === "string" &&
    params.input.metadata.raw.trim().length > 0
  ) {
    rawCandidates.push(params.input.metadata.raw);
  }
  const rawFromContext = await resolveLatestUserTurnFromContext(params.context);
  if (rawFromContext && !rawCandidates.includes(rawFromContext)) {
    rawCandidates.push(rawFromContext);
  }
  return rawCandidates;
}

function normalizeManagedResolutionSource(
  source: "content" | "raw" | "transcript",
): "content" | "raw" {
  return source === "transcript" ? "content" : source;
}

function isManagedCorrectionMatch(
  parsed: ReturnType<typeof parseManagedCorrectionCandidateContent> | null,
): parsed is NonNullable<ReturnType<typeof parseManagedCorrectionCandidateContent>> {
  return Boolean(
    parsed &&
    (parsed.captureClass === "preference_correction" ||
      parsed.captureClass === "requirement_correction"),
  );
}

export async function resolveManagedResponseStyleLearning(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<ManagedResponseStyleResolution | null> {
  const rawCandidates =
    typeof params.input.metadata?.raw === "string" && params.input.metadata.raw.trim().length > 0
      ? [params.input.metadata.raw]
      : [];
  const resolution = await resolveResponseStyleIngestion({
    config: params.runtime.config,
    content: params.input.content,
    primarySource: "content",
    rawCandidates,
    mode: "candidate_learning",
    allowPhrasePatternMatch: true,
  });
  return resolution?.action === "capture"
    ? {
        ...resolution,
        source: normalizeManagedResolutionSource(resolution.source),
      }
    : null;
}

export async function resolveManagedResponseStyleCorrection(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedResponseStyleResolution | null> {
  const resolution = await resolveResponseStyleIngestion({
    config: params.runtime.config,
    content: params.input.content,
    primarySource: "content",
    rawCandidates: await collectManagedRawCandidates(params),
    mode: "candidate_correction",
    allowPhrasePatternMatch: false,
  });
  return resolution?.action === "capture"
    ? {
        ...resolution,
        source: normalizeManagedResolutionSource(resolution.source),
      }
    : null;
}

export async function resolveManagedProjectFactLearning(
  input: CandidateSubmissionInput,
): Promise<ManagedProjectFactResolution | null> {
  const rawCandidates =
    typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0
      ? [input.metadata.raw]
      : [];
  const resolution = await resolveProjectFactIngestion({
    content: input.content,
    primarySource: "content",
    rawCandidates,
    mode: "candidate_learning",
  });
  return resolution
    ? {
        ...resolution,
        source: normalizeManagedResolutionSource(resolution.source),
      }
    : null;
}

export async function resolveManagedProjectFactCorrection(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedProjectFactResolution | null> {
  const resolution = await resolveProjectFactIngestion({
    content: params.input.content,
    primarySource: "content",
    rawCandidates: await collectManagedRawCandidates(params),
    mode: "candidate_correction",
  });
  return resolution
    ? {
        ...resolution,
        source: normalizeManagedResolutionSource(resolution.source),
      }
    : null;
}

export async function resolveManagedRecurringProcedureSubmission(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedRecurringProcedureResolution | null> {
  const resolution = await resolveRecurringProcedureIngestion({
    content: params.input.content,
    primarySource: "content",
    rawCandidates: await collectManagedRawCandidates(params),
  });
  return resolution
    ? {
        ...resolution,
        source: normalizeManagedResolutionSource(resolution.source),
      }
    : null;
}

export async function resolveManagedWorkflowImprovementSubmission(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedWorkflowImprovementResolution | null> {
  const resolution = await resolveWorkflowImprovementIngestion({
    config: params.runtime.config,
    content: params.input.content,
    primarySource: "content",
    rawCandidates: await collectManagedRawCandidates(params),
    projectId: params.input.projectId,
    allowPhrasePatternMatch: true,
  });
  if (!resolution) {
    return null;
  }

  return {
    familyId: "workflow_improvement",
    captureCategory: resolution.captureCategory,
    parsed: resolution.parsed,
    lessonFamily: resolution.lessonFamily,
    reviewMode: resolution.reviewMode,
    ...(resolution.guidancePattern ? { guidancePattern: resolution.guidancePattern } : {}),
    source: normalizeManagedResolutionSource(resolution.source),
    detectionSource: resolution.detectionSource,
    confidence: resolution.confidence,
    evidence: resolution.evidence,
    observedText: resolution.observedText,
  };
}

export async function resolveManagedCorrectionSubmission(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedCorrectionSubmissionResolution | null> {
  const parsedFromContent = parseManagedCorrectionCandidateContent(params.input.content);
  if (isManagedCorrectionMatch(parsedFromContent)) {
    return { parsed: parsedFromContent, source: "content" };
  }

  const rawCandidates = await collectManagedRawCandidates(params);
  for (const rawCandidate of rawCandidates) {
    const parsedFromRawContent = parseManagedCorrectionCandidateContent(rawCandidate);
    if (isManagedCorrectionMatch(parsedFromRawContent)) {
      return { parsed: parsedFromRawContent, source: "raw" };
    }

    const parsedFromRawTurn = parseOrdinaryTurnAutoCapturePreference(
      rawCandidate,
      "user-preference-v2",
    );
    if (isManagedCorrectionMatch(parsedFromRawTurn)) {
      return { parsed: parsedFromRawTurn, source: "raw" };
    }

    const semanticFromRaw = detectResponseStyleSemanticDecision(rawCandidate);
    if (
      semanticFromRaw.action === "capture" &&
      semanticFromRaw.match.captureClass === "requirement_correction"
    ) {
      return {
        parsed: toOrdinaryTurnResponseStyleMatch(semanticFromRaw.match) as NonNullable<
          ReturnType<typeof parseManagedCorrectionCandidateContent>
        >,
        source: "raw",
        detectionSource: "semantic",
        confidence: semanticFromRaw.confidence,
        evidence: semanticFromRaw.evidence,
      };
    }
  }

  const semanticFromContent = detectResponseStyleSemanticDecision(params.input.content);
  if (
    semanticFromContent.action === "capture" &&
    semanticFromContent.match.captureClass === "requirement_correction"
  ) {
    return {
      parsed: toOrdinaryTurnResponseStyleMatch(semanticFromContent.match) as NonNullable<
        ReturnType<typeof parseManagedCorrectionCandidateContent>
      >,
      source: "content",
      detectionSource: "semantic",
      confidence: semanticFromContent.confidence,
      evidence: semanticFromContent.evidence,
    };
  }

  return null;
}

export async function resolveManagedAutoCaptureKey(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<string | null> {
  const { input, context } = params;
  const metadata = input.metadata;
  const directKey = readDirectAutoCaptureKey(metadata);
  if (directKey) {
    return directKey;
  }

  if (input.kind === "learning") {
    const parsed =
      parseAutoCaptureManagedCandidateContent(input.content) ??
      (typeof metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(metadata.raw, "user-preference-v2")
        : null);
    return parsed?.key ?? null;
  }

  if (input.kind === "correction") {
    const parsed =
      parseManagedCorrectionCandidateContent(input.content) ??
      (typeof metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(metadata.raw, "user-preference-v2")
        : null);
    return parsed?.key ?? null;
  }

  if (input.kind === "improvement") {
    const resolution = await resolveWorkflowImprovementIngestion({
      config: params.runtime.config,
      content: input.content,
      primarySource: "content",
      rawCandidates: await collectManagedRawCandidates({ input, context }),
      projectId: input.projectId,
      allowPhrasePatternMatch: true,
    });
    return resolution?.parsed.key ?? null;
  }

  return null;
}
