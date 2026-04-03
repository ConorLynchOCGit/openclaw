import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { openFileWithinRoot, SafeOpenError } from "../infra/fs-safe.js";
import { detectMime } from "../media/mime.js";
import { recommendDocumentIngestion } from "./document-ingestion-policy.js";

export const DOCUMENT_READ_STATE_VERSION = 1;
export const DEFAULT_DOCUMENT_READ_MAX_LINE_BYTES = 8 * 1024;
export const MAX_DOCUMENT_READ_FILE_BYTES = 128 * 1024 * 1024;

export type DocumentChunkingMode = "lines" | "bytes";
export type DocumentContentEncoding = "utf8" | "binary";
export type DocumentLineEnding = "lf" | "crlf" | "cr" | "mixed" | "none";

export type DocumentReadChunkPlan = {
  index: number;
  startByte: number;
  endByteExclusive: number;
  byteCount: number;
  startLine?: number;
  endLine?: number;
  sha256: string;
};

export type DocumentReadFingerprint = {
  absolutePath: string;
  workspacePath: string;
  bytes: number;
  lines: number;
  sha256: string;
  extension: string;
  mimeType?: string;
  encoding: DocumentContentEncoding;
  chunkingMode: DocumentChunkingMode;
  expectedChunkCount: number;
  maxLineBytes: number;
  lineEnding: DocumentLineEnding;
  mtimeMs: number;
};

export type DocumentReadCoverage = {
  expectedChunkCount: number;
  acquiredChunkCount: number;
  missingChunkIndexes: number[];
  contiguous: boolean;
  startedAtFileStart: boolean;
  endedAtFileEnd: boolean;
  allChunksAcquired: boolean;
  verifiedFullHash: boolean;
  fileStillMatchesFingerprint: boolean;
  complete: boolean;
};

export type DocumentReadFailureReason =
  | "file_changed"
  | "missing_chunks"
  | "invalid_chunk"
  | "not_text"
  | "file_too_large"
  | "path";

export type DocumentReadSessionState = {
  version: number;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  status: "started" | "in_progress" | "ready_to_verify" | "complete" | "incomplete" | "failed";
  failureReason?: DocumentReadFailureReason;
  failureDetail?: string;
  fingerprint: DocumentReadFingerprint;
  chunkDefaults: {
    lines: number;
    bytes: number;
    maxLineBytes: number;
  };
  chunks: DocumentReadChunkPlan[];
  acquiredChunkIndexes: number[];
  acquiredChunks: Record<
    string,
    {
      acquiredAt: string;
      sha256: string;
      byteCount: number;
    }
  >;
  coverage?: DocumentReadCoverage;
};

export type DocumentReadStartOptions = {
  rootDir: string;
  relativePath: string;
  chunkLines?: number;
  chunkBytes?: number;
  maxLineBytes?: number;
};

export type DocumentReadChunkResult = {
  session: DocumentReadSessionState;
  chunk: DocumentReadChunkPlan;
  text: string;
  lossyUtf8: boolean;
};

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".graphql",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".m",
  ".markdown",
  ".md",
  ".mdx",
  ".ml",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svg",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

function ensureStateRoot(rootDir: string) {
  return path.join(rootDir, ".openclaw", "document-read");
}

function ensureSessionDir(rootDir: string, sessionId: string) {
  return path.join(ensureStateRoot(rootDir), sessionId);
}

function sessionStatePath(rootDir: string, sessionId: string) {
  return path.join(ensureSessionDir(rootDir, sessionId), "session.json");
}

function coverageReportPath(rootDir: string, sessionId: string) {
  return path.join(ensureSessionDir(rootDir, sessionId), "coverage.json");
}

function planReportPath(rootDir: string, sessionId: string) {
  return path.join(ensureSessionDir(rootDir, sessionId), "plan.json");
}

function buildChunkSha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeRelativeWorkspacePath(relativePath: string) {
  return relativePath.replaceAll(path.sep, "/");
}

function summarizeLineEndings(flags: {
  lf: boolean;
  crlf: boolean;
  cr: boolean;
}): DocumentLineEnding {
  const enabled = [flags.lf, flags.crlf, flags.cr].filter(Boolean).length;
  if (enabled === 0) {
    return "none";
  }
  if (enabled > 1) {
    return "mixed";
  }
  if (flags.crlf) {
    return "crlf";
  }
  if (flags.cr) {
    return "cr";
  }
  return "lf";
}

function detectUtf8(buffer: Buffer): { encoding: DocumentContentEncoding; lossyUtf8: boolean } {
  if (buffer.length === 0) {
    return { encoding: "utf8", lossyUtf8: false };
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(buffer);
    return { encoding: "utf8", lossyUtf8: false };
  } catch {
    return { encoding: "binary", lossyUtf8: true };
  }
}

function chooseChunkingMode(params: {
  extension: string;
  mimeType?: string;
  encoding: DocumentContentEncoding;
  maxLineBytes: number;
  maxLineBytesLimit: number;
}) {
  const mimeType = params.mimeType?.toLowerCase();
  const looksTextMime =
    typeof mimeType === "string" &&
    (mimeType.startsWith("text/") ||
      mimeType.includes("json") ||
      mimeType.includes("xml") ||
      mimeType.includes("yaml"));
  const looksTextExtension = TEXT_EXTENSIONS.has(params.extension);
  if (
    params.encoding === "utf8" &&
    (looksTextMime || looksTextExtension) &&
    params.maxLineBytes <= params.maxLineBytesLimit
  ) {
    return "lines" as const;
  }
  return "bytes" as const;
}

function analyzeBuffer(buffer: Buffer): {
  lines: number;
  maxLineBytes: number;
  lineEnding: DocumentLineEnding;
  lineRanges: Array<{ startByte: number; endByteExclusive: number; lineNumber: number }>;
} {
  const lineRanges: Array<{ startByte: number; endByteExclusive: number; lineNumber: number }> = [];
  let startByte = 0;
  let lines = 0;
  let maxLineBytes = 0;
  const lineEndingFlags = { lf: false, crlf: false, cr: false };

  for (let index = 0; index < buffer.length; index += 1) {
    const value = buffer[index];
    if (value === 0x0a) {
      const endByteExclusive = index + 1;
      lines += 1;
      maxLineBytes = Math.max(maxLineBytes, endByteExclusive - startByte);
      if (index > 0 && buffer[index - 1] === 0x0d) {
        lineEndingFlags.crlf = true;
      } else {
        lineEndingFlags.lf = true;
      }
      lineRanges.push({ startByte, endByteExclusive, lineNumber: lines });
      startByte = endByteExclusive;
      continue;
    }
    if (value === 0x0d && (index + 1 >= buffer.length || buffer[index + 1] !== 0x0a)) {
      const endByteExclusive = index + 1;
      lines += 1;
      maxLineBytes = Math.max(maxLineBytes, endByteExclusive - startByte);
      lineEndingFlags.cr = true;
      lineRanges.push({ startByte, endByteExclusive, lineNumber: lines });
      startByte = endByteExclusive;
    }
  }

  if (buffer.length > 0 && startByte < buffer.length) {
    lines += 1;
    maxLineBytes = Math.max(maxLineBytes, buffer.length - startByte);
    lineRanges.push({ startByte, endByteExclusive: buffer.length, lineNumber: lines });
  }

  return {
    lines,
    maxLineBytes,
    lineEnding: summarizeLineEndings(lineEndingFlags),
    lineRanges,
  };
}

function buildChunkPlan(params: {
  buffer: Buffer;
  lineRanges: Array<{ startByte: number; endByteExclusive: number; lineNumber: number }>;
  lines: number;
  chunkingMode: DocumentChunkingMode;
  chunkLines: number;
  chunkBytes: number;
}) {
  const chunks: DocumentReadChunkPlan[] = [];
  if (params.buffer.length === 0) {
    return chunks;
  }

  if (params.chunkingMode === "lines" && params.lines > 0) {
    for (
      let lineOffset = 0;
      lineOffset < params.lineRanges.length;
      lineOffset += params.chunkLines
    ) {
      const first = params.lineRanges[lineOffset];
      const last =
        params.lineRanges[
          Math.min(params.lineRanges.length - 1, lineOffset + params.chunkLines - 1)
        ];
      if (!first || !last) {
        continue;
      }
      const chunkBuffer = params.buffer.subarray(first.startByte, last.endByteExclusive);
      chunks.push({
        index: chunks.length,
        startByte: first.startByte,
        endByteExclusive: last.endByteExclusive,
        byteCount: chunkBuffer.byteLength,
        startLine: first.lineNumber,
        endLine: last.lineNumber,
        sha256: buildChunkSha256(chunkBuffer),
      });
    }
    return chunks;
  }

  for (let offset = 0; offset < params.buffer.length; offset += params.chunkBytes) {
    const endByteExclusive = Math.min(params.buffer.length, offset + params.chunkBytes);
    const chunkBuffer = params.buffer.subarray(offset, endByteExclusive);
    chunks.push({
      index: chunks.length,
      startByte: offset,
      endByteExclusive,
      byteCount: chunkBuffer.byteLength,
      sha256: buildChunkSha256(chunkBuffer),
    });
  }
  return chunks;
}

async function readWorkspaceFileBuffer(params: { rootDir: string; relativePath: string }) {
  const opened = await openFileWithinRoot({
    rootDir: params.rootDir,
    relativePath: params.relativePath,
  });
  try {
    if (opened.stat.size > MAX_DOCUMENT_READ_FILE_BYTES) {
      throw new SafeOpenError("too-large", `file exceeds ${MAX_DOCUMENT_READ_FILE_BYTES} bytes`);
    }
    const buffer = Buffer.from(await opened.handle.readFile());
    return {
      buffer,
      realPath: opened.realPath,
      stat: opened.stat,
    };
  } finally {
    await opened.handle.close().catch(() => {});
  }
}

async function buildDocumentPlan(options: DocumentReadStartOptions) {
  const normalizedRelativePath = normalizeRelativeWorkspacePath(options.relativePath);
  const { buffer, realPath, stat } = await readWorkspaceFileBuffer({
    rootDir: options.rootDir,
    relativePath: normalizedRelativePath,
  });
  const recommendation = recommendDocumentIngestion({
    workspaceVisible: true,
    fileBytes: buffer.byteLength,
  });
  const chunkLines = Math.max(
    1,
    Math.trunc(options.chunkLines ?? recommendation.documentReadDefaults.chunkLines),
  );
  const chunkBytes = Math.max(
    1,
    Math.trunc(options.chunkBytes ?? recommendation.documentReadDefaults.chunkBytes),
  );
  const maxLineBytes = Math.max(
    1,
    Math.trunc(options.maxLineBytes ?? DEFAULT_DOCUMENT_READ_MAX_LINE_BYTES),
  );
  const {
    lines,
    maxLineBytes: observedMaxLineBytes,
    lineEnding,
    lineRanges,
  } = analyzeBuffer(buffer);
  const { encoding } = detectUtf8(buffer);
  const extension = path.extname(normalizedRelativePath).toLowerCase();
  const mimeType =
    buffer.byteLength > 0 ? await detectMime({ buffer: buffer.subarray(0, 256) }) : undefined;
  const chunkingMode = chooseChunkingMode({
    extension,
    mimeType,
    encoding,
    maxLineBytes: observedMaxLineBytes,
    maxLineBytesLimit: maxLineBytes,
  });
  const sha256 = buildChunkSha256(buffer);
  const chunks = buildChunkPlan({
    buffer,
    lineRanges,
    lines,
    chunkingMode,
    chunkLines,
    chunkBytes,
  });
  const fingerprint: DocumentReadFingerprint = {
    absolutePath: realPath,
    workspacePath: normalizedRelativePath,
    bytes: buffer.byteLength,
    lines,
    sha256,
    extension,
    mimeType,
    encoding,
    chunkingMode,
    expectedChunkCount: chunks.length,
    maxLineBytes: observedMaxLineBytes,
    lineEnding,
    mtimeMs: stat.mtimeMs,
  };
  return {
    chunkDefaults: {
      lines: chunkLines,
      bytes: chunkBytes,
      maxLineBytes,
    },
    chunks,
    fingerprint,
  };
}

async function writeJsonFile(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function persistSession(rootDir: string, state: DocumentReadSessionState) {
  const sessionDir = ensureSessionDir(rootDir, state.sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  await writeJsonFile(sessionStatePath(rootDir, state.sessionId), state);
  await writeJsonFile(planReportPath(rootDir, state.sessionId), {
    sessionId: state.sessionId,
    fingerprint: state.fingerprint,
    chunkDefaults: state.chunkDefaults,
    chunks: state.chunks,
  });
  await writeJsonFile(coverageReportPath(rootDir, state.sessionId), {
    sessionId: state.sessionId,
    status: state.status,
    failureReason: state.failureReason,
    failureDetail: state.failureDetail,
    coverage: state.coverage,
    acquiredChunkIndexes: state.acquiredChunkIndexes,
  });
}

function ensureChunkIndexWithinPlan(state: DocumentReadSessionState, chunkIndex: number) {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= state.chunks.length) {
    throw new Error(
      `chunkIndex ${chunkIndex} is outside the planned range 0-${Math.max(0, state.chunks.length - 1)}`,
    );
  }
}

async function loadSession(rootDir: string, sessionId: string) {
  const raw = await fs.readFile(sessionStatePath(rootDir, sessionId), "utf8");
  return JSON.parse(raw) as DocumentReadSessionState;
}

async function assertSessionFileStillMatches(rootDir: string, state: DocumentReadSessionState) {
  const opened = await openFileWithinRoot({
    rootDir,
    relativePath: state.fingerprint.workspacePath,
  });
  try {
    const sizeMatches = opened.stat.size === state.fingerprint.bytes;
    const mtimeMatches = opened.stat.mtimeMs === state.fingerprint.mtimeMs;
    if (!sizeMatches || !mtimeMatches) {
      return {
        ok: false as const,
        detail:
          `fingerprint mismatch: bytes ${opened.stat.size}/${state.fingerprint.bytes}, ` +
          `mtime ${opened.stat.mtimeMs}/${state.fingerprint.mtimeMs}`,
      };
    }
    return { ok: true as const };
  } finally {
    await opened.handle.close().catch(() => {});
  }
}

function recordFailure(
  state: DocumentReadSessionState,
  reason: DocumentReadFailureReason,
  detail: string,
): DocumentReadSessionState {
  return {
    ...state,
    status: "failed",
    failureReason: reason,
    failureDetail: detail,
    updatedAt: new Date().toISOString(),
  };
}

export async function startDocumentReadSession(
  options: DocumentReadStartOptions,
): Promise<DocumentReadSessionState> {
  const startedAt = new Date().toISOString();
  const sessionId = randomUUID();
  const plan = await buildDocumentPlan(options);
  const state: DocumentReadSessionState = {
    version: DOCUMENT_READ_STATE_VERSION,
    sessionId,
    createdAt: startedAt,
    updatedAt: startedAt,
    status: plan.fingerprint.expectedChunkCount === 0 ? "complete" : "started",
    fingerprint: plan.fingerprint,
    chunkDefaults: plan.chunkDefaults,
    chunks: plan.chunks,
    acquiredChunkIndexes: [],
    acquiredChunks: {},
    coverage: {
      expectedChunkCount: plan.fingerprint.expectedChunkCount,
      acquiredChunkCount: 0,
      missingChunkIndexes: plan.chunks.map((chunk) => chunk.index),
      contiguous: plan.chunks.length === 0,
      startedAtFileStart: plan.chunks.length === 0,
      endedAtFileEnd: plan.chunks.length === 0,
      allChunksAcquired: plan.chunks.length === 0,
      verifiedFullHash: plan.chunks.length === 0,
      fileStillMatchesFingerprint: true,
      complete: plan.chunks.length === 0,
    },
  };
  await persistSession(options.rootDir, state);
  return state;
}

async function readChunkBuffer(
  rootDir: string,
  state: DocumentReadSessionState,
  chunk: DocumentReadChunkPlan,
) {
  const opened = await openFileWithinRoot({
    rootDir,
    relativePath: state.fingerprint.workspacePath,
  });
  try {
    const buffer = Buffer.alloc(chunk.byteCount);
    const { bytesRead } = await opened.handle.read(buffer, 0, chunk.byteCount, chunk.startByte);
    if (bytesRead !== chunk.byteCount) {
      throw new Error(`expected ${chunk.byteCount} bytes, read ${bytesRead}`);
    }
    return buffer;
  } finally {
    await opened.handle.close().catch(() => {});
  }
}

function decodeChunkText(buffer: Buffer, encoding: DocumentContentEncoding) {
  if (encoding === "utf8") {
    return { text: buffer.toString("utf8"), lossyUtf8: false };
  }
  return { text: buffer.toString("utf8"), lossyUtf8: true };
}

function updateCoverage(
  state: DocumentReadSessionState,
  fileStillMatchesFingerprint: boolean,
): DocumentReadCoverage {
  const acquiredSet = new Set(state.acquiredChunkIndexes);
  const missingChunkIndexes = state.chunks
    .map((chunk) => chunk.index)
    .filter((chunkIndex) => !acquiredSet.has(chunkIndex));
  const firstChunk = state.chunks[0];
  const lastChunk = state.chunks[state.chunks.length - 1];
  const contiguous =
    missingChunkIndexes.length === 0 &&
    state.acquiredChunkIndexes.length === state.chunks.length &&
    state.acquiredChunkIndexes.every((chunkIndex, index) => chunkIndex === index);
  const coverage: DocumentReadCoverage = {
    expectedChunkCount: state.chunks.length,
    acquiredChunkCount: state.acquiredChunkIndexes.length,
    missingChunkIndexes,
    contiguous,
    startedAtFileStart: !firstChunk || firstChunk.startByte === 0,
    endedAtFileEnd: !lastChunk || lastChunk.endByteExclusive === state.fingerprint.bytes,
    allChunksAcquired: false,
    verifiedFullHash: false,
    fileStillMatchesFingerprint,
    complete: false,
  };
  coverage.allChunksAcquired =
    coverage.contiguous &&
    coverage.startedAtFileStart &&
    coverage.endedAtFileEnd &&
    coverage.fileStillMatchesFingerprint &&
    coverage.expectedChunkCount === coverage.acquiredChunkCount;
  coverage.complete = coverage.allChunksAcquired && coverage.verifiedFullHash;
  return coverage;
}

export async function readDocumentChunk(params: {
  rootDir: string;
  sessionId: string;
  chunkIndex?: number;
  nextMissing?: boolean;
}): Promise<DocumentReadChunkResult> {
  let state = await loadSession(params.rootDir, params.sessionId);
  const fingerprintCheck = await assertSessionFileStillMatches(params.rootDir, state);
  if (!fingerprintCheck.ok) {
    state = recordFailure(state, "file_changed", fingerprintCheck.detail);
    await persistSession(params.rootDir, state);
    throw new Error(`document_read session became stale: ${fingerprintCheck.detail}`);
  }

  const acquired = new Set(state.acquiredChunkIndexes);
  const resolvedChunkIndex =
    params.nextMissing === true
      ? state.chunks.find((chunk) => !acquired.has(chunk.index))?.index
      : params.chunkIndex;
  if (resolvedChunkIndex === undefined) {
    throw new Error("no missing chunk remains for this session");
  }
  ensureChunkIndexWithinPlan(state, resolvedChunkIndex);
  const chunk = state.chunks[resolvedChunkIndex];
  const buffer = await readChunkBuffer(params.rootDir, state, chunk);
  const actualSha256 = buildChunkSha256(buffer);
  if (actualSha256 !== chunk.sha256) {
    state = recordFailure(
      state,
      "file_changed",
      `chunk ${resolvedChunkIndex} hash changed from ${chunk.sha256} to ${actualSha256}`,
    );
    await persistSession(params.rootDir, state);
    throw new Error(`document_read detected file drift while reading chunk ${resolvedChunkIndex}`);
  }
  const nextAcquired = Array.from(
    new Set([...state.acquiredChunkIndexes, resolvedChunkIndex]),
  ).toSorted((left, right) => left - right);
  const acquiredAt = new Date().toISOString();
  state = {
    ...state,
    updatedAt: acquiredAt,
    acquiredChunkIndexes: nextAcquired,
    acquiredChunks: {
      ...state.acquiredChunks,
      [String(resolvedChunkIndex)]: {
        acquiredAt,
        sha256: actualSha256,
        byteCount: chunk.byteCount,
      },
    },
  };
  state.coverage = updateCoverage(state, true);
  state.status = state.coverage.allChunksAcquired ? "ready_to_verify" : "in_progress";
  await persistSession(params.rootDir, state);
  const { text, lossyUtf8 } = decodeChunkText(buffer, state.fingerprint.encoding);
  return {
    session: state,
    chunk,
    text,
    lossyUtf8,
  };
}

export async function verifyDocumentReadSession(params: {
  rootDir: string;
  sessionId: string;
}): Promise<DocumentReadSessionState> {
  let state = await loadSession(params.rootDir, params.sessionId);
  const fingerprintCheck = await assertSessionFileStillMatches(params.rootDir, state);
  if (!fingerprintCheck.ok) {
    state = recordFailure(state, "file_changed", fingerprintCheck.detail);
    state.coverage = updateCoverage(state, false);
    await persistSession(params.rootDir, state);
    return state;
  }

  const { buffer } = await readWorkspaceFileBuffer({
    rootDir: params.rootDir,
    relativePath: state.fingerprint.workspacePath,
  });
  const fullSha256 = buildChunkSha256(buffer);
  const coverage = updateCoverage(state, fullSha256 === state.fingerprint.sha256);
  coverage.verifiedFullHash = fullSha256 === state.fingerprint.sha256;
  coverage.complete = coverage.allChunksAcquired && coverage.verifiedFullHash;
  state = {
    ...state,
    updatedAt: new Date().toISOString(),
    status: coverage.complete ? "complete" : "incomplete",
    coverage,
    failureReason: coverage.complete ? undefined : "missing_chunks",
    failureDetail:
      coverage.complete || coverage.fileStillMatchesFingerprint
        ? undefined
        : "file fingerprint changed before verification completed",
  };
  await persistSession(params.rootDir, state);
  return state;
}

export async function getDocumentReadSession(params: {
  rootDir: string;
  sessionId: string;
}): Promise<DocumentReadSessionState> {
  return await loadSession(params.rootDir, params.sessionId);
}

export async function cleanupDocumentReadSession(params: { rootDir: string; sessionId: string }) {
  await fs.rm(ensureSessionDir(params.rootDir, params.sessionId), {
    recursive: true,
    force: true,
  });
}
