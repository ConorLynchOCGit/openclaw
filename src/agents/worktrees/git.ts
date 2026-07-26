import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveExecutablePath } from "../../infra/executable-path.js";
import { runCommandBuffered, runCommandWithTimeout } from "../../process/exec.js";

const GIT_TIMEOUT_MS = 120_000;

/** Credential-free process base for exact-generation local Git transactions. */
export const GIT_LOCAL_OBJECT_BASE_ENV = {
  HOME: path.parse(os.tmpdir()).root,
  LANG: "C",
  LC_ALL: "C",
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: "1",
} as const satisfies NodeJS.ProcessEnv;

/** Makes object reads fail closed instead of fetching or honoring replacement refs. */
export const GIT_LOCAL_OBJECT_ENV = {
  GIT_NO_LAZY_FETCH: "1",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "core.hooksPath",
  GIT_CONFIG_VALUE_0: os.devNull,
} as const satisfies NodeJS.ProcessEnv;

export type GitResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type GitEnvironmentOptions = {
  baseEnv?: NodeJS.ProcessEnv;
  env?: NodeJS.ProcessEnv;
  resolveExecutable?: boolean;
};

type WorktreeListEntry = {
  path: string;
  lockedReason?: string;
};

function resolveGitCommand(options: GitEnvironmentOptions): string {
  if (!options.resolveExecutable) {
    return "git";
  }
  const executable = resolveExecutablePath("git", { env: process.env });
  if (!executable) {
    throw new Error("Git executable is unavailable");
  }
  return executable;
}

export async function runGit(
  cwd: string,
  args: string[],
  options: GitEnvironmentOptions & { input?: string | Uint8Array } = {},
): Promise<GitResult> {
  return await runCommandWithTimeout([resolveGitCommand(options), "-C", cwd, ...args], {
    timeoutMs: GIT_TIMEOUT_MS,
    baseEnv: options.baseEnv,
    env: options.env,
    input: options.input,
  });
}

export function commandError(command: string, result: GitResult): Error {
  const detail = (result.stderr || result.stdout).trim().split("\n").slice(-12).join("\n");
  return new Error(`${command} failed${detail ? `:\n${detail}` : ""}`);
}

export async function requireGit(
  cwd: string,
  args: string[],
  options: GitEnvironmentOptions & { input?: string | Uint8Array } = {},
): Promise<string> {
  const result = await runGit(cwd, args, options);
  if (result.code !== 0) {
    throw commandError(`git ${args.join(" ")}`, result);
  }
  return result.stdout.trim();
}

export async function requireGitRaw(
  cwd: string,
  args: string[],
  options: GitEnvironmentOptions = {},
): Promise<string> {
  const result = await runGit(cwd, args, options);
  if (result.code !== 0) {
    throw commandError(`git ${args.join(" ")}`, result);
  }
  return result.stdout;
}

export async function requireGitBuffer(
  cwd: string,
  args: string[],
  options: GitEnvironmentOptions & { input?: Uint8Array } = {},
): Promise<Buffer> {
  const result = await runCommandBuffered([resolveGitCommand(options), "-C", cwd, ...args], {
    timeoutMs: GIT_TIMEOUT_MS,
    baseEnv: options.baseEnv,
    env: options.env,
    input: options.input,
  });
  if (result.code !== 0) {
    const detail = (result.stderr.length > 0 ? result.stderr : result.stdout)
      .toString("utf8")
      .trim()
      .split("\n")
      .slice(-12)
      .join("\n");
    throw new Error(`git ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout;
}

function parseWorktreeList(output: string): WorktreeListEntry[] {
  const entries: WorktreeListEntry[] = [];
  let current: WorktreeListEntry | undefined;
  for (const field of output.split("\0")) {
    if (!field) {
      if (current) {
        entries.push(current);
        current = undefined;
      }
      continue;
    }
    if (field.startsWith("worktree ")) {
      if (current) {
        entries.push(current);
      }
      current = { path: field.slice("worktree ".length) };
    } else if (current && field === "locked") {
      current.lockedReason = "";
    } else if (current && field.startsWith("locked ")) {
      current.lockedReason = field.slice("locked ".length);
    }
  }
  if (current) {
    entries.push(current);
  }
  return entries;
}

export async function listGitWorktrees(
  repoRoot: string,
  options: GitEnvironmentOptions = {},
): Promise<WorktreeListEntry[]> {
  return parseWorktreeList(
    await requireGitRaw(repoRoot, ["worktree", "list", "--porcelain", "-z"], options),
  );
}

/**
 * True when dir sits inside a git checkout: a .git entry on itself or any ancestor.
 * Existence, not directory-ness, is the signal — linked worktrees keep a .git file.
 * Mirrors `git rev-parse --show-toplevel` discovery without spawning git, so UI
 * capability checks and create-preflights cannot diverge from the worktree service.
 */
export function findGitCheckoutRoot(start: string): string | null {
  let current = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function insideGitCheckout(start: string): boolean {
  return findGitCheckoutRoot(start) !== null;
}

export async function hasSelfContainedGitMetadata(checkoutRoot: string): Promise<boolean> {
  try {
    const marker = await fs.lstat(path.join(checkoutRoot, ".git"));
    return marker.isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function removeEmptyParents(start: string, stop: string): Promise<void> {
  let current = start;
  while (current.startsWith(`${stop}${path.sep}`)) {
    try {
      await fs.rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}
