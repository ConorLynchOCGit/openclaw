import crypto from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import {
  persistManagedToolOutputSync,
  type PersistManagedToolOutputResult,
} from "../../config/sessions/managed-output.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { emitSessionTranscriptUpdate } from "../../sessions/transcript-events.js";
import { normalizeLowercaseStringOrEmpty } from "../../shared/string-coerce.js";
import { resolveAgentContextLimits } from "../agent-scope.js";
import { acquireSessionWriteLock } from "../session-write-lock.js";
import { log } from "./logger.js";
import { formatContextLimitTruncationNotice } from "./tool-result-context-guard.js";
import { rewriteTranscriptEntriesInSessionManager } from "./transcript-rewrite.js";

/**
 * Maximum share of the context window a single tool result should occupy.
 * This is intentionally conservative – a single tool result should not
 * consume more than 30% of the context window even without other messages.
 */
const MAX_TOOL_RESULT_CONTEXT_SHARE = 0.3;

/**
 * Default hard cap for a single live tool result text block.
 *
 * Pi already truncates tool results aggressively when serializing old history
 * for compaction summaries. For the live request path we still keep a bounded
 * request-local ceiling so oversized tool output cannot dominate the next turn.
 */
export const DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS = 50 * 1024;

/**
 * Backwards-compatible alias for older call sites/tests.
 */
export const HARD_MAX_TOOL_RESULT_CHARS = DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS;

export const DEFAULT_TOOL_OUTPUT_MAX_LINES = 2_000;
export const DEFAULT_TOOL_OUTPUT_MAX_BYTES = 50 * 1024;
export const COMPACTION_TOOL_OUTPUT_MAX_BYTES = 2_000;
export const OLD_TOOL_RESULT_CONTENT_CLEARED = "[Old tool result content cleared]";

/**
 * Minimum characters to keep when truncating.
 * We always keep at least the first portion so the model understands
 * what was in the content.
 */
const MIN_KEEP_CHARS = 2_000;
const RECOVERY_MIN_KEEP_CHARS = 2_000;

type ToolResultTruncationOptions = {
  suffix?: string | ((truncatedChars: number) => string);
  minKeepChars?: number;
};

export type ToolOutputProjectionOptions = {
  maxLines?: number;
  maxBytes?: number;
  direction?: "head" | "tail";
  stateRoot?: string | null;
  sessionKey?: string;
  toolCallId?: string;
  toolName?: string;
  outputKind?: string;
  reason?: string;
};

export type ToolOutputProjection = {
  content: string;
  truncated: boolean;
  totalLines: number;
  totalBytes: number;
  returnedLines: number;
  returnedBytes: number;
  omittedLines: number;
  omittedBytes: number;
  managedOutput: PersistManagedToolOutputResult | null;
};

const DEFAULT_SUFFIX = (truncatedChars: number) =>
  formatContextLimitTruncationNotice(truncatedChars);
export const MIN_TRUNCATED_TEXT_CHARS = MIN_KEEP_CHARS + DEFAULT_SUFFIX(1).length;

function resolvePositiveInt(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && typeof value === "number" && value > 0
    ? Math.floor(value)
    : fallback;
}

function byteLengthUtf8(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function truncateUtf8ToMaxBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0 || text.length === 0) {
    return "";
  }
  if (byteLengthUtf8(text) <= maxBytes) {
    return text;
  }
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && byteLengthUtf8(text.slice(0, end)) > maxBytes) {
    end -= 1;
  }
  return text.slice(0, end);
}

function buildProjectionHint(params: {
  managedOutput: PersistManagedToolOutputResult | null;
  omittedLines: number;
  omittedBytes: number;
}): string {
  const omitted =
    params.omittedBytes > 0
      ? `${params.omittedBytes} bytes`
      : `${Math.max(1, params.omittedLines)} lines`;
  const lines = [`...${omitted} truncated...`, "", "Output truncated."];
  if (params.managedOutput) {
    lines.push(
      `Full output saved to: ${params.managedOutput.outputPath}`,
      "Use Grep to search the full content or Read with offset/limit to view specific sections.",
    );
  }
  return lines.join("\n");
}

function buildProjectedToolOutputContent(params: {
  preview: string;
  hint: string;
  direction: "head" | "tail";
}): string {
  if (!params.preview) {
    return params.hint;
  }
  return params.direction === "head"
    ? `${params.preview}\n\n${params.hint}`
    : `${params.hint}\n\n${params.preview}`;
}

function fitPreviewWithHint(params: {
  preview: string;
  hint: string;
  direction: "head" | "tail";
  maxBytes: number;
}): string {
  const content = buildProjectedToolOutputContent(params);
  if (byteLengthUtf8(content) <= params.maxBytes) {
    return params.preview;
  }
  const separatorBytes = params.preview ? 2 : 0;
  const reservedBytes = byteLengthUtf8(params.hint) + separatorBytes;
  const previewBudget = Math.max(0, params.maxBytes - reservedBytes);
  if (params.direction === "tail") {
    const bytes = Buffer.from(params.preview, "utf8");
    return truncateUtf8ToMaxBytes(
      bytes.subarray(Math.max(0, bytes.length - previewBudget)).toString("utf8"),
      previewBudget,
    );
  }
  return truncateUtf8ToMaxBytes(params.preview, previewBudget);
}

export function projectToolOutput(params: {
  text: string;
  options?: ToolOutputProjectionOptions;
}): ToolOutputProjection {
  const options = params.options ?? {};
  const maxLines = resolvePositiveInt(options.maxLines, DEFAULT_TOOL_OUTPUT_MAX_LINES);
  const maxBytes = resolvePositiveInt(options.maxBytes, DEFAULT_TOOL_OUTPUT_MAX_BYTES);
  const direction = options.direction ?? "head";
  const lines = params.text.split("\n");
  const totalBytes = byteLengthUtf8(params.text);
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content: params.text,
      truncated: false,
      totalLines,
      totalBytes,
      returnedLines: totalLines,
      returnedBytes: totalBytes,
      omittedLines: 0,
      omittedBytes: 0,
      managedOutput: null,
    };
  }

  const outputLines: string[] = [];
  let returnedBytes = 0;
  let hitByteCap = false;

  if (direction === "head") {
    for (let index = 0; index < totalLines && outputLines.length < maxLines; index += 1) {
      const separatorBytes = outputLines.length > 0 ? 1 : 0;
      const lineBytes = byteLengthUtf8(lines[index] ?? "") + separatorBytes;
      if (returnedBytes + lineBytes > maxBytes) {
        hitByteCap = true;
        break;
      }
      outputLines.push(lines[index] ?? "");
      returnedBytes += lineBytes;
    }
  } else {
    for (let index = totalLines - 1; index >= 0 && outputLines.length < maxLines; index -= 1) {
      const separatorBytes = outputLines.length > 0 ? 1 : 0;
      const lineBytes = byteLengthUtf8(lines[index] ?? "") + separatorBytes;
      if (returnedBytes + lineBytes > maxBytes) {
        hitByteCap = true;
        break;
      }
      outputLines.unshift(lines[index] ?? "");
      returnedBytes += lineBytes;
    }
  }

  if (outputLines.length === 0 && params.text.length > 0 && maxBytes > 0) {
    const byteSlice = Buffer.from(params.text, "utf8").subarray(0, maxBytes).toString("utf8");
    outputLines.push(byteSlice);
    returnedBytes = byteLengthUtf8(byteSlice);
    hitByteCap = true;
  }

  const omittedLines = Math.max(0, totalLines - outputLines.length);
  const omittedBytes = Math.max(0, totalBytes - returnedBytes);
  const managedOutput = persistManagedToolOutputSync({
    stateRoot: options.stateRoot,
    sessionKey: options.sessionKey,
    toolCallId: options.toolCallId,
    toolName: options.toolName ?? "tool_result",
    text: params.text,
    outputKind: options.outputKind ?? "tool_result",
    reason: options.reason ?? "tool_output_projection",
  });
  let preview = outputLines.join("\n");
  let hint = buildProjectionHint({
    managedOutput,
    omittedLines,
    omittedBytes: hitByteCap ? omittedBytes : 0,
  });
  for (let iteration = 0; iteration < 3; iteration += 1) {
    preview = fitPreviewWithHint({
      preview,
      hint,
      direction,
      maxBytes,
    });
    const nextReturnedBytes = byteLengthUtf8(preview);
    const nextReturnedLines = preview ? preview.split("\n").length : 0;
    const nextHint = buildProjectionHint({
      managedOutput,
      omittedLines: Math.max(0, totalLines - nextReturnedLines),
      omittedBytes: Math.max(0, totalBytes - nextReturnedBytes),
    });
    if (
      nextHint === hint &&
      byteLengthUtf8(buildProjectedToolOutputContent({ preview, hint, direction })) <= maxBytes
    ) {
      break;
    }
    hint = nextHint;
  }
  let content = buildProjectedToolOutputContent({ preview, hint, direction });
  if (byteLengthUtf8(content) > maxBytes) {
    content = truncateUtf8ToMaxBytes(content, maxBytes);
  }
  returnedBytes = byteLengthUtf8(preview);
  const returnedLines = preview ? preview.split("\n").length : 0;

  return {
    content,
    truncated: true,
    totalLines,
    totalBytes,
    returnedLines,
    returnedBytes,
    omittedLines: Math.max(0, totalLines - returnedLines),
    omittedBytes: Math.max(0, totalBytes - returnedBytes),
    managedOutput,
  };
}

function resolveSuffixFactory(
  suffix: ToolResultTruncationOptions["suffix"],
): (truncatedChars: number) => string {
  if (typeof suffix === "function") {
    return suffix;
  }
  if (typeof suffix === "string") {
    return () => suffix;
  }
  return DEFAULT_SUFFIX;
}

function resolveEffectiveMinKeepChars(params: {
  maxChars: number;
  minKeepChars: number;
  suffixFactory: (truncatedChars: number) => string;
}): number {
  const suffixFloor = params.suffixFactory(1).length;
  return Math.max(0, Math.min(params.minKeepChars, Math.max(0, params.maxChars - suffixFloor)));
}

function appendBoundedTruncationSuffix(params: {
  keptText: string;
  originalTextLength: number;
  maxChars: number;
  suffixFactory: (truncatedChars: number) => string;
}): string {
  const build = (keptText: string) =>
    keptText + params.suffixFactory(Math.max(1, params.originalTextLength - keptText.length));

  let keptText = params.keptText;
  while (true) {
    const finalText = build(keptText);
    if (finalText.length <= params.maxChars) {
      return finalText;
    }
    if (keptText.length === 0) {
      return finalText.slice(0, params.maxChars);
    }
    const overflow = finalText.length - params.maxChars;
    const nextKeptText = keptText.slice(0, Math.max(0, keptText.length - overflow));
    keptText = nextKeptText.length < keptText.length ? nextKeptText : keptText.slice(0, -1);
  }
}

/**
 * Marker inserted between head and tail when using head+tail truncation.
 */
const MIDDLE_OMISSION_MARKER =
  "\n\n⚠️ [... middle content omitted — showing head and tail ...]\n\n";

/**
 * Detect whether text likely contains error/diagnostic content near the end,
 * which should be preserved during truncation.
 */
function hasImportantTail(text: string): boolean {
  // Check last ~2000 chars for error-like patterns
  const tail = normalizeLowercaseStringOrEmpty(text.slice(-2000));
  return (
    /\b(error|exception|failed|fatal|traceback|panic|stack trace|errno|exit code)\b/.test(tail) ||
    // JSON closing — if the output is JSON, the tail has closing structure
    /\}\s*$/.test(tail.trim()) ||
    // Summary/result lines often appear at the end
    /\b(total|summary|result|complete|finished|done)\b/.test(tail)
  );
}

/**
 * Truncate a single text string to fit within maxChars.
 *
 * Uses a head+tail strategy when the tail contains important content
 * (errors, results, JSON structure), otherwise preserves the beginning.
 * This ensures error messages and summaries at the end of tool output
 * aren't lost during truncation.
 */
export function truncateToolResultText(
  text: string,
  maxChars: number,
  options: ToolResultTruncationOptions = {},
): string {
  const suffixFactory = resolveSuffixFactory(options.suffix);
  const minKeepChars = resolveEffectiveMinKeepChars({
    maxChars,
    minKeepChars: options.minKeepChars ?? MIN_KEEP_CHARS,
    suffixFactory,
  });
  if (text.length <= maxChars) {
    return text;
  }
  const defaultSuffix = suffixFactory(Math.max(1, text.length - maxChars));
  const budget = Math.max(minKeepChars, maxChars - defaultSuffix.length);

  // If tail looks important, split budget between head and tail
  if (hasImportantTail(text) && budget > minKeepChars * 2) {
    const tailBudget = Math.min(Math.floor(budget * 0.3), 4_000);
    const headBudget = budget - tailBudget - MIDDLE_OMISSION_MARKER.length;

    if (headBudget > minKeepChars) {
      // Find clean cut points at newline boundaries
      let headCut = headBudget;
      const headNewline = text.lastIndexOf("\n", headBudget);
      if (headNewline > headBudget * 0.8) {
        headCut = headNewline;
      }

      let tailStart = text.length - tailBudget;
      const tailNewline = text.indexOf("\n", tailStart);
      if (tailNewline !== -1 && tailNewline < tailStart + tailBudget * 0.2) {
        tailStart = tailNewline + 1;
      }

      const keptText = text.slice(0, headCut) + MIDDLE_OMISSION_MARKER + text.slice(tailStart);
      return appendBoundedTruncationSuffix({
        keptText,
        originalTextLength: text.length,
        maxChars,
        suffixFactory,
      });
    }
  }

  // Default: keep the beginning
  let cutPoint = budget;
  const lastNewline = text.lastIndexOf("\n", budget);
  if (lastNewline > budget * 0.8) {
    cutPoint = lastNewline;
  }
  const keptText = text.slice(0, cutPoint);
  return appendBoundedTruncationSuffix({
    keptText,
    originalTextLength: text.length,
    maxChars,
    suffixFactory,
  });
}

/**
 * Calculate the maximum allowed characters for a single tool result
 * based on the model's context window tokens.
 *
 * Uses a rough 4 chars ≈ 1 token heuristic (conservative for English text;
 * actual ratio varies by tokenizer).
 */
export function calculateMaxToolResultChars(contextWindowTokens: number): number {
  return calculateMaxToolResultCharsWithCap(
    contextWindowTokens,
    DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS,
  );
}

export function calculateMaxToolResultCharsWithCap(
  contextWindowTokens: number,
  hardCapChars: number,
): number {
  const maxTokens = Math.floor(contextWindowTokens * MAX_TOOL_RESULT_CONTEXT_SHARE);
  // Rough conversion: ~4 chars per token on average
  const maxChars = maxTokens * 4;
  return Math.min(maxChars, Math.max(1, hardCapChars));
}

export function resolveLiveToolResultMaxChars(params: {
  contextWindowTokens: number;
  cfg?: OpenClawConfig;
  agentId?: string | null;
}): number {
  const configuredCap =
    resolveAgentContextLimits(params.cfg, params.agentId)?.toolResultMaxChars ??
    DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS;
  return calculateMaxToolResultCharsWithCap(params.contextWindowTokens, configuredCap);
}

/**
 * Get the total character count of text content blocks in a tool result message.
 */
export function getToolResultTextLength(msg: AgentMessage): number {
  if (!msg || (msg as { role?: string }).role !== "toolResult") {
    return 0;
  }
  const content = (msg as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return 0;
  }
  let totalLength = 0;
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      const text = (block as TextContent).text;
      if (typeof text === "string") {
        totalLength += text.length;
      }
    }
  }
  return totalLength;
}

function getToolResultTextForManagedOutput(msg: AgentMessage): string {
  if (!msg || (msg as { role?: string }).role !== "toolResult") {
    return "";
  }
  const content = (msg as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object" || (block as { type?: string }).type !== "text") {
        return "";
      }
      const text = (block as TextContent).text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function readToolResultStringField(
  msg: AgentMessage,
  key: "toolCallId" | "toolName",
): string | undefined {
  const value = (msg as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Truncate a tool result message's text content blocks to fit within maxChars.
 * Returns a new message (does not mutate the original).
 */
export function truncateToolResultMessage(
  msg: AgentMessage,
  maxChars: number,
  options: ToolResultTruncationOptions = {},
): AgentMessage {
  const suffixFactory = resolveSuffixFactory(options.suffix);
  const minKeepChars = resolveEffectiveMinKeepChars({
    maxChars,
    minKeepChars: options.minKeepChars ?? MIN_KEEP_CHARS,
    suffixFactory,
  });
  const content = (msg as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return msg;
  }

  // Calculate total text size
  const totalTextChars = getToolResultTextLength(msg);
  if (totalTextChars <= maxChars) {
    return msg;
  }

  // Distribute the budget proportionally among text blocks
  const newContent = content.map((block: unknown) => {
    if (!block || typeof block !== "object" || (block as { type?: string }).type !== "text") {
      return block; // Keep non-text blocks (images) as-is
    }
    const textBlock = block as TextContent;
    if (typeof textBlock.text !== "string") {
      return block;
    }
    // Proportional budget for this block
    const blockShare = textBlock.text.length / totalTextChars;
    const defaultSuffix = suffixFactory(
      Math.max(1, textBlock.text.length - Math.floor(maxChars * blockShare)),
    );
    const proportionalBudget = Math.floor(maxChars * blockShare);
    const blockBudget = Math.max(
      1,
      Math.min(maxChars, Math.max(minKeepChars + defaultSuffix.length, proportionalBudget)),
    );
    return {
      ...textBlock,
      text: truncateToolResultText(textBlock.text, blockBudget, {
        suffix: suffixFactory,
        minKeepChars,
      }),
    };
  });

  return { ...msg, content: newContent } as AgentMessage;
}

export function truncateToolResultMessageWithManagedOutput(params: {
  message: AgentMessage;
  maxChars: number;
  stateRoot?: string | null;
  sessionKey?: string;
  reason: string;
  minKeepChars?: number;
}): AgentMessage {
  if ((params.message as { role?: string }).role !== "toolResult") {
    return params.message;
  }
  const text = getToolResultTextForManagedOutput(params.message);
  if (!text || getToolResultTextLength(params.message) <= params.maxChars) {
    return params.message;
  }
  const projected = projectToolOutput({
    text,
    options: {
      maxLines: DEFAULT_TOOL_OUTPUT_MAX_LINES,
      maxBytes: Math.max(1, params.maxChars),
      direction: "head",
      stateRoot: params.stateRoot,
      sessionKey: params.sessionKey,
      toolCallId: readToolResultStringField(params.message, "toolCallId"),
      toolName: readToolResultStringField(params.message, "toolName") ?? "tool_result",
      outputKind: "tool_result",
      reason: params.reason,
    },
  });
  if (!projected.truncated) {
    return params.message;
  }
  return {
    ...params.message,
    content: [{ type: "text", text: projected.content }],
  } as AgentMessage;
}

/**
 * Truncate oversized tool results in an array of messages (in-memory).
 * Returns a new array with truncated messages.
 *
 * This is used as a pre-emptive guard before sending messages to the LLM,
 * without modifying the session file.
 */
export function truncateOversizedToolResultsInMessages(
  messages: AgentMessage[],
  contextWindowTokens: number,
  maxCharsOverride?: number,
): { messages: AgentMessage[]; truncatedCount: number } {
  const maxChars = Math.max(
    1,
    maxCharsOverride ?? calculateMaxToolResultChars(contextWindowTokens),
  );
  let truncatedCount = 0;

  const result = messages.map((msg) => {
    if ((msg as { role?: string }).role !== "toolResult") {
      return msg;
    }
    const textLength = getToolResultTextLength(msg);
    if (textLength <= maxChars) {
      return msg;
    }
    truncatedCount++;
    return truncateToolResultMessage(msg, maxChars);
  });

  return { messages: result, truncatedCount };
}

function calculateRecoveryAggregateToolResultChars(
  contextWindowTokens: number,
  maxCharsOverride?: number,
): number {
  return Math.max(1, maxCharsOverride ?? calculateMaxToolResultChars(contextWindowTokens));
}

export type ToolResultReductionPotential = {
  maxChars: number;
  aggregateBudgetChars: number;
  toolResultCount: number;
  totalToolResultChars: number;
  mutationToolCallCount: number;
  mutationToolCallChars: number;
  mutationToolCallReducibleChars: number;
  oversizedCount: number;
  oversizedReducibleChars: number;
  aggregateReducibleChars: number;
  maxReducibleChars: number;
};

type ToolResultBranchEntry = {
  id: string;
  type: string;
  message?: AgentMessage;
};

type ToolResultReplacement = {
  entryId: string;
  message: AgentMessage;
};

const OLD_TOOL_RESULT_PROTECT_CHARS = 40_000;
const OLD_TOOL_RESULT_MIN_CLEAR_CHARS = 20_000;
const PROTECTED_RECENT_USER_TURNS = 2;
const MUTATION_TOOL_NAMES = new Set(["edit", "apply_patch", "write"]);
const COMPACT_MUTATION_STRING_FIELD_MIN_CHARS = 256;
const COMPACT_MUTATION_INPUT_MIN_CHARS = 2_000;

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function readMessageRole(message: AgentMessage | undefined): string {
  return typeof (message as { role?: unknown } | undefined)?.role === "string"
    ? (message as { role: string }).role
    : "";
}

function isToolCallBlock(block: unknown): block is Record<string, unknown> {
  if (!block || typeof block !== "object") {
    return false;
  }
  const type = (block as { type?: unknown }).type;
  return type === "toolCall" || type === "toolUse" || type === "functionCall";
}

function normalizeToolName(value: unknown): string {
  return typeof value === "string" ? normalizeLowercaseStringOrEmpty(value) : "";
}

function readToolCallBlockId(block: Record<string, unknown>): string | undefined {
  const value = block.id;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readToolResultCallId(message: AgentMessage): string | undefined {
  const record = message as unknown as Record<string, unknown>;
  const value = record.toolCallId ?? record.toolUseId ?? record.callId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isSuccessfulToolResult(message: AgentMessage): boolean {
  const record = message as unknown as Record<string, unknown>;
  return record.isError !== true;
}

function collectSettledToolResultIdsFromBranch(branch: ToolResultBranchEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of branch) {
    if (entry.type !== "message" || readMessageRole(entry.message) !== "toolResult") {
      continue;
    }
    if (!entry.message || !isSuccessfulToolResult(entry.message)) {
      continue;
    }
    const id = entry.message ? readToolResultCallId(entry.message) : undefined;
    if (id) {
      ids.add(id);
    }
  }
  return ids;
}

function collectSettledToolResultIdsFromMessages(messages: AgentMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (readMessageRole(message) !== "toolResult") {
      continue;
    }
    if (!isSuccessfulToolResult(message)) {
      continue;
    }
    const id = readToolResultCallId(message);
    if (id) {
      ids.add(id);
    }
  }
  return ids;
}

function buildRecentTurnProtection(branch: ToolResultBranchEntry[]): boolean[] {
  const protectedIndices = Array.from({ length: branch.length }, () => false);
  let userTurnsSeen = 0;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    protectedIndices[index] = userTurnsSeen < PROTECTED_RECENT_USER_TURNS;
    if (entry?.type === "message" && readMessageRole(entry.message) === "user") {
      userTurnsSeen += 1;
    }
  }
  return protectedIndices;
}

function isOldToolResultMarker(text: string): boolean {
  return text.trimStart().startsWith(OLD_TOOL_RESULT_CONTENT_CLEARED);
}

function buildOldToolResultClearedMarker(params: {
  text: string;
  managedOutput: PersistManagedToolOutputResult | null;
}): string {
  const preview = truncateUtf8ToMaxBytes(params.text, COMPACTION_TOOL_OUTPUT_MAX_BYTES);
  const omittedChars = Math.max(0, params.text.length - preview.length);
  return [
    OLD_TOOL_RESULT_CONTENT_CLEARED,
    params.managedOutput
      ? `Full output saved to: ${params.managedOutput.outputPath}`
      : "Full output saved to: unavailable",
    "<content>",
    preview,
    omittedChars > 0 ? `[old tool result preview truncated: omitted ${omittedChars} chars]` : null,
    "</content>",
    params.managedOutput
      ? "Use Grep to search the full content or Read with offset/limit to view specific sections."
      : null,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");
}

function buildOldToolResultClearingReplacements(params: {
  branch: ToolResultBranchEntry[];
  stateRoot?: string | null;
  sessionKey?: string;
  protectedChars?: number;
  minClearChars?: number;
}): ToolResultReplacement[] {
  const protectedIndices = buildRecentTurnProtection(params.branch);
  const protectedChars = params.protectedChars ?? OLD_TOOL_RESULT_PROTECT_CHARS;
  const minClearChars = params.minClearChars ?? OLD_TOOL_RESULT_MIN_CLEAR_CHARS;
  const replacements: ToolResultReplacement[] = [];
  let accumulatedChars = 0;
  let clearedChars = 0;

  for (let index = params.branch.length - 1; index >= 0; index -= 1) {
    const entry = params.branch[index];
    if (!entry || protectedIndices[index] || entry.type !== "message" || !entry.message) {
      continue;
    }
    if (readMessageRole(entry.message) !== "toolResult") {
      continue;
    }
    const text = getToolResultTextForManagedOutput(entry.message);
    if (!text || isOldToolResultMarker(text)) {
      continue;
    }
    accumulatedChars += text.length;
    if (accumulatedChars <= protectedChars) {
      continue;
    }
    const managedOutput = persistManagedToolOutputSync({
      stateRoot: params.stateRoot,
      sessionKey: params.sessionKey,
      toolCallId: readToolResultCallId(entry.message),
      toolName: readToolResultStringField(entry.message, "toolName") ?? "tool_result",
      text,
      outputKind: "tool_result",
      reason: "old_tool_result_content_cleared",
    });
    const marker = buildOldToolResultClearedMarker({ text, managedOutput });
    replacements.push({
      entryId: entry.id,
      message: {
        ...entry.message,
        content: [{ type: "text", text: marker }],
      } as AgentMessage,
    });
    clearedChars += Math.max(0, text.length - marker.length);
  }

  return clearedChars >= minClearChars ? replacements : [];
}

function compactReplayString(label: string, value: string): string {
  return `[${label} omitted from settled tool-call replay; bytes=${byteLengthUtf8(value)}; sha256=${hashText(value)}]`;
}

function compactMutationValue(value: unknown, label: string): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    if (value.length < COMPACT_MUTATION_STRING_FIELD_MIN_CHARS) {
      return { value, changed: false };
    }
    return { value: compactReplayString(label, value), changed: true };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item, index) => {
      const compacted = compactMutationValue(item, `${label}[${index}]`);
      changed ||= compacted.changed;
      return compacted.value;
    });
    return { value: next, changed };
  }
  if (!value || typeof value !== "object") {
    return { value, changed: false };
  }
  let changed = false;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "oldText" || key === "newText" || key === "content" || key === "patch") {
      const compacted = compactMutationValue(child, key);
      changed ||= compacted.changed;
      next[key] = compacted.value;
      continue;
    }
    if (key === "edits" && Array.isArray(child)) {
      const compacted = compactMutationValue(child, key);
      changed ||= compacted.changed;
      next[key] = compacted.value;
      continue;
    }
    next[key] = child;
  }
  if (changed) {
    next.replayCompacted = true;
  }
  return { value: next, changed };
}

function compactMutationToolCallBlock(block: Record<string, unknown>): {
  block: Record<string, unknown>;
  changed: boolean;
} {
  const toolName = normalizeToolName(block.name);
  if (!MUTATION_TOOL_NAMES.has(toolName)) {
    return { block, changed: false };
  }
  const inputKey = Object.hasOwn(block, "arguments") ? "arguments" : "input";
  const input = block[inputKey];
  const serialized = JSON.stringify(input ?? {});
  if (serialized.length < COMPACT_MUTATION_INPUT_MIN_CHARS) {
    return { block, changed: false };
  }
  const compacted = compactMutationValue(input, toolName);
  if (!compacted.changed) {
    return { block, changed: false };
  }
  return {
    block: {
      ...block,
      [inputKey]: compacted.value,
    },
    changed: true,
  };
}

function compactAssistantMutationToolCalls(params: {
  message: AgentMessage;
  settledToolResultIds: ReadonlySet<string>;
}): { message: AgentMessage; changed: boolean } {
  if (readMessageRole(params.message) !== "assistant") {
    return { message: params.message, changed: false };
  }
  const content = (params.message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return { message: params.message, changed: false };
  }
  let changed = false;
  const nextContent = content.map((block) => {
    if (!isToolCallBlock(block)) {
      return block;
    }
    const id = readToolCallBlockId(block);
    if (!id || !params.settledToolResultIds.has(id)) {
      return block;
    }
    const compacted = compactMutationToolCallBlock(block);
    changed ||= compacted.changed;
    return compacted.block;
  });
  if (!changed) {
    return { message: params.message, changed: false };
  }
  return {
    message: {
      ...params.message,
      content: nextContent,
    } as AgentMessage,
    changed: true,
  };
}

function buildSettledMutationToolCallInputReplacements(params: {
  branch: ToolResultBranchEntry[];
}): ToolResultReplacement[] {
  const settledToolResultIds = collectSettledToolResultIdsFromBranch(params.branch);
  if (settledToolResultIds.size === 0) {
    return [];
  }
  const replacements: ToolResultReplacement[] = [];
  for (let index = 0; index < params.branch.length; index += 1) {
    const entry = params.branch[index];
    if (!entry || entry.type !== "message" || !entry.message) {
      continue;
    }
    const compacted = compactAssistantMutationToolCalls({
      message: entry.message,
      settledToolResultIds,
    });
    if (compacted.changed) {
      replacements.push({ entryId: entry.id, message: compacted.message });
    }
  }
  return replacements;
}

function estimateMutationToolCallReduction(messages: AgentMessage[]): {
  count: number;
  chars: number;
  reducibleChars: number;
} {
  const settledToolResultIds = collectSettledToolResultIdsFromMessages(messages);
  if (settledToolResultIds.size === 0) {
    return { count: 0, chars: 0, reducibleChars: 0 };
  }
  let count = 0;
  let chars = 0;
  let reducibleChars = 0;
  for (const message of messages) {
    if (readMessageRole(message) !== "assistant") {
      continue;
    }
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (!isToolCallBlock(block)) {
        continue;
      }
      const id = readToolCallBlockId(block);
      if (
        !id ||
        !settledToolResultIds.has(id) ||
        !MUTATION_TOOL_NAMES.has(normalizeToolName(block.name))
      ) {
        continue;
      }
      const before = JSON.stringify(block);
      const compacted = compactMutationToolCallBlock(block);
      if (!compacted.changed) {
        continue;
      }
      const after = JSON.stringify(compacted.block);
      count += 1;
      chars += before.length;
      reducibleChars += Math.max(0, before.length - after.length);
    }
  }
  return { count, chars, reducibleChars };
}

export function projectMessagesForCompactionInput(params: {
  messages: AgentMessage[];
  stateRoot?: string | null;
  sessionKey?: string;
  maxToolOutputBytes?: number;
}): {
  messages: AgentMessage[];
  projectedCount: number;
  toolResultProjectedCount: number;
  mutationToolCallProjectedCount: number;
} {
  const maxToolOutputBytes = resolvePositiveInt(
    params.maxToolOutputBytes,
    COMPACTION_TOOL_OUTPUT_MAX_BYTES,
  );
  const settledToolResultIds = collectSettledToolResultIdsFromMessages(params.messages);
  let projectedCount = 0;
  let toolResultProjectedCount = 0;
  let mutationToolCallProjectedCount = 0;
  const messages = params.messages.map((message) => {
    if (readMessageRole(message) === "toolResult") {
      const capped = truncateToolResultMessageWithManagedOutput({
        message,
        maxChars: maxToolOutputBytes,
        stateRoot: params.stateRoot,
        sessionKey: params.sessionKey,
        reason: "compaction_input_tool_output_cap",
        minKeepChars: 0,
      });
      if (capped !== message) {
        projectedCount += 1;
        toolResultProjectedCount += 1;
      }
      return capped;
    }
    const compacted = compactAssistantMutationToolCalls({
      message,
      settledToolResultIds,
    });
    if (compacted.changed) {
      projectedCount += 1;
      mutationToolCallProjectedCount += 1;
      return compacted.message;
    }
    return message;
  });

  return {
    messages,
    projectedCount,
    toolResultProjectedCount,
    mutationToolCallProjectedCount,
  };
}

function buildAggregateToolResultReplacements(params: {
  branch: ToolResultBranchEntry[];
  aggregateBudgetChars: number;
  minKeepChars?: number;
  stateRoot?: string | null;
  sessionKey?: string;
}): ToolResultReplacement[] {
  const minKeepChars = params.minKeepChars ?? MIN_KEEP_CHARS;
  const minTruncatedTextChars = minKeepChars + DEFAULT_SUFFIX(1).length;
  const candidates = params.branch
    .map((entry, index) => ({ entry, index }))
    .filter(
      (
        item,
      ): item is {
        entry: { id: string; type: string; message: AgentMessage };
        index: number;
      } =>
        item.entry.type === "message" &&
        Boolean(item.entry.message) &&
        (item.entry.message as { role?: string }).role === "toolResult",
    )
    .map((item) => ({
      index: item.index,
      entryId: item.entry.id,
      message: item.entry.message,
      textLength: getToolResultTextLength(item.entry.message),
    }))
    .filter((item) => item.textLength > 0);

  if (candidates.length < 2) {
    return [];
  }

  const totalChars = candidates.reduce((sum, item) => sum + item.textLength, 0);
  if (totalChars <= params.aggregateBudgetChars) {
    return [];
  }

  let remainingReduction = totalChars - params.aggregateBudgetChars;
  const replacements: Array<{ entryId: string; message: AgentMessage }> = [];

  for (const candidate of candidates.toSorted((a, b) => {
    if (a.index !== b.index) {
      return b.index - a.index;
    }
    return b.textLength - a.textLength;
  })) {
    if (remainingReduction <= 0) {
      break;
    }
    const reducibleChars = Math.max(0, candidate.textLength - minTruncatedTextChars);
    if (reducibleChars <= 0) {
      continue;
    }

    const requestedReduction = Math.min(reducibleChars, remainingReduction);
    const targetChars = Math.max(minTruncatedTextChars, candidate.textLength - requestedReduction);
    const truncatedMessage = truncateToolResultMessageWithManagedOutput({
      message: candidate.message,
      maxChars: targetChars,
      stateRoot: params.stateRoot,
      sessionKey: params.sessionKey,
      reason: "tool_result_aggregate_truncation",
      minKeepChars,
    });
    const newLength = getToolResultTextLength(truncatedMessage);
    const actualReduction = Math.max(0, candidate.textLength - newLength);
    if (actualReduction <= 0) {
      continue;
    }

    replacements.push({ entryId: candidate.entryId, message: truncatedMessage });
    remainingReduction -= actualReduction;
  }

  return replacements;
}

function buildOversizedToolResultReplacements(params: {
  branch: ToolResultBranchEntry[];
  maxChars: number;
  minKeepChars?: number;
  stateRoot?: string | null;
  sessionKey?: string;
}): ToolResultReplacement[] {
  const minKeepChars = params.minKeepChars ?? MIN_KEEP_CHARS;
  const replacements: ToolResultReplacement[] = [];

  for (const entry of params.branch) {
    if (entry.type !== "message" || !entry.message) {
      continue;
    }
    const msg = entry.message;
    if ((msg as { role?: string }).role !== "toolResult") {
      continue;
    }
    if (getToolResultTextLength(msg) <= params.maxChars) {
      continue;
    }
    replacements.push({
      entryId: entry.id,
      message: truncateToolResultMessageWithManagedOutput({
        message: msg,
        maxChars: params.maxChars,
        stateRoot: params.stateRoot,
        sessionKey: params.sessionKey,
        reason: "tool_result_oversized_truncation",
        minKeepChars,
      }),
    });
  }

  return replacements;
}

function calculateReplacementReduction(
  branch: ToolResultBranchEntry[],
  replacements: ToolResultReplacement[],
): number {
  if (replacements.length === 0) {
    return 0;
  }
  const branchById = new Map(branch.map((entry) => [entry.id, entry]));
  let reduction = 0;

  for (const replacement of replacements) {
    const entry = branchById.get(replacement.entryId);
    if (!entry?.message) {
      continue;
    }
    reduction += Math.max(
      0,
      getToolResultTextLength(entry.message) - getToolResultTextLength(replacement.message),
    );
  }

  return reduction;
}

function applyToolResultReplacementsToBranch(
  branch: ToolResultBranchEntry[],
  replacements: ToolResultReplacement[],
): ToolResultBranchEntry[] {
  if (replacements.length === 0) {
    return branch;
  }
  const replacementsById = new Map(
    replacements.map((replacement) => [replacement.entryId, replacement]),
  );
  return branch.map((entry) => {
    const replacement = replacementsById.get(entry.id);
    if (!replacement || entry.type !== "message") {
      return entry;
    }
    return {
      ...entry,
      message: replacement.message,
    };
  });
}

function buildToolResultReplacementPlan(params: {
  branch: ToolResultBranchEntry[];
  maxChars: number;
  aggregateBudgetChars: number;
  minKeepChars?: number;
  stateRoot?: string | null;
  sessionKey?: string;
}): {
  replacements: ToolResultReplacement[];
  oversizedReplacementCount: number;
  aggregateReplacementCount: number;
  oversizedReducibleChars: number;
  aggregateReducibleChars: number;
} {
  const minKeepChars = params.minKeepChars ?? MIN_KEEP_CHARS;
  const oversizedReplacements = buildOversizedToolResultReplacements({
    branch: params.branch,
    maxChars: params.maxChars,
    minKeepChars,
    stateRoot: params.stateRoot,
    sessionKey: params.sessionKey,
  });
  const oversizedReducibleChars = calculateReplacementReduction(
    params.branch,
    oversizedReplacements,
  );
  const oversizedTrimmedBranch = applyToolResultReplacementsToBranch(
    params.branch,
    oversizedReplacements,
  );
  const aggregateReplacements = buildAggregateToolResultReplacements({
    branch: oversizedTrimmedBranch,
    aggregateBudgetChars: params.aggregateBudgetChars,
    minKeepChars,
    stateRoot: params.stateRoot,
    sessionKey: params.sessionKey,
  });
  const aggregateReducibleChars = calculateReplacementReduction(
    oversizedTrimmedBranch,
    aggregateReplacements,
  );

  return {
    replacements: [...oversizedReplacements, ...aggregateReplacements],
    oversizedReplacementCount: oversizedReplacements.length,
    aggregateReplacementCount: aggregateReplacements.length,
    oversizedReducibleChars,
    aggregateReducibleChars,
  };
}
export function estimateToolResultReductionPotential(params: {
  messages: AgentMessage[];
  contextWindowTokens: number;
  maxCharsOverride?: number;
}): ToolResultReductionPotential {
  const { messages, contextWindowTokens } = params;
  const maxChars = Math.max(
    1,
    params.maxCharsOverride ?? calculateMaxToolResultChars(contextWindowTokens),
  );
  const aggregateBudgetChars = calculateRecoveryAggregateToolResultChars(
    contextWindowTokens,
    maxChars,
  );
  const branch = messages.map((message, index) => ({
    id: `message-${index}`,
    type: "message",
    message,
  }));

  let toolResultCount = 0;
  let totalToolResultChars = 0;
  for (const msg of messages) {
    if ((msg as { role?: string }).role !== "toolResult") {
      continue;
    }
    const textLength = getToolResultTextLength(msg);
    if (textLength <= 0) {
      continue;
    }
    toolResultCount += 1;
    totalToolResultChars += textLength;
  }
  const plan = buildToolResultReplacementPlan({
    branch,
    maxChars,
    aggregateBudgetChars,
    minKeepChars: RECOVERY_MIN_KEEP_CHARS,
  });
  const mutationReduction = estimateMutationToolCallReduction(messages);
  const maxReducibleChars =
    plan.oversizedReducibleChars + plan.aggregateReducibleChars + mutationReduction.reducibleChars;

  return {
    maxChars,
    aggregateBudgetChars,
    toolResultCount,
    totalToolResultChars,
    mutationToolCallCount: mutationReduction.count,
    mutationToolCallChars: mutationReduction.chars,
    mutationToolCallReducibleChars: mutationReduction.reducibleChars,
    oversizedCount: plan.oversizedReplacementCount,
    oversizedReducibleChars: plan.oversizedReducibleChars,
    aggregateReducibleChars: plan.aggregateReducibleChars,
    maxReducibleChars,
  };
}

function compactOldProviderReplayPayloadsInSessionManager(params: {
  sessionManager: SessionManager;
  sessionFile?: string;
  sessionId?: string;
  sessionKey?: string;
  stateRoot?: string | null;
}): { compacted: boolean; compactedCount: number; reason?: string } {
  const branch = params.sessionManager.getBranch() as ToolResultBranchEntry[];
  if (branch.length === 0) {
    return { compacted: false, compactedCount: 0, reason: "empty session" };
  }
  const mutationReplacements = buildSettledMutationToolCallInputReplacements({ branch });
  const mutationTrimmedBranch = applyToolResultReplacementsToBranch(branch, mutationReplacements);
  const oldToolResultReplacements = buildOldToolResultClearingReplacements({
    branch: mutationTrimmedBranch,
    stateRoot: params.stateRoot,
    sessionKey: params.sessionKey ?? params.sessionId,
  });
  const replacements = [...mutationReplacements, ...oldToolResultReplacements];
  if (replacements.length === 0) {
    return { compacted: false, compactedCount: 0, reason: "no old provider replay payloads" };
  }
  const rewriteResult = rewriteTranscriptEntriesInSessionManager({
    sessionManager: params.sessionManager,
    replacements,
  });
  if (rewriteResult.changed && params.sessionFile) {
    emitSessionTranscriptUpdate(params.sessionFile);
  }
  return {
    compacted: rewriteResult.changed,
    compactedCount: rewriteResult.rewrittenEntries,
    reason: rewriteResult.reason,
  };
}

function truncateOversizedToolResultsInExistingSessionManager(params: {
  sessionManager: SessionManager;
  contextWindowTokens: number;
  maxCharsOverride?: number;
  sessionFile?: string;
  sessionId?: string;
  sessionKey?: string;
  stateRoot?: string | null;
}): { truncated: boolean; truncatedCount: number; reason?: string } {
  const { sessionManager, contextWindowTokens } = params;
  const maxChars = Math.max(
    1,
    params.maxCharsOverride ?? calculateMaxToolResultChars(contextWindowTokens),
  );
  const aggregateBudgetChars = calculateRecoveryAggregateToolResultChars(
    contextWindowTokens,
    maxChars,
  );
  const branch = sessionManager.getBranch() as ToolResultBranchEntry[];

  if (branch.length === 0) {
    return { truncated: false, truncatedCount: 0, reason: "empty session" };
  }

  const plan = buildToolResultReplacementPlan({
    branch,
    maxChars,
    aggregateBudgetChars,
    minKeepChars: RECOVERY_MIN_KEEP_CHARS,
    stateRoot: params.stateRoot,
    sessionKey: params.sessionKey ?? params.sessionId,
  });
  const rewriteResult =
    plan.replacements.length > 0
      ? rewriteTranscriptEntriesInSessionManager({
          sessionManager,
          replacements: plan.replacements,
        })
      : {
          changed: false,
          bytesFreed: 0,
          rewrittenEntries: 0,
          reason: "no oversized or aggregate tool results",
        };
  if (rewriteResult.changed && params.sessionFile) {
    emitSessionTranscriptUpdate(params.sessionFile);
  }
  const replayCompaction = compactOldProviderReplayPayloadsInSessionManager({
    sessionManager,
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    stateRoot: params.stateRoot,
  });

  log.info(
    `[tool-result-truncation] Truncated ${rewriteResult.rewrittenEntries} tool result(s) and compacted ` +
      `${replayCompaction.compactedCount} old replay payload(s) in session ` +
      `(contextWindow=${contextWindowTokens} maxChars=${maxChars} aggregateBudgetChars=${aggregateBudgetChars} ` +
      `oversized=${plan.oversizedReplacementCount} aggregate=${plan.aggregateReplacementCount}) ` +
      `sessionKey=${params.sessionKey ?? params.sessionId ?? "unknown"}`,
  );

  return {
    truncated: rewriteResult.changed || replayCompaction.compacted,
    truncatedCount: rewriteResult.rewrittenEntries + replayCompaction.compactedCount,
    reason: rewriteResult.reason ?? replayCompaction.reason,
  };
}

export function truncateOversizedToolResultsInSessionManager(params: {
  sessionManager: SessionManager;
  contextWindowTokens: number;
  maxCharsOverride?: number;
  sessionFile?: string;
  sessionId?: string;
  sessionKey?: string;
  stateRoot?: string | null;
}): { truncated: boolean; truncatedCount: number; reason?: string } {
  try {
    return truncateOversizedToolResultsInExistingSessionManager(params);
  } catch (err) {
    const errMsg = formatErrorMessage(err);
    log.warn(`[tool-result-truncation] Failed to truncate: ${errMsg}`);
    return { truncated: false, truncatedCount: 0, reason: errMsg };
  }
}

export async function truncateOversizedToolResultsInSession(params: {
  sessionFile: string;
  contextWindowTokens: number;
  maxCharsOverride?: number;
  sessionId?: string;
  sessionKey?: string;
  stateRoot?: string | null;
}): Promise<{ truncated: boolean; truncatedCount: number; reason?: string }> {
  const { sessionFile, contextWindowTokens } = params;
  let sessionLock: Awaited<ReturnType<typeof acquireSessionWriteLock>> | undefined;

  try {
    sessionLock = await acquireSessionWriteLock({ sessionFile });
    const sessionManager = SessionManager.open(sessionFile);
    return truncateOversizedToolResultsInExistingSessionManager({
      sessionManager,
      contextWindowTokens,
      maxCharsOverride: params.maxCharsOverride,
      sessionFile,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      stateRoot: params.stateRoot,
    });
  } catch (err) {
    const errMsg = formatErrorMessage(err);
    log.warn(`[tool-result-truncation] Failed to truncate: ${errMsg}`);
    return { truncated: false, truncatedCount: 0, reason: errMsg };
  } finally {
    await sessionLock?.release();
  }
}

/**
 * Check if a tool result message exceeds the size limit for a given context window.
 */
export function isOversizedToolResult(
  msg: AgentMessage,
  contextWindowTokens: number,
  maxCharsOverride?: number,
): boolean {
  if ((msg as { role?: string }).role !== "toolResult") {
    return false;
  }
  const maxChars = Math.max(
    1,
    maxCharsOverride ?? calculateMaxToolResultChars(contextWindowTokens),
  );
  return getToolResultTextLength(msg) > maxChars;
}

export function sessionLikelyHasOversizedToolResults(params: {
  messages: AgentMessage[];
  contextWindowTokens: number;
  maxCharsOverride?: number;
}): boolean {
  const estimate = estimateToolResultReductionPotential(params);
  return (
    estimate.oversizedCount > 0 ||
    estimate.aggregateReducibleChars > 0 ||
    estimate.mutationToolCallReducibleChars > 0
  );
}
