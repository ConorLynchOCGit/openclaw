import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { resolveBootstrapRepoPath } from "./bootstrap-repo-paths.js";

export type OpenClawPathActorProfile = "ordinary-main" | "host-operator" | "repo-executor";
export type OpenClawPathOwnerHint = "product_repo" | "operator_workspace";

export type OpenClawPathResolution = {
  requested: string;
  canonicalOwner:
    | "product_repo"
    | "operator_workspace"
    | "curated_import_mirror"
    | "hostfs_mirror"
    | "artifact"
    | "memory_ops"
    | "generated_projection"
    | "unknown";
  canonicalPath: string | null;
  writablePath: string | null;
  readOnlyMirrorPaths: string[];
  classification: {
    repoVsWorkspace:
      | "repo"
      | "workspace"
      | "workspace_import"
      | "hostfs"
      | "artifact"
      | "memory_ops"
      | "unknown";
    generated: boolean;
    humanOwned: boolean;
  };
  allowedEditSurface:
    | "direct"
    | "host_operator_only"
    | "repo_executor_required"
    | "read_only"
    | "none";
  requiredEscalation: string | null;
  reason: string;
};

export type OpenClawPathResolverOptions = {
  liveRepoRoot?: string;
  workspaceRoot?: string;
  actorProfile?: OpenClawPathActorProfile;
  ownerHint?: OpenClawPathOwnerHint;
};

export type OpenClawPathResolvedRoots = {
  liveRepoRoot: string;
  runtimeHome: string;
  workspaceRoot: string;
};

const DEFAULT_LIVE_REPO_ROOT = "/root/services/openclaw-roles/live";
const DEFAULT_RUNTIME_HOME = "/root/.openclaw";
const DEFAULT_WORKSPACE_ROOT = "/root/.openclaw/workspace";
const SOURCE_RUNTIME_MANIFEST_RELATIVE_PATH =
  "docs/system/registries/source-runtime-unification.yaml";

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return path.posix.normalize(trimmed.replace(/\\/g, "/"));
}

function stringRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readSourceRuntimeManifestRoots(): Partial<OpenClawPathResolvedRoots> {
  try {
    const manifestPath = resolveBootstrapRepoPath({
      relativePath: SOURCE_RUNTIME_MANIFEST_RELATIVE_PATH,
      importMetaUrl: import.meta.url,
      cwd: process.cwd(),
    });
    const parsed = stringRecord(YAML.parse(fs.readFileSync(manifestPath, "utf8")));
    const canonical = stringRecord(parsed.canonical);
    const runtimeHome = optionalString(canonical.runtimeHome);
    return {
      liveRepoRoot: optionalString(canonical.projectRoot) ?? undefined,
      runtimeHome: runtimeHome ?? undefined,
      workspaceRoot: runtimeHome ? path.posix.join(runtimeHome, "workspace") : undefined,
    };
  } catch {
    return {};
  }
}

export function resolveOpenClawPathRoots(
  options: Pick<OpenClawPathResolverOptions, "liveRepoRoot" | "workspaceRoot"> = {},
): OpenClawPathResolvedRoots {
  const manifestRoots = readSourceRuntimeManifestRoots();
  const runtimeHome = normalizePath(manifestRoots.runtimeHome ?? DEFAULT_RUNTIME_HOME);
  return {
    liveRepoRoot: normalizePath(
      options.liveRepoRoot ?? manifestRoots.liveRepoRoot ?? DEFAULT_LIVE_REPO_ROOT,
    ),
    runtimeHome,
    workspaceRoot: normalizePath(
      options.workspaceRoot ?? manifestRoots.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT,
    ),
  };
}

function pathWithin(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizePath(candidate);
  const normalizedRoot = normalizePath(root);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

function relativeTo(root: string, candidate: string): string {
  return normalizePath(path.posix.relative(normalizePath(root), normalizePath(candidate)));
}

function resolveProductRepoPathFromQuery(query: string, liveRepoRoot: string): string | null {
  const normalized = normalizePath(query);
  if (pathWithin(normalized, liveRepoRoot)) {
    return normalized;
  }
  const withoutImportPrefix = normalized.match(
    /\/imports\/product_live\/content\/(?<relative>.+)$/u,
  )?.groups?.relative;
  if (withoutImportPrefix) {
    return normalizePath(path.posix.join(liveRepoRoot, withoutImportPrefix));
  }
  if (/web[-_\s]?researcher|agent pack/i.test(query)) {
    return normalizePath(path.posix.join(liveRepoRoot, "docs/agents/web-researcher"));
  }
  if (
    normalized.startsWith("docs/") ||
    normalized.startsWith("src/") ||
    normalized.startsWith("ui/")
  ) {
    return normalizePath(path.posix.join(liveRepoRoot, normalized));
  }
  return null;
}

function resolveWorkspacePathFromQuery(query: string, workspaceRoot: string): string | null {
  const normalized = normalizePath(query);
  if (pathWithin(normalized, workspaceRoot)) {
    return normalized;
  }
  if (
    normalized === "core" ||
    normalized === "docs" ||
    normalized === "projects" ||
    normalized === "runbooks" ||
    normalized === "memory" ||
    normalized.startsWith("core/") ||
    normalized.startsWith("docs/") ||
    normalized.startsWith("projects/") ||
    normalized.startsWith("runbooks/") ||
    normalized.startsWith("memory/")
  ) {
    return normalizePath(path.posix.join(workspaceRoot, normalized));
  }
  return null;
}

function parseOwnerHintFromRequest(requested: string): {
  ownerHint: OpenClawPathOwnerHint | null;
  requested: string;
} {
  const trimmed = requested.trim();
  const workspaceMatch = trimmed.match(/^(?:operator_workspace|workspace)\s*[: ]\s*(?<path>.+)$/iu);
  if (workspaceMatch?.groups?.path) {
    return { ownerHint: "operator_workspace", requested: workspaceMatch.groups.path };
  }
  const repoMatch = trimmed.match(/^(?:live_repo|product_repo|repo)\s*[: ]\s*(?<path>.+)$/iu);
  if (repoMatch?.groups?.path) {
    return { ownerHint: "product_repo", requested: repoMatch.groups.path };
  }
  return { ownerHint: null, requested };
}

export function resolveOpenClawPath(
  requested: string,
  options: OpenClawPathResolverOptions = {},
): OpenClawPathResolution {
  const roots = resolveOpenClawPathRoots(options);
  const liveRepoRoot = roots.liveRepoRoot;
  const workspaceRoot = roots.workspaceRoot;
  const actorProfile = options.actorProfile ?? "ordinary-main";
  const parsedRequest = parseOwnerHintFromRequest(requested);
  const ownerHint = options.ownerHint ?? parsedRequest.ownerHint;
  const effectiveRequested = parsedRequest.requested;
  const normalized = normalizePath(effectiveRequested);
  const productImportRoot = normalizePath(
    path.posix.join(workspaceRoot, "imports/product_live/content"),
  );
  const hostfsRoot = normalizePath(path.posix.join(workspaceRoot, "system/hostfs"));
  const artifactsRoot = normalizePath(path.posix.join(liveRepoRoot, ".artifacts"));
  const memoryOpsRoot = normalizePath(path.posix.join(liveRepoRoot, ".openclaw-memory-ops"));
  const projectionsRoot = normalizePath(
    path.posix.join(workspaceRoot, ".openclaw/model-memory/projections"),
  );

  if (normalized && pathWithin(normalized, productImportRoot)) {
    const relative = relativeTo(productImportRoot, normalized);
    const canonicalPath = normalizePath(path.posix.join(liveRepoRoot, relative));
    return {
      requested,
      canonicalOwner: "product_repo",
      canonicalPath,
      writablePath:
        actorProfile === "host-operator" || actorProfile === "repo-executor" ? canonicalPath : null,
      readOnlyMirrorPaths: [normalized],
      classification: {
        repoVsWorkspace: "workspace_import",
        generated: false,
        humanOwned: false,
      },
      allowedEditSurface:
        actorProfile === "host-operator" || actorProfile === "repo-executor"
          ? "direct"
          : "repo_executor_required",
      requiredEscalation:
        actorProfile === "host-operator" || actorProfile === "repo-executor"
          ? null
          : "needs repo executor / host write bridge",
      reason: "Curated product import is a read-only mirror; edit the live product repo instead.",
    };
  }

  if (normalized && pathWithin(normalized, hostfsRoot)) {
    return {
      requested,
      canonicalOwner: "hostfs_mirror",
      canonicalPath: null,
      writablePath: null,
      readOnlyMirrorPaths: [normalized],
      classification: {
        repoVsWorkspace: "hostfs",
        generated: false,
        humanOwned: false,
      },
      allowedEditSurface: "read_only",
      requiredEscalation: "needs repo executor / host write bridge",
      reason: "system/hostfs is a broad host visibility mirror and must not be edited directly.",
    };
  }

  if (normalized && pathWithin(normalized, projectionsRoot)) {
    return {
      requested,
      canonicalOwner: "generated_projection",
      canonicalPath: normalized,
      writablePath: null,
      readOnlyMirrorPaths: [],
      classification: {
        repoVsWorkspace: "workspace",
        generated: true,
        humanOwned: false,
      },
      allowedEditSurface: "none",
      requiredEscalation: null,
      reason:
        "Projection artifacts are generated compiled views; update MMV2 truth or compiler inputs.",
    };
  }

  if (
    normalized &&
    (pathWithin(normalized, artifactsRoot) || normalized.includes("/.artifacts/"))
  ) {
    return {
      requested,
      canonicalOwner: "artifact",
      canonicalPath: normalized,
      writablePath: normalized,
      readOnlyMirrorPaths: [],
      classification: {
        repoVsWorkspace: "artifact",
        generated: true,
        humanOwned: false,
      },
      allowedEditSurface: "direct",
      requiredEscalation: null,
      reason: "Artifact paths are proof/output surfaces, not canonical durable docs.",
    };
  }

  if (
    normalized &&
    (pathWithin(normalized, memoryOpsRoot) || normalized.includes("/.openclaw-memory-ops/"))
  ) {
    return {
      requested,
      canonicalOwner: "memory_ops",
      canonicalPath: normalized,
      writablePath: null,
      readOnlyMirrorPaths: [],
      classification: {
        repoVsWorkspace: "memory_ops",
        generated: true,
        humanOwned: false,
      },
      allowedEditSurface: "read_only",
      requiredEscalation: null,
      reason: "Memory Ops outputs are evidence/report artifacts; do not hand-edit them.",
    };
  }

  if (
    normalized === path.posix.join(workspaceRoot, "USER.md") ||
    normalized === path.posix.join(workspaceRoot, "MEMORY.md")
  ) {
    return {
      requested,
      canonicalOwner: "operator_workspace",
      canonicalPath: normalized,
      writablePath: normalized,
      readOnlyMirrorPaths: [],
      classification: {
        repoVsWorkspace: "workspace",
        generated: false,
        humanOwned: true,
      },
      allowedEditSurface: "direct",
      requiredEscalation: null,
      reason:
        "Root USER.md and MEMORY.md are human-owned compatibility files; never use projection write-back.",
    };
  }

  if (ownerHint === "operator_workspace") {
    const workspacePath = resolveWorkspacePathFromQuery(effectiveRequested, workspaceRoot);
    if (workspacePath) {
      return {
        requested,
        canonicalOwner: "operator_workspace",
        canonicalPath: workspacePath,
        writablePath: workspacePath,
        readOnlyMirrorPaths: [],
        classification: {
          repoVsWorkspace: "workspace",
          generated: false,
          humanOwned: true,
        },
        allowedEditSurface: "direct",
        requiredEscalation: null,
        reason: "Path is inside the canonical operator workspace.",
      };
    }
  }

  const productPath =
    ownerHint === "operator_workspace"
      ? null
      : resolveProductRepoPathFromQuery(effectiveRequested, liveRepoRoot);
  if (productPath) {
    const mirror = normalizePath(
      path.posix.join(productImportRoot, relativeTo(liveRepoRoot, productPath)),
    );
    const canWrite = actorProfile === "host-operator" || actorProfile === "repo-executor";
    return {
      requested,
      canonicalOwner: "product_repo",
      canonicalPath: productPath,
      writablePath: canWrite ? productPath : null,
      readOnlyMirrorPaths: [mirror],
      classification: {
        repoVsWorkspace: "repo",
        generated: false,
        humanOwned: false,
      },
      allowedEditSurface: canWrite ? "direct" : "host_operator_only",
      requiredEscalation: canWrite ? null : "needs repo executor / host write bridge",
      reason: "Canonical implementation/docs source lives in the live product repo.",
    };
  }

  if (normalized && pathWithin(normalized, workspaceRoot)) {
    return {
      requested,
      canonicalOwner: "operator_workspace",
      canonicalPath: normalized,
      writablePath: normalized,
      readOnlyMirrorPaths: [],
      classification: {
        repoVsWorkspace: "workspace",
        generated: false,
        humanOwned: true,
      },
      allowedEditSurface: "direct",
      requiredEscalation: null,
      reason: "Path is inside the canonical operator workspace.",
    };
  }

  return {
    requested,
    canonicalOwner: "unknown",
    canonicalPath: null,
    writablePath: null,
    readOnlyMirrorPaths: [],
    classification: {
      repoVsWorkspace: "unknown",
      generated: false,
      humanOwned: false,
    },
    allowedEditSurface: "none",
    requiredEscalation: "needs repo executor / host write bridge",
    reason: "Path is outside known OpenClaw topology. Resolve via index docs before editing.",
  };
}

export function buildSafeWorkspaceSearchCommand(pattern: string, workspaceRoot?: string) {
  const safePattern = pattern.replace(/'/g, "'\\''");
  const safeRoot = (workspaceRoot ?? resolveOpenClawPathRoots().workspaceRoot).replace(
    /'/g,
    "'\\''",
  );
  return [
    `rg --hidden --glob '!system/hostfs/proc/**'`,
    `--glob '!system/hostfs/sys/**'`,
    `--glob '!system/hostfs/dev/**'`,
    `--glob '!**/.git/**'`,
    `--glob '!**/node_modules/**'`,
    `--glob '!**/.openclaw-memory-ops/**'`,
    `--glob '!**/.artifacts/**'`,
    `'${safePattern}' '${safeRoot}'`,
  ].join(" ");
}
