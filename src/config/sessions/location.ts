import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { SessionLaunchResolvedLocation } from "./types.js";

function resolveRealPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const resolved = path.resolve(trimmed);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function resolveGitTreeIdentity(root: string | null): string | null {
  if (!root) {
    return null;
  }
  try {
    const topLevel = execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const realTopLevel = resolveRealPath(topLevel) ?? topLevel;
    return `git:${realTopLevel}:${commit}`;
  } catch {
    return `path:${root}`;
  }
}

export function buildSessionLaunchLocation(input: {
  sourceRoot?: string | null;
  workspaceRoot?: string | null;
  stateRoot?: string | null;
}): {
  resolvedLocation: SessionLaunchResolvedLocation;
  sourceIdentity: string | null;
  workspaceIdentity: string | null;
} {
  const sourceRoot = resolveRealPath(input.sourceRoot);
  const workspaceRoot = resolveRealPath(input.workspaceRoot);
  const stateRoot = resolveRealPath(input.stateRoot);
  return {
    resolvedLocation: {
      ...(sourceRoot
        ? {
            sourceRoot: {
              path: sourceRoot,
              authorityClass: "source" as const,
              writable: false,
            },
          }
        : {}),
      ...(workspaceRoot
        ? {
            workspaceRoot: {
              path: workspaceRoot,
              authorityClass: "workspace" as const,
              writable: true,
            },
          }
        : {}),
      ...(stateRoot
        ? {
            stateRoot: {
              path: stateRoot,
              authorityClass: "state" as const,
              writable: true,
            },
          }
        : {}),
    },
    sourceIdentity: resolveGitTreeIdentity(sourceRoot),
    workspaceIdentity: resolveGitTreeIdentity(workspaceRoot),
  };
}
