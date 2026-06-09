import path from "node:path";
import type { AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import { expandHomePrefix, resolveOsHomeDir } from "../infra/home-dir.js";
import { getToolParamsRecord } from "./pi-tools.params.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

type EditToolRecoveryOptions = {
  root: string;
  readFile: (absolutePath: string) => Promise<string>;
};

type WriteToolMetadataOptions = {
  root: string;
  access?: (absolutePath: string) => Promise<void>;
};

type EditToolParams = {
  pathParam?: string;
  edits: EditReplacement[];
};

type EditReplacement = {
  oldText: string;
  newText: string;
};

const EDIT_MISMATCH_MESSAGE = "Could not find the exact text in";
const RECOVERY_DIFF_CONTEXT_LINES = 3;
const RECOVERY_DIFF_MAX_CHARS = 8_000;

function resolveEditPath(root: string, pathParam: string): string {
  const home = resolveOsHomeDir();
  const expanded = home ? expandHomePrefix(pathParam, { home }) : pathParam;
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(root, expanded);
}

function readStringParam(record: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function readEditReplacements(record: Record<string, unknown> | undefined): EditReplacement[] {
  if (!Array.isArray(record?.edits)) {
    return [];
  }
  return record.edits.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const replacement = entry as Record<string, unknown>;
    if (typeof replacement.oldText !== "string" || replacement.oldText.trim().length === 0) {
      return [];
    }
    if (typeof replacement.newText !== "string") {
      return [];
    }
    return [{ oldText: replacement.oldText, newText: replacement.newText }];
  });
}

function readEditToolParams(params: unknown): EditToolParams {
  const record = getToolParamsRecord(params);
  return {
    pathParam: readStringParam(record, "path"),
    edits: readEditReplacements(record),
  };
}

function normalizeToLF(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function trimTrailingEmptyLine(lines: string[]): string[] {
  return lines.length > 1 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}

function findFirstChangedLine(originalContent: string, currentContent: string): number | undefined {
  const originalLines = trimTrailingEmptyLine(normalizeToLF(originalContent).split("\n"));
  const currentLines = trimTrailingEmptyLine(normalizeToLF(currentContent).split("\n"));
  const max = Math.max(originalLines.length, currentLines.length);
  for (let index = 0; index < max; index += 1) {
    if (originalLines[index] !== currentLines[index]) {
      return index + 1;
    }
  }
  return undefined;
}

function buildRecoveredDiff(params: {
  originalContent?: string;
  currentContent: string;
  pathParam: string;
}): { diff: string; firstChangedLine?: number } {
  if (typeof params.originalContent !== "string") {
    return { diff: "", firstChangedLine: undefined };
  }
  const firstChangedLine = findFirstChangedLine(params.originalContent, params.currentContent);
  if (firstChangedLine === undefined) {
    return { diff: "", firstChangedLine: undefined };
  }
  const originalLines = trimTrailingEmptyLine(normalizeToLF(params.originalContent).split("\n"));
  const currentLines = trimTrailingEmptyLine(normalizeToLF(params.currentContent).split("\n"));
  const start = Math.max(1, firstChangedLine - RECOVERY_DIFF_CONTEXT_LINES);
  const end = Math.min(
    Math.max(originalLines.length, currentLines.length),
    firstChangedLine + RECOVERY_DIFF_CONTEXT_LINES,
  );
  const lines = [`--- ${params.pathParam}`, `+++ ${params.pathParam}`, `@@ ${start},${end} @@`];
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    const originalLine = originalLines[lineNumber - 1];
    const currentLine = currentLines[lineNumber - 1];
    if (originalLine === currentLine) {
      if (originalLine !== undefined) {
        lines.push(` ${lineNumber}: ${originalLine}`);
      }
      continue;
    }
    if (originalLine !== undefined) {
      lines.push(`-${lineNumber}: ${originalLine}`);
    }
    if (currentLine !== undefined) {
      lines.push(`+${lineNumber}: ${currentLine}`);
    }
  }
  const diff = lines.join("\n");
  return {
    diff:
      diff.length > RECOVERY_DIFF_MAX_CHARS
        ? `${diff.slice(0, RECOVERY_DIFF_MAX_CHARS)}\n... (diff truncated)`
        : diff,
    firstChangedLine,
  };
}

function removeExactOccurrences(content: string, needle: string): string {
  return needle.length > 0 ? content.split(needle).join("") : content;
}

function didEditLikelyApply(params: {
  originalContent?: string;
  currentContent: string;
  edits: EditReplacement[];
}) {
  if (params.edits.length === 0) {
    return false;
  }
  const normalizedCurrent = normalizeToLF(params.currentContent);
  const normalizedOriginal =
    typeof params.originalContent === "string" ? normalizeToLF(params.originalContent) : undefined;

  if (normalizedOriginal !== undefined && normalizedOriginal === normalizedCurrent) {
    return false;
  }

  let withoutInsertedNewText = normalizedCurrent;
  for (const edit of params.edits) {
    const normalizedNew = normalizeToLF(edit.newText);
    if (normalizedNew.length > 0 && !normalizedCurrent.includes(normalizedNew)) {
      return false;
    }
    withoutInsertedNewText =
      normalizedNew.length > 0
        ? removeExactOccurrences(withoutInsertedNewText, normalizedNew)
        : withoutInsertedNewText;
  }

  for (const edit of params.edits) {
    const normalizedOld = normalizeToLF(edit.oldText);
    if (withoutInsertedNewText.includes(normalizedOld)) {
      return false;
    }
  }

  return true;
}

function buildEditSuccessResult(params: {
  pathParam: string;
  editCount: number;
  originalContent?: string;
  currentContent: string;
}): AgentToolResult<unknown> {
  const diff = buildRecoveredDiff({
    pathParam: params.pathParam,
    originalContent: params.originalContent,
    currentContent: params.currentContent,
  });
  const text =
    params.editCount > 1
      ? `Successfully replaced ${params.editCount} block(s) in ${params.pathParam}.`
      : `Successfully replaced text in ${params.pathParam}.`;
  return {
    isError: false,
    content: [
      {
        type: "text",
        text,
      },
    ],
    details: {
      diff: diff.diff,
      firstChangedLine: diff.firstChangedLine,
      changedFilePaths: [params.pathParam],
      modifiedFilePaths: [params.pathParam],
      editCount: params.editCount,
      recoveredAfterPostWriteFailure: true,
    },
  } as AgentToolResult<unknown>;
}

function shouldAddMismatchHint(error: unknown) {
  return error instanceof Error && error.message.includes(EDIT_MISMATCH_MESSAGE);
}

function appendMismatchHint(
  error: Error,
  pathParam: string | undefined,
  currentContent: string,
): Error {
  const target = pathParam ? ` for ${pathParam}` : "";
  const byteCount = Buffer.byteLength(currentContent, "utf8");
  const enhanced = new Error(
    [
      error.message,
      `The target file${target} appears to have changed or the provided oldText is stale.`,
      `Current file bytes: ${byteCount}.`,
      "Do not retry from memory or ask for a full file. Re-ground with an exact updated source window through execution-context-scout, then retry the edit from that returned window.",
    ].join("\n"),
  );
  enhanced.stack = error.stack;
  return enhanced;
}

/**
 * Recover from two edit-tool failure classes without changing edit semantics:
 * - exact-match mismatch errors become actionable by including current file contents
 * - post-write throws are converted back to success only if the file actually changed
 */
export function wrapEditToolWithRecovery(
  base: AnyAgentTool,
  options: EditToolRecoveryOptions,
): AnyAgentTool {
  return {
    ...base,
    execute: async (
      toolCallId: string,
      params: unknown,
      signal: AbortSignal | undefined,
      onUpdate?: AgentToolUpdateCallback<unknown>,
    ) => {
      const { pathParam, edits } = readEditToolParams(params);
      const absolutePath =
        typeof pathParam === "string" ? resolveEditPath(options.root, pathParam) : undefined;
      let originalContent: string | undefined;

      if (absolutePath && edits.length > 0) {
        try {
          originalContent = await options.readFile(absolutePath);
        } catch {
          // Best-effort snapshot only; recovery should still proceed without it.
        }
      }

      try {
        return await base.execute(toolCallId, params, signal, onUpdate);
      } catch (err) {
        if (!absolutePath) {
          throw err;
        }

        let currentContent: string | undefined;
        try {
          currentContent = await options.readFile(absolutePath);
        } catch {
          // Fall through to the original error if readback fails.
        }

        if (typeof currentContent === "string" && edits.length > 0) {
          if (
            didEditLikelyApply({
              originalContent,
              currentContent,
              edits,
            })
          ) {
            return buildEditSuccessResult({
              pathParam: pathParam ?? absolutePath,
              editCount: edits.length,
              originalContent,
              currentContent,
            });
          }
        }

        if (
          typeof currentContent === "string" &&
          err instanceof Error &&
          shouldAddMismatchHint(err)
        ) {
          throw appendMismatchHint(err, pathParam, currentContent);
        }

        throw err;
      }
    },
  };
}

async function pathExistedBeforeWrite(
  absolutePath: string | undefined,
  access: ((absolutePath: string) => Promise<void>) | undefined,
): Promise<boolean> {
  if (!absolutePath || !access) {
    return false;
  }
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function readWriteToolParams(params: unknown): { pathParam?: string; content?: string } {
  const record = getToolParamsRecord(params);
  return {
    pathParam: readStringParam(record, "path"),
    content: readStringParam(record, "content"),
  };
}

function mergeRecordDetails(base: unknown, additions: Record<string, unknown>) {
  return {
    ...(base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : {}),
    ...additions,
  };
}

export function wrapWriteToolWithMetadata(
  base: AnyAgentTool,
  options: WriteToolMetadataOptions,
): AnyAgentTool {
  return {
    ...base,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const { pathParam, content } = readWriteToolParams(params);
      const absolutePath =
        typeof pathParam === "string" ? resolveEditPath(options.root, pathParam) : undefined;
      const existedBefore = await pathExistedBeforeWrite(absolutePath, options.access);
      const result = await base.execute(toolCallId, params, signal, onUpdate);
      if (!pathParam || typeof content !== "string") {
        return result;
      }
      const additions = {
        changedFilePaths: [pathParam],
        addedFilePaths: existedBefore ? [] : [pathParam],
        modifiedFilePaths: existedBefore ? [pathParam] : [],
        bytesWritten: Buffer.byteLength(content, "utf8"),
        fullFileReplacement: true,
      };
      return {
        ...result,
        details: mergeRecordDetails(result.details, additions),
      } as AgentToolResult<unknown>;
    },
  };
}
