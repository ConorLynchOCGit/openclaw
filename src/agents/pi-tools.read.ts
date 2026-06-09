import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { createEditTool, createReadTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import { isWindowsDrivePath } from "../infra/archive-path.js";
import {
  appendFileWithinRoot,
  SafeOpenError,
  openFileWithinRoot,
  readFileWithinRoot,
  writeFileWithinRoot,
} from "../infra/fs-safe.js";
import { expandHomePrefix, resolveOsHomeDir } from "../infra/home-dir.js";
import { hasEncodedFileUrlSeparator, trySafeFileURLToPath } from "../infra/local-file-access.js";
import { resolveRepoCanonicalReadPath } from "../infra/repo-canonical-paths.js";
import { detectMime } from "../media/mime.js";
import { sniffMimeFromBase64 } from "../media/sniff-mime-from-base64.js";
import type { ImageSanitizationLimits } from "./image-sanitization.js";
import { toRelativeWorkspacePath } from "./path-policy.js";
import { wrapEditToolWithRecovery, wrapWriteToolWithMetadata } from "./pi-tools.host-edit.js";
import {
  REQUIRED_PARAM_GROUPS,
  assertRequiredParams,
  getToolParamsRecord,
  wrapToolParamValidation,
} from "./pi-tools.params.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { assertSandboxPath } from "./sandbox-paths.js";
import type { SandboxFsBridge } from "./sandbox/fs-bridge.js";
import { sanitizeToolResultImages } from "./tool-images.js";
import {
  assertWritableWorkspaceMemoryPath,
  isDailyWorkspaceMemoryNote,
} from "./workspace-memory-generated-zones.js";

export {
  REQUIRED_PARAM_GROUPS,
  assertRequiredParams,
  getToolParamsRecord,
  wrapToolParamValidation,
} from "./pi-tools.params.js";

// NOTE(steipete): Upstream read now does file-magic MIME detection; we keep the wrapper
// to sanitize oversized images before they hit providers.
type ToolContentBlock = AgentToolResult<unknown>["content"][number];
type ImageContentBlock = Extract<ToolContentBlock, { type: "image" }>;
type TextContentBlock = Extract<ToolContentBlock, { type: "text" }>;

const DEFAULT_READ_PAGE_LINE_LIMIT = 2000;
const DEFAULT_READ_PAGE_MAX_BYTES = 50 * 1024;
const MAX_ADAPTIVE_READ_MAX_BYTES = DEFAULT_READ_PAGE_MAX_BYTES;
const ADAPTIVE_READ_CONTEXT_SHARE = 0.1;
const CHARS_PER_TOKEN_ESTIMATE = 4;

type OpenClawReadToolOptions = {
  modelContextWindowTokens?: number;
  imageSanitization?: ImageSanitizationLimits;
  workspaceRoot?: string;
  defaultLineLimit?: number;
  maxBytes?: number;
};

type ReadDocumentIngestArbitrationTrigger = "capped_output" | "continued_read" | "repeated_read";

type ReadDocumentIngestArbitrationSkipReason =
  | "missing_path"
  | "missing_ingest_tool"
  | "outside_workspace"
  | "non_text_document"
  | "non_text_result"
  | "no_auto_ingest_trigger"
  | "fingerprint_unavailable"
  | "prior_auto_ingest_failed";

type ReadDocumentIngestArbitrationOutcome =
  | "read_only"
  | "read_then_ingest"
  | "reuse_existing_ingest";

type ReadDocumentIngestArbitrationDetails = {
  outcome: ReadDocumentIngestArbitrationOutcome;
  workspaceRelativePath?: string;
  fingerprint?: string;
  triggers?: ReadDocumentIngestArbitrationTrigger[];
  ingestStatus: "skipped" | "scheduled" | "pending" | "completed" | "failed";
  skipReason?: ReadDocumentIngestArbitrationSkipReason;
  runId?: string;
  recordPath?: string;
  projectId?: string;
};

type ReadDocumentIngestArbitrationCacheEntry = {
  fingerprint: string;
  runId: string;
  recordPath: string;
  projectId?: string;
  status: "pending" | "completed" | "failed";
};

type ReadDocumentIngestArbitrationOptions = {
  workspaceRoot: string;
  ingestTool?: AnyAgentTool | null;
  warn?: (message: string) => void;
};

const READ_CONTINUATION_NOTICE_RE =
  /\n\n\[(?:Showing lines [^\]]*?Use offset=\d+ to continue\.|\d+ more lines in file\. Use offset=\d+ to continue\.)\]\s*$/;
const READ_OUTPUT_CAPPED_NOTICE_RE =
  /\[Read output capped at [^\]]+ Use offset=\d+ to continue\.\]\s*$/;
const AUTO_INGEST_TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".cts",
  ".env",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".less",
  ".log",
  ".lua",
  ".markdown",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".swift",
  ".text",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);
const AUTO_INGEST_TEXT_BASENAMES = new Set([
  "AGENTS.md",
  "CURRENT_SLICE.md",
  "DECISIONS.md",
  "Dockerfile",
  "HEARTBEAT.md",
  "IDENTITY.md",
  "Makefile",
  "MEMORY.md",
  "README",
  "README.md",
  "ROADMAP.md",
  "SOUL.md",
  "STARTUP.md",
  "STATUS.md",
  "TOOLS.md",
  "USER.md",
  "roadmap.md",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveReadDefaultLineLimit(options?: OpenClawReadToolOptions): number {
  return clamp(
    Math.trunc(options?.defaultLineLimit ?? DEFAULT_READ_PAGE_LINE_LIMIT),
    1,
    DEFAULT_READ_PAGE_LINE_LIMIT,
  );
}

function resolveConfiguredReadMaxBytes(options?: OpenClawReadToolOptions): number {
  return clamp(
    Math.trunc(options?.maxBytes ?? DEFAULT_READ_PAGE_MAX_BYTES),
    1,
    DEFAULT_READ_PAGE_MAX_BYTES,
  );
}

function resolveAdaptiveReadMaxBytes(options?: OpenClawReadToolOptions): number {
  const configuredMaxBytes = resolveConfiguredReadMaxBytes(options);
  const contextWindowTokens = options?.modelContextWindowTokens;
  if (
    typeof contextWindowTokens !== "number" ||
    !Number.isFinite(contextWindowTokens) ||
    contextWindowTokens <= 0
  ) {
    return configuredMaxBytes;
  }
  const fromContext = Math.floor(
    contextWindowTokens * CHARS_PER_TOKEN_ESTIMATE * ADAPTIVE_READ_CONTEXT_SHARE,
  );
  return clamp(fromContext, 1, Math.min(configuredMaxBytes, MAX_ADAPTIVE_READ_MAX_BYTES));
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${bytes}B`;
}

function getToolResultText(result: AgentToolResult<unknown>): string | undefined {
  const content = Array.isArray(result.content) ? result.content : [];
  const textBlocks = content
    .map((block) => {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        return (block as { text: string }).text;
      }
      return undefined;
    })
    .filter((value): value is string => typeof value === "string");
  if (textBlocks.length === 0) {
    return undefined;
  }
  return textBlocks.join("\n");
}

function hasImageContent(result: AgentToolResult<unknown>): boolean {
  const content = Array.isArray(result.content) ? result.content : [];
  return content.some(
    (block) => block && typeof block === "object" && (block as { type?: unknown }).type === "image",
  );
}

function withToolResultText(
  result: AgentToolResult<unknown>,
  text: string,
): AgentToolResult<unknown> {
  const content = Array.isArray(result.content) ? result.content : [];
  let replaced = false;
  const nextContent: ToolContentBlock[] = content.map((block) => {
    if (
      !replaced &&
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text"
    ) {
      replaced = true;
      return {
        ...(block as TextContentBlock),
        text,
      };
    }
    return block;
  });
  if (replaced) {
    return {
      ...result,
      content: nextContent as unknown as AgentToolResult<unknown>["content"],
    };
  }
  const textBlock = { type: "text", text } as unknown as TextContentBlock;
  return {
    ...result,
    content: [textBlock] as unknown as AgentToolResult<unknown>["content"],
  };
}

function truncateUtf8ByBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, truncated: false };
  }
  let bytes = 0;
  let output = "";
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) {
      break;
    }
    output += char;
    bytes += charBytes;
  }
  return { text: output.replace(/\s+$/u, ""), truncated: true };
}

function countCompleteOutputLines(text: string): number {
  const stripped = stripReadContinuationNotice(text).trimEnd();
  if (!stripped) {
    return 0;
  }
  return stripped.split(/\r?\n/u).length;
}

function capReadResultTextByBytes(params: {
  result: AgentToolResult<unknown>;
  maxBytes: number;
  fallbackContinuationOffset?: number;
}): AgentToolResult<unknown> {
  const rawText = getToolResultText(params.result);
  if (typeof rawText !== "string") {
    return params.result;
  }
  const capped = truncateUtf8ByBytes(rawText, params.maxBytes);
  if (!capped.truncated) {
    return params.result;
  }
  const lineCount = countCompleteOutputLines(capped.text);
  const derivedContinuationOffset = lineCount > 0 ? lineCount + 1 : null;
  const continuationOffset =
    typeof derivedContinuationOffset === "number"
      ? derivedContinuationOffset
      : typeof params.fallbackContinuationOffset === "number" &&
          Number.isFinite(params.fallbackContinuationOffset)
        ? Math.max(1, Math.floor(params.fallbackContinuationOffset))
        : 1;
  return withToolResultText(
    params.result,
    `${capped.text}\n\n[Read output capped at ${formatBytes(
      params.maxBytes,
    )} for this call. Use offset=${continuationOffset} to continue.]`,
  );
}

function stripReadContinuationNotice(text: string): string {
  return text.replace(READ_CONTINUATION_NOTICE_RE, "").replace(READ_OUTPUT_CAPPED_NOTICE_RE, "");
}

function splitReadTextAndContinuationNotice(text: string): { body: string; notice?: string } {
  const capped = READ_OUTPUT_CAPPED_NOTICE_RE.exec(text);
  if (capped) {
    return {
      body: text.slice(0, capped.index).trimEnd(),
      notice: capped[0].trim(),
    };
  }
  const continuation = READ_CONTINUATION_NOTICE_RE.exec(text);
  if (continuation) {
    return {
      body: text.slice(0, continuation.index).trimEnd(),
      notice: continuation[0].trim(),
    };
  }
  return { body: text };
}

function parseReadContinuationMetadata(text: string): {
  moreLines?: number;
  totalLines?: number;
  nextOffset?: number;
  truncatedBy?: "bytes" | "lines";
} {
  const capped = READ_OUTPUT_CAPPED_NOTICE_RE.exec(text);
  if (capped) {
    const nextOffsetMatch = /Use offset=(\d+) to continue/iu.exec(capped[0]);
    return {
      nextOffset: nextOffsetMatch ? Number(nextOffsetMatch[1]) : undefined,
      truncatedBy: "bytes",
    };
  }
  const showing =
    /\[Showing lines \d+-(\d+) of (\d+)\. Use offset=(\d+) to continue\.\]\s*$/iu.exec(text);
  if (showing) {
    return {
      totalLines: Number(showing[2]),
      nextOffset: Number(showing[3]),
      truncatedBy: "lines",
    };
  }
  const more = /\[(\d+) more lines in file\. Use offset=(\d+) to continue\.\]\s*$/iu.exec(text);
  if (more) {
    return {
      moreLines: Number(more[1]),
      nextOffset: Number(more[2]),
      truncatedBy: "lines",
    };
  }
  const outputCapped =
    /\(Output capped at [^)]+ Showing lines \d+-(\d+)\. Use offset=(\d+) to continue\.\)\s*$/iu.exec(
      text,
    );
  if (outputCapped) {
    return {
      nextOffset: Number(outputCapped[2]),
      truncatedBy: "bytes",
    };
  }
  return {};
}

function buildReadMetadata(params: {
  result: AgentToolResult<unknown>;
  args: Record<string, unknown>;
  maxBytes: number;
}): Record<string, unknown> | null {
  if (hasImageContent(params.result)) {
    return null;
  }
  const rawText = getToolResultText(params.result);
  if (typeof rawText !== "string") {
    return null;
  }
  const contentText = stripReadContinuationNotice(rawText).trimEnd();
  if (!contentText) {
    return null;
  }
  const lineStartRaw = params.args.offset;
  const lineStart =
    typeof lineStartRaw === "number" && Number.isFinite(lineStartRaw) && lineStartRaw > 0
      ? Math.floor(lineStartRaw)
      : 1;
  const returnedLines = contentText.split(/\r?\n/u).length;
  const lineEnd = lineStart + returnedLines - 1;
  const continuation = parseReadContinuationMetadata(rawText);
  const nextOffset =
    typeof continuation.nextOffset === "number" && Number.isFinite(continuation.nextOffset)
      ? Math.floor(continuation.nextOffset)
      : null;
  const totalLines =
    typeof continuation.totalLines === "number" && Number.isFinite(continuation.totalLines)
      ? Math.floor(continuation.totalLines)
      : typeof continuation.moreLines === "number" &&
          Number.isFinite(continuation.moreLines) &&
          nextOffset
        ? nextOffset + Math.floor(continuation.moreLines) - 1
        : nextOffset
          ? null
          : lineEnd;
  const truncated = nextOffset !== null || continuation.truncatedBy === "bytes";
  return {
    type: "file",
    lineStart,
    lineEnd,
    totalLines,
    returnedLines,
    truncated,
    truncatedBy: truncated ? (continuation.truncatedBy ?? "lines") : null,
    nextOffset,
    validOffsetRange:
      typeof totalLines === "number"
        ? {
            start: totalLines > 0 ? 1 : 0,
            end: totalLines,
          }
        : null,
    suggestedOffset: nextOffset,
    bytesRead: Buffer.byteLength(contentText, "utf8"),
    maxBytes: params.maxBytes,
  };
}

function enrichReadToolResultDetails(params: {
  result: AgentToolResult<unknown>;
  args: Record<string, unknown>;
  maxBytes: number;
}): AgentToolResult<unknown> {
  const existingRead = (params.result as { details?: { read?: unknown } }).details?.read;
  if (existingRead && typeof existingRead === "object") {
    return params.result;
  }
  const read = buildReadMetadata(params);
  if (!read) {
    return params.result;
  }
  return mergeReadToolDetails(params.result, { read });
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lineNumberReadResultText(params: {
  result: AgentToolResult<unknown>;
  pathLabel: string;
}): AgentToolResult<unknown> {
  if (hasImageContent(params.result)) {
    return params.result;
  }
  const details = (params.result as { details?: { read?: Record<string, unknown> } }).details;
  const read = details?.read;
  if (!read || read.type !== "file" || (details as Record<string, unknown>)?.status === "eof") {
    return params.result;
  }
  const rawText = getToolResultText(params.result);
  if (typeof rawText !== "string" || !rawText.trim() || rawText.trimStart().startsWith("<path>")) {
    return params.result;
  }
  const lineStart = read.lineStart;
  if (typeof lineStart !== "number" || !Number.isFinite(lineStart) || lineStart < 1) {
    return params.result;
  }
  const { body, notice } = splitReadTextAndContinuationNotice(rawText);
  if (!body.trim()) {
    return params.result;
  }
  const numbered = body
    .split(/\r?\n/u)
    .map((line, index) => `${Math.floor(lineStart) + index}: ${line}`)
    .join("\n");
  const wrapped = [
    `<path>${escapeXmlText(params.pathLabel)}</path>`,
    "<type>file</type>",
    "<content>",
    numbered,
    "</content>",
    notice ? `\n${notice}` : undefined,
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
  return withToolResultText(params.result, wrapped);
}

function stripReadTruncationContentDetails(
  result: AgentToolResult<unknown>,
): AgentToolResult<unknown> {
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") {
    return result;
  }

  const detailsRecord = details as Record<string, unknown>;
  const truncationRaw = detailsRecord.truncation;
  if (!truncationRaw || typeof truncationRaw !== "object") {
    return result;
  }

  const truncation = truncationRaw as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(truncation, "content")) {
    return result;
  }

  const { content: _content, ...restTruncation } = truncation;
  return {
    ...result,
    details: {
      ...detailsRecord,
      truncation: restTruncation,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeReadToolDetails<TDetails extends Record<string, unknown>>(
  result: AgentToolResult<unknown>,
  details: TDetails,
): AgentToolResult<unknown> {
  const existingDetails = (result as { details?: unknown }).details;
  return {
    ...result,
    details: {
      ...(isRecord(existingDetails) ? existingDetails : {}),
      ...details,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingReadPathError(error: unknown): boolean {
  const message = errorMessage(error);
  const code = isRecord(error) ? error.code : undefined;
  return (
    code === "ENOENT" ||
    /\bENOENT\b/i.test(message) ||
    /\bfile not found\b/i.test(message) ||
    /\bno such file or directory\b/i.test(message) ||
    /\bnot-found\b/i.test(message)
  );
}

function scoreMissingPathCandidate(input: { targetName: string; candidateName: string }): number {
  const target = input.targetName.toLowerCase();
  const candidate = input.candidateName.toLowerCase();
  if (!target || !candidate) {
    return 0;
  }
  let score = 0;
  if (candidate === target) {
    score += 100;
  }
  if (candidate.startsWith(target) || target.startsWith(candidate)) {
    score += 40;
  }
  if (path.extname(candidate) && path.extname(candidate) === path.extname(target)) {
    score += 8;
  }
  const targetTerms = target
    .replace(/\.[^.]+$/u, "")
    .split(/[^a-z0-9]+/u)
    .filter((term) => term.length >= 3);
  for (const term of targetTerms) {
    if (candidate.includes(term)) {
      score += 6;
    }
  }
  return score;
}

async function findMissingReadPathSuggestions(params: {
  requestedPath: string;
  workspaceRoot: string;
}): Promise<string[]> {
  const canonical = resolveRepoCanonicalReadPath({
    inputPath: params.requestedPath,
    workspaceRoot: params.workspaceRoot,
  });
  const requestedAbsolutePath =
    canonical?.absolutePath ??
    resolveToolPathAgainstWorkspaceRoot({
      filePath: params.requestedPath,
      root: params.workspaceRoot,
    });
  const parentDir = path.dirname(requestedAbsolutePath);
  const entries = await fs.readdir(parentDir, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) {
    return [];
  }
  const targetName = path.basename(requestedAbsolutePath);
  return entries
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .map((entry) => {
      const absolutePath = path.join(parentDir, entry.name);
      const relativePath = path
        .relative(params.workspaceRoot, absolutePath)
        .split(path.sep)
        .join("/");
      return {
        path:
          relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
            ? relativePath
            : absolutePath,
        score: scoreMissingPathCandidate({
          targetName,
          candidateName: entry.name,
        }),
      };
    })
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 3)
    .map((entry) => entry.path);
}

async function addMissingReadPathSuggestions(params: {
  error: unknown;
  requestedPath: string | undefined;
  workspaceRoot: string | undefined;
}): Promise<never> {
  if (!params.requestedPath || !params.workspaceRoot || !isMissingReadPathError(params.error)) {
    throw params.error;
  }
  const suggestions = await findMissingReadPathSuggestions({
    requestedPath: params.requestedPath,
    workspaceRoot: params.workspaceRoot,
  });
  if (suggestions.length === 0) {
    throw params.error;
  }
  throw new Error(
    `${errorMessage(params.error)}\n\nDid you mean one of these?\n${suggestions
      .map((suggestion) => `- ${suggestion}`)
      .join("\n")}`,
  );
}

function parseReadOffsetBeyondEof(
  error: unknown,
): { requestedOffset: number; totalLines: number } | null {
  const message = errorMessage(error);
  const patterns = [
    /\bOffset\s+(\d+)\s+is\s+beyond\s+end\s+of\s+file\s+\((\d+)\s+lines?\s+total\)/iu,
    /\bOffset\s+(\d+)\s+is\s+out\s+of\s+range\s+for\s+this\s+file\s+\((\d+)\s+lines?\)/iu,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    if (!match) {
      continue;
    }
    const requestedOffset = Number(match[1]);
    const totalLines = Number(match[2]);
    if (
      Number.isFinite(requestedOffset) &&
      requestedOffset > 0 &&
      Number.isFinite(totalLines) &&
      totalLines >= 0
    ) {
      return {
        requestedOffset: Math.floor(requestedOffset),
        totalLines: Math.floor(totalLines),
      };
    }
  }
  return null;
}

function buildReadEofResult(params: {
  requestedPath: string | undefined;
  requestedOffset: number;
  totalLines: number;
}): AgentToolResult<unknown> {
  const pathLabel = params.requestedPath ?? "<unknown>";
  const validOffsetRange =
    params.totalLines > 0
      ? {
          start: 1,
          end: params.totalLines,
        }
      : {
          start: 0,
          end: 0,
        };
  const suggestedOffset = params.totalLines > 0 ? params.totalLines : null;
  const guidance =
    params.totalLines > 0
      ? `No lines were returned. Offset ${params.requestedOffset} is past EOF; the last valid offset is ${params.totalLines}. Use a smaller exact window at or before offset=${params.totalLines}, or stop reading this file.`
      : `No lines were returned. The file is empty; stop reading this file.`;
  return {
    content: [
      {
        type: "text",
        text: [
          `Read reached end of file for ${pathLabel}.`,
          "",
          `requestedOffset: ${params.requestedOffset}`,
          `totalLines: ${params.totalLines}`,
          "returnedLines: 0",
          `validOffsetRange: ${validOffsetRange.start}-${validOffsetRange.end}`,
          "",
          guidance,
        ].join("\n"),
      },
    ],
    details: {
      status: "eof",
      path: pathLabel,
      requestedOffset: params.requestedOffset,
      totalLines: params.totalLines,
      returnedLines: 0,
      truncated: false,
      nextOffset: null,
      validOffsetRange,
      suggestedOffset,
      guidance,
    },
  };
}

async function normalizeReadToolFailure(params: {
  error: unknown;
  requestedPath: string | undefined;
  workspaceRoot: string | undefined;
}): Promise<AgentToolResult<unknown>> {
  const eof = parseReadOffsetBeyondEof(params.error);
  if (eof) {
    return buildReadEofResult({
      requestedPath: params.requestedPath,
      requestedOffset: eof.requestedOffset,
      totalLines: eof.totalLines,
    });
  }
  return addMissingReadPathSuggestions({
    error: params.error,
    requestedPath: params.requestedPath,
    workspaceRoot: params.workspaceRoot,
  });
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

async function tryReadDirectoryWithPagination(params: {
  args: Record<string, unknown>;
  pathLabel: string;
  workspaceRoot: string | undefined;
  defaultLineLimit: number;
}): Promise<AgentToolResult<unknown> | null> {
  if (!params.workspaceRoot) {
    return null;
  }
  const requestedPath = params.args.path;
  if (typeof requestedPath !== "string" || !requestedPath.trim()) {
    return null;
  }
  const workspaceRoot = path.resolve(params.workspaceRoot);
  const absolutePath = resolveToolPathAgainstWorkspaceRoot({
    filePath: requestedPath,
    root: workspaceRoot,
  });
  const relative = path.relative(workspaceRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isDirectory()) {
    return null;
  }
  const entries = (await fs.readdir(absolutePath, { withFileTypes: true }))
    .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`)
    .toSorted((a, b) => a.localeCompare(b));
  const offset = normalizePositiveInt(params.args.offset, 1);
  const limit = normalizePositiveInt(params.args.limit, params.defaultLineLimit);
  const startIndex = Math.max(0, offset - 1);
  const visibleEntries = entries.slice(startIndex, startIndex + limit);
  const nextOffset =
    startIndex + visibleEntries.length < entries.length ? offset + visibleEntries.length : null;
  const truncated = nextOffset !== null;
  const entryStart = visibleEntries.length > 0 ? offset : null;
  const entryEnd = visibleEntries.length > 0 ? offset + visibleEntries.length - 1 : null;
  const guidance = truncated
    ? `(Showing entries ${entryStart}-${entryEnd} of ${entries.length}. Use offset=${nextOffset} to continue or narrow the directory.)`
    : `(${entries.length} entries)`;
  return {
    content: [
      {
        type: "text",
        text: [
          `<path>${escapeXmlText(params.pathLabel)}</path>`,
          "<type>directory</type>",
          "<entries>",
          visibleEntries.join("\n"),
          "",
          guidance,
          "</entries>",
        ].join("\n"),
      },
    ],
    details: {
      read: {
        type: "directory",
        path: params.pathLabel,
        offset,
        limit,
        entryStart,
        entryEnd,
        totalEntries: entries.length,
        returnedEntries: visibleEntries.length,
        truncated,
        nextOffset,
        validOffsetRange: {
          start: entries.length > 0 ? 1 : 0,
          end: entries.length,
        },
        suggestedOffset: nextOffset,
      },
    },
  };
}

function isLikelyTextDocumentPath(filePath: string): boolean {
  const basename = path.basename(filePath);
  if (AUTO_INGEST_TEXT_BASENAMES.has(basename)) {
    return true;
  }
  return AUTO_INGEST_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolveWorkspaceRelativeReadPath(params: {
  filePath: string;
  workspaceRoot: string;
}): { absolutePath: string; workspaceRelativePath: string } | null {
  const canonical = resolveRepoCanonicalReadPath({
    inputPath: params.filePath,
    workspaceRoot: params.workspaceRoot,
  });
  if (canonical) {
    return {
      absolutePath: canonical.absolutePath,
      workspaceRelativePath: canonical.logicalPath,
    };
  }
  const absolutePath = resolveToolPathAgainstWorkspaceRoot({
    filePath: params.filePath,
    root: params.workspaceRoot,
  });
  const relativePath = path.relative(params.workspaceRoot, absolutePath);
  if (
    !relativePath ||
    relativePath === "." ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return {
    absolutePath,
    workspaceRelativePath: relativePath.split(path.sep).join("/"),
  };
}

async function buildAutoIngestFingerprint(params: {
  absolutePath: string;
  workspaceRelativePath: string;
}): Promise<string | null> {
  try {
    if (isDailyWorkspaceMemoryNote(params.workspaceRelativePath)) {
      const content = await fs.readFile(params.absolutePath, "utf8");
      return createHash("sha256")
        .update(params.workspaceRelativePath)
        .update("\0daily-note-content\0")
        .update(content)
        .digest("hex")
        .slice(0, 24);
    }
    const stat = await fs.stat(params.absolutePath);
    return createHash("sha256")
      .update(params.workspaceRelativePath)
      .update("\0")
      .update(String(stat.size))
      .update("\0")
      .update(String(Math.floor(stat.mtimeMs)))
      .digest("hex")
      .slice(0, 24);
  } catch {
    return null;
  }
}

function deriveAutoIngestProjectId(workspaceRelativePath: string): string | undefined {
  const match = /^docs\/projects\/([^/]+)\//.exec(workspaceRelativePath);
  return match?.[1];
}

function resolveAutoIngestTriggerSet(params: {
  resultText: string;
  offset: unknown;
  readCount: number;
}): ReadDocumentIngestArbitrationTrigger[] {
  const triggers: ReadDocumentIngestArbitrationTrigger[] = [];
  if (READ_OUTPUT_CAPPED_NOTICE_RE.test(params.resultText)) {
    triggers.push("capped_output");
  }
  if (
    typeof params.offset === "number" &&
    Number.isFinite(params.offset) &&
    Math.floor(params.offset) > 1
  ) {
    triggers.push("continued_read");
  }
  if (params.readCount >= 2) {
    triggers.push("repeated_read");
  }
  return triggers;
}

export function wrapReadToolWithDocumentIngestArbitration(
  readTool: AnyAgentTool,
  options: ReadDocumentIngestArbitrationOptions,
): AnyAgentTool {
  const pathReadCounts = new Map<string, number>();
  const autoIngestCache = new Map<string, ReadDocumentIngestArbitrationCacheEntry>();

  return {
    ...readTool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const result = await readTool.execute(toolCallId, params, signal, onUpdate);
      const record = getToolParamsRecord(params);
      const filePath = typeof record?.path === "string" ? record.path.trim() : "";
      if (!filePath) {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "read_only",
            ingestStatus: "skipped",
            skipReason: "missing_path",
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      if (!options.ingestTool) {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "read_only",
            ingestStatus: "skipped",
            skipReason: "missing_ingest_tool",
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      const resolvedPath = resolveWorkspaceRelativeReadPath({
        filePath,
        workspaceRoot: options.workspaceRoot,
      });
      if (!resolvedPath) {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "read_only",
            ingestStatus: "skipped",
            skipReason: "outside_workspace",
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      if (!isLikelyTextDocumentPath(resolvedPath.workspaceRelativePath)) {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "read_only",
            workspaceRelativePath: resolvedPath.workspaceRelativePath,
            ingestStatus: "skipped",
            skipReason: "non_text_document",
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      const resultText = getToolResultText(result);
      if (typeof resultText !== "string" || !resultText.trim()) {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "read_only",
            workspaceRelativePath: resolvedPath.workspaceRelativePath,
            ingestStatus: "skipped",
            skipReason: "non_text_result",
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      const readCount = (pathReadCounts.get(resolvedPath.workspaceRelativePath) ?? 0) + 1;
      pathReadCounts.set(resolvedPath.workspaceRelativePath, readCount);
      const triggers = resolveAutoIngestTriggerSet({
        resultText,
        offset: record?.offset,
        readCount,
      });
      if (triggers.length === 0) {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "read_only",
            workspaceRelativePath: resolvedPath.workspaceRelativePath,
            ingestStatus: "skipped",
            skipReason: "no_auto_ingest_trigger",
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      const fingerprint = await buildAutoIngestFingerprint({
        absolutePath: resolvedPath.absolutePath,
        workspaceRelativePath: resolvedPath.workspaceRelativePath,
      });
      if (!fingerprint) {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "read_only",
            workspaceRelativePath: resolvedPath.workspaceRelativePath,
            ingestStatus: "skipped",
            skipReason: "fingerprint_unavailable",
            triggers,
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      const existing = autoIngestCache.get(fingerprint);
      if (existing?.status === "failed") {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "read_only",
            workspaceRelativePath: resolvedPath.workspaceRelativePath,
            fingerprint,
            triggers,
            ingestStatus: "failed",
            skipReason: "prior_auto_ingest_failed",
            runId: existing.runId,
            recordPath: existing.recordPath,
            projectId: existing.projectId,
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      if (existing) {
        return mergeReadToolDetails(result, {
          documentArbitration: {
            outcome: "reuse_existing_ingest",
            workspaceRelativePath: resolvedPath.workspaceRelativePath,
            fingerprint,
            triggers,
            ingestStatus: existing.status,
            runId: existing.runId,
            recordPath: existing.recordPath,
            projectId: existing.projectId,
          } satisfies ReadDocumentIngestArbitrationDetails,
        });
      }

      const runId = `model-memory-auto-read-${fingerprint}`;
      const recordPath = `checkpoints/model-memory/auto-read-ingest/${runId}.json`;
      const projectId = deriveAutoIngestProjectId(resolvedPath.workspaceRelativePath);
      autoIngestCache.set(fingerprint, {
        fingerprint,
        runId,
        recordPath,
        projectId,
        status: "pending",
      });

      if (!signal?.aborted) {
        void options.ingestTool
          .execute(`${toolCallId}::auto_ingest`, {
            source: resolvedPath.workspaceRelativePath,
            runId,
            recordPath,
            projectId,
            resume: true,
          })
          .then(() => {
            autoIngestCache.set(fingerprint, {
              fingerprint,
              runId,
              recordPath,
              projectId,
              status: "completed",
            });
          })
          .catch((error) => {
            autoIngestCache.set(fingerprint, {
              fingerprint,
              runId,
              recordPath,
              projectId,
              status: "failed",
            });
            options.warn?.(
              `[read-auto-ingest] ${resolvedPath.workspaceRelativePath} failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }

      return mergeReadToolDetails(result, {
        documentArbitration: {
          outcome: "read_then_ingest",
          workspaceRelativePath: resolvedPath.workspaceRelativePath,
          fingerprint,
          triggers,
          ingestStatus: signal?.aborted ? "skipped" : "scheduled",
          runId,
          recordPath,
          projectId,
        } satisfies ReadDocumentIngestArbitrationDetails,
      });
    },
  };
}

async function executeReadWithAdaptivePaging(params: {
  base: AnyAgentTool;
  toolCallId: string;
  args: Record<string, unknown>;
  signal?: AbortSignal;
  maxBytes: number;
  defaultLineLimit: number;
}): Promise<AgentToolResult<unknown>> {
  const userLimit = params.args.limit;
  const hasExplicitLimit =
    typeof userLimit === "number" && Number.isFinite(userLimit) && userLimit > 0;
  if (hasExplicitLimit) {
    const result = await params.base.execute(params.toolCallId, params.args, params.signal);
    return capReadResultTextByBytes({
      result,
      maxBytes: params.maxBytes,
    });
  }

  const offsetRaw = params.args.offset;
  const nextOffset =
    typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
      ? Math.floor(offsetRaw)
      : 1;
  const defaultPageResult = await params.base.execute(
    params.toolCallId,
    {
      ...params.args,
      offset: nextOffset,
      limit: params.defaultLineLimit,
    },
    params.signal,
  );
  return capReadResultTextByBytes({
    result: defaultPageResult,
    maxBytes: params.maxBytes,
    fallbackContinuationOffset: nextOffset + params.defaultLineLimit,
  });
}

function rewriteReadImageHeader(text: string, mimeType: string): string {
  // pi-coding-agent uses: "Read image file [image/png]"
  if (text.startsWith("Read image file [") && text.endsWith("]")) {
    return `Read image file [${mimeType}]`;
  }
  return text;
}

async function normalizeReadImageResult(
  result: AgentToolResult<unknown>,
  filePath: string,
): Promise<AgentToolResult<unknown>> {
  const content = Array.isArray(result.content) ? result.content : [];

  const image = content.find(
    (b): b is ImageContentBlock =>
      !!b &&
      typeof b === "object" &&
      (b as { type?: unknown }).type === "image" &&
      typeof (b as { data?: unknown }).data === "string" &&
      typeof (b as { mimeType?: unknown }).mimeType === "string",
  );
  if (!image) {
    return result;
  }

  if (!image.data.trim()) {
    throw new Error(`read: image payload is empty (${filePath})`);
  }

  const sniffed = await sniffMimeFromBase64(image.data);
  if (!sniffed) {
    return result;
  }

  if (!sniffed.startsWith("image/")) {
    throw new Error(
      `read: file looks like ${sniffed} but was treated as ${image.mimeType} (${filePath})`,
    );
  }

  if (sniffed === image.mimeType) {
    return result;
  }

  const nextContent = content.map((block) => {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "image") {
      const b = block as ImageContentBlock & { mimeType: string };
      return { ...b, mimeType: sniffed } satisfies ImageContentBlock;
    }
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      const b = block as TextContentBlock & { text: string };
      return {
        ...b,
        text: rewriteReadImageHeader(b.text, sniffed),
      } satisfies TextContentBlock;
    }
    return block;
  });

  return { ...result, content: nextContent };
}

export function wrapToolWorkspaceRootGuard(tool: AnyAgentTool, root: string): AnyAgentTool {
  return wrapToolWorkspaceRootGuardWithOptions(tool, root);
}

function mapContainerPathToWorkspaceRoot(params: {
  filePath: string;
  root: string;
  containerWorkdir?: string;
}): string {
  const containerWorkdir = params.containerWorkdir?.trim();
  if (!containerWorkdir) {
    return params.filePath;
  }
  const normalizedWorkdir = containerWorkdir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalizedWorkdir.startsWith("/")) {
    return params.filePath;
  }
  if (!normalizedWorkdir) {
    return params.filePath;
  }

  let candidate = params.filePath.startsWith("@") ? params.filePath.slice(1) : params.filePath;
  if (/^file:\/\//i.test(candidate)) {
    const localFilePath = trySafeFileURLToPath(candidate);
    if (localFilePath) {
      candidate = localFilePath;
    } else {
      // Windows rejects posix-style file:///workspace/... in fileURLToPath; map via URL pathname
      // when it clearly refers to the container workdir (same idea as sandbox-paths).
      let parsed: URL;
      try {
        parsed = new URL(candidate);
      } catch {
        return params.filePath;
      }
      if (parsed.protocol !== "file:") {
        return params.filePath;
      }
      const host = parsed.hostname.trim().toLowerCase();
      if (host && host !== "localhost") {
        return params.filePath;
      }
      if (hasEncodedFileUrlSeparator(parsed.pathname)) {
        return params.filePath;
      }
      let normalizedPathname: string;
      try {
        normalizedPathname = decodeURIComponent(parsed.pathname).replace(/\\/g, "/");
      } catch {
        return params.filePath;
      }
      if (
        normalizedPathname !== normalizedWorkdir &&
        !normalizedPathname.startsWith(`${normalizedWorkdir}/`)
      ) {
        return params.filePath;
      }
      candidate = normalizedPathname;
    }
  }

  const normalizedCandidate = candidate.replace(/\\/g, "/");
  if (normalizedCandidate === normalizedWorkdir) {
    return path.resolve(params.root);
  }
  const prefix = `${normalizedWorkdir}/`;
  if (!normalizedCandidate.startsWith(prefix)) {
    return candidate;
  }
  const relative = normalizedCandidate.slice(prefix.length);
  if (!relative) {
    return path.resolve(params.root);
  }
  return path.resolve(params.root, ...relative.split("/").filter(Boolean));
}

export function resolveToolPathAgainstWorkspaceRoot(params: {
  filePath: string;
  root: string;
  containerWorkdir?: string;
}): string {
  const mapped = mapContainerPathToWorkspaceRoot(params);
  const candidate = mapped.startsWith("@") ? mapped.slice(1) : mapped;
  if (isWindowsDrivePath(candidate)) {
    return path.win32.normalize(candidate);
  }
  if (path.isAbsolute(candidate)) {
    return path.resolve(candidate);
  }
  return path.resolve(params.root, candidate || ".");
}

type MemoryFlushAppendOnlyWriteOptions = {
  root: string;
  relativePath: string;
  containerWorkdir?: string;
  sandbox?: {
    root: string;
    bridge: SandboxFsBridge;
  };
};

async function readOptionalUtf8File(params: {
  absolutePath: string;
  relativePath: string;
  sandbox?: MemoryFlushAppendOnlyWriteOptions["sandbox"];
  signal?: AbortSignal;
}): Promise<string> {
  try {
    if (params.sandbox) {
      const stat = await params.sandbox.bridge.stat({
        filePath: params.relativePath,
        cwd: params.sandbox.root,
        signal: params.signal,
      });
      if (!stat) {
        return "";
      }
      const buffer = await params.sandbox.bridge.readFile({
        filePath: params.relativePath,
        cwd: params.sandbox.root,
        signal: params.signal,
      });
      return buffer.toString("utf-8");
    }
    return await fs.readFile(params.absolutePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function appendMemoryFlushContent(params: {
  absolutePath: string;
  root: string;
  relativePath: string;
  content: string;
  sandbox?: MemoryFlushAppendOnlyWriteOptions["sandbox"];
  signal?: AbortSignal;
}) {
  if (!params.sandbox) {
    await appendFileWithinRoot({
      rootDir: params.root,
      relativePath: params.relativePath,
      data: params.content,
      mkdir: true,
      prependNewlineIfNeeded: true,
    });
    return;
  }

  const existing = await readOptionalUtf8File({
    absolutePath: params.absolutePath,
    relativePath: params.relativePath,
    sandbox: params.sandbox,
    signal: params.signal,
  });
  const separator =
    existing.length > 0 && !existing.endsWith("\n") && !params.content.startsWith("\n") ? "\n" : "";
  const next = `${existing}${separator}${params.content}`;
  if (params.sandbox) {
    const parent = path.posix.dirname(params.relativePath);
    if (parent && parent !== ".") {
      await params.sandbox.bridge.mkdirp({
        filePath: parent,
        cwd: params.sandbox.root,
        signal: params.signal,
      });
    }
    await params.sandbox.bridge.writeFile({
      filePath: params.relativePath,
      cwd: params.sandbox.root,
      data: next,
      mkdir: true,
      signal: params.signal,
    });
    return;
  }
  await fs.mkdir(path.dirname(params.absolutePath), { recursive: true });
  await fs.writeFile(params.absolutePath, next, "utf-8");
}

export function wrapToolMemoryFlushAppendOnlyWrite(
  tool: AnyAgentTool,
  options: MemoryFlushAppendOnlyWriteOptions,
): AnyAgentTool {
  const allowedAbsolutePath = path.resolve(options.root, options.relativePath);
  return {
    ...tool,
    description: `${tool.description} During memory flush, this tool may only append to ${options.relativePath}.`,
    execute: async (toolCallId, args, signal, onUpdate) => {
      const record = getToolParamsRecord(args);
      assertRequiredParams(record, REQUIRED_PARAM_GROUPS.write, tool.name);
      const filePath =
        typeof record?.path === "string" && record.path.trim() ? record.path : undefined;
      const content = typeof record?.content === "string" ? record.content : undefined;
      if (!filePath || content === undefined) {
        return tool.execute(toolCallId, args, signal, onUpdate);
      }

      const resolvedPath = resolveToolPathAgainstWorkspaceRoot({
        filePath,
        root: options.root,
        containerWorkdir: options.containerWorkdir,
      });
      if (resolvedPath !== allowedAbsolutePath) {
        throw new Error(
          `Memory flush writes are restricted to ${options.relativePath}; use that path only.`,
        );
      }

      await appendMemoryFlushContent({
        absolutePath: allowedAbsolutePath,
        root: options.root,
        relativePath: options.relativePath,
        content,
        sandbox: options.sandbox,
        signal,
      });
      return {
        content: [{ type: "text", text: `Appended content to ${options.relativePath}.` }],
        details: {
          path: options.relativePath,
          appendOnly: true,
        },
      };
    },
  };
}

export function wrapToolWorkspaceRootGuardWithOptions(
  tool: AnyAgentTool,
  root: string,
  options?: {
    containerWorkdir?: string;
    pathParamKeys?: readonly string[];
    normalizeGuardedPathParams?: boolean;
  },
): AnyAgentTool {
  const pathParamKeys =
    options?.pathParamKeys && options.pathParamKeys.length > 0 ? options.pathParamKeys : ["path"];
  return {
    ...tool,
    execute: async (toolCallId, args, signal, onUpdate) => {
      const record = getToolParamsRecord(args);
      let normalizedRecord: Record<string, unknown> | undefined;
      for (const key of pathParamKeys) {
        const filePath = record?.[key];
        if (typeof filePath !== "string" || !filePath.trim()) {
          continue;
        }
        const sandboxPath = mapContainerPathToWorkspaceRoot({
          filePath,
          root,
          containerWorkdir: options?.containerWorkdir,
        });
        const sandboxResult = await assertSandboxPath({ filePath: sandboxPath, cwd: root, root });
        if (options?.normalizeGuardedPathParams && record) {
          normalizedRecord ??= { ...record };
          normalizedRecord[key] = sandboxResult.resolved;
        }
      }
      return tool.execute(toolCallId, normalizedRecord ?? args, signal, onUpdate);
    },
  };
}

type SandboxToolParams = {
  root: string;
  bridge: SandboxFsBridge;
  modelContextWindowTokens?: number;
  imageSanitization?: ImageSanitizationLimits;
  defaultLineLimit?: number;
  maxBytes?: number;
};

export function createSandboxedReadTool(params: SandboxToolParams) {
  const base = createReadTool(params.root, {
    operations: createSandboxReadOperations(params),
  }) as unknown as AnyAgentTool;
  return createOpenClawReadTool(base, {
    modelContextWindowTokens: params.modelContextWindowTokens,
    imageSanitization: params.imageSanitization,
    workspaceRoot: params.root,
    defaultLineLimit: params.defaultLineLimit,
    maxBytes: params.maxBytes,
  });
}

export function createSandboxedWriteTool(params: SandboxToolParams) {
  const base = createWriteTool(params.root, {
    operations: createSandboxWriteOperations(params),
  }) as unknown as AnyAgentTool;
  const withMetadata = wrapWriteToolWithMetadata(base, {
    root: params.root,
    access: async (absolutePath: string) => {
      const stat = await params.bridge.stat({ filePath: absolutePath, cwd: params.root });
      if (!stat) {
        throw createFsAccessError("ENOENT", absolutePath);
      }
    },
  });
  return wrapToolParamValidation(withMetadata, REQUIRED_PARAM_GROUPS.write);
}

export function createSandboxedEditTool(params: SandboxToolParams) {
  const base = createEditTool(params.root, {
    operations: createSandboxEditOperations(params),
  }) as unknown as AnyAgentTool;
  const withRecovery = wrapEditToolWithRecovery(base, {
    root: params.root,
    readFile: async (absolutePath: string) =>
      (await params.bridge.readFile({ filePath: absolutePath, cwd: params.root })).toString("utf8"),
  });
  return wrapToolParamValidation(withRecovery, REQUIRED_PARAM_GROUPS.edit);
}

export function createHostWorkspaceWriteTool(root: string, options?: { workspaceOnly?: boolean }) {
  const base = createWriteTool(root, {
    operations: createHostWriteOperations(root, options),
  }) as unknown as AnyAgentTool;
  const withMetadata = wrapWriteToolWithMetadata(base, {
    root,
    access: async (absolutePath: string) => {
      await fs.access(path.resolve(expandTildeToOsHome(absolutePath)));
    },
  });
  return wrapToolParamValidation(withMetadata, REQUIRED_PARAM_GROUPS.write);
}

export function createHostWorkspaceEditTool(root: string, options?: { workspaceOnly?: boolean }) {
  const base = createEditTool(root, {
    operations: createHostEditOperations(root, options),
  }) as unknown as AnyAgentTool;
  const withRecovery = wrapEditToolWithRecovery(base, {
    root,
    readFile: (absolutePath: string) => fs.readFile(absolutePath, "utf-8"),
  });
  return wrapToolParamValidation(withRecovery, REQUIRED_PARAM_GROUPS.edit);
}

export function createOpenClawReadTool(
  base: AnyAgentTool,
  options?: OpenClawReadToolOptions,
): AnyAgentTool {
  return {
    ...base,
    execute: async (toolCallId, params, signal) => {
      const record = getToolParamsRecord(params);
      assertRequiredParams(record, REQUIRED_PARAM_GROUPS.read, base.name);
      let normalizedArgs = record ?? {};
      const requestedPath = typeof record?.path === "string" ? record.path : undefined;
      if (requestedPath && options?.workspaceRoot) {
        const canonical = resolveRepoCanonicalReadPath({
          inputPath: requestedPath,
          workspaceRoot: options.workspaceRoot,
        });
        if (canonical) {
          normalizedArgs = {
            ...normalizedArgs,
            path: canonical.absolutePath,
          };
        }
      }
      const maxBytes = resolveAdaptiveReadMaxBytes(options);
      const defaultLineLimit = resolveReadDefaultLineLimit(options);
      const normalizedPathLabel =
        typeof normalizedArgs.path === "string" && normalizedArgs.path.trim()
          ? normalizedArgs.path
          : "<unknown>";
      const directoryResult = await tryReadDirectoryWithPagination({
        args: normalizedArgs,
        pathLabel: requestedPath ?? normalizedPathLabel,
        workspaceRoot: options?.workspaceRoot,
        defaultLineLimit,
      });
      const result =
        directoryResult ??
        (await executeReadWithAdaptivePaging({
          base,
          toolCallId,
          args: normalizedArgs,
          signal,
          maxBytes,
          defaultLineLimit,
        }).catch((error: unknown) =>
          normalizeReadToolFailure({
            error,
            requestedPath,
            workspaceRoot: options?.workspaceRoot,
          }),
        ));
      const filePath = typeof record?.path === "string" ? record.path : "<unknown>";
      const enrichedResult = enrichReadToolResultDetails({
        result,
        args: normalizedArgs,
        maxBytes,
      });
      const strippedDetailsResult = stripReadTruncationContentDetails(enrichedResult);
      const lineNumberedResult = lineNumberReadResultText({
        result: strippedDetailsResult,
        pathLabel: filePath,
      });
      const normalizedResult = await normalizeReadImageResult(lineNumberedResult, filePath);
      return sanitizeToolResultImages(
        normalizedResult,
        `read:${filePath}`,
        options?.imageSanitization,
      );
    },
  };
}

function createSandboxReadOperations(params: SandboxToolParams) {
  return {
    readFile: (absolutePath: string) =>
      params.bridge.readFile({ filePath: absolutePath, cwd: params.root }),
    access: async (absolutePath: string) => {
      const stat = await params.bridge.stat({ filePath: absolutePath, cwd: params.root });
      if (!stat) {
        throw createFsAccessError("ENOENT", absolutePath);
      }
    },
    detectImageMimeType: async (absolutePath: string) => {
      const buffer = await params.bridge.readFile({ filePath: absolutePath, cwd: params.root });
      const mime = await detectMime({ buffer, filePath: absolutePath });
      return mime && mime.startsWith("image/") ? mime : undefined;
    },
  } as const;
}

function createSandboxWriteOperations(params: SandboxToolParams) {
  return {
    mkdir: async (dir: string) => {
      await params.bridge.mkdirp({ filePath: dir, cwd: params.root });
    },
    writeFile: async (absolutePath: string, content: string) => {
      assertWritableWorkspaceMemoryPath({ root: params.root, filePath: absolutePath });
      await params.bridge.writeFile({ filePath: absolutePath, cwd: params.root, data: content });
    },
  } as const;
}

function createSandboxEditOperations(params: SandboxToolParams) {
  return {
    readFile: (absolutePath: string) =>
      params.bridge.readFile({ filePath: absolutePath, cwd: params.root }),
    writeFile: (absolutePath: string, content: string) => {
      assertWritableWorkspaceMemoryPath({ root: params.root, filePath: absolutePath });
      return params.bridge.writeFile({ filePath: absolutePath, cwd: params.root, data: content });
    },
    access: async (absolutePath: string) => {
      const stat = await params.bridge.stat({ filePath: absolutePath, cwd: params.root });
      if (!stat) {
        throw createFsAccessError("ENOENT", absolutePath);
      }
    },
  } as const;
}

function expandTildeToOsHome(filePath: string): string {
  const home = resolveOsHomeDir();
  return home ? expandHomePrefix(filePath, { home }) : filePath;
}

async function writeHostFile(absolutePath: string, content: string) {
  const resolved = path.resolve(expandTildeToOsHome(absolutePath));
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, "utf-8");
}

function createHostWriteOperations(root: string, options?: { workspaceOnly?: boolean }) {
  const workspaceOnly = options?.workspaceOnly ?? false;

  if (!workspaceOnly) {
    // When workspaceOnly is false, allow writes anywhere on the host
    return {
      mkdir: async (dir: string) => {
        const resolved = path.resolve(expandTildeToOsHome(dir));
        await fs.mkdir(resolved, { recursive: true });
      },
      writeFile: async (absolutePath: string, content: string) => {
        assertWritableWorkspaceMemoryPath({ root, filePath: expandTildeToOsHome(absolutePath) });
        await writeHostFile(absolutePath, content);
      },
    } as const;
  }

  // When workspaceOnly is true, enforce workspace boundary
  return {
    mkdir: async (dir: string) => {
      const relative = toRelativeWorkspacePath(root, dir, { allowRoot: true });
      const resolved = relative ? path.resolve(root, relative) : path.resolve(root);
      await assertSandboxPath({ filePath: resolved, cwd: root, root });
      await fs.mkdir(resolved, { recursive: true });
    },
    writeFile: async (absolutePath: string, content: string) => {
      const relative = toRelativeWorkspacePath(root, absolutePath);
      assertWritableWorkspaceMemoryPath({ root, filePath: path.resolve(root, relative) });
      await writeFileWithinRoot({
        rootDir: root,
        relativePath: relative,
        data: content,
        mkdir: true,
      });
    },
  } as const;
}

function createHostEditOperations(root: string, options?: { workspaceOnly?: boolean }) {
  const workspaceOnly = options?.workspaceOnly ?? false;

  if (!workspaceOnly) {
    // When workspaceOnly is false, allow edits anywhere on the host
    return {
      readFile: async (absolutePath: string) => {
        const resolved = path.resolve(expandTildeToOsHome(absolutePath));
        return await fs.readFile(resolved);
      },
      writeFile: async (absolutePath: string, content: string) => {
        assertWritableWorkspaceMemoryPath({ root, filePath: expandTildeToOsHome(absolutePath) });
        await writeHostFile(absolutePath, content);
      },
      access: async (absolutePath: string) => {
        const resolved = path.resolve(expandTildeToOsHome(absolutePath));
        await fs.access(resolved);
      },
    } as const;
  }

  // When workspaceOnly is true, enforce workspace boundary
  return {
    readFile: async (absolutePath: string) => {
      const relative = toRelativeWorkspacePath(root, absolutePath);
      const safeRead = await readFileWithinRoot({
        rootDir: root,
        relativePath: relative,
      });
      return safeRead.buffer;
    },
    writeFile: async (absolutePath: string, content: string) => {
      const relative = toRelativeWorkspacePath(root, absolutePath);
      assertWritableWorkspaceMemoryPath({ root, filePath: path.resolve(root, relative) });
      await writeFileWithinRoot({
        rootDir: root,
        relativePath: relative,
        data: content,
        mkdir: true,
      });
    },
    access: async (absolutePath: string) => {
      let relative: string;
      try {
        relative = toRelativeWorkspacePath(root, absolutePath);
      } catch {
        // Path escapes workspace root.  Don't throw here – the upstream
        // library replaces any `access` error with a misleading "File not
        // found" message.  By returning silently the subsequent `readFile`
        // call will throw the same "Path escapes workspace root" error
        // through a code-path that propagates the original message.
        return;
      }
      try {
        const opened = await openFileWithinRoot({
          rootDir: root,
          relativePath: relative,
        });
        await opened.handle.close().catch(() => {});
      } catch (error) {
        if (error instanceof SafeOpenError && error.code === "not-found") {
          throw createFsAccessError("ENOENT", absolutePath);
        }
        if (error instanceof SafeOpenError && error.code === "outside-workspace") {
          // Don't throw here – see the comment above about the upstream
          // library swallowing access errors as "File not found".
          return;
        }
        throw error;
      }
    },
  } as const;
}

function createFsAccessError(code: string, filePath: string): NodeJS.ErrnoException {
  const error = new Error(`Sandbox FS error (${code}): ${filePath}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}
