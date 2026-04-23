import {
  listAgentIds,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import {
  buildWorkspaceSkillStatus,
  resolveAgentLoadedSkillSnapshotStatus,
} from "../agents/skills-status.js";
import { loadConfig } from "../config/config.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { type RuntimeEnv, defaultRuntime, writeRuntimeJson } from "../runtime.js";
import { shortenHomePath } from "../utils.js";

export type AgentsSkillsStatusOptions = {
  agent?: string;
  json?: boolean;
};

export async function agentsSkillsStatusCommand(
  opts: AgentsSkillsStatusOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const cfg = loadConfig();
  const requestedAgent = opts.agent?.trim();
  const agentId = normalizeAgentId(requestedAgent || resolveDefaultAgentId(cfg));
  if (requestedAgent) {
    const knownAgents = listAgentIds(cfg);
    if (!knownAgents.includes(agentId)) {
      runtime.error(`unknown agent id "${requestedAgent}"`);
      runtime.exit(1);
      return;
    }
  }

  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const loadedSession = resolveAgentLoadedSkillSnapshotStatus({
    config: cfg,
    agentId,
    workspaceDir,
  });
  const report = buildWorkspaceSkillStatus(workspaceDir, { config: cfg, loadedSession });
  const payload = {
    agentId,
    sessionId: report.loadedSessionId ?? null,
    sessionKey: report.loadedSessionKey ?? null,
    workspaceDir: report.workspaceDir,
    configuredSkillDirs: report.configuredSkillDirs,
    discoveredSkillNames: report.discoveredSkillNames,
    loadedSkillNames: report.loadedSkillNames,
    loadedState: report.loadedState,
    loadedStateReason: report.loadedStateReason,
    hotReloadState: report.hotReloadState,
    loadedSnapshotVersion: report.loadedSnapshotVersion,
    currentSnapshotVersion: report.currentSnapshotVersion,
    lastSnapshotPersistedAt: report.lastSnapshotPersistedAt,
    skillCount: report.skills.length,
    skills: report.skills.map((skill) => ({
      name: skill.name,
      skillKey: skill.skillKey,
      source: skill.source,
      eligible: skill.eligible,
      filePath: skill.filePath,
    })),
  };

  if (opts.json) {
    writeRuntimeJson(runtime, payload);
    return;
  }

  const lines = [
    `Agent skills status: ${agentId}`,
    `Workspace: ${shortenHomePath(report.workspaceDir)}`,
    `Configured skill dirs: ${report.configuredSkillDirs
      .map((entry) => `${entry.kind}=${shortenHomePath(entry.path)}`)
      .join(", ")}`,
    `Discovered skills (${report.discoveredSkillNames.length}): ${
      report.discoveredSkillNames.join(", ") || "none"
    }`,
    `Loaded-state: ${report.loadedState}${
      report.loadedStateReason ? ` (${report.loadedStateReason})` : ""
    }`,
    `Hot-reload: ${report.hotReloadState}${
      report.loadedSnapshotVersion !== undefined || report.currentSnapshotVersion !== undefined
        ? ` (loaded=${report.loadedSnapshotVersion ?? "unknown"}, current=${report.currentSnapshotVersion ?? "unknown"})`
        : ""
    }`,
  ];
  runtime.log(lines.join("\n"));
}
