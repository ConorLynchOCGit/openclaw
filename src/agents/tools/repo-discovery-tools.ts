import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import {
  type AnyAgentTool,
  ToolInputError,
  jsonResult,
  readNumberParam,
  readStringParam,
} from "./common.js";

const DEFAULT_EXCLUDED_DIRS = new Set([
  ".artifacts",
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
const DEFAULT_MAX_FILES = 2_000;
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_MATCHES = 120;
const MAX_FILE_BYTES_FOR_GREP = 512 * 1024;
const MAX_CONTEXT_LINES = 3;

const GlobToolSchema = Type.Object({
  pattern: Type.Optional(
    Type.String({
      description:
        "File glob such as **/*.ts, src/agents/**/*.ts, or docs/**/*.md. Omit to list files under path.",
    }),
  ),
  path: Type.Optional(
    Type.String({
      description: "Optional workspace-relative file or directory to search within.",
    }),
  ),
  maxResults: Type.Optional(Type.Number({ description: "Maximum file refs to return." })),
});

const ListToolSchema = Type.Object({
  path: Type.Optional(
    Type.String({
      description: "Workspace-relative directory to list. Defaults to workspace root.",
    }),
  ),
  maxResults: Type.Optional(Type.Number({ description: "Maximum entries to return." })),
});

const GrepToolSchema = Type.Object({
  query: Type.String({ description: "Text or regular expression to search for." }),
  path: Type.Optional(
    Type.String({
      description: "Optional workspace-relative file or directory to search within.",
    }),
  ),
  glob: Type.Optional(
    Type.String({
      description: "Optional file glob such as **/*.ts or docs/**/*.md.",
    }),
  ),
  regex: Type.Optional(
    Type.Boolean({ description: "Treat query as a JavaScript regular expression." }),
  ),
  caseSensitive: Type.Optional(Type.Boolean({ description: "Use case-sensitive matching." })),
  contextLines: Type.Optional(Type.Number({ description: "Number of nearby lines to include." })),
  maxMatches: Type.Optional(Type.Number({ description: "Maximum matches to return." })),
  maxFiles: Type.Optional(Type.Number({ description: "Maximum candidate files to inspect." })),
});

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeRelativePath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === ".") {
    return ".";
  }
  const normalized = path.posix.normalize(trimmed.replace(/\\/g, "/"));
  if (normalized === ".") {
    return ".";
  }
  return normalized.replace(/^\.\//u, "");
}

function pathWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWorkspaceTarget(workspaceRoot: string, relativePath: string): string {
  const absolute = path.resolve(workspaceRoot, relativePath);
  if (!pathWithin(absolute, workspaceRoot)) {
    throw new ToolInputError("path must stay within workspace root");
  }
  return absolute;
}

function isExcludedDirectory(name: string): boolean {
  return DEFAULT_EXCLUDED_DIRS.has(name);
}

function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += char.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
  }
  return new RegExp(`^${source}$`, "u");
}

function matchesGlob(relativePath: string, pattern: string | undefined): boolean {
  const trimmed = pattern?.trim();
  if (!trimmed) {
    return true;
  }
  const normalized = normalizeRelativePath(trimmed);
  if (!normalized.includes("*") && !normalized.includes("?")) {
    return relativePath === normalized || relativePath.includes(normalized);
  }
  return globToRegExp(normalized).test(relativePath);
}

async function walkFiles(input: {
  workspaceRoot: string;
  relativeRoot: string;
  pattern?: string;
  maxFiles: number;
}): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let truncated = false;

  async function walk(relativePath: string): Promise<void> {
    if (files.length >= input.maxFiles) {
      truncated = true;
      return;
    }
    const absolute = resolveWorkspaceTarget(input.workspaceRoot, relativePath);
    const stat = await fs.lstat(absolute).catch(() => null);
    if (!stat || stat.isSymbolicLink()) {
      return;
    }
    if (stat.isFile()) {
      const normalized = normalizeRelativePath(relativePath);
      if (matchesGlob(normalized, input.pattern)) {
        files.push(normalized);
      }
      return;
    }
    if (!stat.isDirectory()) {
      return;
    }
    const basename = path.basename(relativePath);
    if (basename && isExcludedDirectory(basename)) {
      return;
    }
    const entries = await fs.readdir(absolute, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= input.maxFiles) {
        truncated = true;
        return;
      }
      if (entry.isDirectory() && isExcludedDirectory(entry.name)) {
        continue;
      }
      await walk(normalizeRelativePath(path.join(relativePath, entry.name)));
    }
  }

  await walk(input.relativeRoot);
  return { files, truncated };
}

function formatFileRefs(files: string[]): string {
  if (files.length === 0) {
    return "No files found.";
  }
  return files.map((file) => file).join("\n");
}

async function listDirectory(input: {
  workspaceRoot: string;
  relativePath: string;
  maxResults: number;
}) {
  const absolute = resolveWorkspaceTarget(input.workspaceRoot, input.relativePath);
  const entries = await fs.readdir(absolute, { withFileTypes: true }).catch((error: unknown) => {
    throw new ToolInputError(error instanceof Error ? error.message : "directory list failed");
  });
  const normalizedEntries = entries
    .filter((entry) => !isExcludedDirectory(entry.name))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .slice(0, input.maxResults)
    .map((entry) => ({
      path: normalizeRelativePath(path.join(input.relativePath, entry.name)),
      type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
    }));
  return {
    entries: normalizedEntries,
    truncated: entries.length > input.maxResults,
  };
}

function isProbablyBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function buildLineMatcher(input: { query: string; regex: boolean; caseSensitive: boolean }) {
  if (input.regex) {
    try {
      return {
        match: (line: string) =>
          new RegExp(input.query, input.caseSensitive ? "u" : "iu").test(line),
      };
    } catch (error) {
      throw new ToolInputError(
        `invalid regex: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const needle = input.caseSensitive ? input.query : input.query.toLowerCase();
  return {
    match: (line: string) => {
      const haystack = input.caseSensitive ? line : line.toLowerCase();
      return haystack.includes(needle);
    },
  };
}

async function grepFiles(input: {
  workspaceRoot: string;
  files: string[];
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  contextLines: number;
  maxMatches: number;
}) {
  const matcher = buildLineMatcher(input);
  const matches: Array<{
    path: string;
    line: number;
    text: string;
    before?: string[];
    after?: string[];
  }> = [];
  let searchedFileCount = 0;
  let truncated = false;

  for (const file of input.files) {
    if (matches.length >= input.maxMatches) {
      truncated = true;
      break;
    }
    const absolute = resolveWorkspaceTarget(input.workspaceRoot, file);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isFile() || stat.size > MAX_FILE_BYTES_FOR_GREP) {
      continue;
    }
    const buffer = await fs.readFile(absolute).catch(() => null);
    if (!buffer || isProbablyBinary(buffer)) {
      continue;
    }
    searchedFileCount += 1;
    const lines = buffer.toString("utf8").split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      if (matches.length >= input.maxMatches) {
        truncated = true;
        break;
      }
      const line = lines[index] ?? "";
      if (!matcher.match(line)) {
        continue;
      }
      const beforeStart = Math.max(0, index - input.contextLines);
      const afterEnd = Math.min(lines.length, index + input.contextLines + 1);
      matches.push({
        path: file,
        line: index + 1,
        text: line.slice(0, 500),
        ...(input.contextLines > 0
          ? {
              before: lines.slice(beforeStart, index).map((entry) => entry.slice(0, 500)),
              after: lines.slice(index + 1, afterEnd).map((entry) => entry.slice(0, 500)),
            }
          : {}),
      });
    }
  }
  return { matches, searchedFileCount, truncated };
}

function formatGrepMatches(
  matches: Array<{ path: string; line: number; text: string; before?: string[]; after?: string[] }>,
): string {
  if (matches.length === 0) {
    return "No matches found.";
  }
  return matches
    .map((match) => {
      const contextBefore = (match.before ?? []).map((line) => `  ${line}`).join("\n");
      const contextAfter = (match.after ?? []).map((line) => `  ${line}`).join("\n");
      return [
        `${match.path}:${match.line}: ${match.text}`,
        ...(contextBefore ? [contextBefore] : []),
        ...(contextAfter ? [contextAfter] : []),
      ].join("\n");
    })
    .join("\n\n");
}

export function createGlobTool(opts: { workspaceRoot: string }): AnyAgentTool {
  return {
    name: "glob",
    label: "Glob",
    displaySummary: "List workspace files matching a bounded glob.",
    description:
      "Find workspace files by glob or path before reading or editing. Use this for fast local repo discovery instead of shelling out when a file pattern is enough.",
    parameters: GlobToolSchema,
    execute: async (_toolCallId, rawParams) => {
      const params =
        rawParams && typeof rawParams === "object" ? (rawParams as Record<string, unknown>) : {};
      const pattern = readStringParam(params, "pattern", { required: false });
      const relativeRoot = normalizeRelativePath(
        readStringParam(params, "path", { required: false }),
      );
      const maxResults = clampInteger(
        readNumberParam(params, "maxResults", { required: false, integer: true }),
        DEFAULT_MAX_RESULTS,
        1,
        500,
      );
      const result = await walkFiles({
        workspaceRoot: opts.workspaceRoot,
        relativeRoot,
        pattern,
        maxFiles: Math.max(maxResults, DEFAULT_MAX_FILES),
      });
      const files = result.files.slice(0, maxResults);
      return jsonResult({
        status: "ok",
        root: relativeRoot,
        pattern: pattern ?? null,
        files,
        count: files.length,
        truncated: result.truncated || result.files.length > maxResults,
        text: formatFileRefs(files),
      });
    },
  };
}

export function createListTool(opts: { workspaceRoot: string }): AnyAgentTool {
  return {
    name: "list",
    label: "List",
    displaySummary: "List bounded workspace directory entries.",
    description:
      "List entries in a workspace directory. Use this for local orientation before choosing files to read.",
    parameters: ListToolSchema,
    execute: async (_toolCallId, rawParams) => {
      const params =
        rawParams && typeof rawParams === "object" ? (rawParams as Record<string, unknown>) : {};
      const relativePath = normalizeRelativePath(
        readStringParam(params, "path", { required: false }),
      );
      const maxResults = clampInteger(
        readNumberParam(params, "maxResults", { required: false, integer: true }),
        DEFAULT_MAX_RESULTS,
        1,
        500,
      );
      const result = await listDirectory({
        workspaceRoot: opts.workspaceRoot,
        relativePath,
        maxResults,
      });
      return jsonResult({
        status: "ok",
        path: relativePath,
        ...result,
        text:
          result.entries.length === 0
            ? "No entries found."
            : result.entries.map((entry) => `${entry.type}\t${entry.path}`).join("\n"),
      });
    },
  };
}

export function createGrepTool(opts: { workspaceRoot: string }): AnyAgentTool {
  return {
    name: "grep",
    label: "Grep",
    displaySummary: "Search bounded workspace text.",
    description:
      "Search workspace text and return bounded file/line matches. Use this for repo discovery and keyword pivots before reading files. For simple file-pattern discovery use glob.",
    parameters: GrepToolSchema,
    execute: async (_toolCallId, rawParams) => {
      const params =
        rawParams && typeof rawParams === "object" ? (rawParams as Record<string, unknown>) : {};
      const query = readStringParam(params, "query", { required: true });
      const relativeRoot = normalizeRelativePath(
        readStringParam(params, "path", { required: false }),
      );
      const glob = readStringParam(params, "glob", { required: false });
      const contextLines = clampInteger(
        readNumberParam(params, "contextLines", { required: false, integer: true }),
        0,
        0,
        MAX_CONTEXT_LINES,
      );
      const maxMatches = clampInteger(
        readNumberParam(params, "maxMatches", { required: false, integer: true }),
        DEFAULT_MAX_MATCHES,
        1,
        500,
      );
      const maxFiles = clampInteger(
        readNumberParam(params, "maxFiles", { required: false, integer: true }),
        DEFAULT_MAX_FILES,
        1,
        10_000,
      );
      const candidateFiles = await walkFiles({
        workspaceRoot: opts.workspaceRoot,
        relativeRoot,
        pattern: glob,
        maxFiles,
      });
      const result = await grepFiles({
        workspaceRoot: opts.workspaceRoot,
        files: candidateFiles.files,
        query,
        regex: params.regex === true,
        caseSensitive: params.caseSensitive === true,
        contextLines,
        maxMatches,
      });
      return jsonResult({
        status: "ok",
        query,
        root: relativeRoot,
        glob: glob ?? null,
        matches: result.matches,
        matchCount: result.matches.length,
        searchedFileCount: result.searchedFileCount,
        truncated: candidateFiles.truncated || result.truncated,
        text: formatGrepMatches(result.matches),
      });
    },
  };
}
