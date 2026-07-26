import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10_000;

export const DEFAULT_OUTPUT_BYTES = 64_000;
export const MAX_BATCH_ITEMS = 20;
export const DEFAULT_SEARCH_MATCHES = 20;
export const MAX_SEARCH_MATCHES = 60;
export const MAX_SEARCH_COMMAND_BYTES = 12_000;
export const MAX_SEARCH_RESPONSE_BYTES = 16_000;
export const DEFAULT_READ_BYTES = 10_000;
export const MAX_READ_BYTES = 12_000;
export const MAX_READ_TEXT_BYTES = 20_000;
export const MAX_READ_RESPONSE_BYTES = 32_000;
export const MAX_RESULTS = 200;
export const MAX_SEARCH_CONTEXT_LINES = 5;
export const DEFAULT_SEARCH_EXCLUSION_POLICY = "default";

const NODE_MODULES_EXCLUDE_GLOB = "**/node_modules/**";

export const DEFAULT_EXCLUDE_GLOBS = [
  "**/.git/**",
  NODE_MODULES_EXCLUDE_GLOB,
  "**/generated/**",
  "**/.cache/**",
  "**/.artifacts/**",
  "**/vendor/**",
  "**/runtime-state/**",
  ".openclaw/**",
  "artifacts/**",
  "cache/**",
  "state/**",
  "transcripts/**",
  "sessions/**",
  "logs/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.next/**",
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

export function resolveRepoRoot(cwd = process.cwd()) {
  const root = realpathSync(path.resolve(cwd));
  if (!existsSync(path.join(root, ".git"))) {
    throw new Error(`Codex thread cwd is not a Git worktree: ${root}`);
  }
  return root;
}

export function safeResolve(root, requestedPath, options = {}) {
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
  if (isPathExcluded(root, resolved)) {
    const rel = toPosix(relative(root, resolved));
    throw new Error(`path is excluded from workbench access by default: ${rel}`);
  }
}

export function assertExactReadAllowed(root, resolved) {
  const rel = toPosix(relative(root, resolved));
  const disallowed = DEFAULT_EXCLUDE_GLOBS.filter(
    (glob) => glob !== NODE_MODULES_EXCLUDE_GLOB && matchesExcludedGlob(rel, glob),
  );
  if (disallowed.length > 0) {
    throw new Error(`path is excluded from workbench access by default: ${rel}`);
  }
}

export function isPathExcluded(root, resolved) {
  const rel = toPosix(relative(root, resolved));
  if (!rel || rel === ".") {
    return false;
  }
  for (const glob of DEFAULT_EXCLUDE_GLOBS) {
    if (matchesExcludedGlob(rel, glob)) {
      return true;
    }
  }
  return false;
}

function matchesExcludedGlob(rel, glob) {
  const normalized = toPosix(rel);
  const pattern = toPosix(glob);
  if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
    const segment = pattern.slice(3, -3);
    return (
      normalized === segment ||
      normalized.startsWith(`${segment}/`) ||
      normalized.includes(`/${segment}/`)
    );
  }
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
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

export function isInside(root, resolved) {
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

export function relative(root, file) {
  return path.relative(root, file) || ".";
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

export function clampPositiveInt(value, defaultValue, maxValue) {
  if (!Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.min(Math.max(1, Math.trunc(value)), maxValue);
}

export async function runCommand(command, args, cwd, maxBytes) {
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

export async function runBoundedCommand(command, args, cwd, maxBytes) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutNewlines = 0;
    let stdoutSeen = false;
    let stdoutEndsWithNewline = true;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    const finish = (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      let stdout = Buffer.concat(stdoutChunks).toString("utf8");
      if (truncated) {
        const lastNewline = stdout.lastIndexOf("\n");
        stdout = lastNewline >= 0 ? stdout.slice(0, lastNewline + 1) : "";
      }
      resolve({
        exitCode: timedOut ? 124 : (exitCode ?? 2),
        stdout,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        truncated,
        timedOut,
        totalOutputLines: stdoutNewlines + (stdoutSeen && !stdoutEndsWithNewline ? 1 : 0),
      });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      const buffer = Buffer.from(chunk);
      stdoutSeen ||= buffer.length > 0;
      stdoutEndsWithNewline = buffer.length === 0 ? stdoutEndsWithNewline : buffer.at(-1) === 0x0a;
      let newlineIndex = buffer.indexOf(0x0a);
      while (newlineIndex >= 0) {
        stdoutNewlines += 1;
        newlineIndex = buffer.indexOf(0x0a, newlineIndex + 1);
      }
      if (truncated) {
        return;
      }
      const remaining = maxBytes - stdoutBytes;
      if (buffer.length > remaining) {
        if (remaining > 0) {
          stdoutChunks.push(buffer.subarray(0, remaining));
          stdoutBytes += remaining;
        }
        truncated = true;
        return;
      }
      stdoutChunks.push(buffer);
      stdoutBytes += buffer.length;
    });
    child.stderr.on("data", (chunk) => {
      const buffer = Buffer.from(chunk);
      const remaining = 8192 - stderrBytes;
      if (remaining > 0) {
        stderrChunks.push(buffer.subarray(0, remaining));
        stderrBytes += Math.min(buffer.length, remaining);
      }
    });
    child.on("error", (error) => {
      stderrChunks.push(Buffer.from(formatError(error)));
      finish(2);
    });
    child.on("close", (code) => finish(code));
  });
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

export function capString(value, maxBytes) {
  const buffer = Buffer.from(value ?? "", "utf8");
  if (buffer.length <= maxBytes) {
    return { value: value ?? "", truncated: false };
  }
  return { value: buffer.subarray(0, maxBytes).toString("utf8"), truncated: true };
}

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function mcpResult(value) {
  return {
    structuredContent: value,
  };
}

export function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
