import type { OpenClawPluginApi, PluginJsonValue } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";
import type { CodexLoadedSystemProfile } from "./system-profile.js";
import type { CodexAppServerThreadLifecycleBinding } from "./thread-lifecycle-types.js";

export const CODEX_EXECUTION_SESSION_EXTENSION_NAMESPACE = "execution";
export const CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA = "openclaw.codex.execution.v1" as const;

export type CodexExecutionSessionProjection = {
  schema: typeof CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA;
  threadId: string;
  action: "started" | "resumed" | "forked";
  cwd: string;
  model?: string;
  modelProvider?: string;
  permissionProfile?: string;
  runtimeWorkspaceRoots: string[];
  instructionSources: string[];
  appServerVersion?: string;
  runtimeFingerprint?: string;
  systemProfile?: {
    layerVersion: string;
    purposeAgents: string[];
    capabilityRoots: string[];
    workbenchMcp: true;
  };
};

export type CodexExecutionProjectionRuntime = {
  agent: {
    session: Pick<PluginRuntime["agent"]["session"], "patchSessionEntry">;
  };
};

/** Registers a bounded read-only projection over the plugin's existing native session state. */
export function registerCodexExecutionSessionExtension(api: OpenClawPluginApi): void {
  api.session.state.registerSessionExtension({
    namespace: CODEX_EXECUTION_SESSION_EXTENSION_NAMESPACE,
    description: "Factual Codex thread, profile, and workspace readback.",
    project: ({ state }) => readCodexExecutionSessionProjection(state),
  });
}

/** Publishes derived execution facts without creating another lifecycle or state authority. */
export async function publishCodexExecutionSessionProjection(params: {
  runtime: CodexExecutionProjectionRuntime;
  sessionKey?: string;
  sessionId: string;
  agentId?: string;
  thread: CodexAppServerThreadLifecycleBinding;
  systemProfile?: CodexLoadedSystemProfile;
  appServerVersion?: string;
}): Promise<void> {
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return;
  }
  const authority = params.thread.lifecycle.authorityReadback;
  if (!authority) {
    throw new Error("Codex thread did not return native authority readback");
  }
  const value: CodexExecutionSessionProjection = {
    schema: CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA,
    threadId: params.thread.threadId,
    action: params.thread.lifecycle.action,
    cwd: authority.cwd,
    ...(params.thread.model ? { model: params.thread.model } : {}),
    ...(params.thread.modelProvider ? { modelProvider: params.thread.modelProvider } : {}),
    ...(authority.permissionProfile ? { permissionProfile: authority.permissionProfile } : {}),
    runtimeWorkspaceRoots: [...authority.runtimeWorkspaceRoots],
    instructionSources: [...authority.instructionSources],
    ...(params.appServerVersion ? { appServerVersion: params.appServerVersion } : {}),
    ...(params.thread.appServerRuntimeFingerprint
      ? { runtimeFingerprint: params.thread.appServerRuntimeFingerprint }
      : {}),
    ...(params.systemProfile
      ? {
          systemProfile: {
            layerVersion: params.systemProfile.configLayerVersion,
            purposeAgents: [...params.systemProfile.agentNames],
            capabilityRoots: params.systemProfile.selectedCapabilityRoots.map((root) => root.id),
            workbenchMcp: true as const,
          },
        }
      : {}),
  };
  const updated = await params.runtime.agent.session.patchSessionEntry({
    sessionKey,
    ...(params.agentId ? { agentId: params.agentId } : {}),
    readConsistency: "latest",
    preserveActivity: true,
    update: (entry) => {
      if (entry.sessionId !== params.sessionId) {
        throw new Error("Codex execution projection session generation changed");
      }
      const extensions = entry.pluginExtensions ?? {};
      const codex = extensions.codex ?? {};
      return {
        pluginExtensions: {
          ...extensions,
          codex: {
            ...codex,
            [CODEX_EXECUTION_SESSION_EXTENSION_NAMESPACE]: value as unknown as PluginJsonValue,
          },
        },
      };
    },
  });
  if (!updated) {
    throw new Error("Codex execution projection session is unavailable");
  }
}

export function readCodexExecutionSessionProjection(
  value: unknown,
): CodexExecutionSessionProjection | undefined {
  if (!isRecord(value) || value.schema !== CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA) {
    return undefined;
  }
  const threadId = readString(value.threadId);
  const action =
    value.action === "started" || value.action === "resumed" || value.action === "forked"
      ? value.action
      : undefined;
  const cwd = readString(value.cwd);
  const runtimeWorkspaceRoots = readStringArray(value.runtimeWorkspaceRoots);
  const instructionSources = readStringArray(value.instructionSources);
  if (!threadId || !action || !cwd || !runtimeWorkspaceRoots || !instructionSources) {
    return undefined;
  }
  const systemProfile = readSystemProfile(value.systemProfile);
  return {
    schema: CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA,
    threadId,
    action,
    cwd,
    ...(readString(value.model) ? { model: readString(value.model) } : {}),
    ...(readString(value.modelProvider) ? { modelProvider: readString(value.modelProvider) } : {}),
    ...(readString(value.permissionProfile)
      ? { permissionProfile: readString(value.permissionProfile) }
      : {}),
    runtimeWorkspaceRoots,
    instructionSources,
    ...(readString(value.appServerVersion)
      ? { appServerVersion: readString(value.appServerVersion) }
      : {}),
    ...(readString(value.runtimeFingerprint)
      ? { runtimeFingerprint: readString(value.runtimeFingerprint) }
      : {}),
    ...(systemProfile ? { systemProfile } : {}),
  };
}

function readSystemProfile(
  value: unknown,
): CodexExecutionSessionProjection["systemProfile"] | undefined {
  if (!isRecord(value) || value.workbenchMcp !== true) {
    return undefined;
  }
  const layerVersion = readString(value.layerVersion);
  const purposeAgents = readStringArray(value.purposeAgents);
  const capabilityRoots = readStringArray(value.capabilityRoots);
  return layerVersion && purposeAgents && capabilityRoots
    ? { layerVersion, purposeAgents, capabilityRoots, workbenchMcp: true }
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 64) {
    return undefined;
  }
  const strings = value.map(readString);
  return strings.every((entry): entry is string => Boolean(entry)) ? strings : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
