import fs from "node:fs/promises";
import path from "node:path";
import type { AgentContextInjection } from "../config/types.agent-defaults.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import {
  findAgentPackRegistryEntry,
  loadAgentPackRegistryEntries,
  resolveAgentPackRuntimeSourceRoot,
  type AgentPackRegistryEntry,
} from "./agent-pack-registry.js";
import {
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentProjectRootDir,
  resolveSessionAgentIds,
} from "./agent-scope.js";
import { getOrLoadBootstrapFiles } from "./bootstrap-cache.js";
import { materializeCanonicalBootstrapCompatibilityFiles } from "./bootstrap-canonicalization.js";
import { applyBootstrapHookOverrides } from "./bootstrap-hooks.js";
import { resolveBootstrapRepoRoot } from "./bootstrap-repo-paths.js";
import { shouldIncludeHeartbeatGuidanceForSystemPrompt } from "./heartbeat-system-prompt.js";
import type { ModelMemoryBootstrapOverlay } from "./model-memory.live-runtime.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import {
  buildBootstrapContextFiles,
  resolveBootstrapMaxChars,
  resolveBootstrapTotalMaxChars,
} from "./pi-embedded-helpers.js";
import {
  isSourceRuntimeMaterializedAgentStart,
  loadSourceRuntimeUnificationManifest,
  materializeSourceRuntimeFiles,
  type SourceRuntimeMaterializationResult,
  type SourceRuntimeUnificationManifest,
} from "./source-runtime-unification.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
  type WorkspaceBootstrapFile,
  type WorkspaceBootstrapFileName,
} from "./workspace.js";

export type BootstrapContextMode = "full" | "lightweight";
export type BootstrapContextRunKind = "default" | "heartbeat" | "cron";

const CONTINUATION_SCAN_MAX_TAIL_BYTES = 256 * 1024;
const CONTINUATION_SCAN_MAX_RECORDS = 500;
export const FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE = "openclaw:bootstrap-context:full";
export const SOURCE_BACKED_AGENT_REQUIRED_BOOTSTRAP_DOCS = [
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_TOOLS_FILENAME,
] as const;
const SOURCE_BACKED_AGENT_BOOTSTRAP_FILE_NAMES: ReadonlySet<WorkspaceBootstrapFileName> = new Set([
  ...SOURCE_BACKED_AGENT_REQUIRED_BOOTSTRAP_DOCS,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
]);

export type SourceRuntimeBootstrapMaterializationDeps = {
  loadManifest?: () => Promise<SourceRuntimeUnificationManifest>;
  materializeFiles?: (input: {
    manifest: SourceRuntimeUnificationManifest;
  }) => Promise<SourceRuntimeMaterializationResult>;
};

export type SourceBackedAgentBootstrapSource = {
  agentId: string;
  sourceRoot: string;
};

type SourceBackedAgentBootstrapDeps = {
  loadAgentRegistryEntries?: () => Promise<AgentPackRegistryEntry[]>;
};

export type SourceRuntimeBootstrapMaterializationPreflight =
  | {
      status: "skipped";
      reasonCode:
        | "source_runtime_bootstrap_config_missing"
        | "source_runtime_bootstrap_agent_dir_missing"
        | "source_runtime_bootstrap_agent_not_materialized";
      agentId?: string;
      agentDir?: string;
    }
  | {
      status: "aligned";
      agentId: string;
      agentDir: string;
      recordPath: string;
      materializedFileCount: number;
      reasonCodes: string[];
    };

export function resolveContextInjectionMode(config?: OpenClawConfig): AgentContextInjection {
  return config?.agents?.defaults?.contextInjection ?? "always";
}

export async function hasCompletedBootstrapTurn(sessionFile: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(sessionFile);
    if (stat.isSymbolicLink()) {
      return false;
    }

    const fh = await fs.open(sessionFile, "r");
    try {
      const bytesToRead = Math.min(stat.size, CONTINUATION_SCAN_MAX_TAIL_BYTES);
      if (bytesToRead <= 0) {
        return false;
      }
      const start = stat.size - bytesToRead;
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await fh.read(buffer, 0, bytesToRead, start);
      let text = buffer.toString("utf-8", 0, bytesRead);
      if (start > 0) {
        const firstNewline = text.indexOf("\n");
        if (firstNewline === -1) {
          return false;
        }
        text = text.slice(firstNewline + 1);
      }

      const records = text
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .slice(-CONTINUATION_SCAN_MAX_RECORDS);
      let compactedAfterLatestAssistant = false;

      for (let i = records.length - 1; i >= 0; i--) {
        const line = records[i];
        if (!line) {
          continue;
        }
        let entry: unknown;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        const record = entry as
          | {
              type?: string;
              customType?: string;
              message?: { role?: string };
            }
          | null
          | undefined;
        if (record?.type === "compaction") {
          compactedAfterLatestAssistant = true;
          continue;
        }
        if (
          record?.type === "custom" &&
          record.customType === FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE
        ) {
          return !compactedAfterLatestAssistant;
        }
      }

      return false;
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

export function makeBootstrapWarn(params: {
  sessionLabel: string;
  warn?: (message: string) => void;
}): ((message: string) => void) | undefined {
  if (!params.warn) {
    return undefined;
  }
  return (message: string) => params.warn?.(`${message} (sessionKey=${params.sessionLabel})`);
}

function sanitizeBootstrapFiles(
  files: WorkspaceBootstrapFile[],
  warn?: (message: string) => void,
): WorkspaceBootstrapFile[] {
  const sanitized: WorkspaceBootstrapFile[] = [];
  for (const file of files) {
    const pathValue = normalizeOptionalString(file.path) ?? "";
    if (!pathValue) {
      warn?.(
        `skipping bootstrap file "${file.name}" — missing or invalid "path" field (hook may have used "filePath" instead)`,
      );
      continue;
    }
    sanitized.push({ ...file, path: pathValue });
  }
  return sanitized;
}

function applyContextModeFilter(params: {
  files: WorkspaceBootstrapFile[];
  contextMode?: BootstrapContextMode;
  runKind?: BootstrapContextRunKind;
}): WorkspaceBootstrapFile[] {
  const contextMode = params.contextMode ?? "full";
  const runKind = params.runKind ?? "default";
  if (contextMode !== "lightweight") {
    return params.files;
  }
  if (runKind === "heartbeat") {
    return params.files.filter((file) => file.name === "HEARTBEAT.md");
  }
  // cron/default lightweight mode keeps bootstrap context empty on purpose.
  return [];
}

function shouldExcludeHeartbeatBootstrapFile(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  runKind?: BootstrapContextRunKind;
}): boolean {
  if (!params.config || params.runKind === "heartbeat") {
    return false;
  }
  const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey ?? params.sessionId,
    config: params.config,
    agentId: params.agentId,
  });
  if (sessionAgentId !== defaultAgentId) {
    return false;
  }
  return !shouldIncludeHeartbeatGuidanceForSystemPrompt({
    config: params.config,
    agentId: sessionAgentId,
    defaultAgentId,
  });
}

function filterHeartbeatBootstrapFile(
  files: WorkspaceBootstrapFile[],
  excludeHeartbeatBootstrapFile: boolean,
): WorkspaceBootstrapFile[] {
  if (!excludeHeartbeatBootstrapFile) {
    return files;
  }
  return files.filter((file) => file.name !== DEFAULT_HEARTBEAT_FILENAME);
}

async function resolveSourceBackedAgentBootstrapSource(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  deps?: SourceBackedAgentBootstrapDeps;
}): Promise<SourceBackedAgentBootstrapSource | null> {
  if (!params.agentId?.trim() && !params.sessionKey?.trim() && !params.sessionId?.trim()) {
    return null;
  }
  const { sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey ?? params.sessionId,
    config: params.config,
    agentId: params.agentId,
  });
  const loadEntries = params.deps?.loadAgentRegistryEntries ?? loadAgentPackRegistryEntries;
  let entries: AgentPackRegistryEntry[];
  try {
    entries = await loadEntries();
  } catch (error) {
    void error;
    return null;
  }
  const entry = findAgentPackRegistryEntry({
    entries,
    agentId: sessionAgentId,
  });
  if (!entry) {
    return null;
  }
  const defaultProjectRoot = params.config
    ? resolveAgentProjectRootDir(params.config, sessionAgentId)
    : resolveBootstrapRepoRoot({ importMetaUrl: import.meta.url, cwd: process.cwd() });
  const sourceRoot = resolveAgentPackRuntimeSourceRoot({
    entry,
    defaultProjectRoot,
  });
  if (!sourceRoot) {
    throw new Error(`source-backed agent runtime source missing: ${sessionAgentId}`);
  }
  return sourceRoot
    ? {
        agentId: sessionAgentId,
        sourceRoot,
      }
    : null;
}

export async function resolveSourceBackedAgentBootstrapFilePaths(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  fileNames?: readonly string[];
  deps?: SourceBackedAgentBootstrapDeps;
}): Promise<string[] | null> {
  const source = await resolveSourceBackedAgentBootstrapSource(params);
  if (!source) {
    return null;
  }
  const fileNames = params.fileNames ?? SOURCE_BACKED_AGENT_REQUIRED_BOOTSTRAP_DOCS;
  return fileNames.map((fileName) => path.join(source.sourceRoot, fileName));
}

function filterSourceBackedAgentBootstrapFiles(
  files: WorkspaceBootstrapFile[],
): WorkspaceBootstrapFile[] {
  return files.filter((file) => SOURCE_BACKED_AGENT_BOOTSTRAP_FILE_NAMES.has(file.name));
}

async function resolveSourceBackedAgentBootstrapArtifactsForRun(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  warn?: (message: string) => void;
  contextMode?: BootstrapContextMode;
  runKind?: BootstrapContextRunKind;
}): Promise<{
  bootstrapFiles: WorkspaceBootstrapFile[];
  modelMemoryOverlay: null;
} | null> {
  const source = await resolveSourceBackedAgentBootstrapSource(params);
  if (!source) {
    return null;
  }
  const excludeHeartbeatBootstrapFile = shouldExcludeHeartbeatBootstrapFile(params);
  const rawFiles = await loadWorkspaceBootstrapFiles(source.sourceRoot);
  // Source-backed agent packs are the native first-party agent contract. Do
  // not apply the generic subagent minimal-bootstrap filter here; registry-
  // required docs must be available before the first provider turn.
  const bootstrapFiles = applyContextModeFilter({
    files: filterSourceBackedAgentBootstrapFiles(rawFiles),
    contextMode: params.contextMode,
    runKind: params.runKind,
  });
  return {
    bootstrapFiles: sanitizeBootstrapFiles(
      filterHeartbeatBootstrapFile(bootstrapFiles, excludeHeartbeatBootstrapFile),
      params.warn,
    ),
    modelMemoryOverlay: null,
  };
}

export async function materializeSourceRuntimeBeforeBootstrapIfNeeded(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  warn?: (message: string) => void;
  deps?: SourceRuntimeBootstrapMaterializationDeps;
}): Promise<SourceRuntimeBootstrapMaterializationPreflight> {
  if (!params.config) {
    return {
      status: "skipped",
      reasonCode: "source_runtime_bootstrap_config_missing",
    };
  }
  const { sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey ?? params.sessionId,
    config: params.config,
    agentId: params.agentId,
  });
  if (!resolveAgentConfig(params.config, sessionAgentId)?.agentDir) {
    return {
      status: "skipped",
      reasonCode: "source_runtime_bootstrap_agent_dir_missing",
      agentId: sessionAgentId,
    };
  }
  const agentDir = resolveAgentDir(params.config, sessionAgentId);
  const manifest = await (params.deps?.loadManifest ?? loadSourceRuntimeUnificationManifest)();
  if (
    !isSourceRuntimeMaterializedAgentStart({
      manifest,
      agentId: sessionAgentId,
      agentDir,
    })
  ) {
    return {
      status: "skipped",
      reasonCode: "source_runtime_bootstrap_agent_not_materialized",
      agentId: sessionAgentId,
      agentDir: path.resolve(agentDir),
    };
  }
  const result = await (params.deps?.materializeFiles ?? materializeSourceRuntimeFiles)({
    manifest,
  });
  if (result.status === "aligned") {
    return {
      status: "aligned",
      agentId: sessionAgentId,
      agentDir: path.resolve(agentDir),
      recordPath: result.recordPath,
      materializedFileCount: result.materializedFiles.length,
      reasonCodes: result.reasonCodes,
    };
  }
  const message = [
    `source-runtime materialization blocked bootstrap for ${sessionAgentId}`,
    `agentDir=${path.resolve(agentDir)}`,
    `issues=${result.validationIssues.join(",") || "unknown"}`,
  ].join(" ");
  params.warn?.(message);
  throw new Error(message);
}

export function overlayBootstrapFilesByName(
  baseFiles: WorkspaceBootstrapFile[],
  overrideFiles: WorkspaceBootstrapFile[],
): WorkspaceBootstrapFile[] {
  if (overrideFiles.length === 0) {
    return baseFiles;
  }

  const overrides = new Map(overrideFiles.map((file) => [file.name, file] as const));
  const merged: WorkspaceBootstrapFile[] = [];

  for (const file of baseFiles) {
    const override = overrides.get(file.name);
    if (override) {
      merged.push(override);
      overrides.delete(file.name);
      continue;
    }
    merged.push(file);
  }

  for (const file of overrideFiles) {
    if (!overrides.has(file.name)) {
      continue;
    }
    merged.push(file);
    overrides.delete(file.name);
  }

  return merged;
}

export function buildResolvedBootstrapContextFiles(params: {
  bootstrapFiles: WorkspaceBootstrapFile[];
  modelMemoryOverlay?: { contextFiles: EmbeddedContextFile[] } | null;
  config?: OpenClawConfig;
  warn?: (message: string) => void;
}): EmbeddedContextFile[] {
  const contextFiles = buildBootstrapContextFiles(params.bootstrapFiles, {
    maxChars: resolveBootstrapMaxChars(params.config),
    totalMaxChars: resolveBootstrapTotalMaxChars(params.config),
    warn: params.warn,
  });
  return params.modelMemoryOverlay
    ? [...contextFiles, ...params.modelMemoryOverlay.contextFiles]
    : contextFiles;
}

export async function resolveBootstrapFilesForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  currentTurnText?: string;
  warn?: (message: string) => void;
  contextMode?: BootstrapContextMode;
  runKind?: BootstrapContextRunKind;
}): Promise<WorkspaceBootstrapFile[]> {
  const { bootstrapFiles } = await resolveBootstrapArtifactsForRun(params);
  return bootstrapFiles;
}

async function resolveBootstrapArtifactsForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  currentTurnText?: string;
  warn?: (message: string) => void;
  contextMode?: BootstrapContextMode;
  runKind?: BootstrapContextRunKind;
}): Promise<{
  bootstrapFiles: WorkspaceBootstrapFile[];
  modelMemoryOverlay: ModelMemoryBootstrapOverlay | null;
}> {
  const sourceBacked = await resolveSourceBackedAgentBootstrapArtifactsForRun(params);
  if (sourceBacked) {
    return sourceBacked;
  }

  const excludeHeartbeatBootstrapFile = shouldExcludeHeartbeatBootstrapFile(params);
  const sessionKey = params.sessionKey ?? params.sessionId;
  const canonicalized = await materializeCanonicalBootstrapCompatibilityFiles({
    workspaceDir: params.workspaceDir,
    config: params.config,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    currentTurnText: params.currentTurnText,
    writeRootMemoryFiles: params.currentTurnText ? false : undefined,
  });
  const rawFiles = params.sessionKey
    ? await getOrLoadBootstrapFiles({
        workspaceDir: params.workspaceDir,
        sessionKey: params.sessionKey,
      })
    : await loadWorkspaceBootstrapFiles(params.workspaceDir);
  const effectiveFiles = overlayBootstrapFilesByName(rawFiles, canonicalized.files);
  const bootstrapFiles = applyContextModeFilter({
    files: filterBootstrapFilesForSession(effectiveFiles, sessionKey),
    contextMode: params.contextMode,
    runKind: params.runKind,
  });

  const updated = await applyBootstrapHookOverrides({
    files: bootstrapFiles,
    workspaceDir: params.workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
  });
  return {
    bootstrapFiles: sanitizeBootstrapFiles(
      filterHeartbeatBootstrapFile(updated, excludeHeartbeatBootstrapFile),
      params.warn,
    ),
    modelMemoryOverlay: canonicalized.modelMemoryOverlay,
  };
}

export async function resolveBootstrapContextForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  currentTurnText?: string;
  warn?: (message: string) => void;
  contextMode?: BootstrapContextMode;
  runKind?: BootstrapContextRunKind;
}): Promise<{
  bootstrapFiles: WorkspaceBootstrapFile[];
  contextFiles: EmbeddedContextFile[];
}> {
  const { bootstrapFiles, modelMemoryOverlay } = await resolveBootstrapArtifactsForRun(params);
  return {
    bootstrapFiles,
    contextFiles: buildResolvedBootstrapContextFiles({
      bootstrapFiles,
      modelMemoryOverlay,
      config: params.config,
      warn: params.warn,
    }),
  };
}
