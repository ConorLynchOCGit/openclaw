import type { AgentExecutionWorkspaceConfig } from "../config/types.agents.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveAgentConfig } from "./agent-scope.js";
import { resolveLoadedSystemSource, type LoadedSystemSource } from "./system-change-source.js";
import { managedWorktrees } from "./worktrees/service.js";
import type { CreateManagedWorktreeParams, ManagedWorktreeRecord } from "./worktrees/types.js";

type ExecutionWorkspaceDeps = {
  resolveLoadedSystemSource: () => Promise<LoadedSystemSource>;
  createWorktree: (params: CreateManagedWorktreeParams) => Promise<ManagedWorktreeRecord>;
  removeWorktree: (params: { id: string; reason: string; force?: boolean }) => Promise<unknown>;
};

const defaultDeps: ExecutionWorkspaceDeps = {
  resolveLoadedSystemSource,
  createWorktree: managedWorktrees.create.bind(managedWorktrees),
  removeWorktree: managedWorktrees.remove.bind(managedWorktrees),
};

export type MaterializedAgentExecutionWorkspace = {
  config: AgentExecutionWorkspaceConfig;
  worktree: ManagedWorktreeRecord;
};

export function resolveAgentExecutionWorkspaceConfig(
  cfg: OpenClawConfig,
  agentId: string,
): AgentExecutionWorkspaceConfig | undefined {
  return resolveAgentConfig(cfg, agentId)?.executionWorkspace;
}

/**
 * Materialize a trusted task cwd without changing the agent workspace that
 * owns identity, memory, and skills.
 */
export async function materializeAgentExecutionWorkspace(params: {
  cfg: OpenClawConfig;
  agentId: string;
  request?: AgentExecutionWorkspaceConfig;
  ownerSessionKey: string;
  signal?: AbortSignal;
  deps?: Partial<ExecutionWorkspaceDeps>;
}): Promise<MaterializedAgentExecutionWorkspace | undefined> {
  if (!params.request) {
    return undefined;
  }
  const config = resolveAgentExecutionWorkspaceConfig(params.cfg, params.agentId);
  if (config?.type !== params.request.type || config.access !== params.request.access) {
    throw new Error(
      `${params.agentId} is not authorized for ${params.request.access} loaded-source work`,
    );
  }
  const deps = { ...defaultDeps, ...params.deps };
  const source = await deps.resolveLoadedSystemSource();
  const worktree = await deps.createWorktree({
    repoRoot: source.sourceAnchorPath,
    baseRef: source.sourceCommit,
    ownerKind: "session",
    ownerId: params.ownerSessionKey,
    setupMode: "isolated",
    runSetupScript: config.access === "modify",
    signal: params.signal,
  });
  return { config: params.request, worktree };
}

export async function removeAgentExecutionWorkspaceAfterFailedAdmission(
  id: string,
  deps?: Pick<ExecutionWorkspaceDeps, "removeWorktree">,
): Promise<void> {
  await (deps?.removeWorktree ?? defaultDeps.removeWorktree)({
    id,
    reason: "spawn-admission-failed",
    force: true,
  });
}
