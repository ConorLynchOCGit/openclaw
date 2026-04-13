import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginToolContext } from "../../api.js";
import type { CandidateSubmissionInput } from "../db/runtime.js";
import type { OrdinaryTurnAutoCaptureMatch } from "../memory-ingestion-types.js";
import { toOrdinaryTurnRecurringProcedureMatch } from "../memory-ingestion-types.js";
import {
  collectPlannedMemorySemanticCaptures,
  pickBestPlannedMemorySemanticCapture,
  type PlannedWindowSemanticCapture,
} from "../memory-semantic-capture-service.js";
import {
  normalizeDocumentMemorySource,
  normalizeTranscriptMemorySource,
} from "../memory-source-normalization.js";
import { buildMemorySourceWindows } from "../memory-source-windowing.js";
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
  createRecurringProcedureCanonicalMatch,
  type RecurringProcedureFamily,
  type RecurringProcedureKey,
  type RecurringProcedureSemanticConfidence,
} from "../recurring-procedure-semantic.js";
import {
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
  compatibilityProfileId: "response_style";
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
  compatibilityProfileId: "project_fact";
  parsed: OrdinaryTurnAutoCaptureMatch;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ProjectFactSemanticConfidence;
  evidence: string[];
  observedText: string;
};

export type ManagedRecurringProcedureResolution = {
  familyId: "recurring_procedure";
  compatibilityProfileId: "recurring_procedure";
  parsed: OrdinaryTurnAutoCaptureMatch;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "semantic" | "deterministic";
  confidence: "high" | RecurringProcedureSemanticConfidence;
  evidence: string[];
  observedText: string;
};

export type ManagedWorkflowImprovementResolution = {
  familyId: "workflow_improvement";
  compatibilityProfileId: "workflow_improvement";
  captureCategory: "workflow_improvement" | "project_rule" | "unmet_need";
  compatibilityCategory: "workflow_improvement" | "project_rule" | "unmet_need";
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

type ManagedSemanticCapture = {
  source: "content" | "raw";
  capture: PlannedWindowSemanticCapture;
};

function buildManagedSourceWindows(params: {
  input: CandidateSubmissionInput;
  source: "content" | "raw";
  text: string;
}): ReturnType<typeof buildMemorySourceWindows> {
  const sourceId = `managed:${params.input.kind}:${params.source}:${params.input.projectId ?? "global"}`;
  const blocks =
    params.source === "content"
      ? normalizeDocumentMemorySource({
          source: {
            kind: "tool_result",
            sourceId,
            ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
            ...(params.input.agentId ? { agentId: params.input.agentId } : {}),
            toolName: "candidate_submit",
            sourceClass: "managed_candidate_submission",
          },
          content: params.text,
          maxBlockChars: 2_000,
        })
      : normalizeTranscriptMemorySource({
          source: {
            kind: "transcript",
            sourceId,
            sessionKey: params.input.sessionId ?? "managed-candidate-raw",
            ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
            ...(params.input.agentId ? { agentId: params.input.agentId } : {}),
            sourceClass: "managed_candidate_raw",
          },
          text: params.text,
          parentContext: [],
          maxSegments: 4,
        });
  return buildMemorySourceWindows({
    blocks,
    maxWindowChars: params.source === "content" ? 3_200 : 2_400,
    maxBlocksPerWindow: 6,
  });
}

async function collectManagedSemanticCaptures(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedSemanticCapture[]> {
  const candidates: Array<{ source: "content" | "raw"; text: string }> = [
    { source: "content", text: params.input.content },
    ...(await collectManagedRawCandidates(params)).map((text) => ({
      source: "raw" as const,
      text,
    })),
  ];
  const captures: ManagedSemanticCapture[] = [];
  for (const candidate of candidates) {
    const windows = buildManagedSourceWindows({
      input: params.input,
      source: candidate.source,
      text: candidate.text,
    });
    const plannedCaptures = await collectPlannedMemorySemanticCaptures({
      config: params.runtime.config,
      lane: "document_ingestion",
      windows,
      interpreter: params.runtime.semanticInterpreter,
      ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    });
    for (const capture of plannedCaptures.captures) {
      if (capture.materialized.action !== "capture") {
        continue;
      }
      captures.push({
        source: candidate.source,
        capture,
      });
    }
  }
  return captures;
}

function pickManagedCapture(
  captures: ManagedSemanticCapture[],
  predicate: (capture: ManagedSemanticCapture) => boolean,
): ManagedSemanticCapture | null {
  const best = pickBestPlannedMemorySemanticCapture(
    captures.map((capture) => capture.capture),
    (capture) => {
      const wrapped = captures.find((entry) => entry.capture === capture);
      return wrapped ? predicate(wrapped) : false;
    },
  );
  if (!best) {
    return null;
  }
  return captures.find((capture) => capture.capture === best) ?? null;
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

function isManagedProjectFactCorrectionMatch(
  parsed: ReturnType<typeof parseManagedCorrectionCandidateContent> | null,
): parsed is NonNullable<ReturnType<typeof parseManagedCorrectionCandidateContent>> {
  return Boolean(parsed && parsed.captureClass === "project_fact_correction");
}

function looksLikeManagedProcedureCorrection(text: string): boolean {
  return /^\s*actually\b/i.test(text.trim());
}

export async function resolveManagedResponseStyleLearning(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<ManagedResponseStyleResolution | null> {
  const capture = pickManagedCapture(
    await collectManagedSemanticCaptures({
      runtime: params.runtime,
      input: params.input,
    }),
    (entry) =>
      entry.capture.materialized.action === "capture" &&
      entry.capture.materialized.projection.compatibilityCategory === "response_style",
  );
  if (!capture) {
    return null;
  }
  if (capture.capture.materialized.action !== "capture") {
    return null;
  }
  const projection = capture.capture.materialized.projection;
  return {
    action: "capture",
    familyId: "response_style",
    compatibilityProfileId: "response_style",
    parsed: projection.compatibilityMatch,
    responseStyleFamily: projection.responseStyleFamily ?? "generalized_guidance",
    reviewMode:
      (projection.responseStyleFamily ?? "generalized_guidance") === "generalized_guidance"
        ? "hold_for_more_evidence"
        : "pending_confirmation",
    source: capture.source,
    detectionSource: "semantic",
    confidence: projection.confidence,
    evidence: projection.evidence,
    observedText: projection.observedText,
  };
}

export async function resolveManagedResponseStyleCorrection(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedResponseStyleResolution | null> {
  const capture = pickManagedCapture(
    await collectManagedSemanticCaptures(params),
    (entry) =>
      entry.capture.materialized.action === "capture" &&
      entry.capture.materialized.object.kind === "correction" &&
      entry.capture.materialized.object.correctionKind === "response_preference",
  );
  if (!capture) {
    return null;
  }
  if (capture.capture.materialized.action !== "capture") {
    return null;
  }
  const projection = capture.capture.materialized.projection;
  return {
    action: "capture",
    familyId: "response_style",
    compatibilityProfileId: "response_style",
    parsed: projection.compatibilityMatch,
    responseStyleFamily: projection.responseStyleFamily ?? "generalized_guidance",
    reviewMode: projection.reviewMode,
    source: capture.source,
    detectionSource: "semantic",
    confidence: projection.confidence,
    evidence: projection.evidence,
    observedText: projection.observedText,
  };
}

export async function resolveManagedProjectFactLearning(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<ManagedProjectFactResolution | null> {
  const capture = pickManagedCapture(
    await collectManagedSemanticCaptures(params),
    (entry) =>
      entry.capture.materialized.action === "capture" &&
      entry.capture.materialized.projection.compatibilityCategory === "project_fact",
  );
  if (!capture) {
    return null;
  }
  if (capture.capture.materialized.action !== "capture") {
    return null;
  }
  const projection = capture.capture.materialized.projection;
  return {
    familyId: "project_fact",
    compatibilityProfileId: "project_fact",
    parsed: projection.compatibilityMatch,
    factFamily: projection.factFamily ?? "generalized_reference",
    ...(projection.fieldKey ? { fieldKey: projection.fieldKey } : {}),
    reviewMode:
      (projection.factFamily ?? "generalized_reference") === "supported_field"
        ? "pending_confirmation"
        : "hold_for_more_evidence",
    source: capture.source,
    detectionSource: "semantic",
    confidence: projection.confidence,
    evidence: projection.evidence,
    observedText: projection.observedText,
  };
}

export async function resolveManagedProjectFactCorrection(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedProjectFactResolution | null> {
  const correctionParses: Array<{
    source: "content" | "raw";
    parsed: NonNullable<ReturnType<typeof parseManagedCorrectionCandidateContent>>;
  }> = [];
  const parsedContentCorrection = parseManagedCorrectionCandidateContent(params.input.content);
  if (isManagedProjectFactCorrectionMatch(parsedContentCorrection)) {
    correctionParses.push({
      source: "content",
      parsed: parsedContentCorrection,
    });
  }
  for (const rawCandidate of await collectManagedRawCandidates(params)) {
    const parsedRawCorrection = parseManagedCorrectionCandidateContent(rawCandidate);
    if (isManagedProjectFactCorrectionMatch(parsedRawCorrection)) {
      correctionParses.push({
        source: "raw",
        parsed: parsedRawCorrection,
      });
    }
  }
  if (correctionParses.length === 0) {
    return null;
  }

  const capture = pickManagedCapture(
    await collectManagedSemanticCaptures(params),
    (entry) =>
      entry.capture.materialized.action === "capture" &&
      entry.capture.materialized.projection.compatibilityCategory === "project_fact",
  );
  if (!capture) {
    return null;
  }
  if (capture.capture.materialized.action !== "capture") {
    return null;
  }
  const projection = capture.capture.materialized.projection;
  const correctionParse =
    correctionParses.find((entry) => entry.source === capture.source) ?? correctionParses[0];
  if (!correctionParse) {
    return null;
  }
  return {
    familyId: "project_fact",
    compatibilityProfileId: "project_fact",
    parsed: {
      ...correctionParse.parsed,
      // Project-fact lifecycle lookup still clusters on stored compatibility keys.
      key: projection.compatibilityMatch.key,
      subjectKey: projection.compatibilityMatch.subjectKey,
    },
    factFamily: projection.factFamily ?? "generalized_reference",
    ...(projection.fieldKey ? { fieldKey: projection.fieldKey } : {}),
    reviewMode: "direct",
    source: correctionParse.source,
    detectionSource: "semantic",
    confidence: projection.confidence,
    evidence: projection.evidence,
    observedText: projection.observedText,
  };
}

export async function resolveManagedRecurringProcedureSubmission(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedRecurringProcedureResolution | null> {
  const capture = pickManagedCapture(
    await collectManagedSemanticCaptures(params),
    (entry) =>
      entry.capture.materialized.action === "capture" &&
      entry.capture.materialized.projection.compatibilityCategory === "recurring_procedure",
  );
  if (!capture) {
    return null;
  }
  if (capture.capture.materialized.action !== "capture") {
    return null;
  }
  const projection = capture.capture.materialized.projection;
  const object =
    capture.capture.materialized.object.kind === "procedure"
      ? capture.capture.materialized.object
      : null;
  const procedureFamily = projection.procedureFamily ?? "generalized_named_checklist";
  const correctionMatch =
    object &&
    looksLikeManagedProcedureCorrection(
      capture.source === "content"
        ? params.input.content
        : ((await collectManagedRawCandidates(params)).find(Boolean) ?? ""),
    )
      ? {
          ...toOrdinaryTurnRecurringProcedureMatch(
            createRecurringProcedureCanonicalMatch({
              title: object.title,
              steps: object.steps,
              procedureFamily,
              ...(object.procedureKey ? { procedureKey: object.procedureKey } : {}),
              correction: true,
            }),
          ),
          profile: "user-preference-v2" as const,
        }
      : null;
  return {
    familyId: "recurring_procedure",
    compatibilityProfileId: "recurring_procedure",
    parsed: correctionMatch ?? projection.compatibilityMatch,
    procedureFamily,
    ...(object?.procedureKey ? { procedureKey: object.procedureKey } : {}),
    reviewMode:
      procedureFamily === "supported_key"
        ? projection.confidence === "high"
          ? "direct"
          : "pending_confirmation"
        : "hold_for_more_evidence",
    source: capture.source,
    detectionSource: "semantic",
    confidence: projection.confidence,
    evidence: projection.evidence,
    observedText: projection.observedText,
  };
}

export async function resolveManagedWorkflowImprovementSubmission(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedWorkflowImprovementResolution | null> {
  const capture = pickManagedCapture(
    await collectManagedSemanticCaptures(params),
    (entry) =>
      entry.capture.materialized.action === "capture" &&
      (entry.capture.materialized.projection.compatibilityCategory === "workflow_improvement" ||
        entry.capture.materialized.projection.compatibilityCategory === "project_rule" ||
        entry.capture.materialized.projection.compatibilityCategory === "unmet_need"),
  );
  if (!capture) {
    return null;
  }
  if (capture.capture.materialized.action !== "capture") {
    return null;
  }
  const projection = capture.capture.materialized.projection;
  const compatibilityCategory =
    projection.compatibilityCategory === "workflow_improvement" ||
    projection.compatibilityCategory === "project_rule" ||
    projection.compatibilityCategory === "unmet_need"
      ? projection.compatibilityCategory
      : null;
  if (!compatibilityCategory) {
    return null;
  }
  const captureClass = projection.compatibilityMatch.captureClass;
  return {
    familyId: "workflow_improvement",
    compatibilityProfileId: "workflow_improvement",
    captureCategory: compatibilityCategory,
    compatibilityCategory,
    parsed: projection.compatibilityMatch,
    lessonFamily: projection.lessonFamily ?? "generalized_workflow_lesson",
    reviewMode:
      captureClass === "workflow_environment_constraint" ||
      captureClass === "workflow_api_workaround"
        ? "pending_confirmation"
        : "hold_for_more_evidence",
    ...(projection.guidancePattern ? { guidancePattern: projection.guidancePattern } : {}),
    source: capture.source,
    detectionSource: "semantic",
    confidence: projection.confidence,
    evidence: projection.evidence,
    observedText: projection.observedText,
  };
}

export async function resolveManagedCorrectionSubmission(params: {
  runtime: MemoryMiddlewareRuntime;
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
  }
  const capture = pickManagedCapture(
    await collectManagedSemanticCaptures(params),
    (entry) =>
      entry.capture.materialized.object.kind === "correction" &&
      entry.capture.materialized.object.correctionKind === "response_preference",
  );
  if (capture) {
    if (capture.capture.materialized.action !== "capture") {
      return null;
    }
    const projection = capture.capture.materialized.projection;
    return {
      parsed: projection.compatibilityMatch as NonNullable<
        ReturnType<typeof parseManagedCorrectionCandidateContent>
      >,
      source: capture.source,
      detectionSource: "semantic",
      confidence: projection.confidence,
      evidence: projection.evidence,
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
    if (parsed?.key) {
      return parsed.key;
    }
  }

  if (input.kind === "correction") {
    const parsed =
      parseManagedCorrectionCandidateContent(input.content) ??
      (typeof metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(metadata.raw, "user-preference-v2")
        : null);
    if (parsed?.key) {
      return parsed.key;
    }
  }

  const captures = await collectManagedSemanticCaptures({
    runtime: params.runtime,
    input,
    context,
  });
  const preferredCapture = pickManagedCapture(captures, () => true);
  if (preferredCapture?.capture.materialized.action === "capture") {
    return {
      parsed: preferredCapture.capture.materialized.projection.compatibilityMatch,
      source: preferredCapture.source,
      detectionSource: "semantic",
      confidence: preferredCapture.capture.materialized.projection.confidence,
      evidence: preferredCapture.capture.materialized.projection.evidence,
    }.parsed.key;
  }
  return null;
}
