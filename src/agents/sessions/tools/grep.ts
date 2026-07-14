/**
 * Built-in grep session tool.
 *
 * Searches files with ripgrep/local operations, optional context, and bounded output rendering.
 */
import { spawn } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { Text } from "@earendil-works/pi-tui";
import { minimatch } from "minimatch";
import { Type } from "typebox";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import type { AgentTool } from "../../runtime/index.js";
import { ensureTool } from "../../utils/tools-manager.js";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { appendBoundedTextTail, normalizePositiveLimit } from "./limits.js";
import { resolveToCwd } from "./path-utils.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import type { GrepToolDetails } from "./tool-contracts.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import {
  DEFAULT_MAX_BYTES,
  formatSize,
  GREP_MAX_LINE_LENGTH,
  truncateHead,
  truncateLine,
} from "./truncate.js";

const grepSchema = Type.Object({
  pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
  path: Type.Optional(
    Type.String({ description: "Directory or file to search (default: current directory)" }),
  ),
  glob: Type.Optional(
    Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" }),
  ),
  ignoreCase: Type.Optional(
    Type.Boolean({ description: "Case-insensitive search (default: false)" }),
  ),
  literal: Type.Optional(
    Type.Boolean({
      description: "Treat pattern as literal string instead of regex (default: false)",
    }),
  ),
  context: Type.Optional(
    Type.Number({
      description: "Number of lines to show before and after each match (default: 0)",
    }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Maximum number of matches to return (default: 100)" }),
  ),
});
export type { GrepToolDetails, GrepToolInput } from "./tool-contracts.js";
const DEFAULT_LIMIT = 100;
const DEFAULT_IGNORE_NAMES = new Set([".git", "node_modules"]);

/**
 * Pluggable operations for the grep tool.
 * Override these to delegate search to remote systems (for example SSH).
 */
export interface GrepOperations {
  /** Check if path is a directory. Throws if path does not exist. */
  isDirectory: (absolutePath: string) => Promise<boolean> | boolean;
  /** Read file contents for context lines */
  readFile: (absolutePath: string) => Promise<string> | string;
}

const defaultGrepOperations: GrepOperations = {
  isDirectory: (p) => statSync(p).isDirectory(),
  readFile: (p) => readFileSync(p, "utf-8"),
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function localSearchFiles(params: {
  searchPath: string;
  isDirectory: boolean;
  glob?: string;
  limit: number;
}): string[] {
  if (!params.isDirectory) {
    return [params.searchPath];
  }
  const results: string[] = [];
  const stack: string[] = [params.searchPath];
  while (stack.length > 0 && results.length < params.limit) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= params.limit) {
        break;
      }
      if (DEFAULT_IGNORE_NAMES.has(entry.name)) {
        continue;
      }
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        try {
          if (!lstatSync(absolute).isSymbolicLink()) {
            continue;
          }
        } catch {
          continue;
        }
      }
      if (params.glob) {
        const relative = toPosixPath(path.relative(params.searchPath, absolute));
        const normalizedGlob = toPosixPath(params.glob);
        if (
          !minimatch(relative, normalizedGlob, { dot: true }) &&
          !minimatch(path.basename(relative), normalizedGlob, { dot: true }) &&
          !minimatch(
            relative,
            normalizedGlob.startsWith("**/") ? normalizedGlob : `**/${normalizedGlob}`,
            {
              dot: true,
            },
          )
        ) {
          continue;
        }
      }
      results.push(absolute);
    }
  }
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

async function runLocalGrepFallback(params: {
  pattern: string;
  searchPath: string;
  isDirectory: boolean;
  glob?: string;
  ignoreCase?: boolean;
  literal?: boolean;
  contextValue: number;
  effectiveLimit: number;
  ops: GrepOperations;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  details: GrepToolDetails | undefined;
}> {
  let expression: RegExp;
  try {
    expression = new RegExp(
      params.literal ? escapeRegExp(params.pattern) : params.pattern,
      params.ignoreCase ? "i" : undefined,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid search pattern: ${message}`);
  }

  const formatPath = (filePath: string): string => {
    if (params.isDirectory) {
      const relative = path.relative(params.searchPath, filePath);
      if (relative && !relative.startsWith("..")) {
        return toPosixPath(relative);
      }
    }
    return path.basename(filePath);
  };

  const files = localSearchFiles({
    searchPath: params.searchPath,
    isDirectory: params.isDirectory,
    glob: params.glob,
    limit: Math.max(params.effectiveLimit * 20, params.effectiveLimit),
  });
  let matchCount = 0;
  let matchLimitReached = false;
  let linesTruncated = false;
  const outputLines: string[] = [];

  for (const filePath of files) {
    if (matchCount >= params.effectiveLimit) {
      matchLimitReached = true;
      break;
    }
    let lines: string[];
    try {
      const content = await params.ops.readFile(filePath);
      if (content.includes("\u0000")) {
        continue;
      }
      lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    } catch {
      continue;
    }
    for (let index = 0; index < lines.length; index++) {
      if (matchCount >= params.effectiveLimit) {
        matchLimitReached = true;
        break;
      }
      const lineNumber = index + 1;
      if (!expression.test(lines[index] ?? "")) {
        continue;
      }
      matchCount++;
      const start =
        params.contextValue > 0 ? Math.max(1, lineNumber - params.contextValue) : lineNumber;
      const end =
        params.contextValue > 0
          ? Math.min(lines.length, lineNumber + params.contextValue)
          : lineNumber;
      for (let current = start; current <= end; current++) {
        const lineText = lines[current - 1] ?? "";
        const sanitized = lineText.replace(/\r/g, "");
        const { text: truncatedText, wasTruncated } = truncateLine(sanitized);
        if (wasTruncated) {
          linesTruncated = true;
        }
        const separator = current === lineNumber ? ":" : "-";
        outputLines.push(
          `${formatPath(filePath)}${separator}${current}${separator === ":" ? ":" : "-"} ${truncatedText}`,
        );
      }
    }
  }

  if (matchCount === 0) {
    return {
      content: [{ type: "text", text: "No matches found" }],
      details: undefined,
    };
  }

  const rawOutput = outputLines.join("\n");
  const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
  let output = truncation.content;
  const details: GrepToolDetails = {};
  const notices: string[] = [];
  if (matchLimitReached) {
    notices.push(
      `${params.effectiveLimit} matches limit reached. Use limit=${params.effectiveLimit * 2} for more, or refine pattern`,
    );
    details.matchLimitReached = params.effectiveLimit;
  }
  if (truncation.truncated) {
    notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
    details.truncation = truncation;
  }
  if (linesTruncated) {
    notices.push(
      `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`,
    );
    details.linesTruncated = true;
  }
  if (notices.length > 0) {
    output += `\n\n[${notices.join(". ")}]`;
  }
  return {
    content: [{ type: "text", text: output }],
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

export interface GrepToolOptions {
  /** Custom operations for grep. Default: local filesystem plus ripgrep */
  operations?: GrepOperations;
}

function formatGrepCall(
  args: { pattern: string; path?: string; glob?: string; limit?: number } | undefined,
  theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
  const pattern = str(args?.pattern);
  const rawPath = str(args?.path);
  const pathLocal = rawPath !== null ? shortenPath(rawPath || ".") : null;
  const glob = str(args?.glob);
  const limit = args?.limit;
  const invalidArg = invalidArgText(theme);
  let text =
    theme.fg("toolTitle", theme.bold("grep")) +
    " " +
    (pattern === null ? invalidArg : theme.fg("accent", `/${pattern || ""}/`)) +
    theme.fg("toolOutput", ` in ${pathLocal === null ? invalidArg : pathLocal}`);
  if (glob) {
    text += theme.fg("toolOutput", ` (${glob})`);
  }
  if (limit !== undefined) {
    text += theme.fg("toolOutput", ` limit ${limit}`);
  }
  return text;
}

function formatGrepResult(
  result: {
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    details?: GrepToolDetails;
  },
  options: ToolRenderResultOptions,
  theme: typeof import("../../modes/interactive/theme/theme.js").theme,
  showImages: boolean,
): string {
  const output = getTextOutput(result, showImages).trim();
  let text = "";
  if (output) {
    const lines = output.split("\n");
    const maxLines = options.expanded ? lines.length : 15;
    const displayLines = lines.slice(0, maxLines);
    const remaining = lines.length - maxLines;
    text += `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
    if (remaining > 0) {
      text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
    }
  }

  const matchLimit = result.details?.matchLimitReached;
  const truncation = result.details?.truncation;
  const linesTruncated = result.details?.linesTruncated;
  if (matchLimit || truncation?.truncated || linesTruncated) {
    const warnings: string[] = [];
    if (matchLimit) {
      warnings.push(`${matchLimit} matches limit`);
    }
    if (truncation?.truncated) {
      warnings.push(`${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit`);
    }
    if (linesTruncated) {
      warnings.push("some lines truncated");
    }
    text += `\n${theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)}`;
  }
  return text;
}

export function createGrepToolDefinition(
  cwd: string,
  options?: GrepToolOptions,
): ToolDefinition<typeof grepSchema, GrepToolDetails | undefined> {
  const customOps = options?.operations;
  return {
    name: "grep",
    label: "grep",
    description: `Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
    promptSnippet: "Search file contents for patterns (respects .gitignore)",
    parameters: grepSchema,
    async execute(
      toolCallId,
      {
        pattern,
        path: searchDir,
        glob,
        ignoreCase,
        literal,
        context,
        limit,
      }: {
        pattern: string;
        path?: string;
        glob?: string;
        ignoreCase?: boolean;
        literal?: boolean;
        context?: number;
        limit?: number;
      },
      signal?: AbortSignal,
      onUpdate?,
      ctx?,
    ) {
      void toolCallId;
      void onUpdate;
      void ctx;
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error("Operation aborted"));
          return;
        }
        let settled = false;
        const settle = (fn: () => void) => {
          if (!settled) {
            settled = true;
            fn();
          }
        };

        void (async () => {
          try {
            const searchPath = resolveToCwd(searchDir || ".", cwd);
            const ops = customOps ?? defaultGrepOperations;
            let isDirectory: boolean;
            try {
              isDirectory = await ops.isDirectory(searchPath);
            } catch {
              settle(() => reject(new Error(`Path not found: ${searchPath}`)));
              return;
            }

            const contextValue = context && context > 0 ? context : 0;
            const effectiveLimit = normalizePositiveLimit(limit, DEFAULT_LIMIT);
            const rgPath = await ensureTool("rg", true);
            if (!rgPath) {
              const fallbackResult = await runLocalGrepFallback({
                pattern,
                searchPath,
                isDirectory,
                glob,
                ignoreCase,
                literal,
                contextValue,
                effectiveLimit,
                ops,
              });
              settle(() => resolve(fallbackResult));
              return;
            }
            const formatPath = (filePath: string): string => {
              if (isDirectory) {
                const relative = path.relative(searchPath, filePath);
                if (relative && !relative.startsWith("..")) {
                  return relative.replace(/\\/g, "/");
                }
              }
              return path.basename(filePath);
            };

            const fileCache = new Map<string, string[]>();
            const getFileLines = async (filePath: string): Promise<string[]> => {
              let lines = fileCache.get(filePath);
              if (!lines) {
                try {
                  const content = await ops.readFile(filePath);
                  lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
                } catch {
                  lines = [];
                }
                fileCache.set(filePath, lines);
              }
              return lines;
            };

            const args: string[] = ["--json", "--line-number", "--color=never", "--hidden"];
            if (ignoreCase) {
              args.push("--ignore-case");
            }
            if (literal) {
              args.push("--fixed-strings");
            }
            if (glob) {
              args.push("--glob", glob);
            }
            args.push("--", pattern, searchPath);

            const child = spawn(rgPath, args, { stdio: ["ignore", "pipe", "pipe"] });
            const rl = createInterface({ input: child.stdout });
            let stderr = "";
            let matchCount = 0;
            let matchLimitReached = false;
            let linesTruncated = false;
            let aborted = false;
            let killedDueToLimit = false;
            const outputLines: string[] = [];

            const cleanup = () => {
              rl.close();
              signal?.removeEventListener("abort", onAbort);
            };
            const stopChild = (dueToLimit = false) => {
              if (!child.killed) {
                killedDueToLimit = dueToLimit;
                child.kill();
              }
            };
            const onAbort = () => {
              aborted = true;
              stopChild();
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            child.stderr?.on("data", (chunk) => {
              stderr = appendBoundedTextTail(stderr, chunk);
            });

            const formatBlock = async (filePath: string, lineNumber: number): Promise<string[]> => {
              const relativePath = formatPath(filePath);
              const lines = await getFileLines(filePath);
              if (!lines.length) {
                return [`${relativePath}:${lineNumber}: (unable to read file)`];
              }
              const block: string[] = [];
              const start = contextValue > 0 ? Math.max(1, lineNumber - contextValue) : lineNumber;
              const end =
                contextValue > 0 ? Math.min(lines.length, lineNumber + contextValue) : lineNumber;
              for (let current = start; current <= end; current++) {
                const lineText = lines[current - 1] ?? "";
                const sanitized = lineText.replace(/\r/g, "");
                const isMatchLine = current === lineNumber;
                // Truncate long lines so grep output stays compact.
                const { text: truncatedText, wasTruncated } = truncateLine(sanitized);
                if (wasTruncated) {
                  linesTruncated = true;
                }
                if (isMatchLine) {
                  block.push(`${relativePath}:${current}: ${truncatedText}`);
                } else {
                  block.push(`${relativePath}-${current}- ${truncatedText}`);
                }
              }
              return block;
            };

            // Collect matches during streaming, then format them after rg exits.
            const matches: Array<{ filePath: string; lineNumber: number; lineText?: string }> = [];
            rl.on("line", (line) => {
              if (!line.trim() || matchCount >= effectiveLimit) {
                return;
              }
              let event: {
                type?: string;
                data?: {
                  path?: { text?: string };
                  line_number?: unknown;
                  lines?: { text?: string };
                };
              };
              try {
                event = JSON.parse(line);
              } catch {
                return;
              }
              if (event.type === "match") {
                matchCount++;
                const filePath = event.data?.path?.text;
                const lineNumber = event.data?.line_number;
                const lineText = event.data?.lines?.text;
                if (filePath && typeof lineNumber === "number") {
                  matches.push({ filePath, lineNumber, lineText });
                }
                if (matchCount >= effectiveLimit) {
                  matchLimitReached = true;
                  stopChild(true);
                }
              }
            });

            child.on("error", (error) => {
              cleanup();
              settle(() => reject(new Error(`Failed to run ripgrep: ${error.message}`)));
            });
            child.on("close", (code) => {
              void (async () => {
                cleanup();
                if (aborted) {
                  settle(() => reject(new Error("Operation aborted")));
                  return;
                }
                const searchIncomplete = !killedDueToLimit && code !== 0 && code !== 1;
                if (searchIncomplete && matchCount === 0) {
                  const errorMsg = stderr.trim() || `ripgrep exited with code ${code}`;
                  settle(() => reject(new Error(errorMsg)));
                  return;
                }
                if (matchCount === 0) {
                  settle(() =>
                    resolve({
                      content: [{ type: "text", text: "No matches found" }],
                      details: undefined,
                    }),
                  );
                  return;
                }

                // Format matches after streaming finishes so custom readFile() backends can be async.
                for (const match of matches) {
                  if (contextValue === 0 && match.lineText !== undefined) {
                    const relativePath = formatPath(match.filePath);
                    const sanitized = match.lineText
                      .replace(/\r\n/g, "\n")
                      .replace(/\r/g, "")
                      .replace(/\n$/, "");
                    const { text: truncatedText, wasTruncated } = truncateLine(sanitized);
                    if (wasTruncated) {
                      linesTruncated = true;
                    }
                    outputLines.push(`${relativePath}:${match.lineNumber}: ${truncatedText}`);
                  } else {
                    const block = await formatBlock(match.filePath, match.lineNumber);
                    outputLines.push(...block);
                  }
                }

                const rawOutput = outputLines.join("\n");
                // Apply byte truncation. There is no line limit here because the match limit already capped rows.
                const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
                let output = truncation.content;
                const details: GrepToolDetails = {};
                // Build actionable notices for truncation and match limits.
                const notices: string[] = [];
                if (matchLimitReached) {
                  notices.push(
                    `${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
                  );
                  details.matchLimitReached = effectiveLimit;
                }
                if (truncation.truncated) {
                  notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
                  details.truncation = truncation;
                }
                if (linesTruncated) {
                  notices.push(
                    `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`,
                  );
                  details.linesTruncated = true;
                }
                if (searchIncomplete) {
                  notices.push(
                    "Search coverage incomplete; valid matches are shown, but some paths could not be inspected. Narrow the path or glob before making an absence claim",
                  );
                  details.searchIncomplete = true;
                }
                if (notices.length > 0) {
                  output += `\n\n[${notices.join(". ")}]`;
                }
                settle(() =>
                  resolve({
                    content: [{ type: "text", text: output }],
                    details: Object.keys(details).length > 0 ? details : undefined,
                  }),
                );
              })();
            });
          } catch (err) {
            settle(() => reject(err as Error));
          }
        })();
      });
    },
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      text.setText(formatGrepCall(args, theme));
      return text;
    },
    renderResult(result, optionsLocal, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      text.setText(formatGrepResult(result, optionsLocal, theme, context.showImages));
      return text;
    },
  };
}

export function createGrepTool(
  cwd: string,
  options?: GrepToolOptions,
): AgentTool<typeof grepSchema> {
  return wrapToolDefinition(createGrepToolDefinition(cwd, options));
}
