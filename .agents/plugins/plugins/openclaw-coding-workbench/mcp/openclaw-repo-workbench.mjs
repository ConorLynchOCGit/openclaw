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
  const results = await Promise.all(requests.map((request) => runGitRequest(root, request)));
  return { schemaVersion: "openclaw.repo_workbench.git_inspect_many.v1", root, results };
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
    const output = await runCommand(
      "rg",
      ["--files", searchRoot, "--glob", request.pattern],
      root,
      DEFAULT_OUTPUT_BYTES,
    );
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

async function runGitRequest(root, request) {
  try {
    const maxBytes = request.maxBytes ?? 48_000;
    const pathArgs = request.path ? ["--", safeResolve(root, request.path)] : [];
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
    const output = await runCommand("git", args, root, maxBytes);
    const cappedStdout = capString(output.stdout, maxBytes);
    return {
      kind: request.kind,
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

function safeResolve(root, requestedPath) {
  const resolved = path.resolve(root, requestedPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`path escapes repository root: ${requestedPath}`);
  }
  return resolved;
}

function relative(root, file) {
  return path.relative(root, file) || ".";
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
