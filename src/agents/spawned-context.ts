import path from "node:path";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeAgentId, parseAgentSessionKey } from "../routing/session-key.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import { resolveAgentProjectRootDir } from "./agent-scope.js";

export type SpawnedRunMetadata = {
  spawnedBy?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  workspaceDir?: string | null;
};

export type SpawnedToolContext = {
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  workspaceDir?: string;
};

export type NormalizedSpawnedRunMetadata = {
  spawnedBy?: string;
  groupId?: string;
  groupChannel?: string;
  groupSpace?: string;
  workspaceDir?: string;
};

export function normalizeSpawnedRunMetadata(
  value?: SpawnedRunMetadata | null,
): NormalizedSpawnedRunMetadata {
  return {
    spawnedBy: normalizeOptionalString(value?.spawnedBy),
    groupId: normalizeOptionalString(value?.groupId),
    groupChannel: normalizeOptionalString(value?.groupChannel),
    groupSpace: normalizeOptionalString(value?.groupSpace),
    workspaceDir: normalizeOptionalString(value?.workspaceDir),
  };
}

export function mapToolContextToSpawnedRunMetadata(
  value?: SpawnedToolContext | null,
): Pick<NormalizedSpawnedRunMetadata, "groupId" | "groupChannel" | "groupSpace" | "workspaceDir"> {
  return {
    groupId: normalizeOptionalString(value?.agentGroupId),
    groupChannel: normalizeOptionalString(value?.agentGroupChannel),
    groupSpace: normalizeOptionalString(value?.agentGroupSpace),
    workspaceDir: normalizeOptionalString(value?.workspaceDir),
  };
}

export function resolveSpawnedWorkspaceInheritance(params: {
  config: OpenClawConfig;
  targetAgentId?: string;
  requesterSessionKey?: string;
  explicitWorkspaceDir?: string | null;
}): string | undefined {
  const explicit = normalizeOptionalString(params.explicitWorkspaceDir);
  const requesterAgentId = params.requesterSessionKey
    ? parseAgentSessionKey(params.requesterSessionKey)?.agentId
    : undefined;
  const agentId = params.targetAgentId ?? requesterAgentId;
  const targetProjectRoot = agentId
    ? resolveAgentProjectRootDir(params.config, normalizeAgentId(agentId))
    : undefined;
  if (explicit) {
    if (!targetProjectRoot) {
      return explicit;
    }
    if (
      requesterAgentId &&
      agentId &&
      normalizeAgentId(requesterAgentId) === normalizeAgentId(agentId)
    ) {
      return explicit;
    }
    // Preserve inherited project-root state when parent and target agent already
    // share the same canonical project root. When they differ, target agent
    // projectRoot remains authoritative for cross-agent implementation work.
    if (path.resolve(explicit) === path.resolve(targetProjectRoot)) {
      return explicit;
    }
    if (!params.targetAgentId) {
      return explicit;
    }
  }
  return targetProjectRoot;
}

export function resolveIngressWorkspaceOverrideForSpawnedRun(
  metadata?: Pick<SpawnedRunMetadata, "spawnedBy" | "workspaceDir"> | null,
): string | undefined {
  const normalized = normalizeSpawnedRunMetadata(metadata);
  return normalized.spawnedBy ? normalized.workspaceDir : undefined;
}
