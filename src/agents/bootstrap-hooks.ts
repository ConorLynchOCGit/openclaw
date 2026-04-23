import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { AgentBootstrapHookContext } from "../hooks/internal-hooks.js";
import { createInternalHookEvent, triggerInternalHook } from "../hooks/internal-hooks.js";
import { resolveAgentIdFromSessionKey } from "../routing/session-key.js";
import { recordModelMemoryCaptureSeamEvidence } from "./model-memory.capture-seams.js";
import { recordModelMemoryProductionHookProbe } from "./model-memory.hook-probe.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

export async function applyBootstrapHookOverrides(params: {
  files: WorkspaceBootstrapFile[];
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
}): Promise<WorkspaceBootstrapFile[]> {
  const sessionKey = params.sessionKey ?? params.sessionId ?? "unknown";
  const agentId =
    params.agentId ??
    (params.sessionKey ? resolveAgentIdFromSessionKey(params.sessionKey) : undefined);
  const context: AgentBootstrapHookContext = {
    workspaceDir: params.workspaceDir,
    bootstrapFiles: params.files,
    cfg: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId,
  };
  const event = createInternalHookEvent("agent", "bootstrap", sessionKey, context);
  await triggerInternalHook(event);
  const updated = (event.context as AgentBootstrapHookContext).bootstrapFiles;
  const nextFiles = Array.isArray(updated) ? updated : params.files;
  const safePayload = {
    bootstrapFileCount: nextFiles.length,
    bootstrapFileNames: nextFiles.map((file) => file.name).slice(0, 24),
    workspaceDirHash: params.workspaceDir,
  };
  void recordModelMemoryProductionHookProbe({
    hookName: "agent:bootstrap",
    triggerSurface: "agents.bootstrap_hooks.apply_overrides",
    payload: safePayload,
    context: {
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      agentId,
    },
    config: params.config,
  }).catch(() => undefined);
  void recordModelMemoryCaptureSeamEvidence({
    seamName: "agent:bootstrap",
    triggerSurface: "agents.bootstrap_hooks.apply_overrides",
    payload: safePayload,
    context: {
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      agentId,
    },
    config: params.config,
  }).catch(() => undefined);
  return nextFiles;
}
