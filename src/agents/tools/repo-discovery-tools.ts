import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import {
  type AnyAgentTool,
  ToolInputError,
  readNumberParam,
  readStringParam,
  textResult,
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
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_MATCHES = 100;
const MAX_MATCH_LINE_LENGTH = 2000;

type GrepMatch = {
  path: string;
  line: number;
  text: string;
  contextBefore?: Array<{ line: number; text: string }>;
  contextAfter?: Array<{ line: number; text: string }>;
};

type RepoDiscoveryToolOptions = {
  workspaceRoot: string;
  stateRoot?: string | null;
  ignoredRelativeRoots?: readonly string[];
  defaultMaxResults?: number;
  defaultMaxMatches?: number;
};

const GlobToolSchema = Type.Object({
  pattern: Type.String({
    description: "File glob such as **/*.ts, src/agents/**/*.ts, or docs/**/*.md.",
  }),
  path: Type.Optional(
    Type.String({
      description: "Optional workspace-relative directory to search within.",
    }),
  ),
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
  query: Type.String({
    description:
      "Regular expression pattern to search for by default. Set regex:false for a literal text search.",
  }),
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
    Type.Boolean({ description: "Use JavaScript regular expression matching. Defaults to true." }),
  ),
  caseSensitive: Type.Optional(Type.Boolean({ description: "Use case-sensitive matching." })),
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

function expandBraceAlternates(pattern: string): string[] {
  const match = /\{([^{}]+)\}/u.exec(pattern);
  if (!match?.[1]) {
    return [pattern];
  }
  const before = pattern.slice(0, match.index);
  const after = pattern.slice(match.index + match[0].length);
  return match[1].split(",").flatMap((part) => expandBraceAlternates(`${before}${part}${after}`));
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
  return expandBraceAlternates(normalized).some((expanded) =>
    globToRegExp(expanded).test(relativePath),
  );
}

async function walkFiles(input: {
  workspaceRoot: string;
  relativeRoot: string;
  pattern?: string;
  ignoredRelativeRoots: readonly string[];
}): Promise<{ files: string[] }> {
  const files: string[] = [];

  async function walk(relativePath: string): Promise<void> {
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
  return { files };
}

async function resolveExactFileCandidate(input: {
  workspaceRoot: string;
  relativeRoot: string;
  pattern?: string;
}): Promise<string[] | null> {
  const normalized = normalizeRelativePath(input.relativeRoot);
  if (!normalized || normalized === ".") {
    return null;
  }
  const absolute = resolveWorkspaceTarget(input.workspaceRoot, normalized);
  const stat = await fs.lstat(absolute).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }
  return matchesGlob(normalized, input.pattern) ? [normalized] : [];
}

async function resolveManagedOutputExactFileCandidate(input: {
  workspaceRoot: string;
  stateRoot?: string | null;
  requestedPath?: string;
  pattern?: string;
}): Promise<string[] | null> {
  const requestedPath = input.requestedPath?.trim();
  const stateRoot = input.stateRoot?.trim();
  if (!requestedPath || !stateRoot) {
    return null;
  }
  const resolvedStateRoot = path.resolve(stateRoot);
  const managedOutputRoot = path.join(resolvedStateRoot, "managed-tool-output");
  const absolute = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(input.workspaceRoot, requestedPath);
  if (!pathWithin(absolute, managedOutputRoot) || path.extname(absolute) !== ".txt") {
    return null;
  }
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }
  const normalizedAbsolute = absolute.split(path.sep).join("/");
  const basename = path.basename(absolute);
  if (
    input.pattern &&
    !matchesGlob(normalizedAbsolute, input.pattern) &&
    !matchesGlob(basename, input.pattern)
  ) {
    return [];
  }
  return [absolute];
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
      const pattern = new RegExp(input.query, input.caseSensitive ? "u" : "iu");
      return {
        match: (line: string) => pattern.test(line),
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

function buildInvalidRegexDiagnostic(params: { query: string; error: unknown }) {
  const errorMessage = params.error instanceof Error ? params.error.message : String(params.error);
  const text = [
    `Invalid regex: ${errorMessage}`,
    "Retry the same query with regex:false for a literal search, or escape the regex metacharacters before searching.",
  ].join("\n");
  return textResult(text, {
    status: "invalid_regex",
    query: params.query,
    regex: true,
    error: `invalid regex: ${errorMessage}`,
    suggestedRetry: {
      query: params.query,
      regex: false,
    },
    text,
  });
}

async function grepFiles(input: {
  workspaceRoot: string;
  files: string[];
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  maxMatches: number;
  contextLines?: number;
}) {
  const matcher = buildLineMatcher(input);
  const matches: GrepMatch[] = [];
  let searchedFileCount = 0;
  let truncated = false;

  for (const file of input.files) {
    if (matches.length >= input.maxMatches) {
      truncated = true;
      break;
    }
    const absolute = path.isAbsolute(file)
      ? path.resolve(file)
      : resolveWorkspaceTarget(input.workspaceRoot, file);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isFile()) {
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
      const contextLines = Math.max(0, Math.min(3, input.contextLines ?? 0));
      const contextBefore =
        contextLines > 0
          ? lines.slice(Math.max(0, index - contextLines), index).map((contextLine, offset) => ({
              line: Math.max(1, index - contextLines + offset + 1),
              text: contextLine.slice(0, MAX_MATCH_LINE_LENGTH),
            }))
          : undefined;
      const contextAfter =
        contextLines > 0
          ? lines.slice(index + 1, index + 1 + contextLines).map((contextLine, offset) => ({
              line: index + offset + 2,
              text: contextLine.slice(0, MAX_MATCH_LINE_LENGTH),
            }))
          : undefined;
      matches.push({
        path: absolute,
        line: index + 1,
        text: line.slice(0, MAX_MATCH_LINE_LENGTH),
        ...(contextBefore && contextBefore.length > 0 ? { contextBefore } : {}),
        ...(contextAfter && contextAfter.length > 0 ? { contextAfter } : {}),
      });
    }
  }
  return { matches, searchedFileCount, truncated };
}

function formatGrepMatches(matches: readonly GrepMatch[]): string {
  if (matches.length === 0) {
    return "No files found";
  }
  const byPath = new Map<string, GrepMatch[]>();
  for (const match of matches) {
    byPath.set(match.path, [...(byPath.get(match.path) ?? []), match]);
  }
  const output: string[] = [];
  for (const [filePath, fileMatches] of byPath.entries()) {
    if (output.length > 0) {
      output.push("");
    }
    output.push(`${filePath}:`);
    for (const match of fileMatches) {
      for (const context of match.contextBefore ?? []) {
        output.push(`  ${context.line}: ${context.text}`);
      }
      output.push(`  Line ${match.line}: ${match.text}`);
      for (const context of match.contextAfter ?? []) {
        output.push(`  ${context.line}: ${context.text}`);
      }
    }
  }
  return output.join("\n");
}

function formatGrepText(params: {
  matches: readonly GrepMatch[];
  truncated: boolean;
  searchedFileCount: number;
  hiddenCount: number;
  hiddenCountExact: boolean;
}): string {
  const hiddenLabel = params.hiddenCountExact
    ? `${params.hiddenCount}`
    : `at least ${Math.max(1, params.hiddenCount)}`;
  if (params.matches.length > 0) {
    const output = [
      `Found ${params.matches.length} matches${params.truncated ? " (more matches available)" : ""}`,
      formatGrepMatches(params.matches),
    ];
    if (params.truncated) {
      output.push(
        "",
        `(Results truncated: showing ${params.matches.length} matches (${hiddenLabel} hidden). Consider using a more specific path or pattern.)`,
      );
    }
    return output.join("\n");
  }
  return "No files found";
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
      const pattern = readStringParam(params, "pattern", { required: true });
      const relativeRoot = normalizeRelativePath(
        readStringParam(params, "path", { required: false }),
      );
      const maxResults = defaultMaxResults;
      const result = await walkFiles({
        workspaceRoot: opts.workspaceRoot,
        relativeRoot,
        pattern,
        ignoredRelativeRoots,
      });
      const files = result.files.slice(0, maxResults);
      const truncated = result.files.length > maxResults;
      const text = appendTruncationGuidance({
        text: formatFileRefs(files),
        truncated,
        visible: files.length,
        noun: "files",
        guidance: "Use a more specific path or glob pattern.",
      });
      return textResult(text, {
        status: "ok",
        root: relativeRoot,
        pattern: pattern ?? null,
        files,
        count: files.length,
        truncated,
        hiddenCount: Math.max(0, result.files.length - files.length),
        text,
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
      const baseText =
        result.entries.length === 0
          ? "No entries found."
          : result.entries.map((entry) => `${entry.type}\t${entry.path}`).join("\n");
      const text = appendTruncationGuidance({
        text: baseText,
        truncated: result.truncated,
        visible: result.returnedEntries,
        total: result.totalEntries,
        noun: "entries",
        guidance: `Use offset=${result.nextOffset} to continue or choose a narrower directory.`,
      });
      return textResult(text, {
        status: "ok",
        path: relativePath,
        ...result,
        text,
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
  return {
    name: "grep",
    label: "Grep",
    displaySummary: "Search bounded workspace text.",
    description:
      "Search workspace text using regular expressions by default and return bounded file/line matches grouped by path. When a target file or directory is already known, pass path for that file or directory instead of repo-wide search. Use this for repo discovery and keyword pivots before reading files. For simple file-pattern discovery use glob. Set regex:false for literal text search.",
    parameters: GrepToolSchema,
    execute: async (_toolCallId, rawParams) => {
      const params =
        rawParams && typeof rawParams === "object" ? (rawParams as Record<string, unknown>) : {};
      const query = readStringParam(params, "query", { required: true });
      const relativeRoot = normalizeRelativePath(
        readStringParam(params, "path", { required: false }),
      );
      const glob = readStringParam(params, "glob", { required: false });
      const maxMatches = defaultMaxMatches;
      const regex = params.regex !== false;
      const managedOutputFileCandidate = await resolveManagedOutputExactFileCandidate({
        workspaceRoot: opts.workspaceRoot,
        stateRoot: opts.stateRoot,
        requestedPath: readStringParam(params, "path", { required: false }),
        pattern: glob,
      });
      const exactFileCandidate =
        managedOutputFileCandidate ??
        (await resolveExactFileCandidate({
          workspaceRoot: opts.workspaceRoot,
          relativeRoot,
          pattern: glob,
        }));
      const candidateFiles = exactFileCandidate
        ? { files: exactFileCandidate, truncated: false }
        : await walkFiles({
            workspaceRoot: opts.workspaceRoot,
            relativeRoot,
            pattern: glob,
            ignoredRelativeRoots,
          });
      let result: Awaited<ReturnType<typeof grepFiles>>;
      try {
        result = await grepFiles({
          workspaceRoot: opts.workspaceRoot,
          files: candidateFiles.files,
          query,
          regex,
          caseSensitive: params.caseSensitive === true,
          maxMatches,
          contextLines: exactFileCandidate ? 2 : 0,
        });
      } catch (error) {
        if (error instanceof ToolInputError && error.message.startsWith("invalid regex:")) {
          return buildInvalidRegexDiagnostic({ query, error });
        }
        throw error;
      }
      const truncated = result.truncated;
      const hiddenCount = truncated
        ? Math.max(0, candidateFiles.files.length - result.searchedFileCount)
        : 0;
      const hiddenCountExact = true;
      const text = formatGrepText({
        matches: result.matches,
        truncated,
        searchedFileCount: result.searchedFileCount,
        hiddenCount,
        hiddenCountExact,
      });
      return textResult(text, {
        status: "ok",
        query,
        regex,
        root: relativeRoot,
        glob: glob ?? null,
        matches: result.matches,
        matchCount: result.matches.length,
        searchedFileCount: result.searchedFileCount,
        truncated,
        hiddenCount,
        text,
      });
    },
  };
}
