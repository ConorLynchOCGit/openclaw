import fs from "node:fs";
import path from "node:path";
import { resolveOpenClawPackageRootSync } from "./openclaw-root.js";

const REPO_CANONICAL_PREFIXES = ["docs/", "ops/", "scripts/", "extensions/", "skills/"] as const;
const REPO_CANONICAL_TOP_LEVEL_FILES = new Set(["AGENTS.md", "README.md", "docker-compose.yml"]);
const PRODUCT_LIVE_IMPORT_SEGMENTS = ["imports", "product_live", "content"] as const;
const BAKED_APP_ROOT = "/app";

export type RepoCanonicalResolutionSource =
  | "workspace-import"
  | "package-root"
  | "explicit-import"
  | "absolute-app";

export type RepoCanonicalReadResolution = {
  absolutePath: string;
  logicalPath: string;
  resolutionSource: RepoCanonicalResolutionSource;
};

function normalizeInputPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .trim();
}

function isRepoCanonicalTopLevelFile(value: string): boolean {
  return !value.includes("/") && REPO_CANONICAL_TOP_LEVEL_FILES.has(value);
}

export function isRepoCanonicalRelativePath(value: string): boolean {
  const normalized = normalizeInputPath(value);
  if (!normalized || normalized.startsWith("../") || normalized === "..") {
    return false;
  }
  return (
    REPO_CANONICAL_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    isRepoCanonicalTopLevelFile(normalized)
  );
}

function maybeStripAppPrefix(filePath: string): string | null {
  const normalized = path.posix.normalize(filePath.replace(/\\/g, "/"));
  if (normalized === BAKED_APP_ROOT) {
    return null;
  }
  if (!normalized.startsWith(`${BAKED_APP_ROOT}/`)) {
    return null;
  }
  return normalized.slice(BAKED_APP_ROOT.length + 1);
}

function resolveWorkspaceImportRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot, ...PRODUCT_LIVE_IMPORT_SEGMENTS);
}

function resolvePackageRoot(): string | null {
  return resolveOpenClawPackageRootSync({
    cwd: process.cwd(),
    argv1: process.argv[1],
    moduleUrl: import.meta.url,
  });
}

function chooseExistingRepoPath(params: {
  logicalPath: string;
  workspaceRoot: string;
}): RepoCanonicalReadResolution | null {
  const importRoot = resolveWorkspaceImportRoot(params.workspaceRoot);
  const importCandidate = path.resolve(importRoot, params.logicalPath);
  if (fs.existsSync(importCandidate)) {
    return {
      absolutePath: importCandidate,
      logicalPath: params.logicalPath,
      resolutionSource: "workspace-import",
    };
  }

  const packageRoot = resolvePackageRoot();
  if (packageRoot) {
    const packageCandidate = path.resolve(packageRoot, params.logicalPath);
    if (fs.existsSync(packageCandidate)) {
      return {
        absolutePath: packageCandidate,
        logicalPath: params.logicalPath,
        resolutionSource: "package-root",
      };
    }
  }

  if (fs.existsSync(importRoot)) {
    return {
      absolutePath: importCandidate,
      logicalPath: params.logicalPath,
      resolutionSource: "workspace-import",
    };
  }
  if (packageRoot) {
    return {
      absolutePath: path.resolve(packageRoot, params.logicalPath),
      logicalPath: params.logicalPath,
      resolutionSource: "package-root",
    };
  }
  return null;
}

export function resolveRepoCanonicalReadPath(params: {
  workspaceRoot: string;
  inputPath: string;
}): RepoCanonicalReadResolution | null {
  const inputPath = params.inputPath.trim();
  if (!inputPath) {
    return null;
  }

  if (!path.isAbsolute(inputPath)) {
    const normalized = normalizeInputPath(inputPath);
    if (normalized.startsWith("imports/product_live/content/")) {
      const logicalPath = normalized.slice("imports/product_live/content/".length);
      const absolutePath = path.resolve(params.workspaceRoot, normalized);
      return {
        absolutePath,
        logicalPath: isRepoCanonicalRelativePath(logicalPath) ? logicalPath : normalized,
        resolutionSource: "explicit-import",
      };
    }
    if (isRepoCanonicalRelativePath(normalized)) {
      return chooseExistingRepoPath({
        logicalPath: normalized,
        workspaceRoot: params.workspaceRoot,
      });
    }
    return null;
  }

  const appRelative = maybeStripAppPrefix(inputPath);
  if (appRelative && isRepoCanonicalRelativePath(appRelative)) {
    const resolved = chooseExistingRepoPath({
      logicalPath: appRelative,
      workspaceRoot: params.workspaceRoot,
    });
    return resolved
      ? {
          ...resolved,
          resolutionSource:
            resolved.resolutionSource === "workspace-import"
              ? "absolute-app"
              : resolved.resolutionSource,
        }
      : null;
  }

  const importRoot = resolveWorkspaceImportRoot(params.workspaceRoot);
  const importRootWithSep = `${importRoot}${path.sep}`;
  const absolute = path.resolve(inputPath);
  if (absolute === importRoot || absolute.startsWith(importRootWithSep)) {
    const logicalPath = path.relative(importRoot, absolute).split(path.sep).join("/");
    return {
      absolutePath: absolute,
      logicalPath,
      resolutionSource: "explicit-import",
    };
  }

  const packageRoot = resolvePackageRoot();
  if (packageRoot) {
    const packageRootWithSep = `${packageRoot}${path.sep}`;
    if (absolute === packageRoot || absolute.startsWith(packageRootWithSep)) {
      const logicalPath = path.relative(packageRoot, absolute).split(path.sep).join("/");
      if (isRepoCanonicalRelativePath(logicalPath)) {
        return {
          absolutePath: absolute,
          logicalPath,
          resolutionSource: "package-root",
        };
      }
    }
  }

  return null;
}

export function toBundledSkillPromptPath(filePath: string, source?: string): string {
  if (source !== "openclaw-bundled") {
    return filePath;
  }
  const normalized = normalizeInputPath(filePath);
  const parts = normalized.split("/");
  const skillIndex = parts.lastIndexOf("skills");
  const skillName = skillIndex >= 0 ? parts[skillIndex + 1] : undefined;
  if (!skillName) {
    return filePath;
  }
  return `skills/${skillName}/SKILL.md`;
}
