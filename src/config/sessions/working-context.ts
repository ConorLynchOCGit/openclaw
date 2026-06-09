import crypto from "node:crypto";
import { loadSessionStore, resolveSessionStoreEntry, updateSessionStoreEntry } from "./store.js";
import type {
  SessionWorkingContextEntry,
  SessionWorkingContextEntryKind,
  SessionWorkingContextEntrySource,
  SessionWorkingContextState,
  SessionWorkingContextUpdateEvent,
} from "./types.js";

export type SessionWorkingContextInputEntry = {
  kind: SessionWorkingContextEntryKind;
  text: string;
  source?: SessionWorkingContextEntrySource;
  sourceToolCallId?: string;
  toolResultRef?: string;
  taskRef?: string;
  childResultRef?: string;
  requestedAgentId?: string;
  childSessionKey?: string;
  childRunId?: string;
  status?: string;
  lineRangeComplete?: boolean;
  truncatedSource?: boolean;
  changedFilePaths?: string[];
  addedFilePaths?: string[];
  modifiedFilePaths?: string[];
  deletedFilePaths?: string[];
  validationStatus?: string;
};

export type SessionWorkingContextUpdateResult =
  | {
      persisted: true;
      sessionKey: string;
      workingContextRef: string;
      workingContextEntryRef: string;
      entry: SessionWorkingContextEntry;
      workingContext: SessionWorkingContextState;
      event: SessionWorkingContextUpdateEvent;
    }
  | {
      persisted: false;
      sessionKey: string;
      workingContextRef: string;
      reason: "empty_text" | "missing_session";
    };

const SESSION_WORKING_CONTEXT_SCHEMA_VERSION = 1 as const;
const SESSION_WORKING_CONTEXT_ENTRY_LIMIT = 8;
const SESSION_WORKING_CONTEXT_HISTORY_LIMIT = 20;
const SESSION_WORKING_CONTEXT_TEXT_LIMIT = 12_000;
const SESSION_WORKING_CONTEXT_PROMPT_LIMIT = 24_000;
const SESSION_WORKING_CONTEXT_FILE_GRAPH_LIMIT = 4_000;
const WORKING_CONTEXT_PROMPT_START = "<openclaw_native_working_context>";
const WORKING_CONTEXT_PROMPT_END = "</openclaw_native_working_context>";

type FileGraphSectionSummary = {
  text: string;
  verifiedEdgeCount: number;
  uncertainAnnotationCount: number;
};

export function buildSessionWorkingContextRef(sessionKey: string): string {
  return `openclaw-session-working-context://${encodeURIComponent(sessionKey.trim())}`;
}

export function buildSessionWorkingContextEntryRef(params: {
  sessionKey: string;
  entryId: string;
}): string {
  return `${buildSessionWorkingContextRef(params.sessionKey)}/${encodeURIComponent(
    params.entryId.trim(),
  )}`;
}

function normalizeWorkingContextText(value: string): string {
  return value.trim().slice(0, SESSION_WORKING_CONTEXT_TEXT_LIMIT);
}

function truncatePromptText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const suffix = "\n[working context truncated to bounded prompt budget]";
  return `${text.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

export function hasInlineContextWindows(text: string): boolean {
  return /\b(?:inline[_\s-]*context[_\s-]*windows?|bounded\s+(?:source|context)\s+(?:windows?|excerpts?))\b/i.test(
    text,
  );
}

export function hasFileGraph(text: string): boolean {
  return /\bfile[_\s-]*graph\b/i.test(text);
}

function hasReadContinuationOrCap(text: string): boolean {
  return (
    /\[(?:Showing lines [^\]]*?Use offset=\d+ to continue\.|\d+ more lines in file\. Use offset=\d+ to continue\.)\]\s*$/iu.test(
      text,
    ) ||
    /\[Read output capped at [^\]]+ Use offset=\d+ to continue\.\]\s*$/iu.test(text) ||
    /\(Output capped at [^)]+ Showing lines \d+-\d+\. Use offset=\d+ to continue\.\)\s*$/iu.test(
      text,
    ) ||
    /\[\.\.\. \d+ more characters truncated\]\s*$/iu.test(text)
  );
}

function resolveLineRangeComplete(params: {
  input: SessionWorkingContextInputEntry;
  text: string;
}): boolean | undefined {
  if (hasReadContinuationOrCap(params.text)) {
    return false;
  }
  if (typeof params.input.lineRangeComplete === "boolean") {
    return params.input.lineRangeComplete;
  }
  return params.input.kind === "context_window" ? true : undefined;
}

function resolveWorkingContextKind(params: {
  inputKind: SessionWorkingContextEntryKind;
  lineRangeComplete: boolean | undefined;
}): SessionWorkingContextEntryKind {
  if (params.inputKind === "context_window" && params.lineRangeComplete === false) {
    return "discovery_hint";
  }
  return params.inputKind;
}

function hasStructuredWorkingContextSignal(text: string): boolean {
  return /\b(?:inline[_\s-]*context[_\s-]*windows?|bounded\s+(?:source|context)\s+(?:windows?|excerpts?)|file[_\s-]*graph|likely[_\s-]*edit[_\s-]*points?|high[_\s-]*signal[_\s-]*refs?)\b/i.test(
    text,
  );
}

function isProjectedWorkingContextSectionHeader(line: string): boolean {
  return /^\s*(?:#{1,6}\s*)?(?:answer|direct\s+answer|high[_\s-]*signal[_\s-]*refs?|inline[_\s-]*context[_\s-]*windows?|bounded\s+(?:source|context)\s+(?:windows?|excerpts?)|source\s+(?:windows?|excerpts?)|context\s+(?:windows?|excerpts?)|file[_\s-]*graph|likely[_\s-]*edit[_\s-]*points?|adjacent[_\s-]*context|search[_\s-]*terms(?:[_\s-]*used)?|misses|next[_\s-]*(?:searches|likely[_\s-]*pivots)|risks(?:[_\s-]*or[_\s-]*unknowns|\s*\/\s*unknowns)?|unknowns)\b.*:?\s*$/i.test(
    line,
  );
}

function collectProjectedWorkingContextSections(text: string, maxSectionChars: number): string[] {
  const lines = text.split(/\r?\n/u);
  const sections: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!isProjectedWorkingContextSectionHeader(line)) {
      continue;
    }
    let endIndex = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (isProjectedWorkingContextSectionHeader(lines[cursor] ?? "")) {
        endIndex = cursor;
        break;
      }
    }
    const section = lines.slice(index, endIndex).join("\n").trim();
    if (section) {
      sections.push(section.slice(0, maxSectionChars).trim());
    }
    index = endIndex - 1;
  }
  return sections;
}

export function projectStructuredWorkingContextText(params: {
  text: string;
  maxChars: number;
}): string | undefined {
  const text = params.text.trim();
  if (!hasStructuredWorkingContextSignal(text)) {
    return undefined;
  }
  const maxChars = Math.max(1, Math.trunc(params.maxChars));
  const header = [
    "Projected oversized child result:",
    `originalBytes=${Buffer.byteLength(text, "utf8")}`,
    "OpenClaw projected structured scout material into bounded parent-visible context. Use the projected windows/file_graph for the next decision; delegate a narrower scout if exact source is still missing.",
    "",
  ].join("\n");
  const bodyBudget = Math.max(1, maxChars - header.length - 160);
  const sections = collectProjectedWorkingContextSections(
    text,
    Math.max(1, Math.floor(bodyBudget / 4)),
  );
  const body =
    sections.length > 0
      ? sections.join("\n\n")
      : ["inline_context_windows:", text.slice(0, bodyBudget).trimEnd()].join("\n");
  const projected = `${header}${body}`.trim();
  if (projected.length <= maxChars) {
    return projected;
  }
  const suffix = "\n[projected child result truncated to bounded parent context]";
  if (maxChars <= suffix.length) {
    return projected.slice(0, maxChars).trimEnd();
  }
  return `${projected.slice(0, Math.max(1, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function isFileGraphHeader(line: string): boolean {
  return /^\s*(?:#{1,6}\s*)?file[_\s-]*graph\s*:?\s*$/i.test(line);
}

function isKnownWorkingContextSectionHeader(line: string): boolean {
  return /^\s*(?:#{1,6}\s*)?(?:direct\s+answer|bounded\s+(?:source|context)\s+(?:windows?|excerpts?)|source\s+(?:windows?|excerpts?)|context\s+(?:windows?|excerpts?)|search\s+terms|misses|likely\s+edit\s+points|adjacent\s+(?:tests?|configs?|callers?)|next\s+likely\s+pivots|risks(?:\s*\/\s*unknowns)?|unknowns|validation\s+question|commands\s+considered|commands\s+run|exit\s+status|likely\s+cause|source\s*\/\s*test\s+refs|repair\s+context|residual\s+risk)\b.*:?\s*$/i.test(
    line,
  );
}

export function extractFileGraphSection(text: string): string | undefined {
  const normalized = text.trim();
  if (!hasFileGraph(normalized)) {
    return undefined;
  }
  const lines = normalized.split(/\r?\n/);
  let startIndex = lines.findIndex(isFileGraphHeader);
  if (startIndex < 0) {
    startIndex = lines.findIndex((line) => /\bfile[_\s-]*graph\s*:/i.test(line));
  }
  if (startIndex < 0) {
    return undefined;
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (isKnownWorkingContextSectionHeader(lines[index] ?? "")) {
      endIndex = index;
      break;
    }
  }

  const section = lines
    .slice(startIndex, endIndex)
    .join("\n")
    .trim()
    .slice(0, SESSION_WORKING_CONTEXT_FILE_GRAPH_LIMIT)
    .trim();
  return section ? section : undefined;
}

function isFileGraphEdgeLine(line: string): boolean {
  return (
    /(?:->|=>|imports?|exports?|calls?|callers?|references?|depends\s+on|registers?|tests?|validates?)/iu.test(
      line,
    ) && /[A-Za-z0-9_./-]+\.[A-Za-z0-9_.-]+/u.test(line)
  );
}

function isEvidenceBackedFileGraphLine(line: string): boolean {
  return (
    /\bevidence\s*[:=]/iu.test(line) ||
    /\b(?:lines?|window)\s+\d+(?:\s*[-:]\s*\d+)?\b/iu.test(line) ||
    /[A-Za-z0-9_./-]+\.[A-Za-z0-9_.-]+:\d+(?:-\d+)?/u.test(line)
  );
}

function summarizeFileGraphSection(text: string): FileGraphSectionSummary | undefined {
  const section = extractFileGraphSection(text);
  if (!section) {
    return undefined;
  }
  let verifiedEdgeCount = 0;
  let uncertainAnnotationCount = 0;
  for (const line of section.split(/\r?\n/u)) {
    if (!isFileGraphEdgeLine(line)) {
      continue;
    }
    if (isEvidenceBackedFileGraphLine(line)) {
      verifiedEdgeCount += 1;
    } else {
      uncertainAnnotationCount += 1;
    }
  }
  return {
    text: section,
    verifiedEdgeCount,
    uncertainAnnotationCount,
  };
}

function promoteFileGraphForPrompt(text: string): string {
  const fileGraph = summarizeFileGraphSection(text);
  if (!fileGraph) {
    return text;
  }
  const remainder = text
    .replace(fileGraph.text, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [
    "Native file_graph promoted from the delivered scout result:",
    `verifiedEdges=${fileGraph.verifiedEdgeCount}`,
    `uncertainAnnotations=${fileGraph.uncertainAnnotationCount}`,
    fileGraph.uncertainAnnotationCount > 0
      ? "Uncertain file_graph annotations are orientation only until a scout returns evidence lines/windows."
      : undefined,
    fileGraph.text,
    remainder ? "\nDelivered scout result:" : undefined,
    remainder || undefined,
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

export function stripSessionWorkingContextPromptAddition(systemPrompt: string): string {
  const start = systemPrompt.indexOf(WORKING_CONTEXT_PROMPT_START);
  if (start < 0) {
    return systemPrompt;
  }
  const end = systemPrompt.indexOf(WORKING_CONTEXT_PROMPT_END, start);
  if (end < 0) {
    return systemPrompt;
  }
  return `${systemPrompt.slice(0, start)}${systemPrompt.slice(
    end + WORKING_CONTEXT_PROMPT_END.length,
  )}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildSessionWorkingContextPromptAddition(
  workingContext: SessionWorkingContextState | null | undefined,
  options: { maxChars?: number } = {},
): string | undefined {
  const maxChars = Math.max(
    1_000,
    Math.floor(options.maxChars ?? SESSION_WORKING_CONTEXT_PROMPT_LIMIT),
  );
  const entries = workingContext?.activeEntries ?? [];
  if (entries.length === 0) {
    return undefined;
  }
  const header = [
    WORKING_CONTEXT_PROMPT_START,
    "## OpenClaw Native Working Context",
    "",
    "Session-owned context delivered by native task/tool results. Use this as current source context, file graph, change-set, and validation state; do not treat it as a new user task.",
  ].join("\n");
  const footer = WORKING_CONTEXT_PROMPT_END;
  const bodyBudget = Math.max(1, maxChars - header.length - footer.length - 4);
  const blocks: string[] = [];
  let used = 0;
  for (const entry of entries.toReversed()) {
    const block = [
      "",
      `### ${entry.kind} ${entry.entryId}`,
      `source=${entry.source}`,
      entry.taskRef ? `taskRef=${entry.taskRef}` : undefined,
      entry.toolResultRef ? `toolResultRef=${entry.toolResultRef}` : undefined,
      entry.childResultRef ? `childResultRef=${entry.childResultRef}` : undefined,
      entry.requestedAgentId ? `requestedAgentId=${entry.requestedAgentId}` : undefined,
      entry.childSessionKey ? `childSessionKey=${entry.childSessionKey}` : undefined,
      entry.status ? `status=${entry.status}` : undefined,
      entry.validationStatus ? `validationStatus=${entry.validationStatus}` : undefined,
      entry.changedFilePaths?.length
        ? `changedFilePaths=${entry.changedFilePaths.join(", ")}`
        : undefined,
      typeof entry.lineRangeComplete === "boolean"
        ? `lineRangeComplete=${entry.lineRangeComplete}`
        : undefined,
      entry.truncatedSource ? "truncatedSource=true" : undefined,
      `hasInlineContextWindows=${entry.hasInlineContextWindows}`,
      `hasFileGraph=${entry.hasFileGraph}`,
      typeof entry.fileGraphVerifiedEdgeCount === "number"
        ? `fileGraphVerifiedEdges=${entry.fileGraphVerifiedEdgeCount}`
        : undefined,
      typeof entry.fileGraphUncertainAnnotationCount === "number"
        ? `fileGraphUncertainAnnotations=${entry.fileGraphUncertainAnnotationCount}`
        : undefined,
      `textHash=${entry.textHash}`,
      "",
      truncatePromptText(promoteFileGraphForPrompt(entry.text), Math.max(1, bodyBudget - used)),
    ]
      .filter((line): line is string => typeof line === "string")
      .join("\n");
    if (used + block.length > bodyBudget && blocks.length > 0) {
      break;
    }
    blocks.push(block);
    used += block.length;
    if (used >= bodyBudget) {
      break;
    }
  }
  if (blocks.length === 0) {
    return undefined;
  }
  return [header, ...blocks.toReversed(), footer].join("\n").trim();
}

function compactEntryForHistory(
  entry: SessionWorkingContextEntry,
): Omit<SessionWorkingContextEntry, "text"> {
  const { text: _text, ...compact } = entry;
  return compact;
}

function normalizeExistingEntries(value: unknown): SessionWorkingContextEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is SessionWorkingContextEntry => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const record = entry as Record<string, unknown>;
      const source = record.source;
      return (
        typeof record.entryId === "string" &&
        typeof record.createdAt === "number" &&
        (source === "native_task" || source === "native_tool") &&
        typeof record.textHash === "string" &&
        typeof record.textByteCount === "number" &&
        typeof record.text === "string"
      );
    })
    .slice(-SESSION_WORKING_CONTEXT_ENTRY_LIMIT);
}

function normalizeExistingHistory(value: unknown): SessionWorkingContextUpdateEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is SessionWorkingContextUpdateEvent => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return (
        record.type === "working_context.updated" &&
        typeof record.eventId === "string" &&
        typeof record.updatedAt === "number" &&
        Array.isArray(record.activeEntryIds) &&
        Array.isArray(record.entries)
      );
    })
    .slice(-SESSION_WORKING_CONTEXT_HISTORY_LIMIT);
}

function isSessionWorkingContextState(value: unknown): value is SessionWorkingContextState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === SESSION_WORKING_CONTEXT_SCHEMA_VERSION &&
    typeof record.sessionKey === "string" &&
    typeof record.updatedAt === "number" &&
    Array.isArray(record.activeEntries) &&
    Array.isArray(record.history)
  );
}

export function readSessionWorkingContext(params: {
  storePath: string;
  sessionKey: string;
}): SessionWorkingContextState | null {
  try {
    const store = loadSessionStore(params.storePath, { skipCache: true });
    const resolved = resolveSessionStoreEntry({ store, sessionKey: params.sessionKey });
    const workingContext = resolved.existing?.workingContext;
    return isSessionWorkingContextState(workingContext) ? workingContext : null;
  } catch {
    return null;
  }
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanOptionalStringArray(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = Array.from(
    new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0)),
  ).slice(0, 50);
  return entries.length > 0 ? entries : undefined;
}

function buildWorkingContextEntry(params: {
  sessionKey: string;
  input: SessionWorkingContextInputEntry;
  createdAt: number;
}): SessionWorkingContextEntry | null {
  const text = normalizeWorkingContextText(params.input.text);
  if (!text) {
    return null;
  }
  const lineRangeComplete = resolveLineRangeComplete({ input: params.input, text });
  const kind = resolveWorkingContextKind({
    inputKind: params.input.kind,
    lineRangeComplete,
  });
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  const fileGraph = summarizeFileGraphSection(text);
  const fileGraphTextHash = fileGraph
    ? crypto.createHash("sha256").update(fileGraph.text).digest("hex")
    : undefined;
  const entryHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        sessionKey: params.sessionKey,
        createdAt: params.createdAt,
        sourceToolCallId: params.input.sourceToolCallId,
        childRunId: params.input.childRunId,
        hash,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  const status = cleanOptionalString(params.input.status);
  const validationStatus = cleanOptionalString(params.input.validationStatus);
  const changedFilePaths = cleanOptionalStringArray(params.input.changedFilePaths);
  const addedFilePaths = cleanOptionalStringArray(params.input.addedFilePaths);
  const modifiedFilePaths = cleanOptionalStringArray(params.input.modifiedFilePaths);
  const deletedFilePaths = cleanOptionalStringArray(params.input.deletedFilePaths);
  return {
    entryId: `wctx_${entryHash}`,
    kind,
    createdAt: params.createdAt,
    source: params.input.source ?? "native_task",
    ...(params.input.sourceToolCallId ? { sourceToolCallId: params.input.sourceToolCallId } : {}),
    ...(params.input.toolResultRef ? { toolResultRef: params.input.toolResultRef } : {}),
    ...(params.input.taskRef ? { taskRef: params.input.taskRef } : {}),
    ...(params.input.childResultRef ? { childResultRef: params.input.childResultRef } : {}),
    ...(params.input.requestedAgentId ? { requestedAgentId: params.input.requestedAgentId } : {}),
    ...(params.input.childSessionKey ? { childSessionKey: params.input.childSessionKey } : {}),
    ...(params.input.childRunId ? { childRunId: params.input.childRunId } : {}),
    ...(status ? { status } : {}),
    ...(typeof lineRangeComplete === "boolean" ? { lineRangeComplete } : {}),
    ...(params.input.truncatedSource || lineRangeComplete === false
      ? { truncatedSource: true }
      : {}),
    ...(changedFilePaths ? { changedFilePaths } : {}),
    ...(addedFilePaths ? { addedFilePaths } : {}),
    ...(modifiedFilePaths ? { modifiedFilePaths } : {}),
    ...(deletedFilePaths ? { deletedFilePaths } : {}),
    ...(validationStatus ? { validationStatus } : {}),
    textHash: hash,
    textByteCount: Buffer.byteLength(text, "utf8"),
    text,
    hasInlineContextWindows: hasInlineContextWindows(text),
    hasFileGraph: Boolean(fileGraph && fileGraph.verifiedEdgeCount > 0),
    ...(fileGraphTextHash
      ? {
          fileGraphTextHash,
          fileGraphTextByteCount: Buffer.byteLength(fileGraph?.text ?? "", "utf8"),
          fileGraphVerifiedEdgeCount: fileGraph?.verifiedEdgeCount ?? 0,
          fileGraphUncertainAnnotationCount: fileGraph?.uncertainAnnotationCount ?? 0,
        }
      : {}),
  };
}

function buildWorkingContextEvent(params: {
  sessionKey: string;
  updatedAt: number;
  activeEntries: SessionWorkingContextEntry[];
  sourceToolCallId?: string;
}): SessionWorkingContextUpdateEvent {
  const eventHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        sessionKey: params.sessionKey,
        updatedAt: params.updatedAt,
        sourceToolCallId: params.sourceToolCallId,
        activeEntryIds: params.activeEntries.map((entry) => entry.entryId),
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return {
    eventId: `wctx_evt_${eventHash}`,
    type: "working_context.updated",
    updatedAt: params.updatedAt,
    entryCount: params.activeEntries.length,
    activeEntryIds: params.activeEntries.map((entry) => entry.entryId),
    ...(params.sourceToolCallId ? { sourceToolCallId: params.sourceToolCallId } : {}),
    entries: params.activeEntries.map(compactEntryForHistory),
  };
}

export async function updateSessionWorkingContext(params: {
  storePath: string;
  sessionKey: string;
  entry: SessionWorkingContextInputEntry;
  now?: number;
}): Promise<SessionWorkingContextUpdateResult> {
  const sessionKey = params.sessionKey.trim();
  const workingContextRef = buildSessionWorkingContextRef(sessionKey);
  const updatedAt = params.now ?? Date.now();
  const nextEntry = buildWorkingContextEntry({
    sessionKey,
    input: params.entry,
    createdAt: updatedAt,
  });
  if (!nextEntry) {
    return {
      persisted: false,
      sessionKey,
      workingContextRef,
      reason: "empty_text",
    };
  }

  let workingContext: SessionWorkingContextState | null = null;
  let event: SessionWorkingContextUpdateEvent | null = null;
  const updated = await updateSessionStoreEntry({
    storePath: params.storePath,
    sessionKey,
    update: async (entry) => {
      const previousEntries = normalizeExistingEntries(entry.workingContext?.activeEntries);
      const activeEntries = [...previousEntries, nextEntry].slice(
        -SESSION_WORKING_CONTEXT_ENTRY_LIMIT,
      );
      event = buildWorkingContextEvent({
        sessionKey,
        updatedAt,
        activeEntries,
        sourceToolCallId: params.entry.sourceToolCallId,
      });
      const previousHistory = normalizeExistingHistory(entry.workingContext?.history);
      workingContext = {
        schemaVersion: SESSION_WORKING_CONTEXT_SCHEMA_VERSION,
        sessionKey,
        updatedAt,
        activeEntries,
        history: [...previousHistory, event].slice(-SESSION_WORKING_CONTEXT_HISTORY_LIMIT),
      };
      return { workingContext };
    },
  });

  if (!updated || !workingContext || !event) {
    return {
      persisted: false,
      sessionKey,
      workingContextRef,
      reason: "missing_session",
    };
  }
  return {
    persisted: true,
    sessionKey,
    workingContextRef,
    workingContextEntryRef: buildSessionWorkingContextEntryRef({
      sessionKey,
      entryId: nextEntry.entryId,
    }),
    entry: nextEntry,
    workingContext,
    event,
  };
}
