import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GENERATED_BOOTSTRAP_BLOCK_PATTERN =
  /<!-- BEGIN GENERATED:\s*(?:model-memory|openclaw-canonical)\s*-->[\s\S]*?<!-- END GENERATED:\s*(?:model-memory|openclaw-canonical)\s*-->\n*/g;
const LEGACY_MEMORY_PROJECTION_BLOCK_PATTERN =
  /<!-- OPENCLAW:MEMORY-PROJECTION:START\b[\s\S]*?<!-- OPENCLAW:MEMORY-PROJECTION:END\b[^\n]*-->\n*/g;
const REPO_CANONICAL_PREFIXES = ["docs/", "ops/", "scripts/", "extensions/", "skills/"] as const;
const REPO_CANONICAL_TOP_LEVEL_FILES = new Set(["AGENTS.md", "README.md", "docker-compose.yml"]);
const PRODUCT_LIVE_IMPORT_SEGMENTS = ["imports", "product_live", "content"] as const;
const BAKED_APP_ROOT = "/app";
const CORE_PACKAGE_NAMES = new Set(["openclaw"]);

export type WorkspaceMemorySourceAuthority =
  | "workspace_root_human_owned"
  | "workspace_daily_note_lower_authority"
  | "workspace_document";

export type RepoCanonicalReadResolution = {
  absolutePath: string;
  logicalPath: string;
  resolutionSource: "workspace-import" | "package-root" | "explicit-import" | "absolute-app";
};

function normalizeWorkspacePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//u, "");
}

function normalizeInputPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/u, "")
    .trim();
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parsePackageName(raw: string): string | null {
  const parsed = JSON.parse(raw) as { name?: unknown };
  return typeof parsed.name === "string" ? parsed.name : null;
}

function readPackageNameSync(dir: string): string | null {
  try {
    return parsePackageName(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function* iterAncestorDirs(startDir: string, maxDepth = 12): Generator<string> {
  let current = path.resolve(startDir);
  for (let i = 0; i < maxDepth; i += 1) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

function resolveOpenClawPackageRootSync(opts: {
  cwd?: string;
  argv1?: string;
  moduleUrl?: string;
}): string | null {
  const candidates: string[] = [];
  if (opts.moduleUrl) {
    try {
      candidates.push(path.dirname(fileURLToPath(opts.moduleUrl)));
    } catch {
      // Ignore invalid file URLs.
    }
  }
  if (opts.argv1) {
    candidates.push(path.dirname(path.resolve(opts.argv1)));
  }
  if (opts.cwd) {
    candidates.push(path.resolve(opts.cwd));
  }
  for (const candidate of candidates) {
    for (const current of iterAncestorDirs(candidate)) {
      const name = readPackageNameSync(current);
      if (name && CORE_PACKAGE_NAMES.has(name)) {
        return current;
      }
    }
  }
  return null;
}

function isRootWorkspaceUserOrMemoryFile(relativePath: string): boolean {
  const normalized = normalizeWorkspacePath(relativePath);
  return normalized === "USER.md" || normalized === "MEMORY.md" || normalized === "memory.md";
}

export function isDailyWorkspaceMemoryNote(relativePath: string): boolean {
  return /^memory\/\d{4}-\d{2}-\d{2}\.md$/u.test(normalizeWorkspacePath(relativePath));
}

export function stripGeneratedWorkspaceMemoryZones(params: {
  relativePath: string;
  content?: string;
}): string {
  const raw = params.content ?? "";
  if (!isRootWorkspaceUserOrMemoryFile(params.relativePath)) {
    return raw;
  }
  const stripped = raw
    .replace(GENERATED_BOOTSTRAP_BLOCK_PATTERN, "")
    .replace(LEGACY_MEMORY_PROJECTION_BLOCK_PATTERN, "")
    .trim();
  return stripped.length > 0 ? `${stripped}\n` : "";
}

export function buildWorkspaceMemorySourceMetadata(params: {
  relativePath: string;
  content: string;
}): {
  contentHash: string;
  sourceAuthority: WorkspaceMemorySourceAuthority;
  generatedZonesStripped: boolean;
} {
  const relativePath = normalizeWorkspacePath(params.relativePath);
  const filteredContent = stripGeneratedWorkspaceMemoryZones({
    relativePath,
    content: params.content,
  });
  const sourceAuthority: WorkspaceMemorySourceAuthority = isRootWorkspaceUserOrMemoryFile(
    relativePath,
  )
    ? "workspace_root_human_owned"
    : isDailyWorkspaceMemoryNote(relativePath)
      ? "workspace_daily_note_lower_authority"
      : "workspace_document";
  return {
    contentHash: sha256Text(filteredContent),
    sourceAuthority,
    generatedZonesStripped: filteredContent !== params.content,
  };
}

function isRepoCanonicalTopLevelFile(value: string): boolean {
  return !value.includes("/") && REPO_CANONICAL_TOP_LEVEL_FILES.has(value);
}

function isRepoCanonicalRelativePath(value: string): boolean {
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

  const packageRoot = resolveOpenClawPackageRootSync({
    cwd: process.cwd(),
    argv1: process.argv[1],
    moduleUrl: import.meta.url,
  });
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

  const packageRoot = resolveOpenClawPackageRootSync({
    cwd: process.cwd(),
    argv1: process.argv[1],
    moduleUrl: import.meta.url,
  });
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
