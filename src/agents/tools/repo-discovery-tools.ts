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
const DEFAULT_EXCLUDED_RELATIVE_ROOTS = [".openclaw/runtime"];
const DEFAULT_MAX_FILES = 2_000;
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_MATCHES = 100;
const MAX_FILE_BYTES_FOR_GREP = 512 * 1024;
const MAX_MATCH_LINE_LENGTH = 2000;
const MAX_CONTEXT_LINES = 3;

type RepoDiscoveryToolOptions = {
  workspaceRoot: string;
  stateRoot?: string | null;
  ignoredRelativeRoots?: readonly string[];
  defaultMaxResults?: number;
  defaultMaxMatches?: number;
  defaultMaxFiles?: number;
};

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
  offset: Type.Optional(
    Type.Number({ description: "One-based entry offset for paginating large directories." }),
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

function normalizeStateRootAsRelativeRoot(input: {
  workspaceRoot: string;
  stateRoot?: string | null;
}): string | null {
  const stateRoot = input.stateRoot?.trim();
  if (!stateRoot) {
    return null;
  }
  const absoluteStateRoot = path.resolve(stateRoot);
  if (!pathWithin(absoluteStateRoot, input.workspaceRoot)) {
    return null;
  }
  const relative = path.relative(input.workspaceRoot, absoluteStateRoot).split(path.sep).join("/");
  if (!relative || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return normalizeRelativePath(relative);
}

function normalizeIgnoredRelativeRoots(input: {
  workspaceRoot: string;
  stateRoot?: string | null;
  ignoredRelativeRoots?: readonly string[];
}): string[] {
  const stateRoot = normalizeStateRootAsRelativeRoot({
    workspaceRoot: input.workspaceRoot,
    stateRoot: input.stateRoot,
  });
  return [
    ...new Set(
      [
        ...DEFAULT_EXCLUDED_RELATIVE_ROOTS,
        ...(stateRoot ? [stateRoot] : []),
        ...(input.ignoredRelativeRoots ?? []),
      ]
        .map((value) => normalizeRelativePath(value))
        .filter((value) => value && value !== "."),
    ),
  ];
}

function isIgnoredRelativePath(relativePath: string, ignoredRelativeRoots: readonly string[]) {
  const normalized = normalizeRelativePath(relativePath);
  return ignoredRelativeRoots.some(
    (ignoredRoot) => normalized === ignoredRoot || normalized.startsWith(`${ignoredRoot}/`),
  );
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
  ignoredRelativeRoots: readonly string[];
}): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let truncated = false;

  async function walk(relativePath: string): Promise<void> {
    if (files.length >= input.maxFiles) {
      truncated = true;
      return;
    }
    if (isIgnoredRelativePath(relativePath, input.ignoredRelativeRoots)) {
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
      const childRelativePath = normalizeRelativePath(path.join(relativePath, entry.name));
      if (isIgnoredRelativePath(childRelativePath, input.ignoredRelativeRoots)) {
        continue;
      }
      await walk(childRelativePath);
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

function appendTruncationGuidance(params: {
  text: string;
  truncated: boolean;
  visible: number;
  total?: number;
  noun: string;
  guidance: string;
}): string {
  if (!params.truncated) {
    return params.text;
  }
  const total = typeof params.total === "number" ? ` of ${params.total}` : "";
  return [
    params.text,
    "",
    `(Results truncated: showing ${params.visible}${total} ${params.noun}. ${params.guidance})`,
  ].join("\n");
}

async function listDirectory(input: {
  workspaceRoot: string;
  relativePath: string;
  offset: number;
  maxResults: number;
  ignoredRelativeRoots: readonly string[];
}) {
  const absolute = resolveWorkspaceTarget(input.workspaceRoot, input.relativePath);
  const entries = await fs.readdir(absolute, { withFileTypes: true }).catch((error: unknown) => {
    throw new ToolInputError(error instanceof Error ? error.message : "directory list failed");
  });
  const allEntries = entries
    .filter((entry) => !isExcludedDirectory(entry.name))
    .filter((entry) => {
      const childRelativePath = normalizeRelativePath(path.join(input.relativePath, entry.name));
      return !isIgnoredRelativePath(childRelativePath, input.ignoredRelativeRoots);
    })
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      path: normalizeRelativePath(path.join(input.relativePath, entry.name)),
      type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
    }));
  const start = Math.max(0, input.offset - 1);
  const normalizedEntries = allEntries.slice(start, start + input.maxResults);
  const nextOffset = start + normalizedEntries.length + 1;
  const truncated = nextOffset <= allEntries.length;
  return {
    entries: normalizedEntries,
    offset: input.offset,
    totalEntries: allEntries.length,
    returnedEntries: normalizedEntries.length,
    hiddenCount: Math.max(0, allEntries.length - (start + normalizedEntries.length)),
    nextOffset: truncated ? nextOffset : null,
    truncated,
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
        text: line.slice(0, MAX_MATCH_LINE_LENGTH),
        ...(input.contextLines > 0
          ? {
              before: lines
                .slice(beforeStart, index)
                .map((entry) => entry.slice(0, MAX_MATCH_LINE_LENGTH)),
              after: lines
                .slice(index + 1, afterEnd)
                .map((entry) => entry.slice(0, MAX_MATCH_LINE_LENGTH)),
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

export function createGlobTool(opts: RepoDiscoveryToolOptions): AnyAgentTool {
  const ignoredRelativeRoots = normalizeIgnoredRelativeRoots(opts);
  const defaultMaxResults = clampInteger(
    opts.defaultMaxResults,
    DEFAULT_MAX_RESULTS,
    1,
    DEFAULT_MAX_RESULTS,
  );
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
        defaultMaxResults,
        1,
        DEFAULT_MAX_RESULTS,
      );
      const result = await walkFiles({
        workspaceRoot: opts.workspaceRoot,
        relativeRoot,
        pattern,
        maxFiles: Math.max(maxResults, DEFAULT_MAX_FILES),
        ignoredRelativeRoots,
      });
      const files = result.files.slice(0, maxResults);
      const truncated = result.truncated || result.files.length > maxResults;
      return jsonResult({
        status: "ok",
        root: relativeRoot,
        pattern: pattern ?? null,
        files,
        count: files.length,
        truncated,
        hiddenCount: Math.max(0, result.files.length - files.length),
        text: appendTruncationGuidance({
          text: formatFileRefs(files),
          truncated,
          visible: files.length,
          noun: "files",
          guidance: "Use a more specific path or glob pattern.",
        }),
      });
    },
  };
}

export function createListTool(opts: RepoDiscoveryToolOptions): AnyAgentTool {
  const ignoredRelativeRoots = normalizeIgnoredRelativeRoots(opts);
  const defaultMaxResults = clampInteger(
    opts.defaultMaxResults,
    DEFAULT_MAX_RESULTS,
    1,
    DEFAULT_MAX_RESULTS,
  );
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
      const offset = clampInteger(
        readNumberParam(params, "offset", { required: false, integer: true }),
        1,
        1,
        Number.MAX_SAFE_INTEGER,
      );
      const maxResults = clampInteger(
        readNumberParam(params, "maxResults", { required: false, integer: true }),
        defaultMaxResults,
        1,
        500,
      );
      const result = await listDirectory({
        workspaceRoot: opts.workspaceRoot,
        relativePath,
        offset,
        maxResults,
        ignoredRelativeRoots,
      });
      const text =
        result.entries.length === 0
          ? "No entries found."
          : result.entries.map((entry) => `${entry.type}\t${entry.path}`).join("\n");
      return jsonResult({
        status: "ok",
        path: relativePath,
        ...result,
        text: appendTruncationGuidance({
          text,
          truncated: result.truncated,
          visible: result.returnedEntries,
          total: result.totalEntries,
          noun: "entries",
          guidance: `Use offset=${result.nextOffset} to continue or choose a narrower directory.`,
        }),
      });
    },
  };
}

export function createGrepTool(opts: RepoDiscoveryToolOptions): AnyAgentTool {
  const ignoredRelativeRoots = normalizeIgnoredRelativeRoots(opts);
  const defaultMaxMatches = clampInteger(
    opts.defaultMaxMatches,
    DEFAULT_MAX_MATCHES,
    1,
    DEFAULT_MAX_MATCHES,
  );
  const defaultMaxFiles = clampInteger(opts.defaultMaxFiles, DEFAULT_MAX_FILES, 1, 10_000);
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
        defaultMaxMatches,
        1,
        DEFAULT_MAX_MATCHES,
      );
      const maxFiles = clampInteger(
        readNumberParam(params, "maxFiles", { required: false, integer: true }),
        defaultMaxFiles,
        1,
        10_000,
      );
      const candidateFiles = await walkFiles({
        workspaceRoot: opts.workspaceRoot,
        relativeRoot,
        pattern: glob,
        maxFiles,
        ignoredRelativeRoots,
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
      const truncated = candidateFiles.truncated || result.truncated;
      return jsonResult({
        status: "ok",
        query,
        root: relativeRoot,
        glob: glob ?? null,
        matches: result.matches,
        matchCount: result.matches.length,
        searchedFileCount: result.searchedFileCount,
        truncated,
        hiddenCount: truncated
          ? Math.max(0, candidateFiles.files.length - result.searchedFileCount)
          : 0,
        text: appendTruncationGuidance({
          text: formatGrepMatches(result.matches),
          truncated,
          visible: result.matches.length,
          noun: "matches",
          guidance: "Use a more specific path, glob, or query before reading files.",
        }),
      });
    },
  };
}
