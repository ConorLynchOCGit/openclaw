import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { findTaskByRunId } from "../../tasks/runtime-internal.js";
import { isTerminalTaskStatus } from "../../tasks/task-executor-policy.js";
import { listAgentIds, resolveAgentConfig } from "../agent-scope-config.js";
import { resolveSubagentAllowedTargetIds } from "../subagent-target-policy.js";

export function resolveTaskRequesterAgentId(
  opts: { requesterAgentIdOverride?: string; agentSessionKey?: string } | undefined,
): string | undefined {
  const explicit = opts?.requesterAgentIdOverride?.trim();
  if (explicit) {
    return explicit;
  }
  return /^agent:([^:]+)/.exec(opts?.agentSessionKey ?? "")?.[1]?.trim() || undefined;
}

export function resolveTaskAllowedAgentIds(params: {
  config?: OpenClawConfig;
  requesterAgentId?: string;
}): string[] {
  const requesterAgentId = params.requesterAgentId?.trim();
  if (!params.config || !requesterAgentId) {
    return [];
  }
  const requesterConfig = resolveAgentConfig(params.config, requesterAgentId);
  return resolveSubagentAllowedTargetIds({
    requesterAgentId,
    allowAgents:
      requesterConfig?.subagents?.allowAgents ??
      params.config.agents?.defaults?.subagents?.allowAgents,
    configuredAgentIds: listAgentIds(params.config),
  }).allowedIds;
}

export function resolveForegroundParentTask(parentRunId: string | undefined) {
  const runId = parentRunId?.trim();
  if (!runId) {
    return undefined;
  }
  const task = findTaskByRunId(runId);
  return task?.runId === runId && !isTerminalTaskStatus(task.status) ? task : null;
}
