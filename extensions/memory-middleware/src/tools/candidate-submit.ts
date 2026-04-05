import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { Client } from "pg";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import { DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG } from "../config.js";
import {
  CANDIDATE_SUBMISSION_KINDS,
  type CandidateSubmissionInput,
  type CandidateSubmissionKind,
  type CandidateSubmissionResult,
} from "../db/runtime.js";
import {
  parseAutoCaptureManagedCandidateContent,
  parseManagedCorrectionCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
  type OrdinaryTurnAutoCaptureMatch,
} from "../ordinary-turn-auto-capture.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult as asJsonToolResultBase,
  readContextUuid,
  readCandidateKind as readCandidateKindBase,
  readOptionalObject,
  readOptionalString as readOptionalStringBase,
  readRequiredString as readRequiredStringBase,
  type ToolRawParams,
} from "./common.js";

type CandidateSubmitRawParams = ToolRawParams;

function candidateKindSchema() {
  return Type.Unsafe<CandidateSubmissionKind>({
    type: "string",
    enum: [...CANDIDATE_SUBMISSION_KINDS],
    description: "Candidate submission kind: learning, correction, procedure, or improvement.",
  });
}

const CandidateSubmitToolSchema = Type.Object(
  {
    kind: candidateKindSchema(),
    content: Type.String({
      description: "Candidate-only content to submit into the memory middleware seam.",
      minLength: 1,
    }),
    sessionId: Type.Optional(
      Type.String({
        description:
          "Optional explicit memory-middleware session UUID. Omit for ordinary live submissions unless you know the backing memory session row exists.",
      }),
    ),
    projectId: Type.Optional(Type.String({ description: "Optional project id." })),
    agentId: Type.Optional(
      Type.String({
        description:
          "Optional explicit memory-middleware agent UUID. Omit for ordinary live submissions unless you know the backing memory agent row exists.",
      }),
    ),
    metadata: Type.Optional(
      Type.Object({}, { additionalProperties: true, description: "Optional candidate metadata." }),
    ),
  },
  { additionalProperties: false },
);

function readRequiredString(params: CandidateSubmitRawParams, key: string): string {
  return readRequiredStringBase(params, key);
}

function readOptionalString(params: CandidateSubmitRawParams, key: string): string | undefined {
  return readOptionalStringBase(params, key);
}

function readCandidateKind(params: CandidateSubmitRawParams): CandidateSubmissionKind {
  return readCandidateKindBase(params);
}

function readOptionalMetadata(
  params: CandidateSubmitRawParams,
): Record<string, unknown> | undefined {
  return readOptionalObject(params, "metadata");
}

export function normalizeCandidateSubmissionInput(params: {
  rawParams: CandidateSubmitRawParams;
  context?: OpenClawPluginToolContext;
}): CandidateSubmissionInput {
  const sessionId = readContextUuid(readOptionalString(params.rawParams, "sessionId"));
  const projectId = readContextUuid(readOptionalString(params.rawParams, "projectId"));
  const agentId = readContextUuid(readOptionalString(params.rawParams, "agentId"));
  const metadata = readOptionalMetadata(params.rawParams);

  return {
    kind: readCandidateKind(params.rawParams),
    content: readRequiredString(params.rawParams, "content"),
    ...(sessionId ? { sessionId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function submitCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionResult> {
  const normalizedInput = await normalizeManagedToolCandidateInput({
    input: params.input,
    context: params.context,
  });
  if (normalizedInput.kind === "learning" || normalizedInput.kind === "correction") {
    const duplicate = await findExistingAutoCaptureManagedDuplicate({
      runtime: params.runtime,
      input: normalizedInput,
    });
    if (duplicate) {
      return {
        accepted: false,
        status: "failed",
        kind: normalizedInput.kind,
        reason: `ordinary-turn auto-capture already created ${duplicate.reviewState} candidate ${duplicate.id}`,
      };
    }
  }
  let result: CandidateSubmissionResult;
  switch (normalizedInput.kind) {
    case "learning":
      result = await params.runtime.candidateIngress.submitLearning(normalizedInput);
      break;
    case "correction":
      result = await params.runtime.candidateIngress.submitCorrectionSuggestion(normalizedInput);
      break;
    case "procedure":
      result = await params.runtime.candidateIngress.submitProcedureSuggestion(normalizedInput);
      break;
    case "improvement":
      result = await params.runtime.candidateIngress.submitImprovementNote(normalizedInput);
      break;
  }
  result = await maybeAutoPromoteToolSubmittedPreference({
    runtime: params.runtime,
    input: normalizedInput,
    result,
  });
  return result;
}

function resolveAutoPromotableFeedbackSubmission(
  input: CandidateSubmissionInput,
): ReturnType<typeof parseAutoCaptureManagedCandidateContent> | null {
  if (input.kind !== "learning") {
    return null;
  }
  const metadata = input.metadata ?? {};
  const parsedFromContent = parseAutoCaptureManagedCandidateContent(input.content);
  if (
    parsedFromContent &&
    (parsedFromContent.captureClass === "explicit_preference" ||
      parsedFromContent.captureClass === "explicit_requirement")
  ) {
    return parsedFromContent;
  }
  if (typeof metadata.raw === "string") {
    const rawCandidates = [
      metadata.raw,
      metadata.raw.replace(/^(?:going forward|from now on),\s*/i, ""),
    ];
    for (const rawCandidate of rawCandidates) {
      const parsedFromRaw = parseOrdinaryTurnAutoCapturePreference(
        rawCandidate,
        "user-preference-v2",
      );
      if (
        parsedFromRaw &&
        (parsedFromRaw.captureClass === "explicit_preference" ||
          parsedFromRaw.captureClass === "explicit_requirement")
      ) {
        return parsedFromRaw;
      }
    }
  }
  return null;
}

function mergeCandidateMetadata(
  input: CandidateSubmissionInput,
  patch: Record<string, unknown>,
): CandidateSubmissionInput {
  return {
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      ...patch,
    },
  };
}

function normalizeCorrectionPreferenceKey(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  return normalized;
}

function resolveResponseStyleLearningParaphraseKey(
  content: string,
): OrdinaryTurnAutoCaptureMatch["key"] | null {
  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const canonicalRaw =
    /^(?:user|[a-z][a-z0-9_-]*) prefers bullet points\b.*\b(?:reply|replies|response|responses|list|listing|structured)\b.*[.!?]?$/i.test(
      content,
    )
      ? "Use bullet points for me."
      : /^(?:user|[a-z][a-z0-9_-]*) prefers plain english\b.*(?:jargon)?.*[.!?]?$/i.test(content)
        ? "Use plain English, not jargon."
        : null;
  if (!canonicalRaw) {
    return null;
  }

  return parseOrdinaryTurnAutoCapturePreference(canonicalRaw, "user-preference-v2")?.key ?? null;
}

function extractAutoCaptureKey(metadata: Record<string, unknown> | undefined): string | null {
  const autoCapture = metadata?.autoCapture;
  if (!autoCapture || typeof autoCapture !== "object" || Array.isArray(autoCapture)) {
    return null;
  }
  const key = (autoCapture as { key?: unknown }).key;
  return typeof key === "string" ? key : null;
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

type TranscriptUserMessage = {
  role?: unknown;
  content?: unknown;
};

type SessionStoreEntry = {
  sessionId?: unknown;
  sessionFile?: unknown;
};

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

async function resolveLatestUserTurnFromContext(
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

function isManagedCorrectionMatch(
  parsed: ReturnType<typeof parseManagedCorrectionCandidateContent> | null,
): parsed is NonNullable<ReturnType<typeof parseManagedCorrectionCandidateContent>> {
  return Boolean(
    parsed &&
    (parsed.captureClass === "preference_correction" ||
      parsed.captureClass === "requirement_correction" ||
      parsed.captureClass === "project_fact_correction"),
  );
}

async function resolveManagedCorrectionSubmission(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<{
  parsed: NonNullable<ReturnType<typeof parseManagedCorrectionCandidateContent>>;
  source: "content" | "raw";
} | null> {
  const { input, context } = params;
  const parsedFromContent = parseManagedCorrectionCandidateContent(input.content);
  if (isManagedCorrectionMatch(parsedFromContent)) {
    return { parsed: parsedFromContent, source: "content" };
  }

  const rawCandidates: string[] = [];
  if (typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0) {
    rawCandidates.push(input.metadata.raw);
  }
  const rawFromContext = await resolveLatestUserTurnFromContext(context);
  if (rawFromContext && !rawCandidates.includes(rawFromContext)) {
    rawCandidates.push(rawFromContext);
  }

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

  return null;
}

async function normalizeManagedToolCandidateInput(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionInput> {
  const { input, context } = params;
  const correctionOverride = await resolveManagedCorrectionSubmission({
    input,
    context,
  });

  if (input.kind === "learning") {
    if (correctionOverride) {
      const normalizedCorrectionInput = mergeCandidateMetadata(
        {
          ...input,
          kind: "correction",
          content: correctionOverride.parsed.content,
        },
        {
          classificationAdjustment: {
            source: "candidate_submit_normalizer",
            matchedFrom: correctionOverride.source,
            fromKind: "learning",
            toKind: "correction",
            reason: "bounded_correction_match",
          },
        },
      );
      return await normalizeManagedToolCandidateInput({
        input: normalizedCorrectionInput,
        context,
      });
    }

    const parsed =
      resolveAutoPromotableFeedbackSubmission(input) ??
      (typeof input.metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(input.metadata.raw, "user-preference-v2")
        : null);
    if (!parsed) {
      return input;
    }
    return mergeCandidateMetadata(input, {
      category:
        parsed.captureClass === "explicit_requirement"
          ? "user_requirement"
          : parsed.captureClass === "explicit_project_fact"
            ? "project_fact"
            : "user_preference",
      source:
        parsed.captureClass === "explicit_requirement"
          ? "explicit_user_requirement"
          : parsed.captureClass === "explicit_project_fact"
            ? "explicit_project_fact"
            : "explicit_user_statement",
      autoCapture: {
        source: "model_tool_candidate_submit",
        captureSeam: "model_tool_primary",
        profile: parsed.profile,
        captureClass: parsed.captureClass,
        reasonCode: parsed.reasonCode,
        template: parsed.template,
        key: parsed.key,
        subjectKey: parsed.subjectKey,
        subject: parsed.subject,
        value: parsed.value,
        ...(parsed.projectScope ? { projectScope: parsed.projectScope } : {}),
        toolName: "memory_candidate_submit",
      },
    });
  }

  if (input.kind === "correction") {
    const parsedCorrectionOverride = correctionOverride?.parsed ?? null;
    const normalizedPreferenceKey = normalizeCorrectionPreferenceKey(input.metadata?.preferenceKey);
    const normalizedValue =
      typeof input.metadata?.value === "string" ? input.metadata.value.trim().toLowerCase() : null;
    const parsed =
      parsedCorrectionOverride ??
      (normalizedPreferenceKey && normalizedValue
        ? parseManagedCorrectionCandidateContent(
            `User correction: preferred ${normalizedPreferenceKey} is ${normalizedValue}.`,
          )
        : null) ??
      (typeof input.metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(input.metadata.raw, "user-preference-v2")
        : null);
    if (
      !parsed ||
      (parsed.captureClass !== "preference_correction" &&
        parsed.captureClass !== "requirement_correction" &&
        parsed.captureClass !== "project_fact_correction")
    ) {
      return input;
    }
    return mergeCandidateMetadata(input, {
      category:
        parsed.captureClass === "project_fact_correction"
          ? "project_fact_correction"
          : parsed.captureClass === "requirement_correction"
            ? "user_requirement_correction"
            : "user_preference_correction",
      source:
        parsed.captureClass === "project_fact_correction"
          ? "conversational_project_fact_correction"
          : parsed.captureClass === "requirement_correction"
            ? "conversational_user_requirement_correction"
            : "conversational_user_correction",
      subject_key: parsed.subjectKey,
      ...(parsed.captureClass === "preference_correction"
        ? { preference_key: parsed.subjectKey }
        : {}),
      autoCapture: {
        source: "model_tool_candidate_submit",
        captureSeam: "model_tool_primary",
        profile: parsed.profile,
        captureClass: parsed.captureClass,
        reasonCode: parsed.reasonCode,
        template: parsed.template,
        key: parsed.key,
        subjectKey: parsed.subjectKey,
        subject: parsed.subject,
        value: parsed.value,
        ...(parsed.projectScope ? { projectScope: parsed.projectScope } : {}),
        toolName: "memory_candidate_submit",
      },
    });
  }

  return input;
}

async function maybeAutoPromoteToolSubmittedPreference(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  result: CandidateSubmissionResult;
}): Promise<CandidateSubmissionResult> {
  const autoPromotion =
    params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  if (
    autoPromotion.profile !== "explicit-user-preference-v1" ||
    !params.result.accepted ||
    !params.result.memoryObjectId
  ) {
    return params.result;
  }
  const parsed = resolveAutoPromotableFeedbackSubmission(params.input);
  if (!parsed) {
    return params.result;
  }
  const autoPromotionMetadata = {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: autoPromotion.profile,
      captureProfile: "tool-submitted",
      captureClass: parsed.captureClass,
      reasonCode: parsed.reasonCode,
      key: parsed.key,
      subjectKey: parsed.subjectKey,
      subject: parsed.subject,
      value: parsed.value,
      toolName: "memory_candidate_submit",
    },
  };
  const reviewResult = await params.runtime.candidateReview.review({
    candidateId: params.result.memoryObjectId,
    outcome: "accepted",
    metadata: autoPromotionMetadata,
  });
  if (!reviewResult.accepted) {
    return params.result;
  }
  const promotionResult = await params.runtime.candidatePromotion.promoteToMemory({
    candidateId: params.result.memoryObjectId,
    metadata: autoPromotionMetadata,
  });
  if (!promotionResult.accepted) {
    return params.result;
  }
  return {
    ...params.result,
    reviewState: "approved",
  };
}

function resolveManagedAutoCaptureKey(input: CandidateSubmissionInput): string | null {
  const metadata = input.metadata;
  const directKey = extractAutoCaptureKey(metadata);
  if (directKey) {
    return directKey;
  }

  if (input.kind === "learning") {
    const parsed =
      parseAutoCaptureManagedCandidateContent(input.content) ??
      (typeof metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(metadata.raw, "user-preference-v2")
        : null);
    return parsed?.key ?? resolveResponseStyleLearningParaphraseKey(input.content);
  }

  if (input.kind === "correction") {
    const parsed =
      parseManagedCorrectionCandidateContent(input.content) ??
      (typeof metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(metadata.raw, "user-preference-v2")
        : null);
    return parsed?.key ?? null;
  }

  return null;
}

async function findExistingAutoCaptureManagedDuplicate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<{ id: string; reviewState: string } | null> {
  const key = resolveManagedAutoCaptureKey(params.input);
  const databaseUrl = params.runtime.config.database.url;
  if (!key || !databaseUrl) {
    return null;
  }

  const schema = params.runtime.config.database.schema ?? "memory_middleware";
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<{ id: string; review_state: string }>(
      `
        select id::text as id, review_state::text as review_state
        from "${schema}"."memory_objects"
        where (
          metadata->'candidateMetadata'->'autoCapture'->>'key' = $1
          or metadata->'autoCapture'->>'key' = $1
        )
          and review_state in ('candidate', 'approved', 'corrected')
        order by created_at desc
        limit 1
      `,
      [key],
    );
    const row = result.rows[0];
    return row ? { id: row.id, reviewState: row.review_state } : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

function asJsonToolResult(result: CandidateSubmissionResult) {
  return asJsonToolResultBase(result);
}

export function createCandidateSubmitTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_submit",
    label: "Memory Candidate Submit",
    description:
      "Submit candidate-only learnings, correction suggestions, procedure suggestions, or improvement notes into the memory middleware ingress seam without creating approved memory.",
    parameters: CandidateSubmitToolSchema,
    async execute(_toolCallId: string, rawParams: CandidateSubmitRawParams) {
      const input = normalizeCandidateSubmissionInput({
        rawParams,
        context: params.context,
      });
      const result = await submitCandidateFromTool({
        runtime: params.runtime,
        input,
        context: params.context,
      });
      return asJsonToolResult(result);
    },
  };
}
