import { Type } from "@sinclair/typebox";
import { resolveStateDir } from "../../config/paths.js";
import {
  grepManagedToolOutputRefSync,
  readManagedToolOutputRefLinesSync,
  readManagedToolOutputRefSync,
  type ManagedToolOutputGrepResult,
} from "../../config/sessions/managed-output.js";
import { hydrateSessionWorkingContextResourceRef } from "../../config/sessions/working-context.js";
import type { AnyAgentTool } from "./common.js";
import { readNumberParam, readStringParam, textResult } from "./common.js";

export const OPENCLAW_RESOURCE_READ_TOOL_NAME = "openclaw_resource_read" as const;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const OpenClawResourceReadToolSchema = Type.Object({
  ref: Type.String({
    minLength: 1,
    maxLength: 800,
    description: "Exact OpenClaw resource ref, such as openclaw-managed-output://...",
  }),
  offsetBytes: Type.Optional(Type.Number({ minimum: 0 })),
  maxBytes: Type.Optional(Type.Number({ minimum: 500, maximum: 50_000 })),
  offsetLines: Type.Optional(Type.Number({ minimum: 1 })),
  limitLines: Type.Optional(Type.Number({ minimum: 1, maximum: 2_000 })),
  query: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Optional regex search query for openclaw-managed-output refs. Set regex:false for literal text search.",
    }),
  ),
  regex: Type.Optional(
    Type.Boolean({ description: "Use regex search for query. Defaults to true." }),
  ),
  caseSensitive: Type.Optional(Type.Boolean({ description: "Use case-sensitive search." })),
  contextLines: Type.Optional(Type.Number({ minimum: 0, maximum: 3 })),
  maxMatches: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
});

export function hydrateManagedOutputResourceRef(input: {
  ref: string;
  stateRoot?: string | null;
  offsetBytes?: number;
  maxBytes?: number;
  offsetLines?: number;
  limitLines?: number;
}): JsonValue | null {
  if (typeof input.offsetBytes !== "number") {
    const lineHydrated = readManagedToolOutputRefLinesSync({
      stateRoot: input.stateRoot,
      ref: input.ref,
      offsetLines: input.offsetLines,
      limitLines: input.limitLines,
      maxBytes: input.maxBytes,
    });
    if (!lineHydrated) {
      return null;
    }
    const returnedBytes = Buffer.byteLength(lineHydrated.text, "utf8");
    return {
      ref: input.ref,
      status: "hydrated",
      resourceKind: "openclaw.managed_tool_output",
      body: {
        text: lineHydrated.text,
        outputPath: lineHydrated.record.outputPath,
        offsetLines: lineHydrated.offsetLines,
        returnedLines: lineHydrated.returnedLines,
        totalLines: lineHydrated.totalLines,
        nextOffsetLines: lineHydrated.nextOffsetLines,
        returnedBytes,
        totalBytes: lineHydrated.totalBytes,
        truncated: lineHydrated.truncated,
        toolName: lineHydrated.record.toolName,
        toolCallId: lineHydrated.record.toolCallId ?? null,
        outputKind: lineHydrated.record.outputKind ?? null,
        reason: lineHydrated.record.reason ?? null,
        textHash: lineHydrated.record.textHash,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      byteCount: returnedBytes,
      totalBytes: lineHydrated.totalBytes,
      truncated: lineHydrated.truncated,
      reasonCodes: ["openclaw_resource_read_hydrated_managed_tool_output"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } as JsonValue;
  }
  const hydrated = readManagedToolOutputRefSync({
    stateRoot: input.stateRoot,
    ref: input.ref,
    offsetBytes: input.offsetBytes,
    maxBytes: input.maxBytes,
  });
  if (!hydrated) {
    return null;
  }
  return {
    ref: input.ref,
    status: "hydrated",
    resourceKind: "openclaw.managed_tool_output",
    body: {
      text: hydrated.text,
      outputPath: hydrated.record.outputPath,
      offsetBytes: hydrated.offsetBytes,
      returnedBytes: hydrated.returnedBytes,
      totalBytes: hydrated.totalBytes,
      nextOffsetBytes: hydrated.nextOffsetBytes,
      truncated: hydrated.truncated,
      toolName: hydrated.record.toolName,
      toolCallId: hydrated.record.toolCallId ?? null,
      outputKind: hydrated.record.outputKind ?? null,
      reason: hydrated.record.reason ?? null,
      textHash: hydrated.record.textHash,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    byteCount: hydrated.returnedBytes,
    totalBytes: hydrated.totalBytes,
    truncated: hydrated.truncated,
    reasonCodes: ["openclaw_resource_read_hydrated_managed_tool_output"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } as JsonValue;
}

function formatManagedOutputGrepText(result: ManagedToolOutputGrepResult): string {
  if (result.status === "invalid_regex") {
    return [
      `Invalid regex: ${result.regexError ?? "unknown regex error"}`,
      "Retry the same query with regex:false for a literal search, or escape regex metacharacters.",
    ].join("\n");
  }
  if (result.matches.length === 0) {
    return "No files found";
  }
  const lines = [
    `Found ${result.matchCount} matches${result.truncated ? " (more matches available)" : ""}`,
    `${result.record.outputPath}:`,
    ...result.matches.map((match) => `  Line ${match.line}: ${match.text}`),
  ];
  if (result.truncated) {
    lines.push("", `(Results truncated. Consider using a more specific path or pattern.)`);
  }
  return lines.join("\n");
}

export function searchManagedOutputResourceRef(input: {
  ref: string;
  stateRoot?: string | null;
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  contextLines?: number;
  maxMatches?: number;
}): JsonValue | null {
  const result = grepManagedToolOutputRefSync({
    stateRoot: input.stateRoot,
    ref: input.ref,
    query: input.query,
    regex: input.regex,
    caseSensitive: input.caseSensitive,
    contextLines: input.contextLines,
    maxMatches: input.maxMatches,
  });
  if (!result) {
    return null;
  }
  const bodyText = formatManagedOutputGrepText(result);
  return {
    ref: input.ref,
    status: result.status,
    resourceKind: "openclaw.managed_tool_output_search",
    body: {
      text: bodyText,
      query: result.query,
      regex: result.regex,
      caseSensitive: result.caseSensitive,
      contextLines: result.contextLines,
      maxMatches: result.maxMatches,
      matches: result.matches,
      matchCount: result.matchCount,
      searchedLineCount: result.searchedLineCount,
      totalLines: result.totalLines,
      totalBytes: result.totalBytes,
      truncated: result.truncated,
      toolName: result.record.toolName,
      toolCallId: result.record.toolCallId ?? null,
      outputKind: result.record.outputKind ?? null,
      reason: result.record.reason ?? null,
      textHash: result.record.textHash,
      regexError: result.regexError ?? null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    byteCount: Buffer.byteLength(bodyText, "utf8"),
    totalBytes: result.totalBytes,
    truncated: result.truncated,
    reasonCodes: ["openclaw_resource_read_searched_managed_tool_output"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } as JsonValue;
}

function readRecord(value: JsonValue | null | undefined): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null;
}

function readString(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function formatPromptReadyResourceText(resource: JsonValue): string {
  const record = readRecord(resource);
  const body = readRecord(record?.body);
  const bodyText = readString(body?.text);
  if (!bodyText) {
    return "OpenClaw resource read returned no text for the requested ref.";
  }
  const nextOffsetBytes = typeof body?.nextOffsetBytes === "number" ? body.nextOffsetBytes : null;
  const nextOffsetLines = typeof body?.nextOffsetLines === "number" ? body.nextOffsetLines : null;
  const truncated = body?.truncated === true;
  const outputPath = readString(body?.outputPath);
  const offsetLines = typeof body?.offsetLines === "number" ? body.offsetLines : null;
  const returnedLines = typeof body?.returnedLines === "number" ? body.returnedLines : null;
  const totalLines = typeof body?.totalLines === "number" ? body.totalLines : null;
  if (offsetLines !== null && returnedLines !== null && totalLines !== null) {
    const lineEnd = offsetLines + Math.max(0, returnedLines) - 1;
    const numbered = bodyText
      .split(/\r?\n/u)
      .map((line, index) => `${offsetLines + index}: ${line}`)
      .join("\n");
    const continuation =
      truncated && nextOffsetLines !== null
        ? `(Showing lines ${offsetLines}-${lineEnd} of ${totalLines}. Use offset=${nextOffsetLines} to continue.)`
        : `(End of file - total ${totalLines} lines)`;
    return [
      `<path>${outputPath ?? readString(record?.ref) ?? "openclaw-managed-output"}</path>`,
      "<type>file</type>",
      "<content>",
      numbered,
      "",
      continuation,
      "</content>",
    ].join("\n");
  }
  const continuation =
    truncated && nextOffsetLines !== null
      ? `[truncated: nextOffsetLines=${nextOffsetLines}]`
      : truncated && nextOffsetBytes !== null
        ? `[truncated: nextOffsetBytes=${nextOffsetBytes}]`
        : null;
  return [bodyText.trimEnd(), continuation]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");
}

export function createOpenClawResourceReadTool(opts?: {
  stateRoot?: string | null;
  sessionKey?: string | null;
  sessionStorePath?: string | null;
  sessionStorePaths?: readonly (string | null | undefined)[];
}): AnyAgentTool {
  return {
    name: OPENCLAW_RESOURCE_READ_TOOL_NAME,
    label: "Read OpenClaw resource",
    displaySummary: "Hydrate exact OpenClaw managed-output and working-context refs.",
    description:
      "Hydrate exact OpenClaw resource refs. Use this for openclaw-managed-output:// refs returned by truncated tool output or compaction, and openclaw-session-working-context:// refs for the current session, parent session, or direct child sessions. Managed-output refs default to line-window readback with offsetLines, limitLines, totalLines, and nextOffsetLines; pass query to grep/search the full managed output by regex, or regex:false for literal search. Pass offsetBytes only when byte-level continuation is required. Working-context refs return bounded prompt-ready context windows, file_graph, change_set, validation_state text, and entry refs. It does not read local source paths, stateRoot paths, or fuzzy resource names.",
    parameters: OpenClawResourceReadToolSchema,
    execute: async (_callId, rawParams) => {
      const params = rawParams && typeof rawParams === "object" ? rawParams : {};
      const record = params as Record<string, unknown>;
      const ref = readStringParam(record, "ref", { required: true, label: "ref" });
      const offsetBytes = readNumberParam(record, "offsetBytes", {
        required: false,
        label: "offsetBytes",
        integer: true,
      });
      const rawMaxBytes = readNumberParam(record, "maxBytes", {
        required: false,
        label: "maxBytes",
        integer: true,
      });
      const maxBytes =
        typeof rawMaxBytes === "number" && Number.isFinite(rawMaxBytes)
          ? Math.max(500, Math.min(50_000, Math.floor(rawMaxBytes)))
          : 16_000;
      const offsetLines = readNumberParam(record, "offsetLines", {
        required: false,
        label: "offsetLines",
        integer: true,
      });
      const rawLimitLines = readNumberParam(record, "limitLines", {
        required: false,
        label: "limitLines",
        integer: true,
      });
      const limitLines =
        typeof rawLimitLines === "number" && Number.isFinite(rawLimitLines)
          ? Math.max(1, Math.min(2_000, Math.floor(rawLimitLines)))
          : undefined;
      const query = readStringParam(record, "query", { required: false });
      const contextLines = readNumberParam(record, "contextLines", {
        required: false,
        label: "contextLines",
        integer: true,
      });
      const maxMatches = readNumberParam(record, "maxMatches", {
        required: false,
        label: "maxMatches",
        integer: true,
      });
      if (query) {
        const searched = searchManagedOutputResourceRef({
          ref,
          stateRoot: opts?.stateRoot ?? resolveStateDir(process.env),
          query,
          regex: record.regex !== false,
          caseSensitive: record.caseSensitive === true,
          contextLines:
            typeof contextLines === "number" && Number.isFinite(contextLines)
              ? Math.max(0, Math.min(3, Math.floor(contextLines)))
              : undefined,
          maxMatches:
            typeof maxMatches === "number" && Number.isFinite(maxMatches)
              ? Math.max(1, Math.min(100, Math.floor(maxMatches)))
              : undefined,
        });
        if (searched) {
          return textResult(formatPromptReadyResourceText(searched), searched);
        }
      }
      const hydrated = hydrateManagedOutputResourceRef({
        ref,
        stateRoot: opts?.stateRoot ?? resolveStateDir(process.env),
        offsetBytes,
        maxBytes,
        offsetLines,
        limitLines,
      });
      if (hydrated) {
        return textResult(formatPromptReadyResourceText(hydrated), hydrated);
      }
      const workingContext = hydrateSessionWorkingContextResourceRef({
        ref,
        storePath: opts?.sessionStorePath,
        storePaths: opts?.sessionStorePaths,
        currentSessionKey: opts?.sessionKey,
        offsetBytes,
        maxBytes,
      });
      if (workingContext) {
        return textResult(formatPromptReadyResourceText(workingContext), workingContext);
      }
      return textResult(
        "OpenClaw resource ref not found. Use an exact ref returned in visible tool output.",
        {
          ref,
          status: "not_found",
          failureKind: "resource_ref_invalid",
          resourceKind: null,
          body: null,
          byteCount: 0,
          truncated: false,
          reasonCodes: ["resource_ref_invalid", "openclaw_resource_read_ref_not_found"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      );
    },
  };
}
