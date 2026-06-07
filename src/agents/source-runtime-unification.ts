import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";
import {
  createRuntimeSourceRecord,
  detectRuntimeSourceDrift,
  validateRuntimeSourceRecord,
  type RuntimeSourceRecord,
} from "../config/runtime-source-record.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveBootstrapRepoPath } from "./bootstrap-repo-paths.js";

const execFileAsync = promisify(execFile);

export type SourceRuntimeMaterializationEntry = {
  id: string;
  kind: "agent" | "skill";
  sourcePath: string;
  runtimePath: string;
  runtimeAliasPath?: string;
  projectRoot: string;
};

export type SourceRuntimeUnificationManifest = {
  version: number;
  status: string;
  canonical: {
    projectRoot: string;
    executionPlatformDocsRoot?: string;
    runtimeHome: string;
    configPath?: string;
    sourceRuntimeRecordPath?: string;
    forkTransitionReadinessPath?: string;
    dirtyWorktreeReconciliationPath?: string;
  };
  githubTopology?: {
    current?: Record<string, unknown>;
    target?: Record<string, unknown>;
  };
  runtimeAliases: Array<{
    aliasPath: string;
    canonicalPath: string;
    label?: string;
    status?: string;
  }>;
  executionAgentMaterializations: SourceRuntimeMaterializationEntry[];
  executionSkillMaterializations: SourceRuntimeMaterializationEntry[];
};

type RawManifestEntry = Record<string, unknown>;

const MANIFEST_RELATIVE_PATH = "docs/system/registries/source-runtime-unification.yaml";
const RUNTIME_SOURCE_RECORDS_RELATIVE_PATH = "source-runtime/materialization-records.json";
const FORK_TRANSITION_READINESS_RELATIVE_PATH = "source-runtime/fork-transition-readiness.json";
const DIRTY_WORKTREE_RECONCILIATION_RELATIVE_PATH =
  "source-runtime/dirty-worktree-reconciliation.json";
const SOURCE_RUNTIME_MATERIALIZATION_RECORDS_SCHEMA_VERSION =
  "openclaw.source-runtime.materialization-records.v1";
const SOURCE_RUNTIME_FORK_TRANSITION_READINESS_SCHEMA_VERSION =
  "openclaw.source-runtime.fork-transition-readiness.v1";
const SOURCE_RUNTIME_DIRTY_WORKTREE_RECONCILIATION_SCHEMA_VERSION =
  "openclaw.source-runtime.dirty-worktree-reconciliation.v1";

export type SourceRuntimeMaterializationRecordsFile = {
  artifactKind: "openclaw.source_runtime.materialization_records";
  schemaVersion: typeof SOURCE_RUNTIME_MATERIALIZATION_RECORDS_SCHEMA_VERSION;
  generatedAt: string;
  manifestRef: string;
  sourceCommit: string | null;
  canonical: SourceRuntimeUnificationManifest["canonical"];
  runtimeAliases: SourceRuntimeUnificationManifest["runtimeAliases"];
  records: RuntimeSourceRecord[];
  validationIssues: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawTranscriptStored: false;
  hiddenReasoningStored: false;
};

export type SourceRuntimeGitRemote = {
  name: string;
  url: string;
  direction: "fetch" | "push";
};

export type SourceRuntimeForkTransitionReadinessStatus =
  | "migrated"
  | "migrated_with_preserved_dirty_worktree"
  | "migrated_with_dirty_worktree_requiring_reconciliation"
  | "ready_to_switch_origin"
  | "ready_to_switch_origin_with_preserved_dirty_worktree"
  | "pending_dirty_worktree_reconciliation"
  | "fork_remote_missing"
  | "upstream_remote_missing";

export type SourceRuntimeDirtyWorktreeCategory =
  | "source_runtime_unification"
  | "execution_platform_runtime"
  | "execution_platform_docs"
  | "execution_platform_scripts"
  | "openclaw_agent_runtime"
  | "model_memory_runtime"
  | "system_registry"
  | "agent_docs_registry"
  | "machine_agent_registry"
  | "root_agent_surface"
  | "repo_other";

export type SourceRuntimeDirtyWorktreeSample = {
  status: string;
  path: string;
  category: SourceRuntimeDirtyWorktreeCategory;
};

export type SourceRuntimeDirtyWorktreeMigrationAction =
  | "include_in_phase0_fork_transition"
  | "preserve_active_goal_work_before_switch"
  | "preserve_openclaw_runtime_work_before_switch"
  | "preserve_adjacent_runtime_work_before_switch"
  | "preserve_system_registry_before_switch"
  | "preserve_agent_surface_before_switch"
  | "classify_before_switch";

export type SourceRuntimeDirtyWorktreeReconciliationEntry = SourceRuntimeDirtyWorktreeSample & {
  migrationAction: SourceRuntimeDirtyWorktreeMigrationAction;
};

export type SourceRuntimeDirtyWorktreeSummary = {
  total: number;
  statusCounts: Record<string, number>;
  categoryCounts: Record<SourceRuntimeDirtyWorktreeCategory, number>;
  stagedEntryCount: number;
  unstagedEntryCount: number;
  deletedEntryCount: number;
  untrackedEntryCount: number;
  sampleLimit: number;
  sampleEntries: SourceRuntimeDirtyWorktreeSample[];
};

export type SourceRuntimeForkTransitionReadiness = {
  status: SourceRuntimeForkTransitionReadinessStatus;
  head: string | null;
  branch: string | null;
  dirtyEntryCount: number;
  dirtyWorktreeSummary: SourceRuntimeDirtyWorktreeSummary;
  unclassifiedDirtyEntryCount: number;
  originUrl: string | null;
  forkUrl: string | null;
  upstreamUrl: string | null;
  preservationArtifactPath: string | null;
  preservationArtifactPresent: boolean;
  preservationChecksumVerified: boolean;
  preservationChecksumEntryCount: number;
  runtimePreservationArtifactPath: string | null;
  runtimePreservationArtifactPresent: boolean;
  runtimePreservationChecksumVerified: boolean;
  runtimePreservationChecksumEntryCount: number;
  reasonCodes: string[];
};

export type SourceRuntimeForkTransitionReadinessFile = {
  artifactKind: "openclaw.source_runtime.fork_transition_readiness";
  schemaVersion: typeof SOURCE_RUNTIME_FORK_TRANSITION_READINESS_SCHEMA_VERSION;
  generatedAt: string;
  manifestRef: string;
  readiness: SourceRuntimeForkTransitionReadiness;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawTranscriptStored: false;
  hiddenReasoningStored: false;
};

export type SourceRuntimeDirtyWorktreeReconciliationFile = {
  artifactKind: "openclaw.source_runtime.dirty_worktree_reconciliation";
  schemaVersion: typeof SOURCE_RUNTIME_DIRTY_WORKTREE_RECONCILIATION_SCHEMA_VERSION;
  generatedAt: string;
  manifestRef: string;
  readinessRef: string;
  head: string | null;
  branch: string | null;
  summary: SourceRuntimeDirtyWorktreeSummary;
  entries: SourceRuntimeDirtyWorktreeReconciliationEntry[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawTranscriptStored: false;
  hiddenReasoningStored: false;
};

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`source/runtime manifest is missing ${label}`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function rawRecord(value: unknown): RawManifestEntry {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawManifestEntry)
    : {};
}

function rawList(value: unknown): RawManifestEntry[] {
  return Array.isArray(value) ? value.map(rawRecord) : [];
}

function normalizeRemoteUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "DISABLED") {
    return null;
  }
  return trimmed
    .replace(/^git@github\.com:/u, "https://github.com/")
    .replace(/\.git$/u, "")
    .replace(/\/+$/u, "");
}

const CANONICAL_OPENCLAW_FORK_REMOTE_URL = normalizeRemoteUrl(
  "git@github.com:ConorLynchOCGit/openclaw.git",
);

export function parseGitRemoteVerbose(output: string): SourceRuntimeGitRemote[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): SourceRuntimeGitRemote | null => {
      const match = line.match(/^(?<name>\S+)\s+(?<url>\S+)\s+\((?<direction>fetch|push)\)$/u);
      if (!match?.groups) {
        return null;
      }
      return {
        name: match.groups.name,
        url: match.groups.url,
        direction: match.groups.direction as "fetch" | "push",
      };
    })
    .filter((remote): remote is SourceRuntimeGitRemote => Boolean(remote));
}

function findRemoteUrl(
  remotes: SourceRuntimeGitRemote[],
  name: string,
  direction: "fetch" | "push",
) {
  return (
    remotes.find((remote) => remote.name === name && remote.direction === direction)?.url ?? null
  );
}

type PreservationArtifactVerification = {
  artifactPresent: boolean;
  checksumVerified: boolean;
  checksumEntryCount: number;
};

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

async function verifyPreservationArtifact(
  artifactPath: string | null,
): Promise<PreservationArtifactVerification> {
  if (!artifactPath) {
    return {
      artifactPresent: false,
      checksumVerified: false,
      checksumEntryCount: 0,
    };
  }
  const artifactPresent = await fs
    .stat(artifactPath)
    .then((stat) => stat.isDirectory())
    .catch(() => false);
  if (!artifactPresent) {
    return {
      artifactPresent: false,
      checksumVerified: false,
      checksumEntryCount: 0,
    };
  }
  const checksumsPath = path.join(artifactPath, "SHA256SUMS");
  const checksumLines = await fs
    .readFile(checksumsPath, "utf8")
    .then((raw) => raw.split(/\r?\n/u).filter(Boolean))
    .catch(() => []);
  if (checksumLines.length === 0) {
    return {
      artifactPresent: true,
      checksumVerified: false,
      checksumEntryCount: 0,
    };
  }
  for (const line of checksumLines) {
    const match = line.match(/^(?<hash>[a-f0-9]{64})\s+\*?(?<file>.+)$/u);
    if (!match?.groups) {
      return {
        artifactPresent: true,
        checksumVerified: false,
        checksumEntryCount: checksumLines.length,
      };
    }
    const relativeFile = match.groups.file.replace(/^\.\//u, "");
    const filePath = path.join(artifactPath, relativeFile);
    const actualHash = await sha256File(filePath).catch(() => null);
    if (actualHash !== match.groups.hash) {
      return {
        artifactPresent: true,
        checksumVerified: false,
        checksumEntryCount: checksumLines.length,
      };
    }
  }
  return {
    artifactPresent: true,
    checksumVerified: true,
    checksumEntryCount: checksumLines.length,
  };
}

function emptyDirtyWorktreeSummary(total = 0): SourceRuntimeDirtyWorktreeSummary {
  return {
    total,
    statusCounts: total > 0 ? { unknown: total } : {},
    categoryCounts: {
      source_runtime_unification: 0,
      execution_platform_runtime: 0,
      execution_platform_docs: 0,
      execution_platform_scripts: 0,
      openclaw_agent_runtime: 0,
      model_memory_runtime: 0,
      system_registry: 0,
      agent_docs_registry: 0,
      machine_agent_registry: 0,
      root_agent_surface: 0,
      repo_other: total,
    },
    stagedEntryCount: 0,
    unstagedEntryCount: 0,
    deletedEntryCount: 0,
    untrackedEntryCount: 0,
    sampleLimit: 0,
    sampleEntries: [],
  };
}

function incrementCount<K extends string>(counts: Record<K, number>, key: K) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function categorizeDirtyWorktreePath(filePath: string): SourceRuntimeDirtyWorktreeCategory {
  if (
    filePath.startsWith("src/agents/source-runtime-unification") ||
    filePath.startsWith("src/config/runtime-source-record") ||
    filePath.startsWith("docs/system/registries/source-runtime-unification") ||
    filePath.startsWith(
      "docs/projects/execution-platform/specs/openclaw-fork-source-runtime-unification",
    ) ||
    filePath.startsWith("docs/agents/execution-") ||
    filePath.startsWith("skills/execution-")
  ) {
    return "source_runtime_unification";
  }
  if (
    filePath.startsWith("extensions/execution-platform/") ||
    filePath.startsWith("src/gateway/execution-platform")
  ) {
    return "execution_platform_runtime";
  }
  if (filePath.startsWith("docs/projects/execution-platform/")) {
    return "execution_platform_docs";
  }
  if (filePath.startsWith("scripts/execution-platform-")) {
    return "execution_platform_scripts";
  }
  if (
    filePath.startsWith("src/agents/") ||
    filePath.startsWith("src/config/sessions") ||
    filePath.startsWith("src/config/types.agent") ||
    filePath.startsWith("src/config/types.agents") ||
    filePath.startsWith("src/config/zod-schema.agent") ||
    filePath.startsWith("src/gateway/session-utils") ||
    filePath.startsWith("src/gateway/server-methods/agent") ||
    filePath.startsWith("src/infra/agent-events")
  ) {
    return "openclaw_agent_runtime";
  }
  if (filePath.startsWith("extensions/model-memory/")) {
    return "model_memory_runtime";
  }
  if (filePath.startsWith("docs/system/")) {
    return "system_registry";
  }
  if (filePath.startsWith("docs/agents/")) {
    return "agent_docs_registry";
  }
  if (filePath.startsWith(".agents/")) {
    return "machine_agent_registry";
  }
  if (["AGENTS.md", "BOOTSTRAP.md", "SOUL.md", "TOOLS.md"].includes(filePath)) {
    return "root_agent_surface";
  }
  return "repo_other";
}

function parseDirtyWorktreeLine(line: string): SourceRuntimeDirtyWorktreeSample | null {
  if (line.length < 4) {
    return null;
  }
  const status = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  const filePath = rawPath.includes(" -> ")
    ? (rawPath.split(" -> ").at(-1)?.trim() ?? rawPath)
    : rawPath;
  if (!filePath) {
    return null;
  }
  return {
    status,
    path: filePath,
    category: categorizeDirtyWorktreePath(filePath),
  };
}

function migrationActionForDirtyWorktreeCategory(
  category: SourceRuntimeDirtyWorktreeCategory,
): SourceRuntimeDirtyWorktreeMigrationAction {
  switch (category) {
    case "source_runtime_unification":
      return "include_in_phase0_fork_transition";
    case "execution_platform_runtime":
    case "execution_platform_docs":
    case "execution_platform_scripts":
      return "preserve_active_goal_work_before_switch";
    case "openclaw_agent_runtime":
      return "preserve_openclaw_runtime_work_before_switch";
    case "model_memory_runtime":
      return "preserve_adjacent_runtime_work_before_switch";
    case "system_registry":
      return "preserve_system_registry_before_switch";
    case "agent_docs_registry":
    case "machine_agent_registry":
    case "root_agent_surface":
      return "preserve_agent_surface_before_switch";
    case "repo_other":
      return "classify_before_switch";
  }
  return "classify_before_switch";
}

export function buildSourceRuntimeDirtyWorktreeReconciliation(input: {
  statusOutput: string;
  head?: string | null;
  branch?: string | null;
  generatedAt?: string;
  readinessRef?: string;
}): SourceRuntimeDirtyWorktreeReconciliationFile {
  const sampleEntries = input.statusOutput
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(parseDirtyWorktreeLine)
    .filter((entry): entry is SourceRuntimeDirtyWorktreeSample => Boolean(entry));
  const entries = sampleEntries.map(
    (entry): SourceRuntimeDirtyWorktreeReconciliationEntry => ({
      ...entry,
      migrationAction: migrationActionForDirtyWorktreeCategory(entry.category),
    }),
  );
  return {
    artifactKind: "openclaw.source_runtime.dirty_worktree_reconciliation",
    schemaVersion: SOURCE_RUNTIME_DIRTY_WORKTREE_RECONCILIATION_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    manifestRef: MANIFEST_RELATIVE_PATH,
    readinessRef: input.readinessRef ?? FORK_TRANSITION_READINESS_RELATIVE_PATH,
    head: input.head ?? null,
    branch: input.branch ?? null,
    summary: summarizeSourceRuntimeDirtyWorktree(input.statusOutput),
    entries,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawTranscriptStored: false,
    hiddenReasoningStored: false,
  };
}

export function summarizeSourceRuntimeDirtyWorktree(
  statusOutput: string,
  sampleLimit = 40,
): SourceRuntimeDirtyWorktreeSummary {
  const entries = statusOutput
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(parseDirtyWorktreeLine)
    .filter((entry): entry is SourceRuntimeDirtyWorktreeSample => Boolean(entry));
  const categoryCounts: SourceRuntimeDirtyWorktreeSummary["categoryCounts"] = {
    source_runtime_unification: 0,
    execution_platform_runtime: 0,
    execution_platform_docs: 0,
    execution_platform_scripts: 0,
    openclaw_agent_runtime: 0,
    model_memory_runtime: 0,
    system_registry: 0,
    agent_docs_registry: 0,
    machine_agent_registry: 0,
    root_agent_surface: 0,
    repo_other: 0,
  };
  const statusCounts: Record<string, number> = {};
  let stagedEntryCount = 0;
  let unstagedEntryCount = 0;
  let deletedEntryCount = 0;
  let untrackedEntryCount = 0;
  for (const entry of entries) {
    const normalizedStatus = entry.status.trim() || entry.status;
    incrementCount(categoryCounts, entry.category);
    incrementCount(statusCounts, normalizedStatus);
    if (entry.status !== "??" && entry.status[0] !== " ") {
      stagedEntryCount += 1;
    }
    if (entry.status === "??" || entry.status[1] !== " ") {
      unstagedEntryCount += 1;
    }
    if (entry.status.includes("D")) {
      deletedEntryCount += 1;
    }
    if (entry.status === "??") {
      untrackedEntryCount += 1;
    }
  }
  return {
    total: entries.length,
    statusCounts,
    categoryCounts,
    stagedEntryCount,
    unstagedEntryCount,
    deletedEntryCount,
    untrackedEntryCount,
    sampleLimit,
    sampleEntries: entries.slice(0, sampleLimit),
  };
}

export function evaluateSourceRuntimeForkTransitionReadiness(input: {
  remotes: SourceRuntimeGitRemote[];
  dirtyEntryCount: number;
  dirtyWorktreeSummary?: SourceRuntimeDirtyWorktreeSummary;
  head?: string | null;
  branch?: string | null;
  preservationArtifactPath?: string | null;
  preservationArtifactPresent?: boolean;
  preservationChecksumVerified?: boolean;
  preservationChecksumEntryCount?: number;
  runtimePreservationArtifactPath?: string | null;
  runtimePreservationArtifactPresent?: boolean;
  runtimePreservationChecksumVerified?: boolean;
  runtimePreservationChecksumEntryCount?: number;
}): SourceRuntimeForkTransitionReadiness {
  const originUrl = findRemoteUrl(input.remotes, "origin", "fetch");
  const forkUrl = findRemoteUrl(input.remotes, "openclaw-fork", "fetch");
  const upstreamUrl = findRemoteUrl(input.remotes, "upstream", "fetch");
  const normalizedOrigin = normalizeRemoteUrl(originUrl);
  const normalizedFork = normalizeRemoteUrl(forkUrl);
  const originIsCanonicalFork =
    Boolean(normalizedOrigin) && normalizedOrigin === CANONICAL_OPENCLAW_FORK_REMOTE_URL;
  const originMatchesTransitionFork =
    Boolean(normalizedOrigin && normalizedFork) && normalizedOrigin === normalizedFork;
  const originIsFork = originIsCanonicalFork || originMatchesTransitionFork;
  const dirtyWorktreeSummary =
    input.dirtyWorktreeSummary ?? emptyDirtyWorktreeSummary(input.dirtyEntryCount);
  const unclassifiedDirtyEntryCount =
    dirtyWorktreeSummary.categoryCounts.repo_other ?? input.dirtyEntryCount;
  const classifiedDirtyWorktree = input.dirtyEntryCount === 0 || unclassifiedDirtyEntryCount === 0;
  const verifiedPreservation =
    input.preservationArtifactPresent === true &&
    input.preservationChecksumVerified === true &&
    input.runtimePreservationArtifactPresent === true &&
    input.runtimePreservationChecksumVerified === true;
  const reasonCodes = [
    `source_runtime_dirty_entry_count:${input.dirtyEntryCount}`,
    `source_runtime_unclassified_dirty_entry_count:${unclassifiedDirtyEntryCount}`,
    originIsFork
      ? "source_runtime_origin_already_points_at_fork"
      : "source_runtime_origin_not_fork",
    forkUrl
      ? "source_runtime_fork_remote_present"
      : originIsFork
        ? "source_runtime_fork_remote_not_required_origin_canonical"
        : "source_runtime_fork_remote_missing",
    upstreamUrl
      ? "source_runtime_upstream_remote_present"
      : "source_runtime_upstream_remote_missing",
    input.preservationArtifactPresent
      ? "source_runtime_preservation_artifact_present"
      : "source_runtime_preservation_artifact_missing",
    input.preservationChecksumVerified
      ? "source_runtime_preservation_checksum_verified"
      : "source_runtime_preservation_checksum_unverified",
    input.runtimePreservationArtifactPresent
      ? "source_runtime_runtime_preservation_artifact_present"
      : "source_runtime_runtime_preservation_artifact_missing",
    input.runtimePreservationChecksumVerified
      ? "source_runtime_runtime_preservation_checksum_verified"
      : "source_runtime_runtime_preservation_checksum_unverified",
    classifiedDirtyWorktree
      ? "source_runtime_dirty_worktree_fully_classified"
      : "source_runtime_dirty_worktree_has_unclassified_entries",
  ];
  const status: SourceRuntimeForkTransitionReadinessStatus =
    !originIsFork && !forkUrl
      ? "fork_remote_missing"
      : !upstreamUrl
        ? "upstream_remote_missing"
        : originIsFork
          ? input.dirtyEntryCount > 0
            ? verifiedPreservation && classifiedDirtyWorktree
              ? "migrated_with_preserved_dirty_worktree"
              : "migrated_with_dirty_worktree_requiring_reconciliation"
            : "migrated"
          : input.dirtyEntryCount > 0
            ? verifiedPreservation && classifiedDirtyWorktree
              ? "ready_to_switch_origin_with_preserved_dirty_worktree"
              : "pending_dirty_worktree_reconciliation"
            : "ready_to_switch_origin";
  return {
    status,
    head: input.head ?? null,
    branch: input.branch ?? null,
    dirtyEntryCount: input.dirtyEntryCount,
    dirtyWorktreeSummary,
    unclassifiedDirtyEntryCount,
    originUrl,
    forkUrl,
    upstreamUrl,
    preservationArtifactPath: input.preservationArtifactPath ?? null,
    preservationArtifactPresent: input.preservationArtifactPresent ?? false,
    preservationChecksumVerified: input.preservationChecksumVerified ?? false,
    preservationChecksumEntryCount: input.preservationChecksumEntryCount ?? 0,
    runtimePreservationArtifactPath: input.runtimePreservationArtifactPath ?? null,
    runtimePreservationArtifactPresent: input.runtimePreservationArtifactPresent ?? false,
    runtimePreservationChecksumVerified: input.runtimePreservationChecksumVerified ?? false,
    runtimePreservationChecksumEntryCount: input.runtimePreservationChecksumEntryCount ?? 0,
    reasonCodes,
  };
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

export async function readSourceRuntimeForkTransitionReadiness(input?: {
  cwd?: string;
  preservationArtifactPath?: string | null;
  runtimePreservationArtifactPath?: string | null;
}): Promise<SourceRuntimeForkTransitionReadiness> {
  const cwd = input?.cwd ?? process.cwd();
  const [remoteOutput, statusOutput, headOutput, branchOutput] = await Promise.all([
    gitOutput(cwd, ["remote", "-v"]),
    gitOutput(cwd, ["status", "--porcelain=v1"]),
    gitOutput(cwd, ["rev-parse", "HEAD"]),
    gitOutput(cwd, ["branch", "--show-current"]),
  ]);
  const preservationArtifactPath = input?.preservationArtifactPath ?? null;
  const runtimePreservationArtifactPath = input?.runtimePreservationArtifactPath ?? null;
  const [preservationVerification, runtimePreservationVerification] = await Promise.all([
    verifyPreservationArtifact(preservationArtifactPath),
    verifyPreservationArtifact(runtimePreservationArtifactPath),
  ]);
  return evaluateSourceRuntimeForkTransitionReadiness({
    remotes: parseGitRemoteVerbose(remoteOutput),
    dirtyEntryCount: statusOutput.split(/\r?\n/u).filter(Boolean).length,
    dirtyWorktreeSummary: summarizeSourceRuntimeDirtyWorktree(statusOutput),
    head: headOutput.trim() || null,
    branch: branchOutput.trim() || null,
    preservationArtifactPath,
    preservationArtifactPresent: preservationVerification.artifactPresent,
    preservationChecksumVerified: preservationVerification.checksumVerified,
    preservationChecksumEntryCount: preservationVerification.checksumEntryCount,
    runtimePreservationArtifactPath,
    runtimePreservationArtifactPresent: runtimePreservationVerification.artifactPresent,
    runtimePreservationChecksumVerified: runtimePreservationVerification.checksumVerified,
    runtimePreservationChecksumEntryCount: runtimePreservationVerification.checksumEntryCount,
  });
}

export async function readSourceRuntimeDirtyWorktreeReconciliation(input?: {
  cwd?: string;
  readinessRef?: string;
}): Promise<SourceRuntimeDirtyWorktreeReconciliationFile> {
  const cwd = input?.cwd ?? process.cwd();
  const [statusOutput, headOutput, branchOutput] = await Promise.all([
    gitOutput(cwd, ["status", "--porcelain=v1"]),
    gitOutput(cwd, ["rev-parse", "HEAD"]),
    gitOutput(cwd, ["branch", "--show-current"]),
  ]);
  return buildSourceRuntimeDirtyWorktreeReconciliation({
    statusOutput,
    head: headOutput.trim() || null,
    branch: branchOutput.trim() || null,
    readinessRef: input?.readinessRef,
  });
}

function parseMaterializationEntry(kind: "agent" | "skill", value: RawManifestEntry) {
  const id =
    kind === "agent"
      ? requiredString(value.agentId, "executionAgentMaterializations[].agentId")
      : requiredString(value.skillName, "executionSkillMaterializations[].skillName");
  return {
    id,
    kind,
    sourcePath: requiredString(value.sourcePath, `${id}.sourcePath`),
    runtimePath: requiredString(value.runtimePath, `${id}.runtimePath`),
    runtimeAliasPath: optionalString(value.runtimeAliasPath),
    projectRoot: requiredString(value.projectRoot, `${id}.projectRoot`),
  } satisfies SourceRuntimeMaterializationEntry;
}

function resolveManifestPath() {
  return resolveBootstrapRepoPath({
    relativePath: MANIFEST_RELATIVE_PATH,
    importMetaUrl: import.meta.url,
    cwd: process.cwd(),
  });
}

export function resolveSourceRuntimeMaterializationRecordPath(
  manifest: SourceRuntimeUnificationManifest,
): string {
  if (manifest.canonical.sourceRuntimeRecordPath) {
    return manifest.canonical.sourceRuntimeRecordPath;
  }
  return path.join(manifest.canonical.runtimeHome, RUNTIME_SOURCE_RECORDS_RELATIVE_PATH);
}

export function resolveSourceRuntimeForkTransitionReadinessPath(
  manifest: SourceRuntimeUnificationManifest,
): string {
  if (manifest.canonical.forkTransitionReadinessPath) {
    return manifest.canonical.forkTransitionReadinessPath;
  }
  return path.join(manifest.canonical.runtimeHome, FORK_TRANSITION_READINESS_RELATIVE_PATH);
}

export function resolveSourceRuntimeDirtyWorktreeReconciliationPath(
  manifest: SourceRuntimeUnificationManifest,
): string {
  if (manifest.canonical.dirtyWorktreeReconciliationPath) {
    return manifest.canonical.dirtyWorktreeReconciliationPath;
  }
  return path.join(manifest.canonical.runtimeHome, DIRTY_WORKTREE_RECONCILIATION_RELATIVE_PATH);
}

function resolveRepoPath(relativeOrAbsolutePath: string): string {
  if (path.isAbsolute(relativeOrAbsolutePath)) {
    return relativeOrAbsolutePath;
  }
  return resolveBootstrapRepoPath({
    relativePath: relativeOrAbsolutePath,
    importMetaUrl: import.meta.url,
    cwd: process.cwd(),
  });
}

async function listSourceFiles(sourcePath: string): Promise<string[]> {
  const stat = await fs.stat(sourcePath);
  if (stat.isFile()) {
    return [sourcePath];
  }
  if (!stat.isDirectory()) {
    return [];
  }
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(sourcePath, entry.name);
      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }
      if (entry.isFile()) {
        return [entryPath];
      }
      return [];
    }),
  );
  return nested.flat().toSorted();
}

export async function loadSourceRuntimeUnificationManifest(): Promise<SourceRuntimeUnificationManifest> {
  const raw = await fs.readFile(resolveManifestPath(), "utf8");
  const parsed = rawRecord(YAML.parse(raw));
  const canonical = rawRecord(parsed.canonical);
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    status: requiredString(parsed.status, "status"),
    canonical: {
      projectRoot: requiredString(canonical.projectRoot, "canonical.projectRoot"),
      executionPlatformDocsRoot: optionalString(canonical.executionPlatformDocsRoot),
      runtimeHome: requiredString(canonical.runtimeHome, "canonical.runtimeHome"),
      configPath: optionalString(canonical.configPath),
      sourceRuntimeRecordPath: optionalString(canonical.sourceRuntimeRecordPath),
      forkTransitionReadinessPath: optionalString(canonical.forkTransitionReadinessPath),
      dirtyWorktreeReconciliationPath: optionalString(canonical.dirtyWorktreeReconciliationPath),
    },
    githubTopology: rawRecord(parsed.githubTopology),
    runtimeAliases: rawList(parsed.runtimeAliases).map((alias) => ({
      aliasPath: requiredString(alias.aliasPath, "runtimeAliases[].aliasPath"),
      canonicalPath: requiredString(alias.canonicalPath, "runtimeAliases[].canonicalPath"),
      label: optionalString(alias.label),
      status: optionalString(alias.status),
    })),
    executionAgentMaterializations: rawList(parsed.executionAgentMaterializations).map((entry) =>
      parseMaterializationEntry("agent", entry),
    ),
    executionSkillMaterializations: rawList(parsed.executionSkillMaterializations).map((entry) =>
      parseMaterializationEntry("skill", entry),
    ),
  };
}

export async function buildSourceRuntimeMaterializationRecords(input?: {
  sourceCommit?: string;
  manifest?: SourceRuntimeUnificationManifest;
}): Promise<RuntimeSourceRecord[]> {
  const manifest = input?.manifest ?? (await loadSourceRuntimeUnificationManifest());
  const materializations = [
    ...manifest.executionAgentMaterializations,
    ...manifest.executionSkillMaterializations,
  ];
  const records: RuntimeSourceRecord[] = [];
  for (const materialization of materializations) {
    const sourcePath = resolveRepoPath(materialization.sourcePath);
    const sourceFiles = await listSourceFiles(sourcePath);
    for (const sourceFile of sourceFiles) {
      const relative = path.relative(sourcePath, sourceFile);
      const runtimePath =
        relative && relative !== ""
          ? path.join(materialization.runtimePath, relative)
          : materialization.runtimePath;
      records.push(
        createRuntimeSourceRecord({
          runtimePath,
          sourcePath: sourceFile,
          sourceCommit: input?.sourceCommit,
          afterContent: await fs.readFile(sourceFile),
          mode: "materialized",
          reconciled: true,
        }),
      );
    }
  }
  return records;
}

export async function validateSourceRuntimeMaterializationRecords(input?: {
  sourceCommit?: string;
  manifest?: SourceRuntimeUnificationManifest;
}): Promise<string[]> {
  const records = await buildSourceRuntimeMaterializationRecords(input);
  return records.flatMap((record) =>
    validateRuntimeSourceRecord(record).map((issue) => `${record.runtimePath}: ${issue}`),
  );
}

export async function auditSourceRuntimeMaterializationDrift(input?: {
  sourceCommit?: string;
  manifest?: SourceRuntimeUnificationManifest;
}): Promise<string[]> {
  const records = await buildSourceRuntimeMaterializationRecords(input);
  const issues: string[] = [];
  for (const record of records) {
    const validationIssues = validateRuntimeSourceRecord(record);
    for (const issue of validationIssues) {
      issues.push(`${record.runtimePath}: ${issue}`);
    }
    try {
      const currentBytes = await fs.readFile(record.runtimePath);
      const drift = detectRuntimeSourceDrift(record, currentBytes);
      if (drift.status === "drifted") {
        issues.push(`runtime_source_materialization_drifted:${record.runtimePath}`);
      }
    } catch {
      issues.push(`runtime_source_materialization_missing:${record.runtimePath}`);
    }
  }
  return issues;
}

export async function writeSourceRuntimeMaterializationRecords(input?: {
  sourceCommit?: string;
  manifest?: SourceRuntimeUnificationManifest;
  generatedAt?: string;
}): Promise<{
  recordPath: string;
  recordFile: SourceRuntimeMaterializationRecordsFile;
}> {
  const manifest = input?.manifest ?? (await loadSourceRuntimeUnificationManifest());
  const records = await buildSourceRuntimeMaterializationRecords({
    manifest,
    sourceCommit: input?.sourceCommit,
  });
  const validationIssues = await auditSourceRuntimeMaterializationDrift({
    manifest,
    sourceCommit: input?.sourceCommit,
  });
  const recordFile: SourceRuntimeMaterializationRecordsFile = {
    artifactKind: "openclaw.source_runtime.materialization_records",
    schemaVersion: SOURCE_RUNTIME_MATERIALIZATION_RECORDS_SCHEMA_VERSION,
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
    manifestRef: MANIFEST_RELATIVE_PATH,
    sourceCommit: input?.sourceCommit ?? null,
    canonical: manifest.canonical,
    runtimeAliases: manifest.runtimeAliases,
    records,
    validationIssues,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawTranscriptStored: false,
    hiddenReasoningStored: false,
  };
  const recordPath = resolveSourceRuntimeMaterializationRecordPath(manifest);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(`${recordPath}.tmp`, `${JSON.stringify(recordFile, null, 2)}\n`, "utf8");
  await fs.rename(`${recordPath}.tmp`, recordPath);
  return { recordPath, recordFile };
}

export async function writeSourceRuntimeForkTransitionReadiness(input: {
  manifest?: SourceRuntimeUnificationManifest;
  readiness: SourceRuntimeForkTransitionReadiness;
  generatedAt?: string;
}): Promise<{
  recordPath: string;
  recordFile: SourceRuntimeForkTransitionReadinessFile;
}> {
  const manifest = input.manifest ?? (await loadSourceRuntimeUnificationManifest());
  const recordFile: SourceRuntimeForkTransitionReadinessFile = {
    artifactKind: "openclaw.source_runtime.fork_transition_readiness",
    schemaVersion: SOURCE_RUNTIME_FORK_TRANSITION_READINESS_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    manifestRef: MANIFEST_RELATIVE_PATH,
    readiness: input.readiness,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawTranscriptStored: false,
    hiddenReasoningStored: false,
  };
  const recordPath = resolveSourceRuntimeForkTransitionReadinessPath(manifest);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(`${recordPath}.tmp`, `${JSON.stringify(recordFile, null, 2)}\n`, "utf8");
  await fs.rename(`${recordPath}.tmp`, recordPath);
  return { recordPath, recordFile };
}

export async function writeSourceRuntimeDirtyWorktreeReconciliation(input?: {
  manifest?: SourceRuntimeUnificationManifest;
  reconciliation?: SourceRuntimeDirtyWorktreeReconciliationFile;
  cwd?: string;
  generatedAt?: string;
}): Promise<{
  recordPath: string;
  recordFile: SourceRuntimeDirtyWorktreeReconciliationFile;
}> {
  const manifest = input?.manifest ?? (await loadSourceRuntimeUnificationManifest());
  const recordFile =
    input?.reconciliation ??
    (await readSourceRuntimeDirtyWorktreeReconciliation({
      cwd: input?.cwd,
      readinessRef: resolveSourceRuntimeForkTransitionReadinessPath(manifest),
    }));
  const generatedRecordFile = input?.generatedAt
    ? {
        ...recordFile,
        generatedAt: input.generatedAt,
      }
    : recordFile;
  const recordPath = resolveSourceRuntimeDirtyWorktreeReconciliationPath(manifest);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(
    `${recordPath}.tmp`,
    `${JSON.stringify(generatedRecordFile, null, 2)}\n`,
    "utf8",
  );
  await fs.rename(`${recordPath}.tmp`, recordPath);
  return { recordPath, recordFile: generatedRecordFile };
}

export function validateExecutionAgentSourceRuntimeConfig(input: {
  config: OpenClawConfig;
  manifest: SourceRuntimeUnificationManifest;
}): string[] {
  const issues: string[] = [];
  const agents = Array.isArray(input.config.agents?.list) ? input.config.agents.list : [];
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const runtimeRoots = [
    input.manifest.canonical.runtimeHome,
    ...input.manifest.runtimeAliases.map((alias) => alias.aliasPath),
  ].map((root) => path.resolve(root));
  const canonicalRuntimeHome = path.resolve(input.manifest.canonical.runtimeHome);
  const runtimeAliasRoots = input.manifest.runtimeAliases.map((alias) =>
    path.resolve(alias.aliasPath),
  );

  const isSameOrWithin = (candidate: string, root: string): boolean => {
    const resolvedCandidate = path.resolve(candidate);
    const resolvedRoot = path.resolve(root);
    return (
      resolvedCandidate === resolvedRoot ||
      resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
    );
  };

  for (const materialization of input.manifest.executionAgentMaterializations) {
    const agent = agentsById.get(materialization.id);
    if (!agent) {
      issues.push(`execution_agent_missing:${materialization.id}`);
      continue;
    }
    const projectRoot = typeof agent.projectRoot === "string" ? agent.projectRoot.trim() : "";
    if (!projectRoot) {
      issues.push(`execution_agent_project_root_missing:${materialization.id}`);
      continue;
    }
    if (path.resolve(projectRoot) !== path.resolve(materialization.projectRoot)) {
      issues.push(`execution_agent_project_root_mismatch:${materialization.id}`);
    }
    const resolvedProjectRoot = path.resolve(projectRoot);
    if (
      runtimeRoots.some(
        (root) =>
          resolvedProjectRoot === root || resolvedProjectRoot.startsWith(`${root}${path.sep}`),
      )
    ) {
      issues.push(`execution_agent_project_root_points_at_runtime_home:${materialization.id}`);
    }
    const workspace = typeof agent.workspace === "string" ? agent.workspace.trim() : "";
    if (!workspace) {
      issues.push(`execution_agent_workspace_missing:${materialization.id}`);
    } else {
      const workspaceUsesRuntimeAlias = runtimeAliasRoots.some((aliasRoot) =>
        isSameOrWithin(workspace, aliasRoot),
      );
      if (workspaceUsesRuntimeAlias) {
        issues.push(`execution_agent_workspace_uses_runtime_alias:${materialization.id}`);
      } else if (!isSameOrWithin(workspace, canonicalRuntimeHome)) {
        issues.push(`execution_agent_workspace_outside_runtime_home:${materialization.id}`);
      }
    }
    const agentDir = typeof agent.agentDir === "string" ? agent.agentDir.trim() : "";
    if (agentDir) {
      if (path.resolve(agentDir) !== path.resolve(materialization.runtimePath)) {
        issues.push(`execution_agent_agent_dir_mismatch:${materialization.id}`);
      }
      if (runtimeAliasRoots.some((aliasRoot) => isSameOrWithin(agentDir, aliasRoot))) {
        issues.push(`execution_agent_agent_dir_uses_runtime_alias:${materialization.id}`);
      }
    }
  }
  return issues;
}
