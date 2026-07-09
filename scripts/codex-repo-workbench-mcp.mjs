#!/usr/bin/env node
// Bounded repo workbench MCP for Codex-native Coding threads.
// This is loaded by Codex as an MCP server; OpenClaw does not call it directly.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileP = promisify(execFile);

const DEFAULT_OUTPUT_BYTES = 40_000;
const MAX_OUTPUT_BYTES = 80_000;
const MAX_READ_BYTES = 60_000;
const MAX_SEARCHES = 10;
const MAX_READS = 24;
const MAX_GLOBS = 20;
const MAX_COMMANDS = 6;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 180_000;

function clampInt(value, fallback, min, max) {
  const number = Number.isInteger(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
}

function truncateText(value, maxBytes = DEFAULT_OUTPUT_BYTES) {
  const text = String(value ?? "");
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) {
    return { text, bytes, truncated: false };
  }
  const truncated = Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8");
  return {
    text: `${truncated}\n[truncated ${bytes - Buffer.byteLength(truncated, "utf8")} bytes]`,
    bytes,
    truncated: true,
  };
}

function jsonResult(value) {
  const text = JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: value,
  };
}

async function resolveRoot() {
  const rawRoot = process.env.OPENCLAW_CODEX_REPO_WORKBENCH_ROOT || process.cwd();
  return await fs.realpath(path.resolve(rawRoot));
}

function assertInsideRoot(root, absolutePath) {
  const relative = path.relative(root, absolutePath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`path escapes repo root: ${absolutePath}`);
}

async function resolveExistingPath(root, inputPath) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new Error("path is required");
  }
  const candidate = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(root, inputPath);
  const real = await fs.realpath(candidate);
  assertInsideRoot(root, real);
  return real;
}

async function resolveExistingDirectory(root, inputPath = ".") {
  const real = await resolveExistingPath(root, inputPath);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new Error(`cwd is not a directory: ${inputPath}`);
  }
  return real;
}

function relativeToRoot(root, absolutePath) {
  return path.relative(root, absolutePath).replaceAll(path.sep, "/") || ".";
}

async function execInRepo(root, command, args, options = {}) {
  const cwd = await resolveExistingDirectory(root, options.cwd ?? ".");
  const timeout = clampInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, MAX_TIMEOUT_MS);
  const maxOutputBytes = clampInt(
    options.maxOutputBytes,
    DEFAULT_OUTPUT_BYTES,
    1_000,
    MAX_OUTPUT_BYTES,
  );
  try {
    const { stdout, stderr } = await execFileP(command, args, {
      cwd,
      timeout,
      maxBuffer: maxOutputBytes * 3,
      env: process.env,
    });
    const stdoutResult = truncateText(stdout, maxOutputBytes);
    const stderrResult = truncateText(stderr, Math.min(maxOutputBytes, 20_000));
    return {
      ok: true,
      exitCode: 0,
      command,
      args,
      cwd: relativeToRoot(root, cwd),
      stdout: stdoutResult.text,
      stderr: stderrResult.text,
      truncated: stdoutResult.truncated || stderrResult.truncated,
    };
  } catch (error) {
    const stdoutResult = truncateText(error?.stdout ?? "", maxOutputBytes);
    const stderrResult = truncateText(error?.stderr ?? "", Math.min(maxOutputBytes, 20_000));
    return {
      ok: false,
      exitCode: typeof error?.code === "number" ? error.code : null,
      signal: typeof error?.signal === "string" ? error.signal : null,
      command,
      args,
      cwd: relativeToRoot(root, cwd),
      stdout: stdoutResult.text,
      stderr: stderrResult.text,
      error: error instanceof Error ? error.message : String(error),
      truncated: stdoutResult.truncated || stderrResult.truncated,
    };
  }
}

function splitLines(text, maxLines) {
  const lines = text
    ? String(text)
        .split(/\r?\n/u)
        .filter((line) => line.length > 0)
    : [];
  return {
    lines: lines.slice(0, maxLines),
    lineCount: lines.length,
    truncated: lines.length > maxLines,
  };
}

async function repoGlobMany(root, input) {
  const patterns = input.patterns.slice(0, MAX_GLOBS);
  const maxResults = clampInt(input.max_results, 300, 1, 1_000);
  const results = await Promise.all(
    patterns.map(async (pattern) => {
      const run = await execInRepo(root, "rg", ["--files", "-g", pattern], {
        timeoutMs: 15_000,
        maxOutputBytes: 60_000,
      });
      const lines = splitLines(run.stdout, maxResults);
      return {
        pattern,
        ok: run.ok || run.exitCode === 1,
        files: lines.lines,
        count: lines.lineCount,
        truncated: lines.truncated || run.truncated,
        stderr: run.stderr,
      };
    }),
  );
  return { root, results };
}

async function repoSearchMany(root, input) {
  const searches = input.searches.slice(0, MAX_SEARCHES);
  const results = await Promise.all(
    searches.map(async (search) => {
      const maxMatches = clampInt(search.max_matches, 80, 1, 500);
      const args = ["--line-number", "--column", "--no-heading", "--color", "never"];
      if (search.literal === true) {
        args.push("--fixed-strings");
      }
      if (search.ignore_case === true) {
        args.push("--ignore-case");
      }
      for (const glob of search.globs ?? []) {
        args.push("-g", glob);
      }
      args.push("--", search.pattern, ".");
      const run = await execInRepo(root, "rg", args, {
        timeoutMs: clampInt(search.timeout_ms, 20_000, 1_000, 60_000),
        maxOutputBytes: clampInt(search.max_output_bytes, 60_000, 2_000, MAX_OUTPUT_BYTES),
      });
      const lines = splitLines(run.stdout, maxMatches);
      return {
        pattern: search.pattern,
        ok: run.ok || run.exitCode === 1,
        matches: lines.lines,
        matchCount: lines.lineCount,
        truncated: lines.truncated || run.truncated,
        stderr: run.stderr,
      };
    }),
  );
  return { root, results };
}

async function repoReadMany(root, input) {
  const files = input.files.slice(0, MAX_READS);
  const results = await Promise.all(
    files.map(async (entry) => {
      try {
        const filePath = await resolveExistingPath(root, entry.path);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
          throw new Error("not a file");
        }
        const maxBytes = clampInt(entry.max_bytes, 30_000, 1, MAX_READ_BYTES);
        const raw = await fs.readFile(filePath, "utf8");
        const lines = raw.split(/\r?\n/u);
        const startLine = clampInt(entry.start_line, 1, 1, Math.max(1, lines.length));
        const endLine = clampInt(entry.end_line, lines.length, startLine, lines.length);
        const selected = lines.slice(startLine - 1, endLine).join("\n");
        const truncated = truncateText(selected, maxBytes);
        return {
          path: relativeToRoot(root, filePath),
          ok: true,
          startLine,
          endLine,
          totalLines: lines.length,
          bytes: Buffer.byteLength(selected, "utf8"),
          truncated: truncated.truncated,
          text: truncated.text,
        };
      } catch (error) {
        return {
          path: entry.path,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  return { root, results };
}

async function gitInspectMany(root, input) {
  const includeStatus = input.include_status !== false;
  const includeDiffStat = input.include_diff_stat !== false;
  const includeChangedFiles = input.include_changed_files !== false;
  const includeDiff = input.include_diff === true;
  const jobs = [];
  if (includeStatus) {
    jobs.push(["status", execInRepo(root, "git", ["status", "--short"], { timeoutMs: 20_000 })]);
  }
  if (includeDiffStat) {
    jobs.push(["diffStat", execInRepo(root, "git", ["diff", "--stat"], { timeoutMs: 20_000 })]);
  }
  if (includeChangedFiles) {
    jobs.push([
      "changedFiles",
      execInRepo(root, "git", ["diff", "--name-only"], { timeoutMs: 20_000 }),
    ]);
  }
  if (includeDiff) {
    jobs.push([
      "diff",
      execInRepo(root, "git", ["diff", "--unified=3", "--"], {
        timeoutMs: 30_000,
        maxOutputBytes: clampInt(input.max_diff_bytes, 50_000, 1_000, MAX_OUTPUT_BYTES),
      }),
    ]);
  }
  const settled = await Promise.all(jobs.map(async ([key, promise]) => [key, await promise]));
  return {
    root,
    results: Object.fromEntries(settled),
  };
}

async function validationRunMany(root, input) {
  const commands = input.commands.slice(0, MAX_COMMANDS);
  const results = await Promise.all(
    commands.map(async (commandSpec) => {
      if (commandSpec.command.includes("/") || commandSpec.command.includes("\\")) {
        return {
          ok: false,
          command: commandSpec.command,
          error: "validation command must be an executable name, not a path",
        };
      }
      return await execInRepo(root, commandSpec.command, commandSpec.args ?? [], {
        cwd: commandSpec.cwd ?? ".",
        timeoutMs: clampInt(commandSpec.timeout_ms, 60_000, 1_000, MAX_TIMEOUT_MS),
        maxOutputBytes: clampInt(
          commandSpec.max_output_bytes,
          DEFAULT_OUTPUT_BYTES,
          1_000,
          MAX_OUTPUT_BYTES,
        ),
      });
    }),
  );
  return { root, results };
}

async function buildServer() {
  const root = await resolveRoot();
  const server = new McpServer({ name: "openclaw-repo-workbench", version: "1.0.0" });

  server.tool(
    "repo_glob_many",
    "Resolve multiple bounded repository file globs concurrently with ripgrep.",
    {
      patterns: z.array(z.string().min(1)).min(1).max(MAX_GLOBS),
      max_results: z.number().int().min(1).max(1_000).optional(),
    },
    async (input) => jsonResult(await repoGlobMany(root, input)),
  );

  server.tool(
    "repo_search_many",
    "Run multiple bounded ripgrep searches concurrently.",
    {
      searches: z
        .array(
          z.object({
            pattern: z.string().min(1),
            globs: z.array(z.string().min(1)).max(20).optional(),
            literal: z.boolean().optional(),
            ignore_case: z.boolean().optional(),
            max_matches: z.number().int().min(1).max(500).optional(),
            timeout_ms: z.number().int().min(1_000).max(60_000).optional(),
            max_output_bytes: z.number().int().min(2_000).max(MAX_OUTPUT_BYTES).optional(),
          }),
        )
        .min(1)
        .max(MAX_SEARCHES),
    },
    async (input) => jsonResult(await repoSearchMany(root, input)),
  );

  server.tool(
    "repo_read_many",
    "Read multiple repository files or line ranges concurrently with output caps.",
    {
      files: z
        .array(
          z.object({
            path: z.string().min(1),
            start_line: z.number().int().min(1).optional(),
            end_line: z.number().int().min(1).optional(),
            max_bytes: z.number().int().min(1).max(MAX_READ_BYTES).optional(),
          }),
        )
        .min(1)
        .max(MAX_READS),
    },
    async (input) => jsonResult(await repoReadMany(root, input)),
  );

  server.tool(
    "git_inspect_many",
    "Return bounded git status, diff stat, changed files, and optional diff in one call.",
    {
      include_status: z.boolean().optional(),
      include_diff_stat: z.boolean().optional(),
      include_changed_files: z.boolean().optional(),
      include_diff: z.boolean().optional(),
      max_diff_bytes: z.number().int().min(1_000).max(MAX_OUTPUT_BYTES).optional(),
    },
    async (input) => jsonResult(await gitInspectMany(root, input)),
  );

  server.tool(
    "validation_run_many",
    "Run explicitly listed validation commands concurrently inside the repository.",
    {
      commands: z
        .array(
          z.object({
            command: z.string().min(1),
            args: z.array(z.string()).max(80).optional(),
            cwd: z.string().min(1).optional(),
            timeout_ms: z.number().int().min(1_000).max(MAX_TIMEOUT_MS).optional(),
            max_output_bytes: z.number().int().min(1_000).max(MAX_OUTPUT_BYTES).optional(),
          }),
        )
        .min(1)
        .max(MAX_COMMANDS),
    },
    async (input) => jsonResult(await validationRunMany(root, input)),
  );

  return { server, root };
}

if (process.argv.includes("--self-test")) {
  try {
    const root = await resolveRoot();
    const result = await repoGlobMany(root, { patterns: ["scripts/codex-repo-workbench-mcp.mjs"] });
    console.log(JSON.stringify({ ok: true, root, result }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
} else {
  try {
    const { server } = await buildServer();
    await server.connect(new StdioServerTransport());
  } catch (error) {
    // MCP stdio reserves stdout for protocol traffic.
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
