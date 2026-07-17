// Filesystem session history readers.
// Parses transcript JSONL files for messages, previews, counts, and usage metadata.
import fs from "node:fs";
import { StringDecoder } from "node:string_decoder";
import {
  resolveIntegerOption,
  resolveNonNegativeIntegerOption,
} from "@openclaw/normalization-core/number-coercion";
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { deriveSessionTotalTokens, hasNonzeroUsage, normalizeUsage } from "../agents/usage.js";
import { jsonUtf8Bytes } from "../infra/json-utf8-bytes.js";
import { hasInterSessionUserProvenance } from "../sessions/input-provenance.js";
import { extractAssistantVisibleText } from "../shared/chat-message-content.js";
import { escapeRegExp } from "../shared/regexp.js";
import { resolveTrajectoryRuntimeFileSync } from "../trajectory/runtime-file.js";
import { formatBoundedToolEvidencePreview } from "../trajectory/tool-evidence-preview.js";
import { estimateStringChars, estimateTokensFromChars } from "../utils/cjk-chars.js";
import { stripInlineDirectiveTagsForDisplay } from "../utils/directive-tags.js";
import { extractToolCallNames, hasToolCall } from "../utils/transcript-tools.js";
import { stripEnvelope } from "./chat-sanitize.js";
import { isSuppressedControlReplyText } from "./control-reply-text.js";
import { resolveSessionTranscriptCandidates } from "./session-transcript-files.fs.js";
import {
  readSessionTranscriptIndex,
  type IndexedTranscriptEntry,
} from "./session-transcript-index.fs.js";
import type {
  GatewaySessionCodexExecutionEvidence,
  GatewaySessionCodexParentRound,
  GatewaySessionCodexUsage,
  GatewaySessionRow,
  ReadbackProgressProjection,
  ReadbackFieldProvenance,
  SessionPreviewItem,
} from "./session-utils.types.js";

type SessionTitleFields = {
  firstUserMessage: string | null;
  lastMessagePreview: string | null;
};

type SessionTitleFieldsCacheEntry = SessionTitleFields & {
  mtimeMs: number;
  size: number;
};

const sessionTitleFieldsCache = new Map<string, SessionTitleFieldsCacheEntry>();
const MAX_SESSION_TITLE_FIELDS_CACHE_ENTRIES = 5000;
const transcriptMessageCountCache = new Map<
  string,
  {
    mtimeMs: number;
    size: number;
    count: number;
  }
>();
const MAX_TRANSCRIPT_MESSAGE_COUNT_CACHE_ENTRIES = 5000;
const TRANSCRIPT_ASYNC_READ_CHUNK_BYTES = 64 * 1024;
type TranscriptFileHandle = Awaited<ReturnType<typeof fs.promises.open>>;

function readSessionTitleFieldsCacheKey(
  filePath: string,
  opts?: { includeInterSession?: boolean },
) {
  const includeInterSession = opts?.includeInterSession === true ? "1" : "0";
  return `${filePath}\t${includeInterSession}`;
}

function getCachedSessionTitleFields(cacheKey: string, stat: fs.Stats): SessionTitleFields | null {
  const cached = sessionTitleFieldsCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size) {
    sessionTitleFieldsCache.delete(cacheKey);
    return null;
  }
  // LRU bump
  sessionTitleFieldsCache.delete(cacheKey);
  sessionTitleFieldsCache.set(cacheKey, cached);
  return {
    firstUserMessage: cached.firstUserMessage,
    lastMessagePreview: cached.lastMessagePreview,
  };
}

function setCachedSessionTitleFields(cacheKey: string, stat: fs.Stats, value: SessionTitleFields) {
  sessionTitleFieldsCache.set(cacheKey, {
    ...value,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  });
  while (sessionTitleFieldsCache.size > MAX_SESSION_TITLE_FIELDS_CACHE_ENTRIES) {
    const oldestKey = sessionTitleFieldsCache.keys().next().value;
    if (typeof oldestKey !== "string" || !oldestKey) {
      break;
    }
    sessionTitleFieldsCache.delete(oldestKey);
  }
}

function getCachedTranscriptMessageCount(filePath: string, stat: fs.Stats): number | null {
  const cached = transcriptMessageCountCache.get(filePath);
  if (!cached) {
    return null;
  }
  if (cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size) {
    transcriptMessageCountCache.delete(filePath);
    return null;
  }
  transcriptMessageCountCache.delete(filePath);
  transcriptMessageCountCache.set(filePath, cached);
  return cached.count;
}

function setCachedTranscriptMessageCount(filePath: string, stat: fs.Stats, count: number): void {
  transcriptMessageCountCache.set(filePath, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    count,
  });
  while (transcriptMessageCountCache.size > MAX_TRANSCRIPT_MESSAGE_COUNT_CACHE_ENTRIES) {
    const oldestKey = transcriptMessageCountCache.keys().next().value;
    if (typeof oldestKey !== "string" || !oldestKey) {
      break;
    }
    transcriptMessageCountCache.delete(oldestKey);
  }
}

async function yieldTranscriptScan(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/** Attach OpenClaw metadata to a transcript message without dropping existing metadata. */
export function attachOpenClawTranscriptMeta(
  message: unknown,
  meta: Record<string, unknown>,
): unknown {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return message;
  }
  const record = message as Record<string, unknown>;
  const existing =
    record["__openclaw"] &&
    typeof record["__openclaw"] === "object" &&
    !Array.isArray(record["__openclaw"])
      ? (record["__openclaw"] as Record<string, unknown>)
      : {};
  return {
    ...record,
    __openclaw: {
      ...existing,
      ...meta,
    },
  };
}

/** Read all visible transcript messages for a session from the first existing candidate file. */
export function readSessionMessages(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
): unknown[] {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile);

  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return [];
  }

  return transcriptRecordsToMessages(readSelectedTranscriptRecords(filePath));
}

export type ReadRecentSessionMessagesOptions = {
  maxMessages: number;
  maxBytes?: number;
  maxLines?: number;
};

export type ReadSessionMessagesAsyncOptions =
  | {
      mode: "full";
      reason: string;
    }
  | ({
      mode: "recent";
    } & ReadRecentSessionMessagesOptions);

type ReadRecentSessionMessagesResult = {
  messages: unknown[];
  totalMessages: number;
};

const RECENT_SESSION_MESSAGES_DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

type TailTranscriptRecord = {
  id?: string;
  parentId?: string | null;
  record: Record<string, unknown>;
};

function normalizeRecentSessionReadOptions(opts?: Partial<ReadRecentSessionMessagesOptions>) {
  const maxMessages = resolveNonNegativeIntegerOption(opts?.maxMessages, 0);
  const maxBytes = resolveIntegerOption(opts?.maxBytes, RECENT_SESSION_MESSAGES_DEFAULT_MAX_BYTES, {
    min: 1024,
  });
  const maxLines = resolveIntegerOption(opts?.maxLines, maxMessages * 20 + 20, {
    min: maxMessages,
  });
  return { maxMessages, maxBytes, maxLines };
}

export function readRecentSessionMessages(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  opts?: ReadRecentSessionMessagesOptions,
): unknown[] {
  const { maxMessages, maxBytes, maxLines } = normalizeRecentSessionReadOptions(opts);
  if (maxMessages === 0) {
    return [];
  }

  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile);
  if (!filePath) {
    return [];
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return [];
  }
  if (stat.size === 0) {
    return [];
  }

  const readLen = Math.min(stat.size, maxBytes);
  const readStart = Math.max(0, stat.size - readLen);

  return (
    withOpenTranscriptFd(filePath, (fd) => {
      const buf = Buffer.alloc(readLen);
      const bytesRead = fs.readSync(fd, buf, 0, readLen, readStart);
      if (bytesRead <= 0) {
        return [];
      }
      const chunk = buf.toString("utf-8", 0, bytesRead);
      const lines = chunk
        .split(/\r?\n/)
        .slice(readStart > 0 ? 1 : 0)
        .filter((line) => line.trim().length > 0)
        .slice(-maxLines);

      return parseRecentTranscriptTailMessages(lines, maxMessages);
    }) ?? []
  );
}

async function readRecentTranscriptTailLinesAsync(
  filePath: string,
  stat: fs.Stats,
  opts: ReadRecentSessionMessagesOptions,
): Promise<string[]> {
  const { maxBytes, maxLines } = normalizeRecentSessionReadOptions(opts);
  const readLen = Math.min(stat.size, maxBytes);
  const readStart = Math.max(0, stat.size - readLen);
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(readLen);
    const { bytesRead } = await handle.read(buffer, 0, readLen, readStart);
    if (bytesRead <= 0) {
      return [];
    }
    return buffer
      .toString("utf-8", 0, bytesRead)
      .split(/\r?\n/)
      .slice(readStart > 0 ? 1 : 0)
      .filter((line) => line.trim().length > 0)
      .slice(-maxLines);
  } finally {
    await handle.close();
  }
}

const MAX_TRANSCRIPT_PARSE_LINE_BYTES = 256 * 1024;
const OVERSIZED_TRANSCRIPT_METADATA_PREFIX_CHARS = 64 * 1024;
const TRANSCRIPT_OVERSIZED_MESSAGE_PLACEHOLDER = "[chat.history omitted: message too large]";

function isOversizedTranscriptLine(line: string): boolean {
  return Buffer.byteLength(line, "utf8") > MAX_TRANSCRIPT_PARSE_LINE_BYTES;
}

function extractJsonStringFieldPrefix(prefix: string, field: string): string | undefined {
  const match = new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(prefix);
  if (!match) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(`"${match[1]}"`) as unknown;
    return normalizeTailEntryString(decoded);
  } catch {
    return undefined;
  }
}

function extractJsonNullableStringFieldPrefix(
  prefix: string,
  field: string,
): string | null | undefined {
  if (new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*null`).test(prefix)) {
    return null;
  }
  return extractJsonStringFieldPrefix(prefix, field);
}

function extractJsonNumberFieldPrefix(prefix: string, field: string): number | undefined {
  const match = new RegExp(
    `"${escapeRegExp(field)}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)`,
  ).exec(prefix);
  if (!match) {
    return undefined;
  }
  const decoded = Number(match[1]);
  return Number.isFinite(decoded) ? decoded : undefined;
}

function buildOversizedTranscriptRecord(line: string): TailTranscriptRecord {
  const prefix = line.slice(0, OVERSIZED_TRANSCRIPT_METADATA_PREFIX_CHARS);
  const messageMatch = /"message"\s*:/.exec(prefix);
  const recordPrefix = messageMatch ? prefix.slice(0, messageMatch.index) : prefix;
  const id = extractJsonStringFieldPrefix(prefix, "id");
  const parentId = extractJsonNullableStringFieldPrefix(prefix, "parentId");
  const type = extractJsonStringFieldPrefix(prefix, "type");
  const timestamp =
    extractJsonStringFieldPrefix(recordPrefix, "timestamp") ??
    extractJsonNumberFieldPrefix(recordPrefix, "timestamp");
  const role = extractJsonStringFieldPrefix(prefix, "role") ?? "assistant";
  const record: Record<string, unknown> = {
    ...(type ? { type } : {}),
    ...(id ? { id } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
    message: {
      role,
      content: [{ type: "text", text: TRANSCRIPT_OVERSIZED_MESSAGE_PLACEHOLDER }],
      __openclaw: { truncated: true, reason: "oversized" },
    },
  };
  return {
    ...(id ? { id } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
    record,
  };
}

function normalizeTailEntryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseTailTranscriptRecord(line: string): TailTranscriptRecord | null {
  if (isOversizedTranscriptLine(line)) {
    return buildOversizedTranscriptRecord(line);
  }
  return parseTailTranscriptRecordRaw(line);
}

function parseTailTranscriptRecordRaw(line: string): TailTranscriptRecord | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    return {
      ...(normalizeTailEntryString(record.id) ? { id: normalizeTailEntryString(record.id) } : {}),
      ...(record.parentId === null
        ? { parentId: null }
        : normalizeTailEntryString(record.parentId)
          ? { parentId: normalizeTailEntryString(record.parentId) }
          : {}),
      record,
    };
  } catch {
    return null;
  }
}

function tailRecordHasTreeLink(entry: TailTranscriptRecord): boolean {
  return (
    entry.record.type !== "session" &&
    typeof entry.id === "string" &&
    Object.hasOwn(entry.record, "parentId")
  );
}

function selectBoundedActiveTailRecords(entries: TailTranscriptRecord[]): TailTranscriptRecord[] {
  const byId = new Map<string, TailTranscriptRecord>();
  let leafId: string | undefined;
  for (const entry of entries) {
    if (entry.id) {
      byId.set(entry.id, entry);
    }
    if (tailRecordHasTreeLink(entry) && entry.id) {
      leafId = entry.id;
    }
  }
  if (!leafId) {
    return entries;
  }

  const selected: TailTranscriptRecord[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined = leafId;
  while (currentId) {
    if (seen.has(currentId)) {
      return [];
    }
    seen.add(currentId);
    const entry = byId.get(currentId);
    if (!entry) {
      break;
    }
    selected.push(entry);
    currentId = entry.parentId ?? undefined;
  }
  const activeBranch = selected.toReversed();
  const firstActiveRecord = activeBranch[0];
  const firstActiveIndex = firstActiveRecord ? entries.indexOf(firstActiveRecord) : -1;
  if (firstActiveIndex > 0) {
    for (let index = firstActiveIndex - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry?.record.type === "compaction") {
        return [entry, ...activeBranch];
      }
    }
  }
  return activeBranch;
}

function readTranscriptRecords(filePath: string): TailTranscriptRecord[] {
  const records: TailTranscriptRecord[] = [];
  visitTranscriptLines(filePath, (line) => {
    if (!line.trim()) {
      return;
    }
    const record = parseTailTranscriptRecord(line);
    if (record && record.record.type !== "session") {
      records.push(record);
    }
  });
  return records;
}

function readTranscriptRecordsRaw(filePath: string): TailTranscriptRecord[] {
  const records: TailTranscriptRecord[] = [];
  visitTranscriptLines(filePath, (line) => {
    if (!line.trim()) {
      return;
    }
    const record = parseTailTranscriptRecordRaw(line);
    if (record && record.record.type !== "session") {
      records.push(record);
    }
  });
  return records;
}

function selectActiveTranscriptRecords(records: TailTranscriptRecord[]): TailTranscriptRecord[] {
  return records.some(tailRecordHasTreeLink) ? selectBoundedActiveTailRecords(records) : records;
}

function readSelectedTranscriptRecords(filePath: string): TailTranscriptRecord[] {
  try {
    return selectActiveTranscriptRecords(readTranscriptRecords(filePath));
  } catch {
    return [];
  }
}

function readSelectedTranscriptRecordsRaw(filePath: string): TailTranscriptRecord[] {
  try {
    return selectActiveTranscriptRecords(readTranscriptRecordsRaw(filePath));
  } catch {
    return [];
  }
}

function transcriptRecordsToMessages(records: TailTranscriptRecord[]): unknown[] {
  const messages: unknown[] = [];
  let messageSeq = 0;
  for (const entry of records) {
    const message = parsedSessionEntryToMessage(entry.record, messageSeq + 1);
    if (message) {
      messageSeq += 1;
      messages.push(message);
    }
  }
  return messages;
}

function parseRecentTranscriptTailMessages(lines: string[], maxMessages: number): unknown[] {
  const entries = lines.flatMap((line) => {
    const entry = parseTailTranscriptRecord(line);
    return entry ? [entry] : [];
  });
  return transcriptRecordsToMessages(selectActiveTranscriptRecords(entries)).slice(-maxMessages);
}

function visitTranscriptLines(filePath: string, visit: (line: string) => void): void {
  const fd = fs.openSync(filePath, "r");
  try {
    const decoder = new StringDecoder("utf8");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let carry = "";
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead <= 0) {
        break;
      }
      const text = carry + decoder.write(buffer.subarray(0, bytesRead));
      const lines = text.split(/\r?\n/);
      carry = lines.pop() ?? "";
      for (const line of lines) {
        visit(line);
      }
    }
    const tail = carry + decoder.end();
    if (tail) {
      visit(tail);
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function visitTranscriptLinesAsync(
  filePath: string,
  visit: (line: string) => void,
): Promise<void> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const decoder = new StringDecoder("utf8");
    const buffer = Buffer.allocUnsafe(TRANSCRIPT_ASYNC_READ_CHUNK_BYTES);
    let carry = "";
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead <= 0) {
        break;
      }
      const text = carry + decoder.write(buffer.subarray(0, bytesRead));
      const lines = text.split(/\r?\n/);
      carry = lines.pop() ?? "";
      for (const line of lines) {
        visit(line);
      }
      await yieldTranscriptScan();
    }
    const tail = carry + decoder.end();
    if (tail) {
      visit(tail);
    }
  } finally {
    await handle.close();
  }
}

export function visitSessionMessages(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  visit: (message: unknown, seq: number) => void,
): number {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile);
  if (!filePath) {
    return 0;
  }

  const messages = transcriptRecordsToMessages(readSelectedTranscriptRecords(filePath));
  for (const [index, message] of messages.entries()) {
    visit(message, index + 1);
  }
  return messages.length;
}

export function readSessionMessageCount(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
): number {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile);
  if (!filePath) {
    return 0;
  }
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(filePath);
    const cached = getCachedTranscriptMessageCount(filePath, stat);
    if (typeof cached === "number") {
      return cached;
    }
  } catch {
    // Count from the transcript reader below when stat metadata is unavailable.
  }
  const count = visitSessionMessages(sessionId, storePath, sessionFile, () => undefined);
  if (stat) {
    setCachedTranscriptMessageCount(filePath, stat, count);
  }
  return count;
}

export async function readSessionMessagesAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  opts: ReadSessionMessagesAsyncOptions,
): Promise<unknown[]> {
  if (opts.mode === "recent") {
    const { mode: _modeValue, ...recentOpts } = opts;
    return await readRecentSessionMessagesAsync(sessionId, storePath, sessionFile, recentOpts);
  }
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile);
  if (!filePath) {
    return [];
  }
  const index = await readSessionTranscriptIndex(filePath);
  return index?.entries.flatMap((entry) => indexedTranscriptEntryToMessages(entry)) ?? [];
}

export async function readSessionMessageByIdAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  messageId: string,
): Promise<{ message?: unknown; seq?: number; oversized: boolean; found: boolean }> {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile);
  if (!filePath) {
    return { oversized: false, found: false };
  }
  const index = await readSessionTranscriptIndex(filePath);
  if (!index) {
    return { oversized: false, found: false };
  }
  const entry = index.entries.find((candidate) => candidate.id === messageId);
  if (!entry) {
    return { oversized: false, found: false };
  }
  if (entry.byteLength > MAX_TRANSCRIPT_PARSE_LINE_BYTES) {
    return { oversized: true, found: true, seq: entry.seq };
  }
  const message = indexedTranscriptEntryToMessage(entry);
  return { message, seq: entry.seq, oversized: false, found: true };
}

export async function visitSessionMessagesAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  visit: (message: unknown, seq: number) => void,
  opts: { mode: "full"; reason: string; cache?: "reuse" | "skip" },
): Promise<number> {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile);
  if (!filePath) {
    return 0;
  }
  const index = await readSessionTranscriptIndex(filePath, { cache: opts.cache });
  if (!index) {
    return 0;
  }
  for (const entry of index.entries) {
    const message = indexedTranscriptEntryToMessage(entry);
    if (message) {
      visit(message, entry.seq);
    }
  }
  return index.entries.length;
}

export async function readSessionMessageCountAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
): Promise<number> {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile);
  if (!filePath) {
    return 0;
  }
  let stat: fs.Stats | null = null;
  try {
    stat = await fs.promises.stat(filePath);
    const cached = getCachedTranscriptMessageCount(filePath, stat);
    if (typeof cached === "number") {
      return cached;
    }
  } catch {
    // Count from the transcript reader below when stat metadata is unavailable.
  }
  const index = await readSessionTranscriptIndex(filePath);
  const count = index?.entries.length ?? 0;
  if (stat) {
    setCachedTranscriptMessageCount(filePath, stat, count);
  }
  return count;
}

export function readRecentSessionMessagesWithStats(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  opts: ReadRecentSessionMessagesOptions,
): ReadRecentSessionMessagesResult {
  const totalMessages = readSessionMessageCount(sessionId, storePath, sessionFile);
  const messages = readRecentSessionMessages(sessionId, storePath, sessionFile, opts);
  const firstSeq = Math.max(1, totalMessages - messages.length + 1);
  const messagesWithSeq = messages.map((message, index) =>
    attachOpenClawTranscriptMeta(message, { seq: firstSeq + index }),
  );
  return { messages: messagesWithSeq, totalMessages };
}

export async function readRecentSessionMessagesAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  opts?: ReadRecentSessionMessagesOptions,
): Promise<unknown[]> {
  const normalized = normalizeRecentSessionReadOptions(opts);
  const { maxMessages } = normalized;
  if (maxMessages === 0) {
    return [];
  }

  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile);
  if (!filePath) {
    return [];
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return [];
  }
  if (stat.size === 0) {
    return [];
  }
  const lines = await readRecentTranscriptTailLinesAsync(filePath, stat, {
    ...normalized,
  });
  return parseRecentTranscriptTailMessages(lines, maxMessages);
}

export async function readRecentSessionMessagesWithStatsAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  opts: ReadRecentSessionMessagesOptions,
): Promise<ReadRecentSessionMessagesResult> {
  const totalMessages = await readSessionMessageCountAsync(sessionId, storePath, sessionFile);
  const messages = await readRecentSessionMessagesAsync(sessionId, storePath, sessionFile, opts);
  const firstSeq = Math.max(1, totalMessages - messages.length + 1);
  const messagesWithSeq = messages.map((message, index) =>
    attachOpenClawTranscriptMeta(message, { seq: firstSeq + index }),
  );
  return { messages: messagesWithSeq, totalMessages };
}

export function readRecentSessionTranscriptLines(params: {
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  agentId?: string;
  maxLines: number;
}): { lines: string[]; totalLines: number } | null {
  const filePath = findExistingTranscriptPath(
    params.sessionId,
    params.storePath,
    params.sessionFile,
    params.agentId,
  );
  if (!filePath) {
    return null;
  }
  const maxLines = Math.max(1, Math.floor(params.maxLines));
  const lines: string[] = [];
  let totalLines = 0;
  try {
    visitTranscriptLines(filePath, (line) => {
      if (!line.trim()) {
        return;
      }
      totalLines += 1;
      lines.push(line);
      if (lines.length > maxLines) {
        lines.shift();
      }
    });
  } catch {
    return null;
  }
  return { lines, totalLines };
}

function parsedSessionEntryToMessage(parsed: unknown, seq: number): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const entry = parsed as Record<string, unknown>;
  if (entry.message) {
    const recordTimestampMs =
      typeof entry.timestamp === "string"
        ? Date.parse(entry.timestamp)
        : typeof entry.timestamp === "number"
          ? entry.timestamp
          : Number.NaN;
    return attachOpenClawTranscriptMeta(entry.message, {
      ...(typeof entry.id === "string" ? { id: entry.id } : {}),
      ...(Number.isFinite(recordTimestampMs) ? { recordTimestampMs } : {}),
      seq,
    });
  }

  // Compaction entries are not "message" records, but they're useful context for debugging.
  // Emit a lightweight synthetic message that the Web UI can render as a divider.
  if (entry.type === "compaction") {
    const ts = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN;
    const timestamp = Number.isFinite(ts) ? ts : Date.now();
    return {
      role: "system",
      content: [{ type: "text", text: "Compaction" }],
      timestamp,
      __openclaw: {
        kind: "compaction",
        id: typeof entry.id === "string" ? entry.id : undefined,
        seq,
      },
    };
  }
  return null;
}

function indexedTranscriptEntryToMessage(entry: IndexedTranscriptEntry): unknown {
  return parsedSessionEntryToMessage(entry.record, entry.seq);
}

function indexedTranscriptEntryToMessages(entry: IndexedTranscriptEntry): unknown[] {
  const message = indexedTranscriptEntryToMessage(entry);
  return message ? [message] : [];
}

export {
  archiveFileOnDisk,
  archiveSessionTranscripts,
  cleanupArchivedSessionTranscripts,
  resolveSessionTranscriptCandidates,
} from "./session-transcript-files.fs.js";

export function capArrayByJsonBytes<T>(
  items: T[],
  maxBytes: number,
): { items: T[]; bytes: number } {
  if (items.length === 0) {
    return { items, bytes: 2 };
  }
  const parts = items.map((item) => jsonUtf8Bytes(item));
  let bytes = 2 + parts.reduce((a, b) => a + b, 0) + (items.length - 1);
  let start = 0;
  while (bytes > maxBytes && start < items.length - 1) {
    bytes -= parts[start] + 1;
    start += 1;
  }
  const next = start > 0 ? items.slice(start) : items;
  return { items: next, bytes };
}

const MAX_LINES_TO_SCAN = 10;

type TranscriptMessage = {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
  provenance?: unknown;
};

export function readSessionTitleFieldsFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
  opts?: { includeInterSession?: boolean },
): SessionTitleFields {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile, agentId);
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return { firstUserMessage: null, lastMessagePreview: null };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { firstUserMessage: null, lastMessagePreview: null };
  }

  const cacheKey = readSessionTitleFieldsCacheKey(filePath, opts);
  const cached = getCachedSessionTitleFields(cacheKey, stat);
  if (cached) {
    return cached;
  }

  if (stat.size === 0) {
    const empty = { firstUserMessage: null, lastMessagePreview: null };
    setCachedSessionTitleFields(cacheKey, stat, empty);
    return empty;
  }

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const size = stat.size;

    // Head (first user message)
    let firstUserMessage: string | null = null;
    try {
      const chunk = readTranscriptHeadChunk(fd);
      if (chunk) {
        firstUserMessage = extractFirstUserMessageFromTranscriptChunk(chunk, opts);
      }
    } catch {
      // ignore head read errors
    }

    // Tail (last message preview)
    let lastMessagePreview: string | null = null;
    try {
      lastMessagePreview = readLastMessagePreviewFromOpenTranscript({ fd, size });
    } catch {
      // ignore tail read errors
    }

    const result = { firstUserMessage, lastMessagePreview };
    setCachedSessionTitleFields(cacheKey, stat, result);
    return result;
  } catch {
    return { firstUserMessage: null, lastMessagePreview: null };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function readSessionTitleFieldsFromTranscriptAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
  opts?: { includeInterSession?: boolean },
): Promise<SessionTitleFields> {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile, agentId);
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return { firstUserMessage: null, lastMessagePreview: null };
  }
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return { firstUserMessage: null, lastMessagePreview: null };
  }
  const cacheKey = readSessionTitleFieldsCacheKey(filePath, opts);
  const cached = getCachedSessionTitleFields(cacheKey, stat);
  if (cached) {
    return cached;
  }

  if (stat.size === 0) {
    const empty = { firstUserMessage: null, lastMessagePreview: null };
    setCachedSessionTitleFields(cacheKey, stat, empty);
    return empty;
  }

  let handle: TranscriptFileHandle | null = null;
  try {
    handle = await fs.promises.open(filePath, "r");

    let firstUserMessage: string | null = null;
    try {
      const chunk = await readTranscriptHeadChunkAsync(handle);
      if (chunk) {
        firstUserMessage = extractFirstUserMessageFromTranscriptChunk(chunk, opts);
      }
    } catch {
      // ignore head read errors
    }

    let lastMessagePreview: string | null = null;
    try {
      lastMessagePreview = await readLastMessagePreviewFromOpenTranscriptAsync({
        handle,
        size: stat.size,
      });
    } catch {
      // ignore tail read errors
    }

    const result = { firstUserMessage, lastMessagePreview };
    setCachedSessionTitleFields(cacheKey, stat, result);
    return result;
  } catch {
    return { firstUserMessage: null, lastMessagePreview: null };
  } finally {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
  }
}

function extractTextFromContent(content: TranscriptMessage["content"]): string | null {
  if (typeof content === "string") {
    const normalized = stripInlineDirectiveTagsForDisplay(content).text.trim();
    return normalized || null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  for (const part of content) {
    if (!part || typeof part.text !== "string") {
      continue;
    }
    if (part.type === "text" || part.type === "output_text" || part.type === "input_text") {
      const normalized = stripInlineDirectiveTagsForDisplay(part.text).text.trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return null;
}

function readTranscriptHeadChunk(fd: number, maxBytes = 8192): string | null {
  const buf = Buffer.alloc(maxBytes);
  const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
  if (bytesRead <= 0) {
    return null;
  }
  return buf.toString("utf-8", 0, bytesRead);
}

async function readTranscriptHeadChunkAsync(
  handle: TranscriptFileHandle,
  maxBytes = 8192,
): Promise<string | null> {
  const buffer = Buffer.alloc(maxBytes);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
  if (bytesRead <= 0) {
    return null;
  }
  return buffer.toString("utf-8", 0, bytesRead);
}

function extractFirstUserMessageFromTranscriptChunk(
  chunk: string,
  opts?: { includeInterSession?: boolean },
): string | null {
  const lines = chunk.split(/\r?\n/).slice(0, MAX_LINES_TO_SCAN);
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      const msg = parsed?.message as TranscriptMessage | undefined;
      if (msg?.role !== "user") {
        continue;
      }
      if (opts?.includeInterSession !== true && hasInterSessionUserProvenance(msg)) {
        continue;
      }
      const text = extractTextFromContent(msg.content);
      if (text) {
        return text;
      }
    } catch {
      // skip malformed lines
    }
  }
  return null;
}

function findExistingTranscriptPath(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
): string | null {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile, agentId);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function withOpenTranscriptFd<T>(filePath: string, read: (fd: number) => T | null): T | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    return read(fd);
  } catch {
    // file read error
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
  return null;
}

export function readFirstUserMessageFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
  opts?: { includeInterSession?: boolean },
): string | null {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile, agentId);
  if (!filePath) {
    return null;
  }

  return withOpenTranscriptFd(filePath, (fd) => {
    const chunk = readTranscriptHeadChunk(fd);
    if (!chunk) {
      return null;
    }
    return extractFirstUserMessageFromTranscriptChunk(chunk, opts);
  });
}

const LAST_MSG_MAX_BYTES = 16384;
const LAST_MSG_MAX_LINES = 20;

function readLastMessagePreviewFromOpenTranscript(params: {
  fd: number;
  size: number;
}): string | null {
  const readStart = Math.max(0, params.size - LAST_MSG_MAX_BYTES);
  const readLen = Math.min(params.size, LAST_MSG_MAX_BYTES);
  const buf = Buffer.alloc(readLen);
  fs.readSync(params.fd, buf, 0, readLen, readStart);

  const chunk = buf.toString("utf-8");
  const lines = chunk.split(/\r?\n/).filter((l) => l.trim());
  const tailLines = lines.slice(-LAST_MSG_MAX_LINES);

  for (let i = tailLines.length - 1; i >= 0; i--) {
    const line = tailLines[i];
    try {
      const parsed = JSON.parse(line);
      const msg = parsed?.message as TranscriptMessage | undefined;
      if (msg?.role !== "user" && msg?.role !== "assistant") {
        continue;
      }
      const text = extractTextFromContent(msg.content);
      if (text) {
        return text;
      }
    } catch {
      // skip malformed
    }
  }
  return null;
}

async function readLastMessagePreviewFromOpenTranscriptAsync(params: {
  handle: TranscriptFileHandle;
  size: number;
}): Promise<string | null> {
  const readStart = Math.max(0, params.size - LAST_MSG_MAX_BYTES);
  const readLen = Math.min(params.size, LAST_MSG_MAX_BYTES);
  const buffer = Buffer.alloc(readLen);
  const { bytesRead } = await params.handle.read(buffer, 0, readLen, readStart);
  if (bytesRead <= 0) {
    return null;
  }

  const chunk = buffer.toString("utf-8", 0, bytesRead);
  const lines = chunk.split(/\r?\n/).filter((line) => line.trim());
  const tailLines = lines.slice(-LAST_MSG_MAX_LINES);

  for (let i = tailLines.length - 1; i >= 0; i--) {
    const line = tailLines[i];
    try {
      const parsed = JSON.parse(line);
      const msg = parsed?.message as TranscriptMessage | undefined;
      if (msg?.role !== "user" && msg?.role !== "assistant") {
        continue;
      }
      const text = extractTextFromContent(msg.content);
      if (text) {
        return text;
      }
    } catch {
      // skip malformed
    }
  }
  return null;
}

type SessionTranscriptUsageSnapshot = {
  modelProvider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  costUsd?: number;
};

function extractTranscriptUsageCost(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const cost = (raw as { cost?: unknown }).cost;
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) {
    return undefined;
  }
  const total = (cost as { total?: unknown }).total;
  return typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : undefined;
}

function resolvePositiveUsageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function extractTranscriptContentEstimatedChars(content: unknown): number {
  if (typeof content === "string") {
    const normalized = stripInlineDirectiveTagsForDisplay(content).text.trim();
    return normalized ? estimateStringChars(normalized) : 0;
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  let chars = 0;
  for (const part of content) {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (typeof record.text !== "string") {
      continue;
    }
    const type = typeof record.type === "string" ? record.type : "text";
    if (type !== "text" && type !== "output_text" && type !== "input_text") {
      continue;
    }
    const normalized = stripInlineDirectiveTagsForDisplay(record.text).text.trim();
    if (normalized) {
      chars += estimateStringChars(normalized);
    }
  }
  return chars;
}

function extractTranscriptTokenEstimateFromLine(line: string): {
  estimatedChars: number;
  hasModelIdentity: boolean;
} | null {
  if (isOversizedTranscriptLine(line)) {
    return null;
  }
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const message =
      parsed.message && typeof parsed.message === "object" && !Array.isArray(parsed.message)
        ? (parsed.message as Record<string, unknown>)
        : undefined;
    if (!message) {
      return null;
    }
    const role = typeof message.role === "string" ? message.role : undefined;
    if (role !== "user" && role !== "assistant") {
      return null;
    }
    const modelProvider =
      typeof message.provider === "string"
        ? message.provider.trim()
        : typeof parsed.provider === "string"
          ? parsed.provider.trim()
          : undefined;
    const model =
      typeof message.model === "string"
        ? message.model.trim()
        : typeof parsed.model === "string"
          ? parsed.model.trim()
          : undefined;
    const isDeliveryMirror =
      role === "assistant" && modelProvider === "openclaw" && model === "delivery-mirror";
    if (isDeliveryMirror) {
      return null;
    }
    const contentChars = extractTranscriptContentEstimatedChars(message.content);
    if (contentChars <= 0) {
      return null;
    }
    return {
      estimatedChars: contentChars,
      hasModelIdentity: role === "assistant" && Boolean(modelProvider || model),
    };
  } catch {
    return null;
  }
}

function extractUsageSnapshotFromTranscriptLine(
  line: string,
): SessionTranscriptUsageSnapshot | null {
  if (isOversizedTranscriptLine(line)) {
    return null;
  }
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const message =
      parsed.message && typeof parsed.message === "object" && !Array.isArray(parsed.message)
        ? (parsed.message as Record<string, unknown>)
        : undefined;
    if (!message) {
      return null;
    }
    const role = typeof message.role === "string" ? message.role : undefined;
    if (role && role !== "assistant") {
      return null;
    }
    const usageRaw =
      message.usage && typeof message.usage === "object" && !Array.isArray(message.usage)
        ? message.usage
        : parsed.usage && typeof parsed.usage === "object" && !Array.isArray(parsed.usage)
          ? parsed.usage
          : undefined;
    const usage = normalizeUsage(usageRaw);
    const totalTokens = resolvePositiveUsageNumber(deriveSessionTotalTokens({ usage }));
    const costUsd = extractTranscriptUsageCost(usageRaw);
    const modelProvider =
      typeof message.provider === "string"
        ? message.provider.trim()
        : typeof parsed.provider === "string"
          ? parsed.provider.trim()
          : undefined;
    const model =
      typeof message.model === "string"
        ? message.model.trim()
        : typeof parsed.model === "string"
          ? parsed.model.trim()
          : undefined;
    const isDeliveryMirror = modelProvider === "openclaw" && model === "delivery-mirror";
    const hasMeaningfulUsage =
      hasNonzeroUsage(usage) ||
      typeof totalTokens === "number" ||
      (typeof costUsd === "number" && Number.isFinite(costUsd));
    const hasModelIdentity = Boolean(modelProvider || model);
    if (!hasMeaningfulUsage && !hasModelIdentity) {
      return null;
    }
    if (isDeliveryMirror && !hasMeaningfulUsage) {
      return null;
    }

    const snapshot: SessionTranscriptUsageSnapshot = {};
    if (!isDeliveryMirror) {
      if (modelProvider) {
        snapshot.modelProvider = modelProvider;
      }
      if (model) {
        snapshot.model = model;
      }
    }
    if (typeof usage?.input === "number" && Number.isFinite(usage.input)) {
      snapshot.inputTokens = usage.input;
    }
    if (typeof usage?.output === "number" && Number.isFinite(usage.output)) {
      snapshot.outputTokens = usage.output;
    }
    if (typeof usage?.cacheRead === "number" && Number.isFinite(usage.cacheRead)) {
      snapshot.cacheRead = usage.cacheRead;
    }
    if (typeof usage?.cacheWrite === "number" && Number.isFinite(usage.cacheWrite)) {
      snapshot.cacheWrite = usage.cacheWrite;
    }
    if (typeof totalTokens === "number") {
      snapshot.totalTokens = totalTokens;
      snapshot.totalTokensFresh = true;
    }
    if (typeof costUsd === "number" && Number.isFinite(costUsd)) {
      snapshot.costUsd = costUsd;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function extractAggregateUsageFromTranscriptLines(
  lines: Iterable<string>,
): SessionTranscriptUsageSnapshot | null {
  const snapshot: SessionTranscriptUsageSnapshot = {};
  let sawSnapshot = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let sawInputTokens = false;
  let sawOutputTokens = false;
  let sawCacheRead = false;
  let sawCacheWrite = false;
  let costUsdTotal = 0;
  let sawCost = false;
  let estimatedTranscriptChars = 0;
  let sawEstimatedTranscriptContent = false;
  let sawEstimateModelIdentity = false;

  for (const line of lines) {
    const estimate = extractTranscriptTokenEstimateFromLine(line);
    if (estimate) {
      estimatedTranscriptChars += estimate.estimatedChars;
      sawEstimatedTranscriptContent = true;
      sawEstimateModelIdentity ||= estimate.hasModelIdentity;
    }
    const current = extractUsageSnapshotFromTranscriptLine(line);
    if (!current) {
      continue;
    }
    sawSnapshot = true;
    if (current.modelProvider) {
      snapshot.modelProvider = current.modelProvider;
    }
    if (current.model) {
      snapshot.model = current.model;
    }
    if (typeof current.inputTokens === "number") {
      inputTokens += current.inputTokens;
      sawInputTokens = true;
    }
    if (typeof current.outputTokens === "number") {
      outputTokens += current.outputTokens;
      sawOutputTokens = true;
    }
    if (typeof current.cacheRead === "number") {
      cacheRead += current.cacheRead;
      sawCacheRead = true;
    }
    if (typeof current.cacheWrite === "number") {
      cacheWrite += current.cacheWrite;
      sawCacheWrite = true;
    }
    if (typeof current.totalTokens === "number") {
      snapshot.totalTokens = current.totalTokens;
      snapshot.totalTokensFresh = true;
    }
    if (typeof current.costUsd === "number" && Number.isFinite(current.costUsd)) {
      costUsdTotal += current.costUsd;
      sawCost = true;
    }
  }

  if (!sawSnapshot) {
    return null;
  }
  if (sawInputTokens) {
    snapshot.inputTokens = inputTokens;
  }
  if (sawOutputTokens) {
    snapshot.outputTokens = outputTokens;
  }
  if (sawCacheRead) {
    snapshot.cacheRead = cacheRead;
  }
  if (sawCacheWrite) {
    snapshot.cacheWrite = cacheWrite;
  }
  if (sawCost) {
    snapshot.costUsd = costUsdTotal;
  }
  if (
    typeof snapshot.totalTokens !== "number" &&
    sawEstimatedTranscriptContent &&
    sawEstimateModelIdentity
  ) {
    const estimatedTotalTokens = estimateTokensFromChars(estimatedTranscriptChars);
    if (estimatedTotalTokens > 0) {
      snapshot.totalTokens = estimatedTotalTokens;
      snapshot.totalTokensFresh = true;
    }
  }
  return snapshot;
}

function extractLatestUsageFromTranscriptLines(
  lines: Iterable<string>,
): SessionTranscriptUsageSnapshot | null {
  let latest: SessionTranscriptUsageSnapshot | null = null;
  for (const line of lines) {
    latest = extractUsageSnapshotFromTranscriptLine(line) ?? latest;
  }
  return latest;
}

function extractAggregateUsageFromTranscriptChunk(
  chunk: string,
): SessionTranscriptUsageSnapshot | null {
  return extractAggregateUsageFromTranscriptLines(
    chunk.split(/\r?\n/).filter((line) => line.trim().length > 0),
  );
}

export function readLatestSessionUsageFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
): SessionTranscriptUsageSnapshot | null {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile, agentId);
  if (!filePath) {
    return null;
  }

  return withOpenTranscriptFd(filePath, (fd) => {
    const stat = fs.fstatSync(fd);
    if (stat.size === 0) {
      return null;
    }
    const chunk = fs.readFileSync(fd, "utf-8");
    return extractAggregateUsageFromTranscriptChunk(chunk);
  });
}

export async function readLatestSessionUsageFromTranscriptAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
): Promise<SessionTranscriptUsageSnapshot | null> {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile, agentId);
  if (!filePath) {
    return null;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size === 0) {
      return null;
    }
    const lines: string[] = [];
    await visitTranscriptLinesAsync(filePath, (line) => {
      if (line.trim()) {
        lines.push(line);
      }
    });
    return extractAggregateUsageFromTranscriptLines(lines);
  } catch {
    return null;
  }
}

export async function readRecentSessionUsageFromTranscriptAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
  maxBytes: number,
): Promise<SessionTranscriptUsageSnapshot | null> {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile, agentId);
  if (!filePath) {
    return null;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size === 0) {
      return null;
    }
    const lines = await readRecentTranscriptTailLinesAsync(filePath, stat, {
      maxMessages: 1,
      maxLines: 1000,
      maxBytes,
    });
    return extractAggregateUsageFromTranscriptLines(lines);
  } catch {
    return null;
  }
}

export async function readLatestRecentSessionUsageFromTranscriptAsync(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
  maxBytes: number,
): Promise<SessionTranscriptUsageSnapshot | null> {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile, agentId);
  if (!filePath) {
    return null;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size === 0) {
      return null;
    }
    const lines = await readRecentTranscriptTailLinesAsync(filePath, stat, {
      maxMessages: 1,
      maxLines: 1000,
      maxBytes,
    });
    return extractLatestUsageFromTranscriptLines(lines);
  } catch {
    return null;
  }
}

export function readRecentSessionUsageFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
  maxBytes: number,
): SessionTranscriptUsageSnapshot | null {
  const filePath = findExistingTranscriptPath(sessionId, storePath, sessionFile, agentId);
  if (!filePath) {
    return null;
  }

  return withOpenTranscriptFd(filePath, (fd) => {
    const stat = fs.fstatSync(fd);
    if (stat.size === 0) {
      return null;
    }
    const readLen = Math.min(stat.size, Math.max(1024, Math.floor(maxBytes)));
    const readStart = Math.max(0, stat.size - readLen);
    const buf = Buffer.alloc(readLen);
    const bytesRead = fs.readSync(fd, buf, 0, readLen, readStart);
    if (bytesRead <= 0) {
      return null;
    }
    const chunk = buf
      .toString("utf-8", 0, bytesRead)
      .split(/\r?\n/)
      .slice(readStart > 0 ? 1 : 0)
      .join("\n");
    return extractAggregateUsageFromTranscriptChunk(chunk);
  });
}

const PREVIEW_READ_SIZES = [64 * 1024, 256 * 1024, 1024 * 1024];
const PREVIEW_MAX_LINES = 200;
const TRAJECTORY_PROGRESS_READ_BYTES = 256 * 1024;
const CODEX_EXECUTION_EVIDENCE_READ_BYTES = 1024 * 1024;
const CODEX_LAUNCH_EVIDENCE_READ_BYTES = 256 * 1024;
const ACTIVE_PROGRESS_TEXT_LIMIT = 160;

type TranscriptContentEntry = {
  type?: string;
  text?: string;
  name?: string;
};

type TranscriptPreviewMessage = {
  role?: string;
  content?: string | TranscriptContentEntry[];
  text?: string;
  toolName?: string;
  tool_name?: string;
};

function normalizeRole(role: string | undefined, isTool: boolean): SessionPreviewItem["role"] {
  if (isTool) {
    return "tool";
  }
  switch (normalizeLowercaseStringOrEmpty(role)) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "system":
      return "system";
    case "tool":
      return "tool";
    default:
      return "other";
  }
}

function truncatePreviewText(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 3) {
    return text.slice(0, maxChars);
  }
  return `${text.slice(0, maxChars - 3)}...`;
}

function extractPreviewText(message: TranscriptPreviewMessage): string | null {
  const role = normalizeLowercaseStringOrEmpty(message.role);
  if (role === "assistant") {
    const assistantText = extractAssistantVisibleText(message);
    if (assistantText) {
      const normalized = stripInlineDirectiveTagsForDisplay(assistantText).text.trim();
      return normalized ? normalized : null;
    }
    return null;
  }
  if (typeof message.content === "string") {
    const normalized = stripInlineDirectiveTagsForDisplay(message.content).text.trim();
    return normalized ? normalized : null;
  }
  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((entry) =>
        typeof entry?.text === "string" ? stripInlineDirectiveTagsForDisplay(entry.text).text : "",
      )
      .filter((text) => text.trim().length > 0);
    if (parts.length > 0) {
      return parts.join("\n").trim();
    }
  }
  if (typeof message.text === "string") {
    const normalized = stripInlineDirectiveTagsForDisplay(message.text).text.trim();
    return normalized ? normalized : null;
  }
  return null;
}

function isToolCall(message: TranscriptPreviewMessage): boolean {
  return hasToolCall(message as Record<string, unknown>);
}

function extractToolNames(message: TranscriptPreviewMessage): string[] {
  return extractToolCallNames(message as Record<string, unknown>);
}

function extractMediaSummary(message: TranscriptPreviewMessage): string | null {
  if (!Array.isArray(message.content)) {
    return null;
  }
  for (const entry of message.content) {
    const raw = normalizeLowercaseStringOrEmpty(entry?.type);
    if (!raw || raw === "text" || raw === "toolcall" || raw === "tool_call") {
      continue;
    }
    return `[${raw}]`;
  }
  return null;
}

function buildPreviewItems(
  messages: TranscriptPreviewMessage[],
  maxItems: number,
  maxChars: number,
): SessionPreviewItem[] {
  const items: SessionPreviewItem[] = [];
  for (const message of messages) {
    const toolCall = isToolCall(message);
    const role = normalizeRole(message.role, toolCall);
    let text = extractPreviewText(message);
    if (!text) {
      const toolNames = extractToolNames(message);
      if (toolNames.length > 0) {
        const shown = toolNames.slice(0, 2);
        const overflow = toolNames.length - shown.length;
        text = `call ${shown.join(", ")}`;
        if (overflow > 0) {
          text += ` +${overflow}`;
        }
      }
    }
    if (!text) {
      text = extractMediaSummary(message);
    }
    if (!text) {
      continue;
    }
    let trimmed = text.trim();
    if (!trimmed) {
      continue;
    }
    if (role === "user") {
      trimmed = stripEnvelope(trimmed);
    }
    trimmed = truncatePreviewText(trimmed, maxChars);
    items.push({ role, text: trimmed });
  }

  if (items.length <= maxItems) {
    return items;
  }
  return items.slice(-maxItems);
}

function readRecentMessagesFromTranscript(
  filePath: string,
  maxMessages: number,
  readBytes: number,
): TranscriptPreviewMessage[] {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    if (size === 0) {
      return [];
    }

    const readStart = Math.max(0, size - readBytes);
    const readLen = Math.min(size, readBytes);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);

    const chunk = buf.toString("utf-8");
    const lines = chunk.split(/\r?\n/).filter((l) => l.trim());
    const tailLines = lines.slice(-PREVIEW_MAX_LINES);

    const collected: TranscriptPreviewMessage[] = [];
    for (let i = tailLines.length - 1; i >= 0; i--) {
      const line = tailLines[i];
      try {
        const parsed = JSON.parse(line);
        const msg = parsed?.message as TranscriptPreviewMessage | undefined;
        if (msg && typeof msg === "object") {
          collected.push(msg);
          if (collected.length >= maxMessages) {
            break;
          }
        }
      } catch {
        // skip malformed lines
      }
    }
    return collected.toReversed();
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

export function readSessionPreviewItemsFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
  maxItems: number,
  maxChars: number,
): SessionPreviewItem[] {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile, agentId);
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return [];
  }

  const boundedItems = Math.max(1, Math.min(maxItems, 50));
  const boundedChars = Math.max(20, Math.min(maxChars, 2000));

  for (const readSize of PREVIEW_READ_SIZES) {
    const messages = readRecentMessagesFromTranscript(filePath, boundedItems, readSize);
    if (messages.length > 0 || readSize === PREVIEW_READ_SIZES[PREVIEW_READ_SIZES.length - 1]) {
      return buildPreviewItems(messages, boundedItems, boundedChars);
    }
  }

  return [];
}

export function readLastAssistantTextFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
  maxChars?: number,
): string | null {
  return readLastAssistantTextFromTranscriptWithProvenance(
    sessionId,
    storePath,
    sessionFile,
    agentId,
    maxChars,
  ).text;
}

export type LastAssistantTextTranscriptRead = {
  text: string | null;
  answersLatestUser: boolean;
  provenance: ReadbackFieldProvenance;
};

function finalAssistantTextProvenance(
  sessionId: string,
  note: string,
  bounded: boolean,
): ReadbackFieldProvenance {
  return {
    source: "session-transcript",
    ref: `session:${sessionId}`,
    derivedBy: "readLastAssistantTextFromTranscript",
    bounded,
    note,
  };
}

export function readLastAssistantTextFromTranscriptWithProvenance(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
  maxChars?: number,
): LastAssistantTextTranscriptRead {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile, agentId);
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return {
      text: null,
      answersLatestUser: false,
      provenance: finalAssistantTextProvenance(sessionId, "no transcript candidate found", false),
    };
  }

  const messages = transcriptRecordsToMessages(readSelectedTranscriptRecordsRaw(filePath));
  let sawNewerUserTurn = false;
  let skippedSuppressedControlReplies = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as TranscriptPreviewMessage | undefined;
    if (!message) {
      continue;
    }
    const role = normalizeLowercaseStringOrEmpty(message?.role);
    if (role === "user") {
      sawNewerUserTurn = true;
      continue;
    }
    if (role !== "assistant") {
      continue;
    }
    const text = extractPreviewText(message);
    if (!text) {
      continue;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      continue;
    }
    if (isSuppressedControlReplyText(trimmed)) {
      skippedSuppressedControlReplies += 1;
      continue;
    }
    const suppressedReplyNote =
      skippedSuppressedControlReplies > 0
        ? `; skipped ${skippedSuppressedControlReplies} newer suppressed control repl${
            skippedSuppressedControlReplies === 1 ? "y" : "ies"
          }`
        : "";
    if (typeof maxChars === "number" && Number.isFinite(maxChars) && maxChars > 0) {
      const boundedChars = Math.max(20, Math.floor(maxChars));
      const bounded = trimmed.length > boundedChars;
      return {
        text: bounded ? truncatePreviewText(trimmed, boundedChars) : trimmed,
        answersLatestUser: !sawNewerUserTurn,
        provenance: finalAssistantTextProvenance(
          sessionId,
          `${
            bounded
              ? `derived from full transcript scan then bounded by caller maxChars=${boundedChars}`
              : "derived from full transcript scan; caller maxChars did not truncate"
          }${suppressedReplyNote}${sawNewerUserTurn ? "; predates latest user turn" : ""}`,
          bounded,
        ),
      };
    }
    return {
      text: trimmed,
      answersLatestUser: !sawNewerUserTurn,
      provenance: finalAssistantTextProvenance(
        sessionId,
        `derived from full transcript scan; unbounded final assistant text${suppressedReplyNote}${
          sawNewerUserTurn ? "; predates latest user turn" : ""
        }`,
        false,
      ),
    };
  }

  return {
    text: null,
    answersLatestUser: false,
    provenance: finalAssistantTextProvenance(
      sessionId,
      messages.length > 0
        ? `no visible assistant text in selected transcript records${
            skippedSuppressedControlReplies > 0
              ? `; skipped ${skippedSuppressedControlReplies} suppressed control repl${
                  skippedSuppressedControlReplies === 1 ? "y" : "ies"
                }`
              : ""
          }`
        : "no selected transcript records found",
      false,
    ),
  };
}

function resolveSessionTrajectoryRuntimeFileSync(params: {
  sessionId: string;
  storePath: string | undefined;
  sessionFile: string | undefined;
  agentId: string | undefined;
}): string | undefined {
  const transcriptCandidates = resolveSessionTranscriptCandidates(
    params.sessionId,
    params.storePath,
    params.sessionFile,
    params.agentId,
  );
  const trajectoryCandidates: string[] = [];
  for (const sessionFile of transcriptCandidates) {
    const runtimeFile = resolveTrajectoryRuntimeFileSync({
      sessionFile,
      sessionId: params.sessionId,
    });
    if (runtimeFile) {
      trajectoryCandidates.push(runtimeFile);
    }
  }
  return trajectoryCandidates[0];
}

function readRecentTrajectoryLines(filePath: string, maxBytes: number): string[] {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    if (stat.size === 0) {
      return [];
    }
    const readLen = Math.min(stat.size, Math.max(1024, Math.floor(maxBytes)));
    const readStart = Math.max(0, stat.size - readLen);
    const buf = Buffer.alloc(readLen);
    const bytesRead = fs.readSync(fd, buf, 0, readLen, readStart);
    if (bytesRead <= 0) {
      return [];
    }
    return buf
      .toString("utf-8", 0, bytesRead)
      .split(/\r?\n/)
      .slice(readStart > 0 ? 1 : 0)
      .filter((line) => line.trim().length > 0);
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

function readInitialTrajectoryLines(filePath: string, maxBytes: number): string[] {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    if (stat.size === 0) {
      return [];
    }
    const readLen = Math.min(stat.size, Math.max(1024, Math.floor(maxBytes)));
    const buf = Buffer.alloc(readLen);
    const bytesRead = fs.readSync(fd, buf, 0, readLen, 0);
    if (bytesRead <= 0) {
      return [];
    }
    return buf
      .toString("utf-8", 0, bytesRead)
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

function boundedProgressText(
  value: unknown,
  limit = ACTIVE_PROGRESS_TEXT_LIMIT,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteInteger(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined ? Math.trunc(number) : undefined;
}

function finiteNonNegativeInteger(value: unknown): number | undefined {
  const number = finiteInteger(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function activeProgressRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function activeProgressResultRecord(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return activeProgressRecord(data?.result);
}

function activeProgressToolName(data: Record<string, unknown> | undefined): string | undefined {
  return (
    boundedProgressText(data?.toolName, 96) ??
    boundedProgressText(data?.name, 96) ??
    boundedProgressText(data?.tool, 96)
  );
}

function activeProgressCommand(data: Record<string, unknown> | undefined): string | undefined {
  const direct =
    boundedProgressText(data?.command, 240) ??
    boundedProgressText(data?.cmd, 240) ??
    boundedProgressText(data?.shellCommand, 240) ??
    boundedProgressText(activeProgressRecord(data?.arguments)?.command, 240) ??
    boundedProgressText(activeProgressRecord(data?.arguments)?.cmd, 240) ??
    boundedProgressText(activeProgressRecord(data?.args)?.command, 240) ??
    boundedProgressText(activeProgressRecord(data?.args)?.cmd, 240);
  if (direct) {
    return direct;
  }
  const argv = data?.argv ?? data?.args;
  if (Array.isArray(argv) && argv.length > 0 && argv.every((entry) => typeof entry === "string")) {
    return boundedProgressText(argv.join(" "), 240);
  }
  return undefined;
}

function activeProgressExitCode(data: Record<string, unknown> | undefined): number | undefined {
  const result = activeProgressResultRecord(data);
  return (
    finiteInteger(data?.exitCode) ??
    finiteInteger(data?.code) ??
    finiteInteger(result?.exitCode) ??
    finiteInteger(result?.code)
  );
}

function activeProgressValidationClass(
  data: Record<string, unknown> | undefined,
): string | undefined {
  const explicit =
    boundedProgressText(data?.validationClass, 80) ??
    boundedProgressText(data?.checkClass, 80) ??
    boundedProgressText(data?.proofClass, 80);
  if (explicit) {
    return explicit;
  }
  const command = activeProgressCommand(data)?.toLowerCase();
  if (!command) {
    return undefined;
  }
  if (
    /\b(validate|validation|check|smoke|doctor)\b/u.test(command) ||
    /\bnode\s+scripts\/check-[^\s]+/u.test(command)
  ) {
    return "check";
  }
  if (/\b(typecheck|tsc)\b/u.test(command)) {
    return "typecheck";
  }
  if (/\b(test|vitest|jest|mocha|playwright)\b/u.test(command)) {
    return "test";
  }
  if (/\b(lint|eslint|biome)\b/u.test(command)) {
    return "lint";
  }
  if (/\b(format|prettier)\b/u.test(command)) {
    return "format";
  }
  if (/\b(build|tsdown|vite|webpack|rollup)\b/u.test(command)) {
    return "build";
  }
  return undefined;
}

function isPatchToolName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return normalized === "applypatch";
}

function isShellToolName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return normalized === "bash" || normalized === "execcommand" || normalized === "commandexec";
}

function isSpawnAgentToolName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return normalized === "spawnagent";
}

function isWaitAgentToolName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return normalized === "waitagent";
}

function normalizedCodexToolName(name: string): string {
  return name.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function isBrowserToolName(name: string): boolean {
  const normalized = normalizedCodexToolName(name);
  return (
    normalized.includes("browser") ||
    normalized.includes("playwright") ||
    normalized.includes("computeruse")
  );
}

function isImageToolName(name: string): boolean {
  const normalized = normalizedCodexToolName(name);
  return (
    normalized.includes("image") ||
    normalized.includes("screenshot") ||
    normalized.includes("vision")
  );
}

function isCollaborationToolName(name: string): boolean {
  const normalized = normalizedCodexToolName(name);
  return (
    normalized === "spawnagent" ||
    normalized === "waitagent" ||
    normalized === "sendinput" ||
    normalized === "closeagent" ||
    normalized === "resumeagent"
  );
}

function isLikelyValidationCommand(command: string | undefined): boolean {
  if (!command) {
    return false;
  }
  return activeProgressValidationClass({ command }) !== undefined;
}

function activeProgressOutputSummary(
  data: Record<string, unknown> | undefined,
): string | undefined {
  const result = activeProgressResultRecord(data);
  const error = activeProgressRecord(data?.error);
  const resultError = activeProgressRecord(result?.error);
  return (
    formatBoundedToolEvidencePreview(data) ??
    boundedProgressText(data?.outputSummary, 500) ??
    boundedProgressText(data?.stderr, 500) ??
    boundedProgressText(data?.stdout, 500) ??
    boundedProgressText(data?.output, 500) ??
    boundedProgressText(data?.result, 500) ??
    boundedProgressText(data?.error, 500) ??
    boundedProgressText(error?.message, 500) ??
    boundedProgressText(result?.outputSummary, 500) ??
    boundedProgressText(result?.stderr, 500) ??
    boundedProgressText(result?.stdout, 500) ??
    boundedProgressText(result?.output, 500) ??
    boundedProgressText(result?.message, 500) ??
    boundedProgressText(result?.error, 500) ??
    boundedProgressText(resultError?.message, 500)
  );
}

function activeProgressRepairAction(data: Record<string, unknown> | undefined): string | undefined {
  return (
    boundedProgressText(data?.repairAction, 200) ??
    boundedProgressText(data?.nextAction, 200) ??
    boundedProgressText(data?.inspectNext, 200)
  );
}

function activeProgressChildRole(data: Record<string, unknown> | undefined): string | undefined {
  return (
    boundedProgressText(data?.childRole, 96) ??
    boundedProgressText(data?.subagentRole, 96) ??
    boundedProgressText(data?.agentRole, 96) ??
    boundedProgressText(data?.role, 96)
  );
}

function activeProgressChildAgentPath(
  data: Record<string, unknown> | undefined,
): string | undefined {
  return (
    boundedProgressText(data?.childAgentPath, 160) ??
    boundedProgressText(data?.agentPath, 160) ??
    boundedProgressText(data?.subagentAgentPath, 160)
  );
}

function isAssistantGenerationEvent(eventType: string): boolean {
  return (
    eventType === "agent.assistant" ||
    eventType === "assistant.message" ||
    eventType === "assistant.delta"
  );
}

function activeProgressLabel(
  eventType: string,
  data: Record<string, unknown> | undefined,
): string | undefined {
  return (
    boundedProgressText(data?.activeLabel, 96) ??
    boundedProgressText(data?.label, 96) ??
    boundedProgressText(data?.title, 96) ??
    boundedProgressText(data?.name, 96) ??
    boundedProgressText(data?.toolName, 96) ??
    boundedProgressText(data?.action, 96) ??
    (isAssistantGenerationEvent(eventType) ? "assistant generation" : undefined) ??
    (eventType === "prompt.submitted" ? "assistant generation" : undefined) ??
    (eventType === "run.started" ? "run" : undefined)
  );
}

function activeProgressElapsedMs(data: Record<string, unknown> | undefined): number | undefined {
  const result = activeProgressResultRecord(data);
  const elapsedMs =
    finiteNumber(data?.elapsedMs) ??
    finiteNumber(data?.durationMs) ??
    finiteNumber(result?.elapsedMs) ??
    finiteNumber(result?.durationMs);
  if (elapsedMs !== undefined && elapsedMs >= 0) {
    return elapsedMs;
  }
  const startedAt = finiteNumber(data?.startedAt);
  const endedAt = finiteNumber(data?.endedAt);
  if (startedAt !== undefined && endedAt !== undefined && endedAt >= startedAt) {
    return endedAt - startedAt;
  }
  return undefined;
}

function activeProgressDurationMs(data: Record<string, unknown> | undefined): number | undefined {
  const result = activeProgressResultRecord(data);
  return finiteNonNegativeInteger(data?.durationMs) ?? finiteNonNegativeInteger(result?.durationMs);
}

function activeProgressNote(
  eventType: string,
  data: Record<string, unknown> | undefined,
): string | undefined {
  const explicit = boundedProgressText(data?.summary) ?? boundedProgressText(data?.note);
  if (explicit) {
    return explicit;
  }
  const label = activeProgressLabel(eventType, data);
  if (eventType === "tool.call" && label) {
    return `${label} started`;
  }
  if (eventType === "prompt.submitted") {
    return "model prompt submitted; assistant generation in progress";
  }
  if (isAssistantGenerationEvent(eventType)) {
    return "assistant generation/finalization event observed";
  }
  return undefined;
}

function isLowSignalSuccessfulStatus(value: unknown): boolean {
  const normalized =
    typeof value === "string" ? value.replace(/[^a-z0-9]/giu, "").toLowerCase() : "";
  return (
    normalized === "completed" ||
    normalized === "succeeded" ||
    normalized === "success" ||
    normalized === "ok"
  );
}

function trajectoryEventIsUsefulActiveProgress(
  eventType: string,
  data: Record<string, unknown> | undefined,
): boolean {
  if (
    isAssistantGenerationEvent(eventType) ||
    eventType === "prompt.submitted" ||
    eventType === "agent.lifecycle"
  ) {
    return true;
  }
  if (
    eventType === "context.compiled" ||
    eventType === "session.started" ||
    eventType === "model.completed" ||
    eventType === "session.ended"
  ) {
    return false;
  }
  if (
    eventType === "tool.result" &&
    isLowSignalSuccessfulStatus(data?.status) &&
    !boundedProgressText(data?.summary) &&
    !boundedProgressText(data?.note) &&
    !boundedProgressText(data?.phase) &&
    !activeProgressOutputSummary(data) &&
    !activeProgressPointer(data)
  ) {
    return false;
  }
  return Boolean(
    activeProgressLabel(eventType, data) ??
    activeProgressNote(eventType, data) ??
    activeProgressOutputSummary(data) ??
    activeProgressCommand(data) ??
    activeProgressChildRole(data) ??
    activeProgressChildAgentPath(data) ??
    boundedProgressText(data?.phase) ??
    activeProgressPointer(data),
  );
}

function activeProgressPointer(
  data: Record<string, unknown> | undefined,
): ReadbackProgressProjection["pointer"] | undefined {
  const artifactRef =
    boundedProgressText(data?.artifactRef, 200) ??
    boundedProgressText(data?.artifactPath, 200) ??
    boundedProgressText(data?.artifact, 200);
  if (artifactRef) {
    const artifactLabel = boundedProgressText(data?.artifactLabel, 80);
    return {
      kind: "artifact",
      ref: artifactRef,
      ...(artifactLabel ? { label: artifactLabel } : {}),
    };
  }
  const inspectNext = boundedProgressText(data?.inspectNext, 200);
  if (inspectNext) {
    return {
      kind: "inspect-next",
      ref: inspectNext,
    };
  }
  const childSessionKey = boundedProgressText(data?.childSessionKey, 200);
  if (childSessionKey) {
    return {
      kind: "session",
      ref: childSessionKey,
      label: "child session",
    };
  }
  return undefined;
}

function activeProgressProjectionFromTrajectoryEvent(params: {
  sessionId: string;
  event: Record<string, unknown>;
  eventType: string;
}): ReadbackProgressProjection {
  const data = activeProgressRecord(params.event.data);
  const observedAt = boundedProgressText(params.event.ts, 64);
  const sourceEventSeq = finiteNumber(params.event.sourceSeq) ?? finiteNumber(params.event.seq);
  const currentPhase = boundedProgressText(data?.phase, 64);
  const activeLabel = activeProgressLabel(params.eventType, data);
  const elapsedMs = activeProgressElapsedMs(data);
  const durationMs = activeProgressDurationMs(data);
  const toolName = activeProgressToolName(data);
  const command = activeProgressCommand(data);
  const exitCode = activeProgressExitCode(data);
  const validationClass = activeProgressValidationClass(data);
  const outputSummary = activeProgressOutputSummary(data);
  const repairAction = activeProgressRepairAction(data);
  const childRole = activeProgressChildRole(data);
  const childAgentPath = activeProgressChildAgentPath(data);
  const childPhase = boundedProgressText(data?.childPhase, 80);
  const spawnReason = boundedProgressText(data?.spawnReason, 200);
  const diffReviewed = typeof data?.diffReviewed === "boolean" ? data.diffReviewed : undefined;
  const note = activeProgressNote(params.eventType, data);
  const pointer = activeProgressPointer(data);
  return {
    source: "trajectory",
    ref: `session:${params.sessionId}`,
    ...(currentPhase ? { currentPhase } : {}),
    ...(activeLabel ? { activeLabel } : {}),
    ...(observedAt ? { observedAt } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    sourceEventType: params.eventType,
    ...(sourceEventSeq !== undefined ? { sourceEventSeq } : {}),
    ...(toolName ? { toolName } : {}),
    ...(command ? { command } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(validationClass ? { validationClass } : {}),
    ...(outputSummary ? { outputSummary } : {}),
    ...(repairAction ? { repairAction } : {}),
    ...(childRole ? { childRole } : {}),
    ...(childAgentPath ? { childAgentPath } : {}),
    ...(childPhase ? { childPhase } : {}),
    ...(spawnReason ? { spawnReason } : {}),
    ...(diffReviewed !== undefined ? { diffReviewed } : {}),
    ...(note ? { note } : {}),
    ...(pointer ? { pointer } : {}),
    derivedBy: "readLatestTrajectoryProgressProjection",
    bounded: true,
  };
}

type ParsedTrajectoryProgressEvent = {
  event: Record<string, unknown>;
  eventType: string;
  data: Record<string, unknown> | undefined;
};

type CodexTrajectoryRound = GatewaySessionCodexParentRound & { order: number };

function trajectoryTimestampMs(event: Record<string, unknown>): number | undefined {
  const value = typeof event.ts === "string" ? Date.parse(event.ts) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

function trajectoryString(
  data: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function trajectoryUsage(
  value: unknown,
  options: { inputIsFresh?: boolean } = {},
): GatewaySessionCodexUsage | undefined {
  const record = activeProgressRecord(value);
  if (!record) {
    return undefined;
  }
  const number = (keys: readonly string[]) => {
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
        return Math.floor(candidate);
      }
    }
    return undefined;
  };
  const cachedInputTokens = number(["cachedInputTokens", "cacheRead", "cache_read"]);
  const inputTokens = number(["inputTokens", "input"]);
  const totalInputTokens =
    inputTokens === undefined
      ? undefined
      : options.inputIsFresh
        ? inputTokens + (cachedInputTokens ?? 0)
        : inputTokens;
  const freshInputTokens =
    inputTokens === undefined
      ? undefined
      : options.inputIsFresh
        ? inputTokens
        : Math.max(0, inputTokens - (cachedInputTokens ?? 0));
  const usage = {
    inputTokens: totalInputTokens,
    freshInputTokens,
    cachedInputTokens,
    outputTokens: number(["outputTokens", "output"]),
    reasoningOutputTokens: number(["reasoningOutputTokens", "reasoningTokens"]),
    totalTokens: number(["totalTokens", "total"]),
  };
  return Object.values(usage).some((token) => token !== undefined) ? usage : undefined;
}

function maximumUsage(
  current: GatewaySessionCodexUsage | undefined,
  incoming: GatewaySessionCodexUsage | undefined,
): GatewaySessionCodexUsage | undefined {
  if (!incoming) {
    return current;
  }
  const result: GatewaySessionCodexUsage = {};
  for (const key of Object.keys(incoming) as Array<keyof GatewaySessionCodexUsage>) {
    const value = incoming[key];
    const previous = current?.[key];
    if (value !== undefined || previous !== undefined) {
      result[key] = Math.max(value ?? 0, previous ?? 0);
    }
  }
  for (const key of Object.keys(current ?? {}) as Array<keyof GatewaySessionCodexUsage>) {
    if (result[key] === undefined && current?.[key] !== undefined) {
      result[key] = current[key];
    }
  }
  return result;
}

function usageDelta(
  current: GatewaySessionCodexUsage | undefined,
  previous: GatewaySessionCodexUsage | undefined,
): GatewaySessionCodexUsage | undefined {
  if (!current) {
    return undefined;
  }
  const delta: GatewaySessionCodexUsage = {};
  for (const key of Object.keys(current) as Array<keyof GatewaySessionCodexUsage>) {
    const value = current[key];
    if (value !== undefined) {
      delta[key] = Math.max(0, value - (previous?.[key] ?? 0));
    }
  }
  return Object.keys(delta).length > 0 ? delta : undefined;
}

/**
 * Reconstructs bounded Codex parent rounds from trajectory events. Native usage
 * notifications are cumulative per thread, so repeated and out-of-order
 * snapshots are collapsed by maximum and only round deltas are contributory.
 */
export function readCodexTrajectoryParentRounds(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
): GatewaySessionCodexParentRound[] | undefined {
  const filePath = resolveSessionTrajectoryRuntimeFileSync({
    sessionId,
    storePath,
    sessionFile,
    agentId,
  });
  if (!filePath) {
    return undefined;
  }
  const events = parseTrajectoryProgressEvents(
    readRecentTrajectoryLines(filePath, TRAJECTORY_PROGRESS_READ_BYTES),
    sessionId,
  );
  const rounds = new Map<string, CodexTrajectoryRound>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    const threadId = trajectoryString(event.data, "threadId");
    const turnId = trajectoryString(event.data, "turnId");
    if (!threadId || !turnId) {
      continue;
    }
    if (
      event.eventType !== "prompt.submitted" &&
      event.eventType !== "thread.token_usage.updated" &&
      event.eventType !== "model.completed" &&
      event.eventType !== "session.ended"
    ) {
      continue;
    }
    const key = `${threadId}\0${turnId}`;
    const at = trajectoryTimestampMs(event.event);
    const existing = rounds.get(key);
    const round: CodexTrajectoryRound = existing ?? {
      threadId,
      turnId,
      provider: trajectoryString(event.event, "provider"),
      model: trajectoryString(event.event, "modelId"),
      coverage: "none",
      settlement: "pending",
      children: [],
      order: index,
    };
    if (at !== undefined) {
      round.startedAt = round.startedAt === undefined ? at : Math.min(round.startedAt, at);
      if (event.eventType === "model.completed" || event.eventType === "session.ended") {
        round.endedAt = Math.max(round.endedAt ?? 0, at);
      }
    }
    round.provider ??= trajectoryString(event.event, "provider");
    round.model ??= trajectoryString(event.event, "modelId");
    if (event.eventType === "thread.token_usage.updated") {
      round.currentTurnUsage = maximumUsage(
        round.currentTurnUsage,
        trajectoryUsage(event.data?.currentTurnUsage, { inputIsFresh: true }),
      );
      round.cumulativeUsage = maximumUsage(
        round.cumulativeUsage,
        trajectoryUsage(event.data?.cumulativeUsage),
      );
    }
    if (event.eventType === "model.completed") {
      round.currentTurnUsage = maximumUsage(
        round.currentTurnUsage,
        trajectoryUsage(event.data?.usage, { inputIsFresh: true }),
      );
      round.finalRef = `trajectory:${sessionId}:${threadId}:${turnId}`;
      round.coverage = "complete";
    }
    if (event.eventType === "session.ended") {
      const status = trajectoryString(event.data, "status");
      const timedOut = event.data?.timedOut === true;
      round.failureClass = timedOut
        ? "timeout"
        : status === "interrupted"
          ? "interrupted"
          : status === "error"
            ? "failed"
            : undefined;
      round.coverage = round.coverage === "complete" ? "complete" : "partial";
    }
    rounds.set(key, round);
  }
  // Map insertion order follows the retained trajectory window. Sorting by a
  // mixture of epoch timestamps and small event indexes can move timestamp-less
  // rounds ahead of their actual predecessors.
  const sorted = [...rounds.values()].toSorted((left, right) => left.order - right.order);
  const previousByThread = new Map<string, GatewaySessionCodexUsage>();
  for (const round of sorted) {
    const previous = previousByThread.get(round.threadId);
    const cumulativeTurnUsage = usageDelta(round.cumulativeUsage, previous);
    // App-server's `last` usage is for one model call, not the whole Codex
    // turn. A tool-using turn can contain many such calls, so independently
    // maximizing those snapshots produces impossible fresh/cache totals. The
    // native cumulative thread counters are authoritative; subtract the prior
    // round to derive this turn and retain `last` only as a partial fallback.
    round.currentTurnUsage = cumulativeTurnUsage ?? round.currentTurnUsage;
    round.contributionUsage = cumulativeTurnUsage ?? round.currentTurnUsage;
    if (round.cumulativeUsage) {
      previousByThread.set(round.threadId, round.cumulativeUsage);
    }
    if (round.startedAt !== undefined && round.endedAt !== undefined) {
      round.durationMs = Math.max(0, round.endedAt - round.startedAt);
    }
    round.settlement =
      round.coverage === "complete" && round.cumulativeUsage
        ? "settled"
        : round.currentTurnUsage || round.cumulativeUsage
          ? "partial"
          : "pending";
  }
  return sorted.length > 0 ? sorted.map(({ order: _order, ...round }) => round) : undefined;
}

function parseTrajectoryProgressEvents(
  lines: string[],
  sessionId: string,
): ParsedTrajectoryProgressEvent[] {
  const events: ParsedTrajectoryProgressEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      const event = parsed as Record<string, unknown>;
      if (
        event.traceSchema !== "openclaw-trajectory" ||
        event.sessionId !== sessionId ||
        typeof event.type !== "string"
      ) {
        continue;
      }
      events.push({
        event,
        eventType: event.type,
        data: activeProgressRecord(event.data),
      });
    } catch {
      continue;
    }
  }
  return events;
}

type CodexExecutionToolStats = {
  name: string;
  count: number;
  completed: number;
  errored: number;
  lastStatus?: string;
  lastEventSeq?: number;
};

type CodexExecutionMcpToolStats = {
  server: string;
  tool: string;
  count: number;
  completed: number;
  errored: number;
  lastStatus?: string;
  lastEventSeq?: number;
  paths: Set<string>;
  roots: Set<string>;
  projectModes: Set<string>;
};

type CodexExecutionLspToolStats = {
  tool: string;
  count: number;
  completed: number;
  lastStatus?: string;
  lastEventSeq?: number;
  files: Set<string>;
  projectModes: Set<string>;
  partial?: boolean;
};

type CodexExecutionShellStats = {
  count: number;
  completed: number;
  errored: number;
  cwd: Set<string>;
  commandSamples: string[];
};

type CodexExecutionToolMix = {
  shell: number;
  mcp: number;
  lsp: number;
  browser: number;
  image: number;
  collaboration: number;
  spawnAgent: number;
  waitAgent: number;
  applyPatch: number;
};

type CodexExecutionThreadStats = {
  threadId: string;
  role?: string;
  objective?: string;
  observedEventCount: number;
  eventSeqStart?: number;
  eventSeqEnd?: number;
  toolCallCount: number;
  toolResultCount: number;
  peakConcurrentToolCalls: number;
  toolMix: CodexExecutionToolMix;
  mcpTools: Set<string>;
  lspTools: Set<string>;
  shellSamples: string[];
  validationCommands: string[];
  patchCount: number;
};

function createCodexExecutionToolMix(): CodexExecutionToolMix {
  return {
    shell: 0,
    mcp: 0,
    lsp: 0,
    browser: 0,
    image: 0,
    collaboration: 0,
    spawnAgent: 0,
    waitAgent: 0,
    applyPatch: 0,
  };
}

function addBoundedSetValue(target: Set<string>, value: unknown, limit = 8): void {
  if (target.size >= limit) {
    return;
  }
  const text = boundedProgressText(value, 200);
  if (text) {
    target.add(text);
  }
}

function addBoundedArrayValue(target: string[], value: unknown, limit = 5): void {
  if (target.length >= limit) {
    return;
  }
  const text = boundedProgressText(value, 240);
  if (text && !target.includes(text)) {
    target.push(text);
  }
}

function trajectoryStatus(data: Record<string, unknown> | undefined): string | undefined {
  return boundedProgressText(data?.status, 80);
}

function trajectoryStructuredContent(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const result = activeProgressRecord(data?.result);
  const nestedResult = activeProgressRecord(result?.result);
  return (
    activeProgressRecord(data?.structuredContent) ??
    activeProgressRecord(result?.structuredContent) ??
    activeProgressRecord(nestedResult?.structuredContent)
  );
}

function trajectoryResultRoot(data: Record<string, unknown> | undefined): string | undefined {
  return (
    boundedProgressText(trajectoryStructuredContent(data)?.root, 200) ??
    boundedProgressText(activeProgressRecord(data?.result)?.root, 200)
  );
}

function collectToolArgumentPaths(
  data: Record<string, unknown> | undefined,
  target: Set<string>,
): void {
  const args = activeProgressRecord(data?.arguments);
  if (!args) {
    return;
  }
  addBoundedSetValue(target, args.path);
  addBoundedSetValue(target, args.file);
  const queries = Array.isArray(args.queries) ? args.queries : [];
  for (const query of queries) {
    addBoundedSetValue(target, activeProgressRecord(query)?.path);
  }
  const files = Array.isArray(args.files) ? args.files : [];
  for (const file of files) {
    addBoundedSetValue(target, activeProgressRecord(file)?.path);
  }
}

function readCodexThreadRole(data: Record<string, unknown> | undefined): string | undefined {
  return (
    boundedProgressText(data?.role, 80) ??
    boundedProgressText(data?.agentRole, 80) ??
    boundedProgressText(data?.agent, 80)
  );
}

function readCodexThreadObjective(data: Record<string, unknown> | undefined): string | undefined {
  return boundedProgressText(data?.objective, 160) ?? boundedProgressText(data?.task, 160);
}

function getCodexExecutionThreadStats(
  target: Map<string, CodexExecutionThreadStats>,
  threadId: string,
): CodexExecutionThreadStats {
  const existing = target.get(threadId);
  if (existing) {
    return existing;
  }
  const created: CodexExecutionThreadStats = {
    threadId,
    observedEventCount: 0,
    toolCallCount: 0,
    toolResultCount: 0,
    peakConcurrentToolCalls: 0,
    toolMix: createCodexExecutionToolMix(),
    mcpTools: new Set<string>(),
    lspTools: new Set<string>(),
    shellSamples: [],
    validationCommands: [],
    patchCount: 0,
  };
  target.set(threadId, created);
  return created;
}

function incrementCodexExecutionToolMix(
  mix: CodexExecutionToolMix,
  name: string,
  mcpName: { server: string; tool: string } | undefined,
): void {
  if (isShellToolName(name)) {
    mix.shell += 1;
  }
  if (mcpName) {
    mix.mcp += 1;
    if (mcpName.tool.startsWith("lsp_")) {
      mix.lsp += 1;
    }
  }
  if (isBrowserToolName(name)) {
    mix.browser += 1;
  }
  if (isImageToolName(name)) {
    mix.image += 1;
  }
  if (isCollaborationToolName(name)) {
    mix.collaboration += 1;
  }
  if (isSpawnAgentToolName(name)) {
    mix.spawnAgent += 1;
  }
  if (isWaitAgentToolName(name)) {
    mix.waitAgent += 1;
  }
  if (isPatchToolName(name)) {
    mix.applyPatch += 1;
  }
}

function extractMcpToolName(name: string): { server: string; tool: string } | undefined {
  const dotIndex = name.indexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return undefined;
  }
  return {
    server: name.slice(0, dotIndex),
    tool: name.slice(dotIndex + 1),
  };
}

function sortCodexExecutionStats<T extends { count: number; lastEventSeq?: number }>(
  values: Iterable<T>,
): T[] {
  return Array.from(values).toSorted(
    (a, b) => b.count - a.count || (b.lastEventSeq ?? 0) - (a.lastEventSeq ?? 0),
  );
}

function compactToolStats(stats: CodexExecutionToolStats) {
  return {
    name: stats.name,
    count: stats.count,
    ...(stats.completed > 0 ? { completed: stats.completed } : {}),
    ...(stats.errored > 0 ? { errored: stats.errored } : {}),
    ...(stats.lastStatus ? { lastStatus: stats.lastStatus } : {}),
    ...(stats.lastEventSeq !== undefined ? { lastEventSeq: stats.lastEventSeq } : {}),
  };
}

function compactMcpStats(stats: CodexExecutionMcpToolStats) {
  return {
    server: stats.server,
    tool: stats.tool,
    count: stats.count,
    ...(stats.completed > 0 ? { completed: stats.completed } : {}),
    ...(stats.errored > 0 ? { errored: stats.errored } : {}),
    ...(stats.lastStatus ? { lastStatus: stats.lastStatus } : {}),
    ...(stats.lastEventSeq !== undefined ? { lastEventSeq: stats.lastEventSeq } : {}),
    ...(stats.paths.size > 0 ? { paths: Array.from(stats.paths) } : {}),
    ...(stats.roots.size > 0 ? { roots: Array.from(stats.roots) } : {}),
    ...(stats.projectModes.size > 0 ? { projectModes: Array.from(stats.projectModes) } : {}),
  };
}

function compactLspStats(stats: CodexExecutionLspToolStats) {
  return {
    tool: stats.tool,
    count: stats.count,
    ...(stats.completed > 0 ? { completed: stats.completed } : {}),
    ...(stats.lastStatus ? { lastStatus: stats.lastStatus } : {}),
    ...(stats.lastEventSeq !== undefined ? { lastEventSeq: stats.lastEventSeq } : {}),
    ...(stats.files.size > 0 ? { files: Array.from(stats.files) } : {}),
    ...(stats.projectModes.size > 0 ? { projectModes: Array.from(stats.projectModes) } : {}),
    ...(stats.partial !== undefined ? { partial: stats.partial } : {}),
  };
}

function compactToolMix(stats: CodexExecutionToolMix) {
  return {
    shell: stats.shell,
    mcp: stats.mcp,
    lsp: stats.lsp,
    browser: stats.browser,
    image: stats.image,
    collaboration: stats.collaboration,
    spawnAgent: stats.spawnAgent,
    waitAgent: stats.waitAgent,
    applyPatch: stats.applyPatch,
  };
}

function compactCodexExecutionThreadStats(stats: CodexExecutionThreadStats) {
  return {
    threadId: stats.threadId,
    ...(stats.role ? { role: stats.role } : {}),
    ...(stats.objective ? { objective: stats.objective } : {}),
    observedEventCount: stats.observedEventCount,
    ...(stats.eventSeqStart !== undefined ? { eventSeqStart: stats.eventSeqStart } : {}),
    ...(stats.eventSeqEnd !== undefined ? { eventSeqEnd: stats.eventSeqEnd } : {}),
    toolCallCount: stats.toolCallCount,
    toolResultCount: stats.toolResultCount,
    ...(stats.peakConcurrentToolCalls > 0
      ? { peakConcurrentToolCalls: stats.peakConcurrentToolCalls }
      : {}),
    toolMix: compactToolMix(stats.toolMix),
    ...(stats.mcpTools.size > 0 ? { mcpTools: Array.from(stats.mcpTools).slice(0, 12) } : {}),
    ...(stats.lspTools.size > 0 ? { lspTools: Array.from(stats.lspTools).slice(0, 8) } : {}),
    ...(stats.shellSamples.length > 0 ? { shellSamples: stats.shellSamples.slice(0, 5) } : {}),
    ...(stats.validationCommands.length > 0
      ? { validationCommands: stats.validationCommands.slice(0, 5) }
      : {}),
    ...(stats.patchCount > 0 ? { patchCount: stats.patchCount } : {}),
  };
}

export function readCodexExecutionEvidenceProjection(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
): GatewaySessionCodexExecutionEvidence | undefined {
  const filePath = resolveSessionTrajectoryRuntimeFileSync({
    sessionId,
    storePath,
    sessionFile,
    agentId,
  });
  if (!filePath) {
    return undefined;
  }
  const lines = readRecentTrajectoryLines(filePath, CODEX_EXECUTION_EVIDENCE_READ_BYTES);
  const events = parseTrajectoryProgressEvents(lines, sessionId);
  if (events.length === 0) {
    return undefined;
  }

  const tools = new Map<string, CodexExecutionToolStats>();
  const mcpTools = new Map<string, CodexExecutionMcpToolStats>();
  const lspTools = new Map<string, CodexExecutionLspToolStats>();
  const shell: CodexExecutionShellStats = {
    count: 0,
    completed: 0,
    errored: 0,
    cwd: new Set<string>(),
    commandSamples: [],
  };
  const toolMix = createCodexExecutionToolMix();
  const byThread = new Map<string, CodexExecutionThreadStats>();
  const workspaceDirs = new Set<string>();
  const threadIds = new Set<string>();
  const validationCommands: string[] = [];
  let toolCallCount = 0;
  let toolResultCount = 0;
  let peakConcurrentToolCalls = 0;
  const activeToolCalls = new Set<string>();
  const activeToolCallsByThread = new Map<string, Set<string>>();
  let patchCount = 0;
  let modelCompleted = false;
  let sessionEndedStatus: string | undefined;
  let latestAttemptStatus: string | undefined;
  let latestAttemptId: string | undefined;
  let lastEventSeq: number | undefined;
  let lastEventType: string | undefined;
  let lastObservedAt: string | undefined;

  for (const { event, eventType, data } of events) {
    const sourceSeq = finiteNumber(event.sourceSeq) ?? finiteNumber(event.seq);
    if (sourceSeq !== undefined) {
      lastEventSeq = sourceSeq;
    }
    lastEventType = eventType;
    lastObservedAt = boundedProgressText(event.ts, 64) ?? lastObservedAt;
    addBoundedSetValue(workspaceDirs, event.workspaceDir);
    const threadId = boundedProgressText(data?.threadId, 200);
    addBoundedSetValue(threadIds, threadId);
    const threadStats = threadId ? getCodexExecutionThreadStats(byThread, threadId) : undefined;
    if (threadStats) {
      threadStats.observedEventCount += 1;
      if (sourceSeq !== undefined) {
        threadStats.eventSeqStart =
          threadStats.eventSeqStart === undefined
            ? sourceSeq
            : Math.min(threadStats.eventSeqStart, sourceSeq);
        threadStats.eventSeqEnd =
          threadStats.eventSeqEnd === undefined
            ? sourceSeq
            : Math.max(threadStats.eventSeqEnd, sourceSeq);
      }
      threadStats.role = threadStats.role ?? readCodexThreadRole(data);
      threadStats.objective = threadStats.objective ?? readCodexThreadObjective(data);
    }
    if (eventType === "model.completed") {
      modelCompleted = true;
      continue;
    }
    if (eventType === "session.ended") {
      const status = boundedProgressText(data?.status, 80);
      if (data?.lifecycleScope === "attempt") {
        latestAttemptStatus = status ?? latestAttemptStatus;
        latestAttemptId = boundedProgressText(data?.attemptId, 100) ?? latestAttemptId;
      } else {
        sessionEndedStatus = status ?? sessionEndedStatus;
      }
      continue;
    }
    if (eventType !== "tool.call" && eventType !== "tool.result") {
      continue;
    }
    const name = activeProgressToolName(data);
    if (!name) {
      continue;
    }
    const status = trajectoryStatus(data);
    const isResult = eventType === "tool.result";
    const toolCallId = activeProgressToolCallId(data);
    if (toolCallId) {
      const concurrencyThreadId = threadId ?? "unknown";
      const threadCalls = activeToolCallsByThread.get(concurrencyThreadId) ?? new Set<string>();
      const scopedCallId = `${concurrencyThreadId}\0${toolCallId}`;
      if (isResult) {
        activeToolCalls.delete(scopedCallId);
        threadCalls.delete(toolCallId);
      } else {
        activeToolCalls.add(scopedCallId);
        threadCalls.add(toolCallId);
        peakConcurrentToolCalls = Math.max(peakConcurrentToolCalls, activeToolCalls.size);
        if (threadStats) {
          threadStats.peakConcurrentToolCalls = Math.max(
            threadStats.peakConcurrentToolCalls,
            threadCalls.size,
          );
        }
      }
      activeToolCallsByThread.set(concurrencyThreadId, threadCalls);
    }
    if (isResult) {
      toolResultCount += 1;
      if (threadStats) {
        threadStats.toolResultCount += 1;
      }
    } else {
      toolCallCount += 1;
      if (threadStats) {
        threadStats.toolCallCount += 1;
      }
    }
    const toolStats = tools.get(name) ?? {
      name,
      count: 0,
      completed: 0,
      errored: 0,
    };
    if (!isResult) {
      toolStats.count += 1;
    }
    if (isResult && status === "completed") {
      toolStats.completed += 1;
    }
    if (isResult && (data?.isError === true || status === "error" || status === "failed")) {
      toolStats.errored += 1;
    }
    toolStats.lastStatus = status ?? toolStats.lastStatus;
    toolStats.lastEventSeq = sourceSeq ?? toolStats.lastEventSeq;
    tools.set(name, toolStats);

    const mcpName = extractMcpToolName(name);
    if (!isResult) {
      incrementCodexExecutionToolMix(toolMix, name, mcpName);
      if (threadStats) {
        incrementCodexExecutionToolMix(threadStats.toolMix, name, mcpName);
      }
    }

    if (!isResult && isPatchToolName(name)) {
      patchCount += 1;
      if (threadStats) {
        threadStats.patchCount += 1;
      }
    }

    if (isShellToolName(name)) {
      if (!isResult) {
        shell.count += 1;
        const args = activeProgressRecord(data?.arguments);
        addBoundedSetValue(shell.cwd, args?.cwd);
        const command = activeProgressCommand(data) ?? boundedProgressText(args?.command, 240);
        addBoundedArrayValue(shell.commandSamples, command);
        if (threadStats) {
          addBoundedArrayValue(threadStats.shellSamples, command);
        }
        if (isLikelyValidationCommand(command)) {
          addBoundedArrayValue(validationCommands, command, 8);
          if (threadStats) {
            addBoundedArrayValue(threadStats.validationCommands, command, 8);
          }
        }
      } else if (status === "completed") {
        shell.completed += 1;
      } else if (data?.isError === true || status === "error" || status === "failed") {
        shell.errored += 1;
      }
    }

    if (!mcpName) {
      continue;
    }
    if (!isResult && threadStats) {
      threadStats.mcpTools.add(`${mcpName.server}.${mcpName.tool}`);
      if (mcpName.tool.startsWith("lsp_")) {
        threadStats.lspTools.add(mcpName.tool);
      }
    }
    const mcpKey = `${mcpName.server}.${mcpName.tool}`;
    const mcpStats = mcpTools.get(mcpKey) ?? {
      server: mcpName.server,
      tool: mcpName.tool,
      count: 0,
      completed: 0,
      errored: 0,
      paths: new Set<string>(),
      roots: new Set<string>(),
      projectModes: new Set<string>(),
    };
    if (!isResult) {
      mcpStats.count += 1;
      collectToolArgumentPaths(data, mcpStats.paths);
    }
    if (isResult && status === "completed") {
      mcpStats.completed += 1;
    }
    if (isResult && (data?.isError === true || status === "error" || status === "failed")) {
      mcpStats.errored += 1;
    }
    const structured = trajectoryStructuredContent(data);
    addBoundedSetValue(mcpStats.roots, trajectoryResultRoot(data));
    addBoundedSetValue(mcpStats.projectModes, structured?.projectMode);
    mcpStats.lastStatus = status ?? mcpStats.lastStatus;
    mcpStats.lastEventSeq = sourceSeq ?? mcpStats.lastEventSeq;
    mcpTools.set(mcpKey, mcpStats);

    if (!mcpName.tool.startsWith("lsp_")) {
      continue;
    }
    const lspStats = lspTools.get(mcpName.tool) ?? {
      tool: mcpName.tool,
      count: 0,
      completed: 0,
      files: new Set<string>(),
      projectModes: new Set<string>(),
    };
    if (!isResult) {
      lspStats.count += 1;
      collectToolArgumentPaths(data, lspStats.files);
    }
    if (isResult && status === "completed") {
      lspStats.completed += 1;
    }
    addBoundedSetValue(lspStats.files, structured?.file);
    addBoundedSetValue(lspStats.projectModes, structured?.projectMode);
    if (typeof structured?.lspPartial === "boolean") {
      lspStats.partial = structured.lspPartial;
    }
    lspStats.lastStatus = status ?? lspStats.lastStatus;
    lspStats.lastEventSeq = sourceSeq ?? lspStats.lastEventSeq;
    lspTools.set(mcpName.tool, lspStats);
  }

  if (
    toolCallCount === 0 &&
    toolResultCount === 0 &&
    !modelCompleted &&
    !sessionEndedStatus &&
    !latestAttemptStatus
  ) {
    return undefined;
  }

  return {
    source: "trajectory",
    ref: `session:${sessionId}`,
    derivedBy: "readCodexExecutionEvidenceProjection",
    bounded: true,
    observedEventCount: events.length,
    toolCallCount,
    toolResultCount,
    ...(peakConcurrentToolCalls > 0 ? { peakConcurrentToolCalls } : {}),
    ...(peakConcurrentToolCalls > 1
      ? {
          nativeParallelActivity: {
            observed: true as const,
            peakConcurrentToolCalls,
          },
        }
      : {}),
    toolMix: compactToolMix(toolMix),
    ...(byThread.size > 0
      ? {
          byThread: Array.from(byThread.values())
            .toSorted(
              (left, right) =>
                (left.eventSeqStart ?? Number.MAX_SAFE_INTEGER) -
                (right.eventSeqStart ?? Number.MAX_SAFE_INTEGER),
            )
            .map(compactCodexExecutionThreadStats)
            .slice(0, 12),
        }
      : {}),
    ...(patchCount > 0 ? { patchCount } : {}),
    ...(validationCommands.length > 0 ? { validationCommands } : {}),
    ...(workspaceDirs.size > 0 ? { workspaceDirs: Array.from(workspaceDirs) } : {}),
    ...(threadIds.size > 0 ? { threadIds: Array.from(threadIds) } : {}),
    ...(tools.size > 0
      ? { tools: sortCodexExecutionStats(tools.values()).map(compactToolStats).slice(0, 20) }
      : {}),
    ...(mcpTools.size > 0
      ? { mcpTools: sortCodexExecutionStats(mcpTools.values()).map(compactMcpStats).slice(0, 20) }
      : {}),
    ...(lspTools.size > 0
      ? { lspTools: sortCodexExecutionStats(lspTools.values()).map(compactLspStats).slice(0, 10) }
      : {}),
    ...(shell.count > 0
      ? {
          shell: {
            count: shell.count,
            ...(shell.completed > 0 ? { completed: shell.completed } : {}),
            ...(shell.errored > 0 ? { errored: shell.errored } : {}),
            ...(shell.cwd.size > 0 ? { cwd: Array.from(shell.cwd) } : {}),
            ...(shell.commandSamples.length > 0 ? { commandSamples: shell.commandSamples } : {}),
          },
        }
      : {}),
    ...(modelCompleted ? { modelCompleted } : {}),
    ...(sessionEndedStatus ? { sessionEndedStatus } : {}),
    ...(latestAttemptStatus ? { latestAttemptStatus } : {}),
    ...(latestAttemptId ? { latestAttemptId } : {}),
    ...(lastEventSeq !== undefined ? { lastEventSeq } : {}),
    ...(lastEventType ? { lastEventType } : {}),
    ...(lastObservedAt ? { lastObservedAt } : {}),
  };
}

type GatewaySessionCodexNativeSurface = NonNullable<
  NonNullable<GatewaySessionRow["promptContext"]>["codexNativeSurface"]
>;

export function readCodexNativeSurfaceProjection(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
): GatewaySessionCodexNativeSurface | undefined {
  const filePath = resolveSessionTrajectoryRuntimeFileSync({
    sessionId,
    storePath,
    sessionFile,
    agentId,
  });
  if (!filePath) {
    return undefined;
  }
  const lines = readInitialTrajectoryLines(filePath, CODEX_LAUNCH_EVIDENCE_READ_BYTES);
  const events = parseTrajectoryProgressEvents(lines, sessionId);
  for (const { eventType, data } of events) {
    if (eventType !== "session.started") {
      continue;
    }
    const surface = activeProgressRecord(data?.codexNativeSurface);
    if (surface?.owner === "codex_app_server") {
      return surface as GatewaySessionCodexNativeSurface;
    }
  }
  return undefined;
}

function activeProgressToolCallId(data: Record<string, unknown> | undefined): string | undefined {
  return (
    boundedProgressText(data?.toolCallId, 160) ??
    boundedProgressText(data?.itemId, 160) ??
    boundedProgressText(data?.callId, 160)
  );
}

function activeProgressEventPhase(data: Record<string, unknown> | undefined): string | undefined {
  return boundedProgressText(data?.phase, 80);
}

function isToolCallStartProgressEvent(event: ParsedTrajectoryProgressEvent): boolean {
  if (event.eventType === "tool.call") {
    return true;
  }
  return event.eventType === "agent.tool" && activeProgressEventPhase(event.data) === "start";
}

function isToolResultProgressEvent(event: ParsedTrajectoryProgressEvent | undefined): boolean {
  if (!event) {
    return false;
  }
  if (event.eventType === "tool.result") {
    return true;
  }
  if (event.eventType !== "agent.tool") {
    return false;
  }
  const phase = activeProgressEventPhase(event.data);
  return phase === "result" || phase === "end";
}

function matchingPriorToolCallData(
  events: ParsedTrajectoryProgressEvent[],
  resultIndex: number,
  resultData: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const resultCallId = activeProgressToolCallId(resultData);
  const resultName = activeProgressToolName(resultData);
  for (let index = resultIndex - 1; index >= 0; index -= 1) {
    const candidate = events[index];
    if (!candidate || !isToolCallStartProgressEvent(candidate)) {
      continue;
    }
    const candidateCallId = activeProgressToolCallId(candidate.data);
    if (resultCallId && candidateCallId === resultCallId) {
      return candidate.data;
    }
    if (!resultCallId && resultName && resultName === activeProgressToolName(candidate.data)) {
      return candidate.data;
    }
  }
  return undefined;
}

function mergeToolResultWithPriorCallData(params: {
  events: ParsedTrajectoryProgressEvent[];
  eventIndex: number;
  event: Record<string, unknown>;
  data: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  if (!isToolResultProgressEvent(params.events[params.eventIndex])) {
    return params.event;
  }
  const callData = matchingPriorToolCallData(params.events, params.eventIndex, params.data);
  if (!callData) {
    return params.event;
  }
  return {
    ...params.event,
    data: {
      ...callData,
      ...params.data,
      arguments: params.data?.arguments ?? callData.arguments,
    },
  };
}

export function readLatestTrajectoryProgressProjection(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
): ReadbackProgressProjection | undefined {
  const filePath = resolveSessionTrajectoryRuntimeFileSync({
    sessionId,
    storePath,
    sessionFile,
    agentId,
  });
  if (!filePath) {
    return undefined;
  }
  const lines = readRecentTrajectoryLines(filePath, TRAJECTORY_PROGRESS_READ_BYTES);
  const events = parseTrajectoryProgressEvents(lines, sessionId);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    const mergedEvent = mergeToolResultWithPriorCallData({
      events,
      eventIndex: index,
      event: event.event,
      data: event.data,
    });
    const data = activeProgressRecord(mergedEvent.data);
    if (!trajectoryEventIsUsefulActiveProgress(event.eventType, data)) {
      continue;
    }
    return activeProgressProjectionFromTrajectoryEvent({
      sessionId,
      event: mergedEvent,
      eventType: event.eventType,
    });
  }
  return {
    source: "trajectory",
    ref: `session:${sessionId}`,
    derivedBy: "readLatestTrajectoryProgressProjection",
    bounded: true,
    note: "trajectory file found but no valid recent event in bounded tail",
  };
}
