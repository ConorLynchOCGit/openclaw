#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_OUTPUT_BYTES = 64_000;
const MAX_BATCH_ITEMS = 20;
const MAX_READ_BYTES = 80_000;
const MAX_RESULTS = 200;
const DEFAULT_EXCLUDE_GLOBS = [
  ".git/**",
  ".openclaw/**",
  "artifacts/**",
  "state/**",
  "transcripts/**",
  "sessions/**",
  "logs/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".turbo/**",
  ".next/**",
  "*.log",
  "*.jsonl",
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/*secret*",
  "**/*token*",
  "**/*credential*",
  "**/*provider-prompt*",
];

const server = new McpServer({
  name: "openclaw_repo_workbench",
  version: "0.1.0",
});

const SearchQuerySchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  glob: z.string().optional(),
  literal: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  contextLines: z.number().int().min(0).max(5).optional(),
  maxMatches: z.number().int().min(1).max(MAX_RESULTS).optional(),
});

const ReadRequestSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  maxBytes: z.number().int().min(1).max(MAX_READ_BYTES).optional(),
});

const GlobRequestSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  maxResults: z.number().int().min(1).max(MAX_RESULTS).optional(),
});

const GitRequestSchema = z.object({
  kind: z.enum(["status", "diff_stat", "changed_files", "diff_hunks"]),
  path: z.string().optional(),
  maxBytes: z.number().int().min(1).max(DEFAULT_OUTPUT_BYTES).optional(),
});

server.registerTool(
  "repo_search_many",
  {
    title: "Search Many",
    description: "Run multiple bounded ripgrep searches under the active repository root.",
    inputSchema: z.object({
      queries: z.array(SearchQuerySchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => result(await repoSearchMany(input)),
);

server.registerTool(
  "repo_read_many",
  {
    title: "Read Many",
    description: "Read multiple files or line ranges under the active repository root.",
    inputSchema: z.object({
      files: z.array(ReadRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => result(await repoReadMany(input)),
);

server.registerTool(
  "repo_glob_many",
  {
    title: "Glob Many",
    description: "Resolve multiple bounded file globs under the active repository root.",
    inputSchema: z.object({
      globs: z.array(GlobRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => result(await repoGlobMany(input)),
);

server.registerTool(
  "git_inspect_many",
  {
    title: "Git Inspect Many",
    description: "Run bounded read-only git status/diff inspection under the repository root.",
    inputSchema: z.object({
      requests: z.array(GitRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => result(await gitInspectMany(input)),
);

if (isMainModule()) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function repoSearchMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const queries = input.queries.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(queries.map((query) => runSearchQuery(root, query)));
  return { schemaVersion: "openclaw.repo_workbench.search_many.v1", root, results };
}

export async function repoReadMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const files = input.files.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(files.map((request) => readFileRequest(root, request)));
  return { schemaVersion: "openclaw.repo_workbench.read_many.v1", root, results };
}

export async function repoGlobMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const globs = input.globs.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(globs.map((request) => runGlobRequest(root, request)));
  return { schemaVersion: "openclaw.repo_workbench.glob_many.v1", root, results };
}

export async function gitInspectMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const requests = input.requests.slice(0, MAX_BATCH_ITEMS);
  const roots = resolveGitRoots(root, options.env ?? process.env);
  const expandedRequests = requests.flatMap((request) =>
    expandGitRequestRoots(root, roots, request).map((gitRoot) => ({ request, gitRoot })),
  );
  const results = await Promise.all(
    expandedRequests.map(({ request, gitRoot }) => runGitRequest(root, gitRoot, request)),
  );
  return {
    schemaVersion: "openclaw.repo_workbench.git_inspect_many.v1",
    root,
    gitRoots: roots.map((gitRoot) => relative(root, gitRoot)),
    results,
  };
}

export function resolveRepoRoot(cwd = process.cwd(), env = process.env) {
  const envRoot = env.OPENCLAW_REPO_WORKBENCH_ROOT?.trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }
  let current = path.resolve(cwd);
  for (let index = 0; index < 12; index += 1) {
    if (
      existsSync(path.join(current, "openclaw.mjs")) &&
      existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    if (
      path.basename(current) === "openclaw-coding-workbench" &&
      existsSync(path.join(current, "..", "..", "openclaw.mjs"))
    ) {
      return path.resolve(current, "..", "..");
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error(`Unable to resolve OpenClaw repository root from ${cwd}`);
}

function resolveSourceRoot(root, env = process.env) {
  const envSourceRoot = env.OPENCLAW_REPO_WORKBENCH_SOURCE_ROOT?.trim();
  if (envSourceRoot) {
    const resolved = path.resolve(envSourceRoot);
    if (isInside(root, resolved) && existsSync(path.join(resolved, ".git"))) {
      return resolved;
    }
  }
  const nested = path.join(root, "src", "openclaw");
  return existsSync(path.join(nested, ".git")) ? nested : undefined;
}

function resolveGitRoots(root, env = process.env) {
  const roots = [];
  if (existsSync(path.join(root, ".git"))) {
    roots.push(root);
  }
  const sourceRoot = resolveSourceRoot(root, env);
  if (sourceRoot && !roots.includes(sourceRoot)) {
    roots.push(sourceRoot);
  }
  return roots.length > 0 ? roots : [root];
}

function expandGitRequestRoots(root, gitRoots, request) {
  if (request.path) {
    const requested = safeResolve(root, request.path, { allowExcluded: true });
    const containingRoot = gitRoots
      .filter((gitRoot) => requested === gitRoot || requested.startsWith(`${gitRoot}${path.sep}`))
      .toSorted((left, right) => right.length - left.length)[0];
    return [containingRoot ?? root];
  }
  return gitRoots;
}

async function runSearchQuery(root, query) {
  try {
    const searchRoot = safeResolve(root, query.path ?? ".");
    const maxMatches = query.maxMatches ?? 80;
    const args = [
      "--line-number",
      "--no-heading",
      "--color",
      "never",
      "--max-count",
      String(maxMatches),
    ];
    if (query.literal) {
      args.push("-F");
    }
    if (query.caseSensitive === false) {
      args.push("-i");
    }
    if (query.contextLines && query.contextLines > 0) {
      args.push("-C", String(query.contextLines));
    }
    if (query.glob) {
      args.push("--glob", query.glob);
    }
    for (const excludeGlob of DEFAULT_EXCLUDE_GLOBS) {
      args.push("--glob", `!${excludeGlob}`);
    }
    args.push("--", query.pattern, searchRoot);
    const output = await runCommand("rg", args, root, DEFAULT_OUTPUT_BYTES);
    const lines = output.stdout.split(/\r?\n/u).filter(Boolean).slice(0, maxMatches);
    return {
      pattern: query.pattern,
      path: relative(root, searchRoot),
      status: output.exitCode === 0 ? "matched" : output.exitCode === 1 ? "no_match" : "error",
      matches: lines,
      truncated: output.truncated || lines.length >= maxMatches,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    return { pattern: query.pattern, status: "error", error: formatError(error) };
  }
}

async function readFileRequest(root, request) {
  try {
    const file = safeResolve(root, request.path);
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new Error("path is not a file");
    }
    const content = await fs.readFile(file, "utf8");
    const lines = content.split(/\r?\n/u);
    const startLine = request.startLine ?? 1;
    const endLine = request.endLine ?? lines.length;
    if (endLine < startLine) {
      throw new Error("endLine must be greater than or equal to startLine");
    }
    const selected = lines.slice(startLine - 1, endLine).join("\n");
    const maxBytes = request.maxBytes ?? 24_000;
    const capped = capString(selected, maxBytes);
    return {
      path: relative(root, file),
      status: "ok",
      startLine,
      endLine: Math.min(endLine, lines.length),
      totalLines: lines.length,
      content: capped.value,
      truncated: capped.truncated,
    };
  } catch (error) {
    return { path: request.path, status: "error", error: formatError(error) };
  }
}

async function runGlobRequest(root, request) {
  try {
    const searchRoot = safeResolve(root, request.path ?? ".");
    const maxResults = request.maxResults ?? 100;
    const args = ["--files", "--glob", request.pattern];
    for (const excludeGlob of DEFAULT_EXCLUDE_GLOBS) {
      args.push("--glob", `!${excludeGlob}`);
    }
    args.push(searchRoot);
    const output = await runCommand("rg", args, root, DEFAULT_OUTPUT_BYTES);
    const files = output.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((file) => relative(root, path.resolve(file)))
      .slice(0, maxResults);
    return {
      pattern: request.pattern,
      path: relative(root, searchRoot),
      status: output.exitCode === 0 ? "ok" : output.exitCode === 1 ? "no_match" : "error",
      files,
      truncated: output.truncated || files.length >= maxResults,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    return { pattern: request.pattern, status: "error", error: formatError(error) };
  }
}

async function runGitRequest(root, gitRoot, request) {
  try {
    const maxBytes = request.maxBytes ?? 48_000;
    const requestedPath = request.path
      ? safeResolve(root, request.path, { allowExcluded: true })
      : undefined;
    const gitRelativePath = requestedPath
      ? path.relative(gitRoot, requestedPath) || "."
      : undefined;
    const pathArgs = gitRelativePath ? ["--", gitRelativePath] : [];
    let args;
    switch (request.kind) {
      case "status":
        args = ["status", "--short", ...pathArgs];
        break;
      case "diff_stat":
        args = ["diff", "--stat", ...pathArgs];
        break;
      case "changed_files":
        args = ["diff", "--name-only", ...pathArgs];
        break;
      case "diff_hunks":
        args = ["diff", "--unified=3", ...pathArgs];
        break;
      default:
        throw new Error(`unsupported git inspect kind ${request.kind}`);
    }
    const output = await runCommand(
      "git",
      ["-c", `safe.directory=${gitRoot}`, ...args],
      gitRoot,
      maxBytes,
    );
    const cappedStdout = capString(output.stdout, maxBytes);
    return {
      kind: request.kind,
      repoRoot: relative(root, gitRoot),
      path: request.path ?? ".",
      status: output.exitCode === 0 ? "ok" : "error",
      stdout: cappedStdout.value,
      truncated: output.truncated || cappedStdout.truncated,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    return {
      kind: request.kind,
      path: request.path ?? ".",
      status: "error",
      error: formatError(error),
    };
  }
}

async function runCommand(command, args, cwd, maxBytes) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      timeout: DEFAULT_TIMEOUT_MS,
      maxBuffer: maxBytes + 8192,
    });
    return outputResult(0, stdout, stderr, maxBytes);
  } catch (error) {
    return outputResult(
      error.code ?? 2,
      error.stdout ?? "",
      error.stderr ?? formatError(error),
      maxBytes,
    );
  }
}

function outputResult(exitCode, stdout, stderr, maxBytes) {
  const cappedStdout = capString(stdout, maxBytes);
  const cappedStderr = capString(stderr, 8192);
  return {
    exitCode,
    stdout: cappedStdout.value,
    stderr: cappedStderr.value,
    truncated: cappedStdout.truncated || cappedStderr.truncated,
  };
}

function safeResolve(root, requestedPath, options = {}) {
  const resolved = path.resolve(root, requestedPath);
  if (!isInside(root, resolved)) {
    throw new Error(`path escapes repository root: ${requestedPath}`);
  }
  if (options.allowExcluded !== true) {
    assertNotExcluded(root, resolved);
  }
  return resolved;
}

function assertNotExcluded(root, resolved) {
  const rel = toPosix(relative(root, resolved));
  if (!rel || rel === ".") {
    return;
  }
  for (const glob of DEFAULT_EXCLUDE_GLOBS) {
    if (matchesExcludedGlob(rel, glob)) {
      throw new Error(`path is excluded from workbench access by default: ${rel}`);
    }
  }
}

function matchesExcludedGlob(rel, glob) {
  const normalized = toPosix(rel);
  const pattern = toPosix(glob);
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
    const segment = pattern.slice(3, -3);
    return normalized.includes(`/${segment}/`) || normalized.startsWith(`${segment}/`);
  }
  if (pattern.startsWith("**/*")) {
    const needle = pattern.slice(4).replaceAll("*", "").toLowerCase();
    return needle.length > 0 && normalized.toLowerCase().includes(needle);
  }
  if (pattern.includes("*")) {
    const regex = new RegExp(
      `^${pattern
        .split("*")
        .map((part) => escapeRegExp(part))
        .join(".*")}$`,
      "iu",
    );
    const basenameRegex = new RegExp(
      `(^|/)${pattern
        .split("*")
        .map((part) => escapeRegExp(part))
        .join(".*")}$`,
      "iu",
    );
    return regex.test(normalized) || basenameRegex.test(normalized);
  }
  if (pattern.startsWith("*.")) {
    return normalized.endsWith(pattern.slice(1));
  }
  return normalized === pattern || normalized.endsWith(`/${pattern}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isInside(root, resolved) {
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function relative(root, file) {
  return path.relative(root, file) || ".";
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

function capString(value, maxBytes) {
  const buffer = Buffer.from(value ?? "", "utf8");
  if (buffer.length <= maxBytes) {
    return { value: value ?? "", truncated: false };
  }
  return { value: buffer.subarray(0, maxBytes).toString("utf8"), truncated: true };
}

function result(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
