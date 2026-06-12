import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type ManagedToolOutputRecord = {
  schemaVersion: 1;
  ref: string;
  id: string;
  createdAt: number;
  stateRoot: string;
  outputPath: string;
  metadataPath: string;
  toolName: string;
  sessionKey?: string;
  toolCallId?: string;
  outputKind?: string;
  byteCount: number;
  textHash: string;
  reason?: string;
};

export type PersistManagedToolOutputResult = {
  ref: string;
  id: string;
  outputPath: string;
  byteCount: number;
  textHash: string;
};

export type ManagedToolOutputReadResult = {
  record: ManagedToolOutputRecord;
  text: string;
  offsetBytes: number;
  returnedBytes: number;
  totalBytes: number;
  nextOffsetBytes: number | null;
  truncated: boolean;
};

export type ManagedToolOutputLineReadResult = {
  record: ManagedToolOutputRecord;
  text: string;
  offsetLines: number;
  returnedLines: number;
  totalLines: number;
  nextOffsetLines: number | null;
  truncated: boolean;
  totalBytes: number;
};

export type ManagedToolOutputGrepMatch = {
  line: number;
  text: string;
  before?: string[];
  after?: string[];
};

export type ManagedToolOutputGrepResult = {
  record: ManagedToolOutputRecord;
  status: "ok" | "invalid_regex";
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  contextLines: number;
  maxMatches: number;
  matches: ManagedToolOutputGrepMatch[];
  matchCount: number;
  searchedLineCount: number;
  totalLines: number;
  totalBytes: number;
  truncated: boolean;
  regexError?: string;
};

export type ManagedToolOutputStream = {
  ref: string;
  id: string;
  outputPath: string;
  metadataPath: string;
  append: (chunk: string) => void;
  finalize: () => PersistManagedToolOutputResult;
  discard: () => void;
};

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function buildManagedOutputId(params: {
  createdAt: number;
  toolName: string;
  textHash: string;
  toolCallId?: string;
}): string {
  const toolName = sanitizePathSegment(params.toolName);
  const callPart = params.toolCallId
    ? `${sanitizePathSegment(params.toolCallId).slice(0, 32)}_`
    : "";
  return `mout_${params.createdAt}_${toolName}_${callPart}${params.textHash.slice(0, 16)}`;
}

export function buildManagedToolOutputRef(params: {
  sessionKey?: string | null;
  id: string;
}): string {
  const sessionPart = encodeURIComponent(params.sessionKey?.trim() || "global");
  return `openclaw-managed-output://${sessionPart}/${encodeURIComponent(params.id.trim())}`;
}

function writeFileAtomicSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function buildManagedOutputPaths(params: { stateRoot: string; createdAt: number; id: string }): {
  outputPath: string;
  metadataPath: string;
} {
  const date = new Date(params.createdAt).toISOString().slice(0, 10);
  const outputDir = path.join(params.stateRoot, "managed-tool-output", date);
  return {
    outputPath: path.join(outputDir, `${params.id}.txt`),
    metadataPath: path.join(outputDir, `${params.id}.json`),
  };
}

function writeManagedOutputMetadataSync(record: ManagedToolOutputRecord): void {
  writeFileAtomicSync(record.metadataPath, `${JSON.stringify(record, null, 2)}\n`);
}

export function isManagedToolOutputRef(ref: string): boolean {
  return ref.trim().startsWith("openclaw-managed-output://");
}

function parseManagedToolOutputRef(ref: string): { sessionKey: string; id: string } | null {
  if (!isManagedToolOutputRef(ref)) {
    return null;
  }
  try {
    const parsed = new URL(ref);
    const sessionKey = decodeURIComponent(parsed.hostname);
    const id = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ""));
    if (!sessionKey || !id || /[^A-Za-z0-9_.-]/u.test(id)) {
      return null;
    }
    return { sessionKey, id };
  } catch {
    return null;
  }
}

function filePathIsInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function managedOutputDateFromId(id: string): string | null {
  const match = /^mout_(\d+)_/u.exec(id);
  if (!match) {
    return null;
  }
  const createdAt = Number(match[1]);
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) {
    return null;
  }
  return new Date(createdAt).toISOString().slice(0, 10);
}

function readManagedOutputRecordByRefSync(params: {
  stateRoot?: string | null;
  ref: string;
}): ManagedToolOutputRecord | null {
  const stateRoot = normalizeOptionalString(params.stateRoot);
  const parsed = parseManagedToolOutputRef(params.ref);
  if (!stateRoot || !parsed) {
    return null;
  }
  const resolvedStateRoot = path.resolve(stateRoot);
  const date = managedOutputDateFromId(parsed.id);
  if (!date) {
    return null;
  }
  const expectedMetadataPath = path.join(
    resolvedStateRoot,
    "managed-tool-output",
    date,
    `${parsed.id}.json`,
  );
  let record: ManagedToolOutputRecord;
  try {
    record = JSON.parse(fs.readFileSync(expectedMetadataPath, "utf8")) as ManagedToolOutputRecord;
  } catch {
    return null;
  }
  if (record.schemaVersion !== 1 || record.ref !== params.ref || record.id !== parsed.id) {
    return null;
  }
  const outputPath = path.resolve(record.outputPath);
  const recordMetadataPath = path.resolve(record.metadataPath);
  if (
    !filePathIsInside(resolvedStateRoot, outputPath) ||
    !filePathIsInside(resolvedStateRoot, recordMetadataPath) ||
    recordMetadataPath !== path.resolve(expectedMetadataPath)
  ) {
    return null;
  }
  return {
    ...record,
    stateRoot: resolvedStateRoot,
    outputPath,
    metadataPath: recordMetadataPath,
  };
}

export function readManagedToolOutputRefSync(params: {
  stateRoot?: string | null;
  ref: string;
  offsetBytes?: number;
  maxBytes?: number;
}): ManagedToolOutputReadResult | null {
  const record = readManagedOutputRecordByRefSync({
    stateRoot: params.stateRoot,
    ref: params.ref,
  });
  if (!record) {
    return null;
  }
  const stat = fs.statSync(record.outputPath);
  const totalBytes = stat.size;
  const offsetBytes =
    typeof params.offsetBytes === "number" && Number.isFinite(params.offsetBytes)
      ? Math.max(0, Math.min(totalBytes, Math.floor(params.offsetBytes)))
      : 0;
  const maxBytes =
    typeof params.maxBytes === "number" && Number.isFinite(params.maxBytes)
      ? Math.max(1, Math.floor(params.maxBytes))
      : 16_000;
  const returnedBytes = Math.max(0, Math.min(maxBytes, totalBytes - offsetBytes));
  const buffer = Buffer.alloc(returnedBytes);
  const fd = fs.openSync(record.outputPath, "r");
  try {
    fs.readSync(fd, buffer, 0, returnedBytes, offsetBytes);
  } finally {
    fs.closeSync(fd);
  }
  const nextOffsetBytes =
    offsetBytes + returnedBytes < totalBytes ? offsetBytes + returnedBytes : null;
  return {
    record,
    text: buffer.toString("utf8"),
    offsetBytes,
    returnedBytes,
    totalBytes,
    nextOffsetBytes,
    truncated: nextOffsetBytes !== null,
  };
}

export function readManagedToolOutputRefLinesSync(params: {
  stateRoot?: string | null;
  ref: string;
  offsetLines?: number;
  limitLines?: number;
  maxBytes?: number;
}): ManagedToolOutputLineReadResult | null {
  const record = readManagedOutputRecordByRefSync({
    stateRoot: params.stateRoot,
    ref: params.ref,
  });
  if (!record) {
    return null;
  }
  const raw = fs.readFileSync(record.outputPath, "utf8");
  const totalBytes = Buffer.byteLength(raw, "utf8");
  const lines = raw.length === 0 ? [] : raw.split(/\r?\n/u);
  const totalLines = lines.length;
  const offsetLines =
    typeof params.offsetLines === "number" && Number.isFinite(params.offsetLines)
      ? Math.max(1, Math.floor(params.offsetLines))
      : 1;
  const limitLines =
    typeof params.limitLines === "number" && Number.isFinite(params.limitLines)
      ? Math.max(1, Math.floor(params.limitLines))
      : 2_000;
  const startIndex = Math.max(0, offsetLines - 1);
  const selected: string[] = [];
  let selectedBytes = 0;
  const maxBytes =
    typeof params.maxBytes === "number" && Number.isFinite(params.maxBytes)
      ? Math.max(1, Math.floor(params.maxBytes))
      : 50_000;
  for (const line of lines.slice(startIndex, startIndex + limitLines)) {
    const nextBytes =
      selectedBytes + Buffer.byteLength(line, "utf8") + (selected.length > 0 ? 1 : 0);
    if (nextBytes > maxBytes && selected.length > 0) {
      break;
    }
    if (nextBytes > maxBytes) {
      selected.push(line.slice(0, Math.max(0, maxBytes - selectedBytes)));
      selectedBytes = maxBytes;
      break;
    }
    selected.push(line);
    selectedBytes = nextBytes;
  }
  const returnedLines = selected.length;
  const nextOffsetLines =
    startIndex + returnedLines < totalLines ? offsetLines + returnedLines : null;
  return {
    record,
    text: selected.join("\n"),
    offsetLines,
    returnedLines,
    totalLines,
    nextOffsetLines,
    truncated: nextOffsetLines !== null,
    totalBytes,
  };
}

function buildManagedOutputLineMatcher(input: {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
}): { match: (line: string) => boolean; regexError?: string } {
  if (input.regex) {
    try {
      const expression = new RegExp(input.query, input.caseSensitive ? "u" : "iu");
      return { match: (line) => expression.test(line) };
    } catch (error) {
      return {
        match: () => false,
        regexError: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const needle = input.caseSensitive ? input.query : input.query.toLowerCase();
  return {
    match: (line) => {
      const haystack = input.caseSensitive ? line : line.toLowerCase();
      return haystack.includes(needle);
    },
  };
}

export function grepManagedToolOutputRefSync(params: {
  stateRoot?: string | null;
  ref: string;
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  contextLines?: number;
  maxMatches?: number;
}): ManagedToolOutputGrepResult | null {
  const record = readManagedOutputRecordByRefSync({
    stateRoot: params.stateRoot,
    ref: params.ref,
  });
  if (!record) {
    return null;
  }
  const raw = fs.readFileSync(record.outputPath, "utf8");
  const totalBytes = Buffer.byteLength(raw, "utf8");
  const lines = raw.length === 0 ? [] : raw.split(/\r?\n/u);
  const regex = params.regex !== false;
  const caseSensitive = params.caseSensitive === true;
  const contextLines =
    typeof params.contextLines === "number" && Number.isFinite(params.contextLines)
      ? Math.max(0, Math.min(3, Math.floor(params.contextLines)))
      : 0;
  const maxMatches =
    typeof params.maxMatches === "number" && Number.isFinite(params.maxMatches)
      ? Math.max(1, Math.min(100, Math.floor(params.maxMatches)))
      : 100;
  const matcher = buildManagedOutputLineMatcher({
    query: params.query,
    regex,
    caseSensitive,
  });
  if (matcher.regexError) {
    return {
      record,
      status: "invalid_regex",
      query: params.query,
      regex,
      caseSensitive,
      contextLines,
      maxMatches,
      matches: [],
      matchCount: 0,
      searchedLineCount: 0,
      totalLines: lines.length,
      totalBytes,
      truncated: false,
      regexError: matcher.regexError,
    };
  }
  const matches: ManagedToolOutputGrepMatch[] = [];
  let searchedLineCount = 0;
  let truncated = false;
  for (const [index, line] of lines.entries()) {
    if (matches.length >= maxMatches) {
      truncated = true;
      break;
    }
    searchedLineCount += 1;
    if (!matcher.match(line)) {
      continue;
    }
    const beforeStart = Math.max(0, index - contextLines);
    const afterEnd = Math.min(lines.length, index + contextLines + 1);
    matches.push({
      line: index + 1,
      text: line,
      ...(contextLines > 0
        ? {
            before: lines
              .slice(beforeStart, index)
              .map((value, offset) => `${beforeStart + offset + 1}: ${value}`),
            after: lines
              .slice(index + 1, afterEnd)
              .map((value, offset) => `${index + offset + 2}: ${value}`),
          }
        : {}),
    });
  }
  return {
    record,
    status: "ok",
    query: params.query,
    regex,
    caseSensitive,
    contextLines,
    maxMatches,
    matches,
    matchCount: matches.length,
    searchedLineCount,
    totalLines: lines.length,
    totalBytes,
    truncated,
  };
}

export function persistManagedToolOutputSync(params: {
  stateRoot?: string | null;
  sessionKey?: string | null;
  toolCallId?: string | null;
  toolName: string;
  text: string;
  outputKind?: string | null;
  reason?: string | null;
  now?: number;
}): PersistManagedToolOutputResult | null {
  const stateRoot = normalizeOptionalString(params.stateRoot);
  if (!stateRoot || params.text.length === 0) {
    return null;
  }
  const resolvedStateRoot = path.resolve(stateRoot);
  const createdAt = params.now ?? Date.now();
  const textHash = crypto.createHash("sha256").update(params.text, "utf8").digest("hex");
  const toolCallId = normalizeOptionalString(params.toolCallId);
  const sessionKey = normalizeOptionalString(params.sessionKey);
  const id = buildManagedOutputId({
    createdAt,
    toolName: params.toolName,
    textHash,
    toolCallId,
  });
  const { outputPath, metadataPath } = buildManagedOutputPaths({
    stateRoot: resolvedStateRoot,
    createdAt,
    id,
  });
  const ref = buildManagedToolOutputRef({ sessionKey, id });
  const byteCount = Buffer.byteLength(params.text, "utf8");
  const record: ManagedToolOutputRecord = {
    schemaVersion: 1,
    ref,
    id,
    createdAt,
    stateRoot: resolvedStateRoot,
    outputPath,
    metadataPath,
    toolName: params.toolName,
    ...(sessionKey ? { sessionKey } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    ...(normalizeOptionalString(params.outputKind)
      ? { outputKind: normalizeOptionalString(params.outputKind) }
      : {}),
    byteCount,
    textHash,
    ...(normalizeOptionalString(params.reason)
      ? { reason: normalizeOptionalString(params.reason) }
      : {}),
  };

  writeFileAtomicSync(outputPath, params.text);
  writeManagedOutputMetadataSync(record);
  return {
    ref,
    id,
    outputPath,
    byteCount,
    textHash,
  };
}

export function createManagedToolOutputStreamSync(params: {
  stateRoot?: string | null;
  sessionKey?: string | null;
  toolCallId?: string | null;
  toolName: string;
  outputKind?: string | null;
  reason?: string | null;
  now?: number;
}): ManagedToolOutputStream | null {
  const stateRoot = normalizeOptionalString(params.stateRoot);
  if (!stateRoot) {
    return null;
  }
  const resolvedStateRoot = path.resolve(stateRoot);
  const createdAt = params.now ?? Date.now();
  const toolCallId = normalizeOptionalString(params.toolCallId);
  const sessionKey = normalizeOptionalString(params.sessionKey);
  const id = `mout_${createdAt}_${sanitizePathSegment(params.toolName)}_${
    toolCallId ? `${sanitizePathSegment(toolCallId).slice(0, 32)}_` : ""
  }${crypto.randomUUID().replace(/-/gu, "").slice(0, 16)}`;
  const { outputPath, metadataPath } = buildManagedOutputPaths({
    stateRoot: resolvedStateRoot,
    createdAt,
    id,
  });
  const ref = buildManagedToolOutputRef({ sessionKey, id });
  const hash = crypto.createHash("sha256");
  let byteCount = 0;
  let finalized = false;
  let finalizedResult: PersistManagedToolOutputResult | null = null;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, "", { encoding: "utf8", mode: 0o600 });

  return {
    ref,
    id,
    outputPath,
    metadataPath,
    append: (chunk: string) => {
      if (finalized || chunk.length === 0) {
        return;
      }
      fs.appendFileSync(outputPath, chunk, { encoding: "utf8" });
      hash.update(chunk, "utf8");
      byteCount += Buffer.byteLength(chunk, "utf8");
    },
    finalize: () => {
      if (finalizedResult) {
        return finalizedResult;
      }
      const textHash = hash.digest("hex");
      finalized = true;
      const record: ManagedToolOutputRecord = {
        schemaVersion: 1,
        ref,
        id,
        createdAt,
        stateRoot: resolvedStateRoot,
        outputPath,
        metadataPath,
        toolName: params.toolName,
        ...(sessionKey ? { sessionKey } : {}),
        ...(toolCallId ? { toolCallId } : {}),
        ...(normalizeOptionalString(params.outputKind)
          ? { outputKind: normalizeOptionalString(params.outputKind) }
          : {}),
        byteCount,
        textHash,
        ...(normalizeOptionalString(params.reason)
          ? { reason: normalizeOptionalString(params.reason) }
          : {}),
      };
      writeManagedOutputMetadataSync(record);
      finalizedResult = {
        ref,
        id,
        outputPath,
        byteCount,
        textHash,
      };
      return finalizedResult;
    },
    discard: () => {
      if (finalized) {
        return;
      }
      finalized = true;
      try {
        fs.rmSync(outputPath, { force: true });
      } catch {
        // Best-effort cleanup only.
      }
    },
  };
}
