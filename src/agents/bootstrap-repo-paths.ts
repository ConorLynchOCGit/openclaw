import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MAX_PARENT_STEPS = 12;

function pathExists(pathValue: string): boolean {
  try {
    fs.accessSync(pathValue);
    return true;
  } catch {
    return false;
  }
}

function* walkCandidateDirs(startDir: string): Generator<string> {
  let current = path.resolve(startDir);
  for (let i = 0; i < DEFAULT_MAX_PARENT_STEPS; i += 1) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

export function resolveBootstrapRepoPath(params: {
  relativePath: string;
  importMetaUrl?: string;
  cwd?: string;
  extraStartDirs?: string[];
}): string {
  const startDirs = [
    params.cwd,
    params.importMetaUrl ? path.dirname(fileURLToPath(params.importMetaUrl)) : undefined,
    ...(params.extraStartDirs ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const seenDirs = new Set<string>();
  for (const startDir of startDirs) {
    for (const candidateDir of walkCandidateDirs(startDir)) {
      if (seenDirs.has(candidateDir)) {
        continue;
      }
      seenDirs.add(candidateDir);
      const candidatePath = path.join(candidateDir, params.relativePath);
      if (pathExists(candidatePath)) {
        return candidatePath;
      }
    }
  }

  throw new Error(
    `Unable to locate repo path "${params.relativePath}" from ${startDirs.join(", ") || "no start dirs"}`,
  );
}

export function resolveBootstrapRepoRoot(params: {
  importMetaUrl?: string;
  cwd?: string;
  extraStartDirs?: string[];
}): string {
  return path.dirname(
    resolveBootstrapRepoPath({
      relativePath: "package.json",
      importMetaUrl: params.importMetaUrl,
      cwd: params.cwd,
      extraStartDirs: params.extraStartDirs,
    }),
  );
}
